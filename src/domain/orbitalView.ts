import type { ModeledOrbitalPosition, OrbitalCatalogSnapshot } from './orbital'
import type { MapProjectionPreference } from './preferences'
import { normalizeOrbitalLongitude, unwrapOrbitalLongitude } from './orbitalViewport'

export interface CapturedOrbitalView {
  readonly revision: number
  readonly viewRequestId: number
  readonly position: Readonly<ModeledOrbitalPosition>
  readonly snapshot: Readonly<OrbitalCatalogSnapshot>
}

export const ORBITAL_VIEW_MAXIMUM_LATITUDE = Math.atan(Math.sinh(Math.PI)) * 180 / Math.PI

export const interpolateOrbitalViewPosition = (
  first: Readonly<ModeledOrbitalPosition>,
  last: Readonly<ModeledOrbitalPosition>,
  modeledFor: number,
): Readonly<ModeledOrbitalPosition> | undefined => {
  if (first.id !== last.id || first.owner !== last.owner ||
    first.noradCatalogId !== last.noradCatalogId || first.snapshotSha256 !== last.snapshotSha256 ||
    first.snapshotRetrievedAt !== last.snapshotRetrievedAt || first.elementEpoch !== last.elementEpoch ||
    !Number.isFinite(modeledFor) || !Number.isFinite(first.modeledFor) ||
    !Number.isFinite(last.modeledFor) || !Number.isFinite(first.velocityKmPerSecond) ||
    !Number.isFinite(last.velocityKmPerSecond) || modeledFor < first.modeledFor ||
    modeledFor > last.modeledFor || last.modeledFor < first.modeledFor ||
    orbitalViewUnavailableReason(first, 'auto') || orbitalViewUnavailableReason(last, 'auto')) return undefined
  if (modeledFor === last.modeledFor) return last
  if (modeledFor === first.modeledFor) return first
  const fraction = (modeledFor - first.modeledFor) / (last.modeledFor - first.modeledFor)
  return {
    ...last,
    modeledFor,
    latitude: first.latitude + (last.latitude - first.latitude) * fraction,
    longitude: normalizeOrbitalLongitude(first.longitude +
      (unwrapOrbitalLongitude(last.longitude, first.longitude) - first.longitude) * fraction),
    altitudeKm: first.altitudeKm + (last.altitudeKm - first.altitudeKm) * fraction,
    velocityKmPerSecond: first.velocityKmPerSecond +
      (last.velocityKmPerSecond - first.velocityKmPerSecond) * fraction,
    travelBearingDegrees: first.travelBearingDegrees === undefined || last.travelBearingDegrees === undefined
      ? undefined
      : ((first.travelBearingDegrees +
        (unwrapOrbitalLongitude(last.travelBearingDegrees, first.travelBearingDegrees) -
          first.travelBearingDegrees) * fraction) % 360 + 360) % 360,
  }
}

export const orbitalViewUnavailableReason = (
  position: Readonly<ModeledOrbitalPosition> | undefined,
  projection: MapProjectionPreference,
): string | undefined => {
  if (projection !== 'auto') return 'View from here is available in Auto projection, not Flat.'
  if (!position) return 'An accepted modeled position is needed.'
  if (position.travelBearingDegrees !== undefined &&
    (!Number.isFinite(position.travelBearingDegrees) ||
      position.travelBearingDegrees < 0 || position.travelBearingDegrees >= 360)) {
    return 'The modeled travel direction is invalid.'
  }
  if (
    !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude) ||
    !Number.isFinite(position.altitudeKm) || position.altitudeKm <= 0 ||
    Math.abs(position.longitude) > 180 ||
    Math.abs(position.latitude) > ORBITAL_VIEW_MAXIMUM_LATITUDE
  ) return 'This position cannot be represented without moving the eye.'
  return undefined
}
