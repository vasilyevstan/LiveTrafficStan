import { describe, expect, it } from 'vitest'
import type { ModeledOrbitalPosition } from '../../domain/orbital'
import type { DisplayAircraft, DisplayVessel } from '../../domain/traffic'
import { aircraftAltitudeColors, trafficIconTreatment } from '../icons'
import { orbitalIconTreatment, starlinkIconTreatment } from '../orbitalIcons'
import { trafficFeatures } from '../trafficFeatures'
import {
  MODEL_FLAG_DROP_LINE,
  MODEL_FLAG_SELECTED,
  MODEL_FLAG_ZOOM_CONTEXT,
  mercatorUnitsPerMeter,
  mercatorX,
  mercatorY,
} from './modelProjection'
import {
  MODEL_INSTANCE_FLOATS,
  MODEL_INSTANCE_STRIDE_BYTES,
  orbitalModelInstances,
  packModelInstances,
  trafficModelInstances,
  type ModelInstance,
} from './modelInstances'
import {
  TRAFFIC_MODEL_IDS,
  hexColorBytes,
  type TrafficModelId,
} from './trafficModelCatalog'

const DIMENSIONS = new Map(
  TRAFFIC_MODEL_IDS.map((id) => [id, { lengthMeters: 50, beamMeters: 40 }]),
)
const FLOOR_PX = 32 * 0.88
const RADIANS = Math.PI / 180

const aircraft = (overrides: Partial<DisplayAircraft> = {}): DisplayAircraft => ({
  id: 'aircraft:abc123',
  kind: 'aircraft',
  provider: 'adsb.lol',
  hex: 'abc123',
  position: { latitude: 59.4, longitude: 24.8, observedAt: 1_000 },
  receivedAt: 1_000,
  headingDegrees: 90,
  markerIcon: 'aircraft',
  markerScale: 1,
  altitudeMeters: 10_000,
  freshness: 'live',
  ...overrides,
})

const vessel = (overrides: Partial<DisplayVessel> = {}): DisplayVessel => ({
  id: 'vessel:230000000',
  kind: 'vessel',
  provider: 'digitraffic',
  mmsi: 230_000_000,
  position: { latitude: 59.5, longitude: 24.7, observedAt: 1_000 },
  receivedAt: 1_000,
  headingDegrees: 45,
  speedKph: 20,
  markerIcon: 'vessel-cargo',
  markerScale: 1.2,
  vesselCategory: 'cargo',
  navigationCategory: 'underway',
  lengthMeters: 200,
  freshness: 'live',
  ...overrides,
})

const flat = (
  entities: readonly (DisplayAircraft | DisplayVessel)[],
  selectedId: string | null = null,
  context = false,
) => trafficFeatures(entities, new Map(), 0, selectedId, false, context, false).features

describe('traffic model instances', () => {
  it('mirrors flat aircraft symbols at their reported altitude', () => {
    const entities = [aircraft()]
    const features = flat(entities, 'aircraft:abc123')
    const [instance] = trafficModelInstances(entities, features, 'dark', DIMENSIONS)
    const properties = features[0].properties!
    const band = aircraftAltitudeColors('dark', properties.altitudeBand)
    expect(instance).toMatchObject({
      id: 'aircraft:abc123',
      model: 'aircraft',
      longitude: 24.8,
      latitude: 59.4,
      altitudeMeters: 10_000,
      headingDegrees: properties.heading,
      lengthScale: 1,
      extentMeters: 50,
      opacity: 0.98,
      flags: MODEL_FLAG_SELECTED | MODEL_FLAG_DROP_LINE,
      tint: hexColorBytes(band.fill),
      detail: hexColorBytes(band.detail),
    })
    expect(instance.floorPx).toBeCloseTo(FLOOR_PX * 1.08 * properties.markerScale)
  })

  it('keeps grounded or unreported aircraft on the surface without drop lines', () => {
    const entities = [
      aircraft({ id: 'aircraft:a', altitudeMeters: 0 }),
      aircraft({ id: 'aircraft:b', altitudeMeters: undefined }),
      aircraft({ id: 'aircraft:c', altitudeMeters: -30 }),
    ]
    const instances = trafficModelInstances(entities, flat(entities), 'light', DIMENSIONS)
    expect(instances.map(({ altitudeMeters, flags }) => [altitudeMeters, flags])).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ])
  })

  it('scales vessels by reported length and dims stale observations per theme', () => {
    const entities = [
      vessel(),
      vessel({ id: 'vessel:2', mmsi: 2, lengthMeters: 1, freshness: 'stale' }),
      vessel({ id: 'vessel:3', mmsi: 3, lengthMeters: 600, freshness: 'stale' }),
      vessel({ id: 'vessel:4', mmsi: 4, lengthMeters: undefined }),
    ]
    const features = flat(entities)
    for (const theme of ['dark', 'light'] as const) {
      const instances = trafficModelInstances(entities, features, theme, DIMENSIONS)
      const treatment = trafficIconTreatment(theme)
      expect(instances.map((instance) => instance.lengthScale)).toEqual([4, 1, 1, 1])
      expect(instances.map((instance) => instance.extentMeters)).toEqual([200, 50, 50, 50])
      expect(instances.map((instance) => instance.opacity)).toEqual(
        theme === 'dark' ? [0.98, 0.52, 0.52, 0.98] : [0.98, 0.54, 0.54, 0.98],
      )
      expect(instances[0]).toMatchObject({
        model: features[0].properties!.markerIcon,
        altitudeMeters: 0,
        flags: 0,
        tint: hexColorBytes(treatment.vesselFill),
        detail: hexColorBytes(treatment.vesselDetail),
      })
      expect(instances[0].floorPx).toBeCloseTo(
        FLOOR_PX * 0.86 * features[0].properties!.markerScale,
      )
    }
  })

  it('flags zoom-context samples and never marks them selected', () => {
    const entities = [aircraft()]
    const [instance] = trafficModelInstances(
      entities,
      flat(entities, 'aircraft:abc123', true),
      'dark',
      DIMENSIONS,
    )
    expect(instance.flags).toBe(MODEL_FLAG_ZOOM_CONTEXT | MODEL_FLAG_DROP_LINE)
  })

  it('skips features that do not align with their entities', () => {
    const entities = [aircraft({ id: 'aircraft:a' }), aircraft({ id: 'aircraft:b' })]
    const features = flat(entities).reverse()
    expect(trafficModelInstances(entities, features, 'dark', DIMENSIONS)).toEqual([])
  })
})

const satellite: ModeledOrbitalPosition = {
  id: 'orbital:694',
  noradCatalogId: '694',
  name: 'ATLAS CENTAUR 2',
  internationalDesignator: '1963-047A',
  objectType: 'PAY',
  sourceGroups: ['visual'],
  displayOrder: 694,
  elementEpoch: 1,
  snapshotRetrievedAt: 2,
  snapshotSha256: 'a'.repeat(64),
  modeledFor: 3,
  latitude: 10,
  longitude: 20,
  altitudeKm: 600,
  velocityKmPerSecond: 7.6,
  travelBearingDegrees: 37,
}

const iss: ModeledOrbitalPosition = {
  ...satellite,
  id: 'orbital:25544',
  noradCatalogId: '25544',
  name: 'ISS (ZARYA)',
  internationalDesignator: '1998-067A',
  sourceGroups: ['visual', 'stations'],
  displayOrder: 25544,
  travelBearingDegrees: undefined,
}

describe('orbital model instances', () => {
  it('draws only shown curated objects at modeled altitude', () => {
    const hidden = { ...satellite, id: 'orbital:hidden' }
    const instances = orbitalModelInstances(
      [satellite, iss, hidden],
      ['orbital:694', 'orbital:25544'],
      'orbital:694',
      'dark',
      false,
      DIMENSIONS,
    )
    const treatment = orbitalIconTreatment('dark', 'PAY')
    expect(instances).toHaveLength(2)
    expect(instances[0]).toMatchObject({
      id: 'orbital:694',
      model: 'orbital-payload',
      altitudeMeters: 600_000,
      headingDegrees: 37,
      opacity: 0.94,
      flags: MODEL_FLAG_SELECTED | MODEL_FLAG_DROP_LINE,
      tint: hexColorBytes(treatment.fill),
      detail: hexColorBytes(treatment.detail),
    })
    expect(instances[0].floorPx).toBeCloseTo(FLOOR_PX * 0.72)
    expect(instances[1]).toMatchObject({
      id: 'orbital:25544',
      headingDegrees: 0,
      flags: MODEL_FLAG_DROP_LINE,
    })
    expect(instances[1].floorPx).toBeCloseTo(FLOOR_PX * 1.08)
    expect(orbitalModelInstances([satellite], [], null, 'dark', false, DIMENSIONS)).toEqual([])
  })

  it('uses the Starlink spacecraft only for Starlink payloads', () => {
    const rocketBody = { ...satellite, id: 'starlink:rb', objectType: 'R/B' as const }
    const payload = { ...iss, id: 'starlink:pay' }
    const instances = orbitalModelInstances(
      [payload, rocketBody],
      ['starlink:pay', 'starlink:rb'],
      null,
      'light',
      true,
      DIMENSIONS,
    )
    expect(instances.map(({ model, flags, opacity }) => [model, flags, opacity])).toEqual([
      ['orbital-starlink-spacecraft', 0, 0.96],
      ['orbital-rocket-body', 0, 0.96],
    ])
    expect(instances[0].tint).toEqual(hexColorBytes(starlinkIconTreatment('light').fill))
    expect(instances[1].floorPx).toBeCloseTo(FLOOR_PX * 0.78)
  })
})

const instance = (
  id: string,
  model: TrafficModelId,
  longitude: number,
  overrides: Partial<ModelInstance> = {},
): ModelInstance => ({
  id,
  model,
  longitude,
  latitude: 45,
  altitudeMeters: 1_234,
  headingDegrees: 90,
  lengthMeters: 50,
  beamMeters: 40,
  lengthScale: 1.5,
  extentMeters: 75,
  floorPx: 30,
  opacity: 0.5,
  flags: MODEL_FLAG_DROP_LINE,
  tint: [1, 2, 3],
  detail: [4, 5, 6],
  ...overrides,
})

describe('model instance packing', () => {
  it('groups models into contiguous runs in catalog order', () => {
    const packed = packModelInstances(
      [
        instance('a', 'vessel-cargo', 0),
        instance('b', 'aircraft', 0),
        instance('c', 'vessel-cargo', 0),
        instance('d', 'aircraft', 0),
      ],
      { x: 0.5, y: 0.5 },
    )
    expect(packed.instances.map(({ id }) => id)).toEqual(['b', 'd', 'a', 'c'])
    expect(packed.runs).toEqual([
      { model: 'aircraft', first: 0, count: 2 },
      { model: 'vessel-cargo', first: 2, count: 2 },
    ])
    expect(packed.data.byteLength).toBe(4 * MODEL_INSTANCE_STRIDE_BYTES)
  })

  it('packs relative-to-reference offsets across the antimeridian', () => {
    const reference = { x: mercatorX(179.9), y: mercatorY(45) }
    const packed = packModelInstances(
      [instance('east', 'aircraft-heavy', -179.9, { flags: 6 })],
      reference,
    )
    const floats = new Float32Array(packed.data)
    const bytes = new Uint8Array(packed.data)
    expect(MODEL_INSTANCE_FLOATS * 4).toBe(MODEL_INSTANCE_STRIDE_BYTES)
    expect(floats[0]).toBeCloseTo(0.2 / 360, 9)
    expect(floats[1]).toBeCloseTo(0, 9)
    expect(floats[2]).toBeCloseTo(-179.9 * RADIANS, 5)
    expect(floats[3]).toBeCloseTo(45 * RADIANS, 6)
    expect(floats[4]).toBeCloseTo(mercatorUnitsPerMeter(45), 12)
    expect(Array.from(floats.slice(5, 12))).toEqual([
      1_234,
      Math.fround(90 * RADIANS),
      1.5,
      30,
      75,
      0.5,
      6,
    ])
    expect(Array.from(bytes.slice(48, 56))).toEqual([1, 2, 3, 255, 4, 5, 6, 255])
    expect(packed.reference).toEqual(reference)
    expect(packed.reference).not.toBe(reference)
  })
})
