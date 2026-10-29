import { AIRCRAFT_VIEW_CONFIG } from '../config/appConfig'
import { ORBITAL_VIEW_MAXIMUM_LATITUDE } from './orbitalView'
import { normalizeOrbitalLongitude, unwrapOrbitalLongitude } from './orbitalViewport'
import type { MapProjectionPreference } from './preferences'
import type { DisplayAircraft } from './traffic'

export interface AircraftViewPosition {
  readonly id: string
  readonly name: string
  readonly latitude: number
  readonly longitude: number
  readonly altitudeKm: number
  readonly travelBearingDegrees?: number
  readonly observedAt: number
}

export interface CapturedAircraftView {
  readonly revision: number
  readonly viewRequestId: number
  readonly position: AircraftViewPosition
}

const validBearing = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) && value >= 0 && value < 360 ? value : undefined

export const aircraftViewName = (aircraft: Readonly<DisplayAircraft>) =>
  aircraft.callsign?.trim() || aircraft.registration?.trim() || aircraft.hex.toUpperCase()

export const aircraftViewUnavailableReason = (
  aircraft: Readonly<DisplayAircraft> | undefined,
  projection: MapProjectionPreference,
): string | undefined => {
  if (projection !== 'auto') return 'View from here is available in Auto projection, not Flat.'
  if (!aircraft) return 'A live aircraft position is needed.'
  if (aircraft.freshness !== 'live') return 'View from here needs a live aircraft position.'
  const { latitude, longitude } = aircraft.position
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
    Math.abs(latitude) > ORBITAL_VIEW_MAXIMUM_LATITUDE) {
    return 'This position cannot be represented without moving the eye.'
  }
  if (aircraft.altitudeMeters === undefined || !Number.isFinite(aircraft.altitudeMeters)) {
    return 'View from here needs a reported altitude.'
  }
  if (aircraft.altitudeMeters < AIRCRAFT_VIEW_CONFIG.minimumAltitudeMeters) {
    return `View from here needs an airborne aircraft above ${AIRCRAFT_VIEW_CONFIG.minimumAltitudeMeters} m.`
  }
  return undefined
}

export const aircraftViewPosition = (
  aircraft: Readonly<DisplayAircraft>,
  previousBearing?: number,
): AircraftViewPosition | undefined => {
  if (aircraftViewUnavailableReason(aircraft, 'auto')) return undefined
  return Object.freeze({
    id: aircraft.id,
    name: aircraftViewName(aircraft),
    latitude: aircraft.position.latitude,
    longitude: aircraft.position.longitude,
    altitudeKm: (aircraft.altitudeMeters ?? 0) / 1_000,
    travelBearingDegrees: validBearing(aircraft.courseDegrees) ??
      validBearing(aircraft.headingDegrees) ?? validBearing(previousBearing),
    observedAt: aircraft.position.observedAt,
  })
}

// Interpolates only between two observations of the same aircraft; never extrapolates.
export const interpolateAircraftViewPosition = (
  first: AircraftViewPosition,
  last: AircraftViewPosition,
  observedAt: number,
): AircraftViewPosition | undefined => {
  if (first.id !== last.id || !Number.isFinite(observedAt) || observedAt < first.observedAt ||
    observedAt > last.observedAt) return undefined
  if (observedAt === last.observedAt) return last
  if (observedAt === first.observedAt) return first
  const fraction = (observedAt - first.observedAt) / (last.observedAt - first.observedAt)
  const between = (from: number, to: number) => from + (to - from) * fraction
  return {
    ...last,
    observedAt,
    latitude: between(first.latitude, last.latitude),
    longitude: normalizeOrbitalLongitude(
      between(first.longitude, unwrapOrbitalLongitude(last.longitude, first.longitude))),
    altitudeKm: between(first.altitudeKm, last.altitudeKm),
    travelBearingDegrees: first.travelBearingDegrees === undefined || last.travelBearingDegrees === undefined
      ? last.travelBearingDegrees
      : ((between(first.travelBearingDegrees,
        unwrapOrbitalLongitude(last.travelBearingDegrees, first.travelBearingDegrees)) % 360) + 360) % 360,
  }
}
