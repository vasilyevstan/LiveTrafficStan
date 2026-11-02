import type { TrafficQuery } from '../providers/types'
import type {
  TrafficViewport,
  ViewportAssessment,
} from './viewport'

const RADIUS_EPSILON_KM = 0.000_001

export interface TrafficViewportScopes {
  aircraft: TrafficViewport | null
  marine: TrafficViewport | null
}

export const viewportWithinMaximum = (
  viewport: TrafficViewport | null,
  maximumRadiusKm: number,
) =>
  viewport &&
  (viewport.measuredRadiusKm ?? viewport.enclosingRadiusKm) -
      maximumRadiusKm <=
    RADIUS_EPSILON_KM
    ? viewport.enclosingRadiusKm > maximumRadiusKm
      ? { ...viewport, enclosingRadiusKm: maximumRadiusKm }
      : viewport
    : null

export const trafficViewportScopes = (
  assessment: ViewportAssessment | null,
  marineMaximumRadiusKm: number,
): TrafficViewportScopes => {
  const aircraft =
    assessment?.kind === 'eligible' ? assessment.viewport : null
  return {
    aircraft,
    marine: viewportWithinMaximum(aircraft, marineMaximumRadiusKm),
  }
}

export const trafficQueryForViewport = (
  viewport: TrafficViewport | null,
): TrafficQuery | null =>
  viewport
    ? {
        center: viewport.center,
        radiusKm: viewport.enclosingRadiusKm,
      }
    : null
