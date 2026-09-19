import type { Feature, Point } from 'geojson'
import type {
  GeoJSONSource,
  GeoJSONSourceDiff,
  MapGeoJSONFeature,
  Map as MapLibreMap,
} from 'maplibre-gl'
import {
  SOURCE_AIRCRAFT,
  SOURCE_VESSELS,
} from './trafficStyle'

export type TrafficClusterKind = 'aircraft' | 'vessel'

export interface TrafficClusterTarget {
  kind: TrafficClusterKind
  sourceId: typeof SOURCE_AIRCRAFT | typeof SOURCE_VESSELS
  clusterId: number
  center: [number, number]
}

export const shouldAnimateTrafficSources = (
  clusteringEnabled: boolean,
  hasActiveTrafficMotion: boolean,
) => !clusteringEnabled && hasActiveTrafficMotion

const featureId = (feature: Feature<Point>) =>
  typeof feature.id === 'string' || typeof feature.id === 'number'
    ? feature.id
    : undefined

const samePointGeometry = (
  first: Feature<Point>,
  second: Feature<Point>,
) => {
  const [firstLongitude, firstLatitude] = first.geometry.coordinates
  const [secondLongitude, secondLatitude] = second.geometry.coordinates
  return (
    firstLongitude === secondLongitude &&
    firstLatitude === secondLatitude
  )
}

const sameFeatureProperties = (
  first: Feature<Point>,
  second: Feature<Point>,
) => {
  const firstProperties = first.properties ?? {}
  const secondProperties = second.properties ?? {}
  const keys = new Set([
    ...Object.keys(firstProperties),
    ...Object.keys(secondProperties),
  ])
  for (const key of keys) {
    if (firstProperties[key] !== secondProperties[key]) return false
  }
  return true
}

export const trafficSourceDiff = (
  previous: readonly Feature<Point>[],
  next: readonly Feature<Point>[],
): GeoJSONSourceDiff => {
  const previousById = new Map(
    previous.flatMap((feature) => {
      const id = featureId(feature)
      return id === undefined ? [] : [[id, feature] as const]
    }),
  )
  const nextIds = new Set<string | number>()
  const add: Feature<Point>[] = []
  const update: NonNullable<GeoJSONSourceDiff['update']> = []

  for (const feature of next) {
    const id = featureId(feature)
    if (id === undefined) continue
    nextIds.add(id)
    const existing = previousById.get(id)
    if (!existing) {
      add.push(feature)
      continue
    }
    const geometryChanged = !samePointGeometry(existing, feature)
    const propertiesChanged = !sameFeatureProperties(existing, feature)
    if (!geometryChanged && !propertiesChanged) continue
    update.push({
      id,
      ...(geometryChanged ? { newGeometry: feature.geometry } : {}),
      ...(propertiesChanged
        ? {
            removeAllProperties: true,
            addOrUpdateProperties: Object.entries(
              feature.properties ?? {},
            ).map(([key, value]) => ({ key, value })),
          }
        : {}),
    })
  }

  const remove = [...previousById.keys()].filter((id) => !nextIds.has(id))
  return {
    ...(remove.length > 0 ? { remove } : {}),
    ...(add.length > 0 ? { add } : {}),
    ...(update.length > 0 ? { update } : {}),
  }
}

export const setTrafficClustering = async (
  map: MapLibreMap,
  enabled: boolean,
) => {
  const updates: Promise<void>[] = []
  for (const sourceId of [SOURCE_AIRCRAFT, SOURCE_VESSELS] as const) {
    const source = map.getSource(sourceId)
    if (source) {
      updates.push(
        (source as GeoJSONSource).setClusterOptions({
          cluster: enabled,
        }),
      )
    }
  }
  await Promise.all(updates)
}

const finiteCoordinate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const trafficClusterTarget = (
  feature: MapGeoJSONFeature,
): TrafficClusterTarget | null => {
  const sourceId =
    feature.source === SOURCE_AIRCRAFT
      ? SOURCE_AIRCRAFT
      : feature.source === SOURCE_VESSELS
        ? SOURCE_VESSELS
        : undefined
  const clusterId = feature.properties?.cluster_id
  const geometry = feature.geometry as Point
  if (
    !sourceId ||
    !Number.isSafeInteger(clusterId) ||
    clusterId < 0 ||
    geometry.type !== 'Point' ||
    !Array.isArray(geometry.coordinates)
  ) {
    return null
  }

  const [longitude, latitude] = geometry.coordinates
  if (
    !finiteCoordinate(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !finiteCoordinate(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null
  }

  return {
    kind: sourceId === SOURCE_AIRCRAFT ? 'aircraft' : 'vessel',
    sourceId,
    clusterId,
    center: [longitude, latitude],
  }
}

export const firstTrafficClusterTarget = (
  features: readonly MapGeoJSONFeature[],
) => {
  for (const feature of features) {
    const target = trafficClusterTarget(feature)
    if (target) return target
  }
  return null
}

export const clusterExpansionZoom = (
  currentZoom: number,
  requestedZoom: number,
  maximumZoom: number,
) =>
  Math.min(
    Math.max(
      Number.isFinite(requestedZoom) ? requestedZoom : currentZoom + 1,
      Math.floor(currentZoom) + 1,
    ),
    maximumZoom,
  )
