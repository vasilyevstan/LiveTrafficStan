import { describe, expect, it } from 'vitest'
import { JOURNEY_CONFIG } from '../../config/appConfig'
import { parseMarineJourneyHistory } from './marineJourneyNormalization'
import { JOURNEY_TEST_MMSI as mmsi, JOURNEY_TEST_NOW as now, marineHistoryFixture } from './marineJourneyFixtures'

const parse = (value: unknown) => parseMarineJourneyHistory(value, mmsi, now - 86_400_000, now, now + 100)

describe('anonymous received ship-history normalization', () => {
  it('uses root attribution, RFC3339 clocks and provider break-start indexes', () => {
    const fixture = marineHistoryFixture()
    const history = parse(fixture)
    expect(history.segments.map(points => points.map(point => point.observedAt)))
      .toEqual([[now - 120_000, now - 100_000], [now - 40_000, now - 10_000]])
    expect(history.attribution).toEqual(Object.values(fixture.attribution))
    expect(history.receptionBreaks).toBe(1)
    expect(history.timeGaps).toBe(0)
    expect(Object.isFrozen(history.segments[0]![0])).toBe(true)
    fixture.geometry.coordinates[0]![0] = 0
    expect(history.segments[0]![0]!.longitude).toBe(24.6)
  })

  it('treats optional gap and simplification metadata as unknown rather than zero', () => {
    const fixture = marineHistoryFixture()
    for (const key of ['breaks', 'simplified', 'tolerance_m']) Reflect.deleteProperty(fixture.properties, key)
    const history = parse(fixture)
    expect(history.receptionBreaks).toBeUndefined()
    expect(history.simplified).toBeUndefined()
    expect(history.toleranceMeters).toBeUndefined()
    expect(history.segments).toHaveLength(1)
  })

  it('keeps sparse intervals separate without inventing provider reception outages', () => {
    const fixture = marineHistoryFixture()
    fixture.properties.breaks = []
    fixture.properties.times[0] = new Date(now - 5_000_000).toISOString()
    const history = parse(fixture)
    expect(history.receptionBreaks).toBe(0)
    expect(history.timeGaps).toBe(1)
    expect(history.segments.map(points => points.length)).toEqual([1, 3])
  })

  it('accepts a clamped subset but rejects a broader window or points outside it', () => {
    const fixture = marineHistoryFixture()
    fixture.properties.from = new Date(now - 200_000).toISOString()
    expect(parse(fixture).windowLimited).toBe(true)
    fixture.properties.from = new Date(now - 86_400_001).toISOString()
    expect(() => parse(fixture)).toThrow()
    fixture.properties.from = new Date(now - 30_000).toISOString()
    expect(() => parse(fixture)).toThrow()
  })

  it('distinguishes a successful empty response and a single point from a path', () => {
    const base = marineHistoryFixture()
    const empty = {
      ...base, geometry: null, attribution: {},
      properties: { ...base.properties, points: 0, breaks: [], times: [], sog: [], cog: [], heading: [], nav_status: [] },
    }
    expect(parse(empty).pointCount).toBe(0)
    const point = {
      ...base, geometry: { type: 'Point', coordinates: [24.6, 59.5] },
      properties: {
        ...base.properties, points: 1, breaks: [], times: [new Date(now).toISOString()],
        sog: [null], cog: [null], heading: [null], nav_status: [null],
      },
    }
    expect(parse(point).segments[0]).toHaveLength(1)
  })

  it('rejects mismatched identity, malformed geometry, clocks, breaks, aligned arrays and credits', () => {
    const mutations: ((fixture: ReturnType<typeof marineHistoryFixture>) => void)[] = [
      value => { value.id += 1 },
      value => { value.properties.mmsi += 1 },
      value => { value.geometry.coordinates[0] = [181, 90] },
      value => { value.geometry.coordinates.pop() },
      value => { value.properties.times[1] = value.properties.times[0]! },
      value => { value.properties.times[0] = '2026-02-30T12:00:00Z' },
      value => { value.properties.times[3] = new Date(now + 1_000).toISOString() },
      value => { value.properties.sog.pop() },
      value => { value.properties.heading[0] = 1.5 },
      value => { value.properties.breaks = [2, 2] },
      value => { value.properties.breaks = [4] },
      value => { value.properties.points = JOURNEY_CONFIG.maximumObservedPoints + 1 },
      value => { value.attribution.aisstream = '' },
      value => { value.attribution.aisstream = 'credit\nwith control' },
      value => { Reflect.deleteProperty(value, 'attribution') },
      value => { Reflect.deleteProperty(value.properties, 'nav_status') },
    ]
    for (const mutate of mutations) {
      const fixture = marineHistoryFixture()
      mutate(fixture)
      expect(() => parse(fixture)).toThrow()
    }
  })
})
