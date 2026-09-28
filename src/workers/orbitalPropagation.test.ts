import { describe, expect, it } from 'vitest'
import {
  modelOrbitalPositions,
  predictOrbitalView,
  prepareOrbitalCatalog,
} from './orbitalPropagation'
import type { OrbitalCatalogSnapshot, OrbitalObject } from '../domain/orbital'
import type { OrbitalPropagationLimits } from './orbitalProtocol'

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
}

const snapshot = (record = object): OrbitalCatalogSnapshot => ({
  schemaVersion: 1,
  sourceContractVersion: 1,
  group: 'visual',
  gpSourceUrl: 'https://example.test/gp',
  satcatSourceUrl: 'https://example.test/satcat',
  retrievedAt: '2026-09-28T00:49:00.000Z',
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
}

const epoch = Date.parse(object.epoch)

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
