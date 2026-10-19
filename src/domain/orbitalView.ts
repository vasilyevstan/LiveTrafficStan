import type { ModeledOrbitalPosition, OrbitalCatalogSnapshot } from './orbital'
import type { MapProjectionPreference } from './preferences'

export interface CapturedOrbitalView {
  readonly revision: number
  readonly viewRequestId: number
  readonly position: Readonly<ModeledOrbitalPosition>
  readonly snapshot: Readonly<OrbitalCatalogSnapshot>
}

export const ORBITAL_VIEW_MAXIMUM_LATITUDE = Math.atan(Math.sinh(Math.PI)) * 180 / Math.PI

export const orbitalViewUnavailableReason = (
  position: Readonly<ModeledOrbitalPosition> | undefined,
  projection: MapProjectionPreference,
): string | undefined => {
  if (projection !== 'auto') return 'View from here is available in Auto projection, not Flat.'
  if (!position) return 'An accepted modeled position is needed.'
  if (
    !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude) ||
    !Number.isFinite(position.altitudeKm) || position.altitudeKm <= 0 ||
    Math.abs(position.longitude) > 180 ||
    Math.abs(position.latitude) > ORBITAL_VIEW_MAXIMUM_LATITUDE
  ) return 'This position cannot be represented without moving the eye.'
  return undefined
}
