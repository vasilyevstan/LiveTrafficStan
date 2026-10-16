import { APP_CONFIG, LOCAL_MAP_TOOLS_CONFIG } from '../config/appConfig'
import type { Coordinates } from './center'
import { distanceKm, isValidCoordinate } from './geo'
import { geodesicJourneyArc } from './journey'
import { KILOMETERS_PER_NAUTICAL_MILE, type UnitSystem } from './units'

export type RulerPoints = readonly [] | readonly [Coordinates] | readonly [Coordinates, Coordinates]
export interface LocalRulerState {
  readonly revision: number
  readonly phase: 'idle' | 'placing' | 'retained'
  readonly points: RulerPoints
  readonly problem?: 'geometry' | 'points'
}
export type LocalRulerAvailability = 'available' | 'moving' | 'updating' | 'unsupported' | 'obscured'
export type LocalRulerAction =
  | { type: 'start' | 'done' | 'cancel' | 'clear' | 'unsupported' | 'supported' }
  | { type: 'place'; point: Coordinates }

export const EMPTY_LOCAL_RULER: LocalRulerState = Object.freeze({
  revision: 0, phase: 'idle', points: [] as const,
})

export const rulerAllowsDeferredInteraction = (state: LocalRulerState, revision: number) =>
  state.phase !== 'placing' && state.revision === revision

const mercatorLatitudeLimit = Math.atan(Math.sinh(Math.PI)) * 180 / Math.PI
export const isLocalRulerPoint = (point: Coordinates) =>
  isValidCoordinate(point.latitude, point.longitude) &&
  Math.abs(point.latitude) <= mercatorLatitudeLimit

export const localRulerArc = (points: RulerPoints) => {
  if (points.length !== 2 || !points.every(isLocalRulerPoint) ||
      distanceKm(points[0], points[1]) > APP_CONFIG.map.maximumViewportRadiusKm * 2) return undefined
  const arc = geodesicJourneyArc(points[0], points[1], {
    maximumPoints: LOCAL_MAP_TOOLS_CONFIG.rulerMaximumGeometryPoints - 4,
    stepDegrees: LOCAL_MAP_TOOLS_CONFIG.rulerArcStepDegrees,
  })
  return arc && arc.every(isLocalRulerPoint) ? arc : undefined
}

export const reduceLocalRuler = (
  state: LocalRulerState,
  action: LocalRulerAction,
): LocalRulerState => {
  const next = (
    phase: LocalRulerState['phase'],
    points: RulerPoints,
    problem?: LocalRulerState['problem'],
  ): LocalRulerState => ({ revision: state.revision + 1, phase, points, ...(problem ? { problem } : {}) })
  switch (action.type) {
    case 'start': return next('placing', [])
    case 'done':
      return state.phase === 'placing' && state.points.length === 2
        ? next('retained', state.points) : state
    case 'clear':
    case 'cancel':
      return state.phase === 'idle' && state.points.length === 0
        ? state : next('idle', [])
    case 'unsupported':
      return state.phase === 'placing'
        ? state.points.length === 0 && state.problem === 'geometry'
          ? state : next('placing', [], 'geometry')
        : state.phase === 'retained' ? next('idle', []) : state
    case 'supported':
      return state.problem === 'geometry' ? next(state.phase, state.points) : state
    case 'place': {
      if (state.phase !== 'placing' || state.points.length === 2) return state
      const point = Object.freeze({ latitude: action.point.latitude, longitude: action.point.longitude })
      const points: RulerPoints = state.points.length === 0 ? [point] : [state.points[0], point]
      return !isLocalRulerPoint(point) || points.length === 2 && !localRulerArc(points)
        ? next('placing', [], 'points') : next('placing', points)
    }
  }
}

const approximateNumber = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 3 })
export const formatLocalRulerDistance = (points: RulerPoints, units: UnitSystem): string | undefined => {
  if (!localRulerArc(points) || points.length !== 2) return undefined
  const kilometers = distanceKm(points[0], points[1])
  if (units === 'aviation-nautical') return `${approximateNumber.format(kilometers / KILOMETERS_PER_NAUTICAL_MILE)} NM`
  const roundedMeters = Number((kilometers * 1_000).toPrecision(3))
  return roundedMeters >= 1_000
    ? `${approximateNumber.format(kilometers)} km`
    : `${approximateNumber.format(kilometers * 1_000)} m`
}

export const rulerAvailabilityMessage = (availability: LocalRulerAvailability) =>
  availability === 'unsupported' ? 'Use a local, level Flat view.'
    : availability === 'updating' ? 'Map style is updating.'
      : availability === 'moving' ? 'Let the map settle to place a point.'
        : availability === 'obscured' ? 'Reveal the map center or close details.'
          : undefined
