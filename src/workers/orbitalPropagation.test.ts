import { describe, expect, it, vi } from 'vitest'
import {
  modelOrbitalPositions,
  orbitalTravelBearing,
  predictOrbitalView,
  predictOrbitalViewAsync,
  prepareOrbitalCatalog,
} from './orbitalPropagation'
import type { OrbitalCatalogSnapshot, OrbitalObject } from '../domain/orbital'
import type { OrbitalPropagationLimits } from './orbitalProtocol'
import * as satelliteJs from './satelliteJs'
import { ORBITAL_VIEW_CONFIG } from '../config/appConfig'

const object: OrbitalObject = {
  noradCatalogId: '694',
  name: 'ATLAS CENTAUR 2',
  internationalDesignator: '1963-047A',
  objectType: 'PAY',
  epoch: '2026-09-28T00:48:48.238560Z',
  meanMotion: 14.12743636,
  eccentricity: 0.05447525,
  inclination: 30.3513,
  rightAscensionOfAscendingNode: 144.1518,
  argumentOfPericenter: 64.668,
  meanAnomaly: 300.9324,
  ephemerisType: 0,
  classificationType: 'U',
  elementSetNumber: 999,
  revolutionAtEpoch: 16025,
  bstar: 0.00026100196,
  meanMotionDot: 0.0000222,
  meanMotionDdot: 0,
  sourceGroups: ['visual'],
  displayOrder: 694,
}

const snapshot = (record = object): OrbitalCatalogSnapshot => ({
  schemaVersion: 2,
  sourceContractVersion: 2,
  catalogId: 'celestrak-curated-v1',
  sources: [
    {
      group: 'visual',
      gpSourceUrl: 'https://example.test/gp',
      satcatSourceUrl: 'https://example.test/satcat',
      gpRecordCount: 1,
      satcatRecordCount: 1,
    },
  ],
  retrievedAt: '2026-09-28T00:49:00.000Z',
  publishedAt: '2026-09-28T00:49:00.000Z',
  recordCount: 1,
  records: [record],
  sha256: 'a'.repeat(64),
})

const limits: OrbitalPropagationLimits = {
  maximumElementAgeMs: 14 * 24 * 60 * 60_000,
  maximumFutureElementMs: 10 * 60_000,
  maximumAltitudeKm: 100_000,
  predictionHorizonMs: 90 * 60_000,
  predictionStepMs: 30_000,
  maximumDetailedResults: 20,
  trackDurationMs: 15 * 60_000,
  maximumTrackPoints: 31,
  predictionChunkSize: 8,
}

const epoch = Date.parse(object.epoch)

describe('Earth-relative orbital travel bearing', () => {
  it.each([
    [0, 0, 0], [90, 0, 90], [180, 45, -170],
    [270, -80, 179.9], [359, 80, -179.9], [1, -30, 120],
  ])('projects heading %s at latitude %s and inertial longitude %s', (bearing, latitude, longitude) => {
    const radians = Math.PI / 180
    const phi = latitude * radians, angle = longitude * radians
    const radius = 7_000 * Math.cos(phi)
    const east = 7 * Math.sin(bearing * radians) + 7.2921151467e-5 * radius
    const north = 7 * Math.cos(bearing * radians)
    const velocity = {
      x: -Math.sin(angle) * east - Math.cos(angle) * Math.sin(phi) * north,
      y: Math.cos(angle) * east - Math.sin(angle) * Math.sin(phi) * north,
      z: Math.cos(phi) * north,
    }
    expect(orbitalTravelBearing(
      { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }, velocity, phi,
    )).toBeCloseTo(bearing, 9)
  })

  it('does not confuse inertial eastward speed with stationary, radial or westward Earth-relative motion', () => {
    const position = { x: 42_164, y: 0 }
    const rotation = 7.2921151467e-5 * position.x
    expect(orbitalTravelBearing(position, { x: 0, y: rotation, z: 0 }, 0)).toBeUndefined()
    expect(orbitalTravelBearing(position, { x: 2, y: rotation, z: 0 }, 0)).toBeUndefined()
    expect(orbitalTravelBearing(position, { x: 0, y: rotation - 0.1, z: 0 }, 0)).toBe(270)
    const minimum = ORBITAL_VIEW_CONFIG.minimumTravelSpeedKmPerSecond
    expect(orbitalTravelBearing(position, { x: 0, y: rotation + minimum / 2, z: 0 }, 0)).toBeUndefined()
    expect(orbitalTravelBearing(position, { x: 0, y: rotation + minimum * 2, z: 0 }, 0)).toBe(90)
  })

  it('leaves invalid vectors and an undefined polar basis without an invented direction', () => {
    expect(orbitalTravelBearing({ x: 0, y: 0 }, { x: 0, y: 0, z: 7 }, Math.PI / 2)).toBeUndefined()
    expect(orbitalTravelBearing({ x: NaN, y: 0 }, { x: 0, y: 7, z: 0 }, 0)).toBeUndefined()
    expect(orbitalTravelBearing({ x: 7_000, y: 0 }, { x: 0, y: Infinity, z: 0 }, 0)).toBeUndefined()
    expect(orbitalTravelBearing({ x: 7_000, y: 0 }, { x: 0, y: 7, z: 0 }, NaN)).toBeUndefined()
    expect(orbitalTravelBearing({ x: 7_000, y: 0 }, { x: 0, y: 7, z: 0 }, Math.PI)).toBeUndefined()
  })
})

describe('orbital SGP4 propagation', () => {
  it('matches a pinned ordinary LEO reference vector', () => {
    const catalog = prepareOrbitalCatalog(snapshot(), limits)
    const [position] = modelOrbitalPositions(catalog, epoch)

    expect(position.id).toBe('orbital:694')
    expect(position.latitude).toBeCloseTo(0.0000088714, 6)
    expect(position.longitude).toBeCloseTo(125.1317693, 5)
    expect(position.altitudeKm).toBeCloseTo(662.5911321, 3)
    expect(position.velocityKmPerSecond).toBeCloseTo(7.6241986, 5)
    expect(position).not.toHaveProperty('observedAt')
  })

  it('uses the existing selected propagation once and agrees with modeled Earth-relative motion', () => {
    const catalog = prepareOrbitalCatalog(snapshot(), limits)
    const propagate = vi.spyOn(satelliteJs, 'propagate')
    try {
      const [position] = modelOrbitalPositions(catalog, epoch, 'orbital:694')
      expect(propagate).toHaveBeenCalledTimes(1)
      expect(position.travelBearingDegrees).toBeGreaterThan(0)
      expect(position.travelBearingDegrees).toBeLessThan(90)
    } finally {
      propagate.mockRestore()
    }
    for (const minutes of [0, 10, 30, 55, 90]) {
      const time = epoch + minutes * 60_000
      const [position] = modelOrbitalPositions(catalog, time)
      const [before] = modelOrbitalPositions(catalog, time - 1_000)
      const [after] = modelOrbitalPositions(catalog, time + 1_000)
      const longitudeDelta = ((after.longitude - before.longitude + 540) % 360) - 180
      const direction = Math.atan2(longitudeDelta * Math.cos(position.latitude * Math.PI / 180),
        after.latitude - before.latitude) * 180 / Math.PI
      if (position.travelBearingDegrees === undefined) throw Error('Expected modeled travel')
      const error = Math.abs(((position.travelBearingDegrees - direction + 540) % 360) - 180)
      // The viewer sphere is not the geodetic ellipsoid used by SGP4's conversion.
      expect(error).toBeLessThan(0.25)
    }
  })

  it('supports six-digit catalog IDs and rejects over-age elements', () => {
    const sixDigit = { ...object, noradCatalogId: '100000' }
    const catalog = prepareOrbitalCatalog(snapshot(sixDigit), limits)
    expect(modelOrbitalPositions(catalog, epoch)[0]?.id).toBe(
      'orbital:100000',
    )
    expect(
      modelOrbitalPositions(
        catalog,
        epoch + limits.maximumElementAgeMs + 1,
      ),
    ).toEqual([])
  })

  it('propagates only the exact selected canonical ID and never treats a mismatch as all objects', () => {
    const records = [object, { ...object, noradCatalogId: '695', displayOrder: 695 }]
    const catalog = prepareOrbitalCatalog({ ...snapshot(), records, recordCount: records.length }, limits)
    const ordinary = modelOrbitalPositions(catalog, epoch)
    expect(ordinary).toHaveLength(2)
    expect(modelOrbitalPositions(catalog, epoch, 'orbital:695')).toEqual([ordinary[1]])
    expect(modelOrbitalPositions(catalog, epoch, 'orbital:starlink:695')).toEqual([])
    expect(modelOrbitalPositions(catalog, epoch, 'orbital:696')).toEqual([])
    expect(modelOrbitalPositions(catalog, epoch, null)).toEqual([])
    expect(modelOrbitalPositions(catalog, epoch, undefined)).toEqual(ordinary)
  })

  it('reports current and future local crossings with bounded detail', () => {
    const catalog = prepareOrbitalCatalog(snapshot(), limits)
    const futureTime = epoch + 10 * 60_000
    const [future] = modelOrbitalPositions(catalog, futureTime)
    const prediction = predictOrbitalView(
      catalog,
      epoch,
      {
        kind: 'local',
        center: {
          latitude: future.latitude,
          longitude: future.longitude,
        },
        polygon: [
          {
            latitude: future.latitude - 2,
            longitude: future.longitude - 2,
          },
          {
            latitude: future.latitude - 2,
            longitude: future.longitude + 2,
          },
          {
            latitude: future.latitude + 2,
            longitude: future.longitude + 2,
          },
          {
            latitude: future.latitude + 2,
            longitude: future.longitude - 2,
          },
        ],
      },
      'orbital:694',
    )

    expect(prediction.mode).toBe('local')
    expect(prediction.totalResults).toBe(1)
    expect(prediction.results[0]).toMatchObject({
      id: 'orbital:694',
      currentlyInView: false,
    })
    expect(prediction.results[0].firstCrossingAt).toBeGreaterThan(epoch)
    expect(
      prediction.trackSegments.flatMap(({ points }) => points),
    ).toHaveLength(31)
  })

  it('treats a whole-world view separately from crossing ranking', () => {
    const catalog = prepareOrbitalCatalog(snapshot(), limits)
    const prediction = predictOrbitalView(
      catalog,
      epoch,
      { kind: 'world' },
      null,
    )
    expect(prediction).toMatchObject({
      mode: 'world',
      totalResults: 1,
      inViewCount: 1,
      futureCrossingCount: 0,
    })
    expect(prediction.message).toMatch(/whole world/i)
  })

  it('filters prediction populations by exact type and source group', () => {
    const records = [
      object,
      {
        ...object,
        noradCatalogId: '695',
        name: 'SCIENCE BODY',
        objectType: 'R/B' as const,
        sourceGroups: ['science' as const],
        displayOrder: 4_000_000_695,
      },
      {
        ...object,
        noradCatalogId: '696',
        name: 'VISUAL BODY',
        objectType: 'R/B' as const,
        displayOrder: 696,
      },
    ]
    const catalog = prepareOrbitalCatalog(
      {
        ...snapshot(),
        recordCount: records.length,
        records,
      },
      limits,
    )
    const prediction = predictOrbitalView(
      catalog,
      epoch,
      { kind: 'world' },
      'orbital:694',
      { objectType: 'R/B', sourceGroup: 'science' },
    )

    expect(prediction).toMatchObject({
      mode: 'world',
      totalResults: 1,
      inViewCount: 1,
      futureCrossingCount: 0,
    })
    expect(prediction.results.map(({ id }) => id)).toEqual([
      'orbital:695',
    ])
    expect(prediction.trackSegments.length).toBeGreaterThan(0)
  })

  it('yields and cancels obsolete chunked predictions before publishing', async () => {
    const records = Array.from({ length: 24 }, (_, index) => ({
      ...object,
      noradCatalogId: String(700 + index),
      name: `OBJECT ${700 + index}`,
      displayOrder: 700 + index,
    }))
    const catalog = prepareOrbitalCatalog(
      {
        ...snapshot(),
        recordCount: records.length,
        records,
      },
      { ...limits, predictionChunkSize: 1 },
    )
    let cancelled = false
    let yields = 0

    const prediction = await predictOrbitalViewAsync(
      catalog,
      epoch,
      { kind: 'world' },
      null,
      { objectType: 'all', sourceGroup: 'all' },
      {
        shouldCancel: () => cancelled,
        yieldControl: async () => {
          yields += 1
          cancelled = true
        },
      },
    )

    expect(yields).toBe(1)
    expect(prediction).toBeUndefined()
  })

  it('splits selected tracks instead of drawing across the antimeridian', () => {
    const catalog = prepareOrbitalCatalog(snapshot(), limits)
    let crossingTime = epoch
    let previous = modelOrbitalPositions(catalog, epoch)[0]
    for (let offset = 60_000; offset <= 24 * 60 * 60_000; offset += 60_000) {
      const next = modelOrbitalPositions(catalog, epoch + offset)[0]
      if (Math.abs(next.longitude - previous.longitude) > 180) {
        crossingTime = epoch + offset
        break
      }
      previous = next
    }
    const crossingPosition = modelOrbitalPositions(
      catalog,
      crossingTime,
    )[0]

    const prediction = predictOrbitalView(
      catalog,
      crossingTime,
      {
        kind: 'local',
        center: {
          latitude: crossingPosition.latitude,
          longitude: crossingPosition.longitude,
        },
        polygon: [
          {
            latitude: crossingPosition.latitude - 1,
            longitude: crossingPosition.longitude - 1,
          },
          {
            latitude: crossingPosition.latitude - 1,
            longitude: crossingPosition.longitude + 1,
          },
          {
            latitude: crossingPosition.latitude + 1,
            longitude: crossingPosition.longitude + 1,
          },
          {
            latitude: crossingPosition.latitude + 1,
            longitude: crossingPosition.longitude - 1,
          },
        ],
      },
      'orbital:694',
    )
    expect(prediction.trackSegments.length).toBeGreaterThan(1)
    for (const segment of prediction.trackSegments) {
      for (let index = 1; index < segment.points.length; index += 1) {
        expect(
          Math.abs(
            segment.points[index].longitude -
              segment.points[index - 1].longitude,
          ),
        ).toBeLessThanOrEqual(180)
      }
    }
  })
})
