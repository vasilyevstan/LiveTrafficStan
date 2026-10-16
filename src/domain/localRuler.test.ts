import { describe, expect, it } from 'vitest'
import { APP_CONFIG, JOURNEY_CONFIG, LOCAL_MAP_TOOLS_CONFIG } from '../config/appConfig'
import type { Coordinates } from './center'
import { geodesicJourneyArc } from './journey'
import {
  EMPTY_LOCAL_RULER, formatLocalRulerDistance, localRulerArc, reduceLocalRuler,
  rulerAllowsDeferredInteraction, rulerAvailabilityMessage, type LocalRulerAction, type LocalRulerState,
} from './localRuler'

const a = { latitude: 0, longitude: 0 }
const b = { latitude: 0, longitude: 1 }
const apply = (...actions: LocalRulerAction[]) =>
  actions.reduce(reduceLocalRuler, EMPTY_LOCAL_RULER)
const complete = () => apply({ type: 'start' }, { type: 'place', point: a }, { type: 'place', point: b })

describe('local two-point ruler', () => {
  it('owns only two copied points and one revisioned ephemeral result', () => {
    const first = { ...a }
    const state = apply({ type: 'start' }, { type: 'place', point: first }, { type: 'place', point: b })
    first.latitude = 10
    expect(state).toEqual({ phase: 'placing', points: [a, b], revision: 3 })
    expect(Object.isFrozen(state.points[0])).toBe(true)
    expect(reduceLocalRuler(state, { type: 'place', point: a })).toBe(state)
    const done = reduceLocalRuler(state, { type: 'done' })
    expect(done).toEqual({ phase: 'retained', points: [a, b], revision: 4 })
    expect(reduceLocalRuler(done, { type: 'place', point: a })).toBe(done)
    expect(reduceLocalRuler(done, { type: 'start' })).toEqual({ phase: 'placing', points: [], revision: 5 })
    expect(EMPTY_LOCAL_RULER).toEqual({ phase: 'idle', points: [], revision: 0 })
  })

  it('requires two points for Done and clears Cancel or retained Clear', () => {
    const started = apply({ type: 'start' })
    expect(reduceLocalRuler(started, { type: 'done' })).toBe(started)
    const first = reduceLocalRuler(started, { type: 'place', point: a })
    expect(reduceLocalRuler(first, { type: 'done' })).toBe(first)
    for (const state of [first, complete(), reduceLocalRuler(complete(), { type: 'done' })]) {
      for (const type of ['cancel', 'clear'] as const) {
        expect(reduceLocalRuler(state, { type })).toEqual({ revision: state.revision + 1, phase: 'idle', points: [] })
      }
    }
    expect(reduceLocalRuler(EMPTY_LOCAL_RULER, { type: 'clear' })).toBe(EMPTY_LOCAL_RULER)
    expect(reduceLocalRuler(EMPTY_LOCAL_RULER, { type: 'place', point: a })).toBe(EMPTY_LOCAL_RULER)
  })

  it('clears unsupported points once, retains the visible active mode, and never revives old geometry', () => {
    const unsupported = reduceLocalRuler(complete(), { type: 'unsupported' })
    expect(unsupported).toEqual({ revision: 4, phase: 'placing', points: [], problem: 'geometry' })
    expect(reduceLocalRuler(unsupported, { type: 'unsupported' })).toBe(unsupported)
    const supported = reduceLocalRuler(unsupported, { type: 'supported' })
    expect(supported).toEqual({ revision: 5, phase: 'placing', points: [] })
    expect(reduceLocalRuler(supported, { type: 'supported' })).toBe(supported)
    const retained = reduceLocalRuler(complete(), { type: 'done' })
    expect(reduceLocalRuler(retained, { type: 'unsupported' })).toEqual({ revision: 5, phase: 'idle', points: [] })
  })

  it.each<Coordinates>([
    { latitude: NaN, longitude: 0 }, { latitude: 0, longitude: Infinity },
    { latitude: 86, longitude: 0 }, { latitude: 0, longitude: 181 },
    { latitude: -91, longitude: 0 },
  ])('rejects invalid or off-Mercator coordinates as a whole: %j', point => {
    const state = apply({ type: 'start' }, { type: 'place', point: a }, { type: 'place', point })
    expect(state).toMatchObject({ phase: 'placing', points: [], problem: 'points' })
    expect(formatLocalRulerDistance([a, point], 'metric')).toBeUndefined()
    expect(localRulerArc([a, point])).toBeUndefined()
  })

  it('bounds a pair by the existing local-view diameter, including after successive pans', () => {
    expect(APP_CONFIG.map.maximumViewportRadiusKm * 2).toBe(200)
    const tooFar = { latitude: 0, longitude: 2 }
    expect(localRulerArc([a, tooFar])).toBeUndefined()
    expect(apply({ type: 'start' }, { type: 'place', point: a }, { type: 'place', point: tooFar }))
      .toMatchObject({ phase: 'placing', points: [], problem: 'points' })
    expect(localRulerArc([a, { latitude: 0, longitude: 1.79 }])).toBeDefined()
  })

  it('rejects the whole high-latitude arc rather than silently joining removed vertices', () => {
    const points = [{ latitude: 85.051, longitude: -5 }, { latitude: 85.051, longitude: 5 }] as const
    expect(geodesicJourneyArc(...points, { maximumPoints: 124, stepDegrees: 0.05 })!.some(p => p.latitude > 85.05113)).toBe(true)
    expect(localRulerArc(points)).toBeUndefined()
  })

  it('formats approximate distances with at most three significant digits, without mutating endpoints', () => {
    const state = complete()
    expect(formatLocalRulerDistance(state.points, 'metric')).toBe('111 km')
    expect(formatLocalRulerDistance(state.points, 'aviation-nautical')).toBe('60 NM')
    expect(formatLocalRulerDistance([a, { ...a, longitude: 0.001 }], 'metric')).toBe('111 m')
    expect(formatLocalRulerDistance([a, { ...a, longitude: 0.00899 }], 'metric')).toBe('1 km')
    expect(formatLocalRulerDistance([a, a], 'metric')).toBe('0 m')
    expect(formatLocalRulerDistance([a, a], 'aviation-nautical')).toBe('0 NM')
    expect(formatLocalRulerDistance([], 'metric')).toBeUndefined()
    expect(formatLocalRulerDistance([a], 'metric')).toBeUndefined()
    expect(state.points).toEqual([a, b])
  })

  it('uses short wrapped geometry within the configured budget and preserves default journey sampling', () => {
    const start = { latitude: 59, longitude: 179.7 }, end = { latitude: 59, longitude: -179.7 }
    const arc = localRulerArc([start, end])!
    expect(arc.length).toBeLessThanOrEqual(LOCAL_MAP_TOOLS_CONFIG.rulerMaximumGeometryPoints - 4)
    expect(arc.every(point => Math.abs(point.longitude) >= 179.7)).toBe(true)
    expect(arc[0]).toEqual(start)
    expect(arc.at(-1)).toEqual(end)
    expect(geodesicJourneyArc(a, b)).toEqual(geodesicJourneyArc(a, b, {
      maximumPoints: JOURNEY_CONFIG.maximumArcPoints, stepDegrees: JOURNEY_CONFIG.arcStepDegrees,
    }))
    expect(geodesicJourneyArc(a, b)).toHaveLength(2)
    expect(geodesicJourneyArc(a, b, { maximumPoints: 5, stepDegrees: 0.01 })).toHaveLength(5)
    for (const options of [
      { maximumPoints: 1, stepDegrees: 1 }, { maximumPoints: 2.5, stepDegrees: 1 },
      { maximumPoints: Infinity, stepDegrees: 1 }, { maximumPoints: 5, stepDegrees: 0 },
      { maximumPoints: 5, stepDegrees: NaN },
    ]) expect(geodesicJourneyArc(a, b, options)).toBeUndefined()
  })

  it('offers a specific visible reason for every disabled placement state', () => {
    for (const availability of ['updating', 'unsupported', 'moving', 'obscured'] as const) {
      expect(rulerAvailabilityMessage(availability)).toBeTruthy()
    }
    expect(rulerAvailabilityMessage('available')).toBeUndefined()
  })

  it('advances the interaction fence across a complete start/cancel/start cycle', () => {
    let state: LocalRulerState = EMPTY_LOCAL_RULER
    const revisions = [state.revision]
    for (const action of [{ type: 'start' }, { type: 'cancel' }, { type: 'start' }] as const) {
      state = reduceLocalRuler(state, action)
      revisions.push(state.revision)
    }
    expect(new Set(revisions).size).toBe(4)
  })

  it('fences obsolete deferred success and error work even after placement has ended', () => {
    expect(rulerAllowsDeferredInteraction(EMPTY_LOCAL_RULER, 0)).toBe(true)
    const placing = complete()
    expect(rulerAllowsDeferredInteraction(placing, placing.revision)).toBe(false)
    for (const type of ['done', 'cancel', 'clear', 'unsupported'] as const) {
      const next = reduceLocalRuler(placing, { type })
      expect(rulerAllowsDeferredInteraction(next, placing.revision)).toBe(false)
      expect(rulerAllowsDeferredInteraction(next, 0)).toBe(false)
    }
    const retained = reduceLocalRuler(placing, { type: 'done' })
    expect(rulerAllowsDeferredInteraction(retained, retained.revision)).toBe(true)
  })
})
