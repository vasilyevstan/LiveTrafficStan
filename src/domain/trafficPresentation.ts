import {
  TRAFFIC_MARKER_ICONS,
  type Aircraft,
  type TrafficEntity,
  type TrafficMarkerIcon,
  type Vessel,
} from './traffic'
import { ONE_KNOT_KPH } from './trafficThresholds'
import type { UnitSystem } from './units'

export const RENDER_ONLY_MARKER_ICONS = [
  'vessel-sailing',
  'vessel-pleasure',
  'vessel-highspeed',
] as const

export type RenderTrafficMarkerIcon =
  | TrafficMarkerIcon
  | (typeof RENDER_ONLY_MARKER_ICONS)[number]

export const VESSEL_MOTION_STATES = [
  'moving',
  'slow-stopped',
  'unknown',
] as const
export type VesselMotionState = (typeof VESSEL_MOTION_STATES)[number]

export const AIRCRAFT_ALTITUDE_BANDS = [
  'low',
  'medium',
  'high',
  'cruise',
  'unknown',
] as const
export type AircraftAltitudeBand =
  (typeof AIRCRAFT_ALTITUDE_BANDS)[number]

export const AIRCRAFT_VERTICAL_TRENDS = [
  'climb',
  'small',
  'descent',
  'unknown',
] as const
export type AircraftVerticalTrend =
  (typeof AIRCRAFT_VERTICAL_TRENDS)[number]

export type VesselMotionBadgeIcon =
  `vessel-motion-${VesselMotionState}`
export type AircraftBadgeIcon =
  `aircraft-state-${AircraftAltitudeBand}-${AircraftVerticalTrend}`

export const VESSEL_MOTION_BADGE_ICONS =
  VESSEL_MOTION_STATES.map(
    (state) => `vessel-motion-${state}` as VesselMotionBadgeIcon,
  )

export const AIRCRAFT_BADGE_ICONS = AIRCRAFT_ALTITUDE_BANDS.flatMap(
  (band) =>
    AIRCRAFT_VERTICAL_TRENDS.map(
      (trend) =>
        `aircraft-state-${band}-${trend}` as AircraftBadgeIcon,
    ),
)

export const TRAFFIC_STYLE_IMAGE_IDS = [
  ...TRAFFIC_MARKER_ICONS,
  ...RENDER_ONLY_MARKER_ICONS,
  ...VESSEL_MOTION_BADGE_ICONS,
  ...AIRCRAFT_BADGE_ICONS,
] as const

export type TrafficStyleImageId =
  (typeof TRAFFIC_STYLE_IMAGE_IDS)[number]

export interface AircraftPresentation {
  kind: 'aircraft'
  markerIcon: TrafficMarkerIcon
  headingDegrees: number
  altitudeBand: AircraftAltitudeBand
  verticalTrend: AircraftVerticalTrend
  badgeIcon: AircraftBadgeIcon
}

export interface VesselPresentation {
  kind: 'vessel'
  markerIcon: RenderTrafficMarkerIcon
  headingDegrees: number
  motionState: VesselMotionState
  badgeIcon: VesselMotionBadgeIcon
  navigationConflict: boolean
}

export type TrafficPresentation =
  | AircraftPresentation
  | VesselPresentation

const finiteNumber = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value)

const reportedHeading = (entity: TrafficEntity) => {
  const heading = entity.courseDegrees ?? entity.headingDegrees
  return finiteNumber(heading) ? heading : 0
}

export const vesselMotionState = (
  speedKph: number | undefined,
): VesselMotionState => {
  if (!finiteNumber(speedKph) || speedKph < 0) return 'unknown'
  return speedKph >= ONE_KNOT_KPH ? 'moving' : 'slow-stopped'
}

export const isReportedYacht = (
  vessel: Pick<Vessel, 'vesselType'>,
) =>
  vessel.vesselType === 'Sailing vessel' ||
  vessel.vesselType === 'Pleasure craft'

export const vesselRenderIcon = (
  vessel: Pick<Vessel, 'markerIcon' | 'vesselType'>,
): RenderTrafficMarkerIcon => {
  if (vessel.vesselType === 'Sailing vessel') return 'vessel-sailing'
  if (vessel.vesselType === 'Pleasure craft') return 'vessel-pleasure'
  if (vessel.vesselType === 'High-speed craft') {
    return 'vessel-highspeed'
  }
  return vessel.markerIcon
}

export const vesselNavigationMotionConflict = (
  vessel: Pick<Vessel, 'navigationCategory' | 'speedKph'>,
) =>
  vesselMotionState(vessel.speedKph) === 'moving' &&
  ['anchored', 'moored', 'aground'].includes(
    vessel.navigationCategory,
  )

export const aircraftAltitudeBand = (
  altitudeMeters: number | undefined,
): AircraftAltitudeBand => {
  if (!finiteNumber(altitudeMeters)) return 'unknown'
  if (altitudeMeters < 1_000) return 'low'
  if (altitudeMeters < 3_000) return 'medium'
  if (altitudeMeters < 10_000) return 'high'
  return 'cruise'
}

export const aircraftVerticalTrend = (
  verticalSpeedMps: number | undefined,
): AircraftVerticalTrend => {
  if (!finiteNumber(verticalSpeedMps)) return 'unknown'
  if (verticalSpeedMps >= 1.016) return 'climb'
  if (verticalSpeedMps <= -1.016) return 'descent'
  return 'small'
}

export const aircraftBadgeIcon = (
  band: AircraftAltitudeBand,
  trend: AircraftVerticalTrend,
): AircraftBadgeIcon => `aircraft-state-${band}-${trend}`

export const trafficPresentation = (
  entity: TrafficEntity,
): TrafficPresentation => {
  if (entity.kind === 'aircraft') {
    const altitudeBand = aircraftAltitudeBand(entity.altitudeMeters)
    const verticalTrend = aircraftVerticalTrend(entity.verticalSpeedMps)
    return {
      kind: 'aircraft',
      markerIcon: entity.markerIcon,
      headingDegrees: reportedHeading(entity),
      altitudeBand,
      verticalTrend,
      badgeIcon: aircraftBadgeIcon(altitudeBand, verticalTrend),
    }
  }

  const motionState = vesselMotionState(entity.speedKph)
  return {
    kind: 'vessel',
    markerIcon: vesselRenderIcon(entity),
    headingDegrees:
      motionState === 'moving' ? reportedHeading(entity) : 0,
    motionState,
    badgeIcon: `vessel-motion-${motionState}`,
    navigationConflict: vesselNavigationMotionConflict(entity),
  }
}

export const vesselMotionLabel = (state: VesselMotionState) => {
  switch (state) {
    case 'moving':
      return 'Moving · reported speed at least 1 kn'
    case 'slow-stopped':
      return 'Slow or stopped · reported speed below 1 kn'
    case 'unknown':
      return 'Reported movement unknown'
  }
}

export const aircraftAltitudeBandCode = (
  band: AircraftAltitudeBand,
) => {
  switch (band) {
    case 'low':
      return '1'
    case 'medium':
      return '2'
    case 'high':
      return '3'
    case 'cruise':
      return '4'
    case 'unknown':
      return '?'
  }
}

export const aircraftAltitudeBandLabel = (
  band: AircraftAltitudeBand,
  units: UnitSystem = 'metric',
) => {
  const ranges =
    units === 'aviation-nautical'
      ? {
          low: 'below 3,281 ft',
          medium: '3,281 to below 9,843 ft',
          high: '9,843 to below 32,808 ft',
          cruise: '32,808 ft or higher',
          unknown: 'unreported',
        }
      : {
          low: 'below 1,000 m',
          medium: '1,000 to below 3,000 m',
          high: '3,000 to below 10,000 m',
          cruise: '10,000 m or higher',
          unknown: 'unreported',
        }
  return `Band ${aircraftAltitudeBandCode(band)} · ${ranges[band]}`
}

export const aircraftVerticalTrendLabel = (
  trend: AircraftVerticalTrend,
) => {
  switch (trend) {
    case 'climb':
      return 'Climbing · reported rate is at least 200 ft/min upward'
    case 'descent':
      return 'Descending · reported rate is at least 200 ft/min downward'
    case 'small':
      return 'Small reported vertical rate · less than 200 ft/min either way'
    case 'unknown':
      return 'Vertical trend unreported'
  }
}

export const aircraftStatePresentation = (
  aircraft: Pick<Aircraft, 'altitudeMeters' | 'verticalSpeedMps'>,
) => {
  const altitudeBand = aircraftAltitudeBand(aircraft.altitudeMeters)
  const verticalTrend = aircraftVerticalTrend(aircraft.verticalSpeedMps)
  return {
    altitudeBand,
    verticalTrend,
    badgeIcon: aircraftBadgeIcon(altitudeBand, verticalTrend),
  }
}
