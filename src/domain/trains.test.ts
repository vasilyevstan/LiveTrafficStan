import { describe, expect, it } from 'vitest'
import { TRAIN_CONFIG } from '../config/appConfig'
import {
  displayTrains,
  isTrainId,
  trainCategoryLabel,
  trainId,
  trainSummary,
  viewportIntersectsTrainSource,
  withDerivedCourses,
  type TrainPosition,
} from './trains'
import { assessTrafficViewport, type TrafficViewport } from './viewport'

const viewportAround = (
  longitude: number,
  latitude: number,
  halfSpanDegrees: number,
): TrafficViewport => {
  const assessment = assessTrafficViewport({
    center: { latitude, longitude },
    perimeter: [
      { latitude: latitude + halfSpanDegrees, longitude: longitude - halfSpanDegrees },
      { latitude: latitude + halfSpanDegrees, longitude: longitude + halfSpanDegrees },
      { latitude: latitude - halfSpanDegrees, longitude: longitude + halfSpanDegrees },
      { latitude: latitude - halfSpanDegrees, longitude: longitude - halfSpanDegrees },
    ],
    pitchDegrees: 0,
  }, { coordinatePrecision: 3, maximumRadiusKm: 100 })
  if (!assessment.viewport) throw new Error('fixture viewport is invalid')
  return assessment.viewport
}

const train = (overrides: Partial<TrainPosition> = {}): TrainPosition => ({
  id: trainId('lirr', '7756_6412'),
  sourceId: 'lirr',
  name: 'Train 6412',
  category: 'commuter',
  longitude: -73.6874,
  latitude: 40.82904,
  observedAt: 1_000_000,
  ...overrides,
})

describe('train identity and labels', () => {
  it('namespaces identities by source and summarizes destinations', () => {
    expect(trainId('entur', '2242-2026-11-14')).toBe('train:entur:2242-2026-11-14')
    expect(isTrainId('train:mbta:1724')).toBe(true)
    expect(isTrainId('aircraft:abc123')).toBe(false)
    expect(trainSummary(train())).toBe('Train 6412')
    expect(trainSummary(train({ destination: 'Babylon' }))).toBe('Train 6412 → Babylon')
    expect(trainCategoryLabel('freight')).toBe('Freight')
    expect(trainCategoryLabel('other')).toBe('Other rail movement')
  })
})

describe('train source coverage', () => {
  const finland = { west: 19, south: 59.5, east: 32, north: 70.2 }

  it('queries a source only when the viewport rectangle can intersect it', () => {
    expect(viewportIntersectsTrainSource(viewportAround(24.94, 60.17, 0.5), finland)).toBe(true)
    expect(viewportIntersectsTrainSource(viewportAround(-71.06, 42.36, 0.5), finland)).toBe(false)
    expect(viewportIntersectsTrainSource(viewportAround(24.94, 50, 2), finland)).toBe(false)
  })

  it('handles views whose unwrapped longitudes cross the antimeridian', () => {
    const view = viewportAround(179.8, 60, 0.5)
    expect(view.polygon.some((corner) => corner.longitude > 180)).toBe(true)
    expect(viewportIntersectsTrainSource(view, { west: -180, south: 59, east: -179.5, north: 61 }))
      .toBe(true)
    expect(viewportIntersectsTrainSource({ ...view, polygon: [] }, finland)).toBe(false)
  })
})

describe('displayed trains', () => {
  const limits = { staleAfterMs: 120_000, expireAfterMs: 600_000 }
  const view = viewportAround(-73.7, 40.8, 0.3)

  it('filters to the visible viewport and marks stale observations', () => {
    const now = 2_000_000
    const shown = displayTrains([
      train({ id: 'train:lirr:current', observedAt: now - 30_000 }),
      train({ id: 'train:lirr:stale', observedAt: now - 300_000 }),
      train({ id: 'train:lirr:expired', observedAt: now - 600_001 }),
      train({ id: 'train:lirr:outside', longitude: -72 }),
      train({ id: 'train:lirr:future', observedAt: now + 30_000 }),
    ], view, now, limits)
    expect(shown.map(({ id, freshness }) => [id, freshness])).toEqual([
      ['train:lirr:current', 'current'],
      ['train:lirr:stale', 'stale'],
      ['train:lirr:future', 'current'],
    ])
    expect(displayTrains([train()], null, now, limits)).toEqual([])
  })
})

describe('derived train courses', () => {
  const limits = TRAIN_CONFIG.course

  it('derives a bearing only from two observed positions of the same train', () => {
    const before = train({ latitude: 40.8, longitude: -73.7, observedAt: 0 })
    const north = train({ latitude: 40.81, longitude: -73.7, observedAt: 60_000 })
    const [derived] = withDerivedCourses([north], [before], limits)
    expect(derived!.courseOrigin).toBe('derived')
    expect(derived!.courseDegrees).toBeCloseTo(0, 5)

    const east = train({ latitude: 40.8, longitude: -73.69, observedAt: 60_000 })
    expect(withDerivedCourses([east], [before], limits)[0]!.courseDegrees).toBeCloseTo(90, 1)
    expect(withDerivedCourses([north], [], limits)[0]).not.toHaveProperty('courseDegrees')
    expect(withDerivedCourses(
      [north],
      [train({ ...before, id: 'train:lirr:other' })],
      limits,
    )[0]).not.toHaveProperty('courseDegrees')
  })

  it('preserves reported courses and never invents one across long or reversed gaps', () => {
    const before = train({ latitude: 40.8, longitude: -73.7, observedAt: 0 })
    const reported = train({
      latitude: 40.81,
      longitude: -73.7,
      observedAt: 60_000,
      courseDegrees: 200,
      courseOrigin: 'reported',
    })
    expect(withDerivedCourses([reported], [before], limits)[0]).toBe(reported)

    const late = train({ latitude: 40.81, longitude: -73.7, observedAt: limits.maximumIntervalMs + 1 })
    expect(withDerivedCourses([late], [before], limits)[0]).not.toHaveProperty('courseDegrees')

    const reversed = train({ latitude: 40.81, longitude: -73.7, observedAt: -1 })
    expect(withDerivedCourses([reversed], [before], limits)[0]).not.toHaveProperty('courseDegrees')
  })

  it('keeps the last derived course while a train is stationary', () => {
    const moving = train({ observedAt: 0, courseDegrees: 42, courseOrigin: 'derived' })
    const stopped = train({ observedAt: 60_000, longitude: moving.longitude + 0.0001 })
    expect(withDerivedCourses([stopped], [moving], limits)[0]).toMatchObject({
      courseDegrees: 42,
      courseOrigin: 'derived',
    })
    expect(withDerivedCourses([stopped], [train({ observedAt: 0 })], limits)[0])
      .not.toHaveProperty('courseDegrees')
  })
})
