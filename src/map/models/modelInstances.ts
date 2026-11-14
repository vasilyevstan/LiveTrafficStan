import type { Feature, Point } from 'geojson'
import type { Theme } from '../../app/theme'
import { TRAFFIC_MODEL_CONFIG } from '../../config/appConfig'
import type { ModeledOrbitalPosition } from '../../domain/orbital'
import { orbitalFeaturedMapLabelForPosition } from '../../domain/orbitalEnrichment'
import type { DisplayTrafficEntity } from '../../domain/traffic'
import type { DisplayTrain } from '../../domain/trains'
import {
  ORBITAL_ICON_OPACITY,
  STARLINK_ICON_OPACITY,
} from '../orbitalStyle'
import { trafficObservationOpacity } from '../trafficStyle'
import {
  MODEL_FLAG_DROP_LINE,
  MODEL_FLAG_SELECTED,
  MODEL_FLAG_ZOOM_CONTEXT,
  mercatorUnitsPerMeter,
  mercatorX,
  mercatorY,
  wrapMercatorOffset,
  type MercatorPoint,
  type ModelInstanceGeometry,
} from './modelProjection'
import type { TrafficModelBounds } from './trafficModelAsset'
import {
  TRAFFIC_MODEL_IDS,
  featuredOrbitalModel,
  orbitalModelColors,
  orbitalModelForObject,
  trafficModelColors,
  trafficModelForMarkerIcon,
  trafficModelKind,
  trainModelColors,
  trainModelForCategory,
  type Rgb,
  type TrafficModelId,
} from './trafficModelCatalog'

export type ModelGroup = 'aircraft' | 'vessels' | 'trains' | 'orbital' | 'starlink'
export const MODEL_GROUPS: readonly ModelGroup[] = [
  'trains',
  'vessels',
  'aircraft',
  'orbital',
  'starlink',
]

export interface ModelInstance extends ModelInstanceGeometry {
  id: string
  model: TrafficModelId
  tint: Rgb
  detail: Rgb
  /** One-based country-flag atlas cell drawn beside the model; 0 or absent draws none. */
  flagSlot?: number
}

/** Shader flag bits occupy 0-2; the flag atlas cell is packed above them. */
export const MODEL_FLAG_SLOT_SHIFT = 3

export interface ModelDimensions {
  lengthMeters: number
  beamMeters: number
  heightMeters: number
  bounds: TrafficModelBounds
}

export type ModelDimensionTable = ReadonlyMap<TrafficModelId, ModelDimensions>

export const MODEL_INSTANCE_FLOATS = 14
export const MODEL_INSTANCE_STRIDE_BYTES = 56

const RADIANS = Math.PI / 180
const MODEL_ORDER = new Map<TrafficModelId, number>(
  TRAFFIC_MODEL_IDS.map((id, index) => [id, index]),
)

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const overviewMaximumLengthToBeam = (model: TrafficModelId) => {
  const kind = trafficModelKind(model)
  if (kind === 'vessel') return TRAFFIC_MODEL_CONFIG.vesselOverviewMaximumLengthToBeam
  if (kind === 'train') return TRAFFIC_MODEL_CONFIG.trainOverviewMaximumLengthToBeam
  return undefined
}

/**
 * Per-model overview stretch k: while the screen floor enlarges a long hull or
 * train, length is divided and beam multiplied by k, capping the painted
 * length-to-beam ratio. Shared by the shader uniform and its CPU mirror.
 */
export const modelOverviewStretch = (
  model: TrafficModelId,
  size: Pick<ModelDimensions, 'lengthMeters' | 'beamMeters'>,
) => {
  const maximum = overviewMaximumLengthToBeam(model)
  if (maximum === undefined || !(size.beamMeters > 0)) return 1
  return Math.sqrt(Math.max(1, size.lengthMeters / size.beamMeters / maximum))
}

const vesselLengthScale = (
  entity: DisplayTrafficEntity,
  dimensions: ModelDimensions,
) => {
  if (entity.kind !== 'vessel' || !finite(entity.lengthMeters)) return 1
  const length = entity.lengthMeters
  return length >= TRAFFIC_MODEL_CONFIG.minimumVesselLengthMeters &&
    length <= TRAFFIC_MODEL_CONFIG.maximumVesselLengthMeters
    ? length / dimensions.lengthMeters
    : 1
}

/**
 * Mirrors the flat traffic symbols one-to-one. `features` must be the
 * `trafficFeatures` output for `entities`, so positions, headings, selection,
 * staleness, and zoom-context sampling stay identical to the flat path.
 * Aircraft carry their `flagIcon` atlas cell so the flag follows the lifted
 * model; vessel flags stay on the flat ground-anchored layer.
 */
export const trafficModelInstances = (
  entities: readonly DisplayTrafficEntity[],
  features: readonly Feature<Point>[],
  theme: Theme,
  dimensions: ModelDimensionTable,
  flagSlots: ReadonlyMap<string, number> = new Map(),
): ModelInstance[] => {
  const instances: ModelInstance[] = []
  entities.forEach((entity, index) => {
    const feature = features[index]
    const properties = feature?.properties
    if (!properties || properties.id !== entity.id) return
    const image = trafficModelForMarkerIcon(properties.markerIcon)
    const size = image ? dimensions.get(image.model) : undefined
    const [longitude, latitude] = feature.geometry.coordinates
    if (!image || !size || !finite(longitude) || !finite(latitude)) return
    const aircraft = entity.kind === 'aircraft'
    const altitudeMeters =
      aircraft && finite(entity.altitudeMeters) && entity.altitudeMeters > 0
        ? entity.altitudeMeters
        : 0
    const lengthScale = vesselLengthScale(entity, size)
    const markerScale = finite(properties.markerScale) ? properties.markerScale : 1
    const flags =
      (properties.zoomContext === true ? MODEL_FLAG_ZOOM_CONTEXT : 0) |
      (properties.selected === true ? MODEL_FLAG_SELECTED : 0) |
      (altitudeMeters > 0 ? MODEL_FLAG_DROP_LINE : 0)
    const flagSlot =
      aircraft && typeof properties.flagIcon === 'string'
        ? flagSlots.get(properties.flagIcon)
        : undefined
    instances.push({
      id: entity.id,
      model: image.model,
      longitude,
      latitude,
      altitudeMeters,
      lengthMeters: size.lengthMeters,
      beamMeters: size.beamMeters,
      heightMeters: size.heightMeters,
      bounds: size.bounds,
      headingDegrees: finite(properties.heading) ? properties.heading : 0,
      lengthScale,
      overviewStretch: modelOverviewStretch(image.model, size),
      extentMeters: Math.max(size.lengthMeters, size.beamMeters) * lengthScale,
      floorPx:
        TRAFFIC_MODEL_CONFIG.minimumScreenSizePx[aircraft ? 'aircraft' : 'vessel'] *
        markerScale,
      opacity: trafficObservationOpacity(theme, properties.stale === true),
      flags,
      ...(flagSlot ? { flagSlot } : {}),
      ...trafficModelColors(theme, image),
    })
  })
  return instances
}

/** Mirrors the flat orbital point layers, including their shown-id filter. */
export const orbitalModelInstances = (
  positions: readonly ModeledOrbitalPosition[],
  shownIds: readonly string[],
  selectedId: string | null,
  theme: Theme,
  starlink: boolean,
  dimensions: ModelDimensionTable,
): ModelInstance[] => {
  const shown = new Set(shownIds)
  const instances: ModelInstance[] = []
  for (const position of positions) {
    if (!shown.has(position.id)) continue
    const featuredLabel = starlink
      ? undefined
      : orbitalFeaturedMapLabelForPosition(position)
    const featured = featuredLabel !== undefined
    const model =
      featuredOrbitalModel(featuredLabel) ??
      orbitalModelForObject(position.objectType, starlink)
    const size = dimensions.get(model)
    if (!size || !finite(position.longitude) || !finite(position.latitude)) continue
    const selected = position.id === selectedId
    const altitudeMeters =
      finite(position.altitudeKm) && position.altitudeKm > 0
        ? position.altitudeKm * 1000
        : 0
    instances.push({
      id: position.id,
      model,
      longitude: position.longitude,
      latitude: position.latitude,
      altitudeMeters,
      lengthMeters: size.lengthMeters,
      beamMeters: size.beamMeters,
      heightMeters: size.heightMeters,
      bounds: size.bounds,
      // Earth-relative ground-track direction; not spacecraft attitude.
      headingDegrees: finite(position.travelBearingDegrees)
        ? position.travelBearingDegrees
        : 0,
      lengthScale: 1,
      overviewStretch: modelOverviewStretch(model, size),
      extentMeters: Math.max(size.lengthMeters, size.beamMeters),
      floorPx: TRAFFIC_MODEL_CONFIG.minimumScreenSizePx[
        starlink
          ? 'starlink'
          : featured
            ? 'featuredOrbital'
            : 'orbital'
      ],
      opacity: starlink ? STARLINK_ICON_OPACITY : ORBITAL_ICON_OPACITY,
      flags:
        (selected ? MODEL_FLAG_SELECTED : 0) |
        ((selected || featured) && altitudeMeters > 0 ? MODEL_FLAG_DROP_LINE : 0),
      ...orbitalModelColors(theme, position.objectType, starlink),
    })
  }
  return instances
}

/**
 * Ground-level train models for observed positions with a derived or
 * reported course only; trains without a course stay flat dots.
 */
export const trainModelInstances = (
  trains: readonly DisplayTrain[],
  selectedId: string | null,
  theme: Theme,
  dimensions: ModelDimensionTable,
): ModelInstance[] => {
  const instances: ModelInstance[] = []
  for (const train of trains) {
    if (
      !finite(train.courseDegrees) ||
      !finite(train.longitude) ||
      !finite(train.latitude)
    ) {
      continue
    }
    const model = trainModelForCategory(train.category)
    const size = dimensions.get(model)
    if (!size) continue
    instances.push({
      id: train.id,
      model,
      longitude: train.longitude,
      latitude: train.latitude,
      altitudeMeters: 0,
      lengthMeters: size.lengthMeters,
      beamMeters: size.beamMeters,
      heightMeters: size.heightMeters,
      bounds: size.bounds,
      headingDegrees: train.courseDegrees,
      lengthScale: 1,
      overviewStretch: modelOverviewStretch(model, size),
      extentMeters: Math.max(size.lengthMeters, size.beamMeters),
      floorPx: TRAFFIC_MODEL_CONFIG.minimumScreenSizePx.train,
      opacity: trafficObservationOpacity(theme, train.freshness === 'stale'),
      flags: train.id === selectedId ? MODEL_FLAG_SELECTED : 0,
      ...trainModelColors(theme, train.category),
    })
  }
  return instances
}

export interface ModelRun {
  model: TrafficModelId
  first: number
  count: number
}

export interface PackedModelInstances {
  instances: readonly ModelInstance[]
  data: ArrayBuffer
  runs: readonly ModelRun[]
  reference: MercatorPoint
}

/** Stable model-order sort so each mesh draws as one contiguous instanced run. */
export const sortModelInstances = (instances: readonly ModelInstance[]) =>
  [...instances].sort(
    (a, b) => (MODEL_ORDER.get(a.model) ?? 0) - (MODEL_ORDER.get(b.model) ?? 0),
  )

export const packModelInstances = (
  instances: readonly ModelInstance[],
  reference: MercatorPoint,
): PackedModelInstances => {
  const sorted = sortModelInstances(instances)
  const data = new ArrayBuffer(sorted.length * MODEL_INSTANCE_STRIDE_BYTES)
  const floats = new Float32Array(data)
  const bytes = new Uint8Array(data)
  const runs: ModelRun[] = []
  sorted.forEach((instance, index) => {
    const offset = index * MODEL_INSTANCE_FLOATS
    floats[offset] = wrapMercatorOffset(mercatorX(instance.longitude) - reference.x)
    floats[offset + 1] = mercatorY(instance.latitude) - reference.y
    floats[offset + 2] = instance.longitude * RADIANS
    floats[offset + 3] = instance.latitude * RADIANS
    floats[offset + 4] = mercatorUnitsPerMeter(instance.latitude)
    floats[offset + 5] = instance.altitudeMeters
    floats[offset + 6] = instance.headingDegrees * RADIANS
    floats[offset + 7] = instance.lengthScale
    floats[offset + 8] = instance.floorPx
    floats[offset + 9] = instance.extentMeters
    floats[offset + 10] = instance.opacity
    floats[offset + 11] = instance.flags | ((instance.flagSlot ?? 0) << MODEL_FLAG_SLOT_SHIFT)
    const colorOffset = index * MODEL_INSTANCE_STRIDE_BYTES + 48
    bytes.set(instance.tint, colorOffset)
    bytes[colorOffset + 3] = 255
    bytes.set(instance.detail, colorOffset + 4)
    bytes[colorOffset + 7] = 255
    const last = runs.at(-1)
    if (last?.model === instance.model) last.count += 1
    else runs.push({ model: instance.model, first: index, count: 1 })
  })
  return { instances: sorted, data, runs, reference: { ...reference } }
}
