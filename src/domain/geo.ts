import type { GeoPosition } from './traffic.js'

export interface AppCenter {
  latitude: number
  longitude: number
  label: string
}

const EARTH_RADIUS_KM = 6_371

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

export const isValidCoordinate = (latitude: number, longitude: number) =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180

export const distanceKm = (
  first: Pick<GeoPosition, 'latitude' | 'longitude'>,
  second: Pick<GeoPosition, 'latitude' | 'longitude'>,
) => {
  const latitudeDelta = toRadians(second.latitude - first.latitude)
  const longitudeDelta = toRadians(second.longitude - first.longitude)
  const firstLatitude = toRadians(first.latitude)
  const secondLatitude = toRadians(second.latitude)

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2

  const boundedHaversine = Math.min(1, Math.max(0, haversine))

  return (
    2 *
    EARTH_RADIUS_KM *
    Math.atan2(
      Math.sqrt(boundedHaversine),
      Math.sqrt(1 - boundedHaversine),
    )
  )
}

export const initialBearingRadians = (
  from: Pick<GeoPosition, 'latitude' | 'longitude'>,
  to: Pick<GeoPosition, 'latitude' | 'longitude'>,
) => {
  const fromLatitude = toRadians(from.latitude)
  const toLatitude = toRadians(to.latitude)
  const longitudeDelta = toRadians(to.longitude - from.longitude)
  return Math.atan2(
    Math.sin(longitudeDelta) * Math.cos(toLatitude),
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
      Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta),
  )
}

export const distanceFromGeodesicSegmentKm = (
  point: Pick<GeoPosition, 'latitude' | 'longitude'>,
  start: Pick<GeoPosition, 'latitude' | 'longitude'>,
  end: Pick<GeoPosition, 'latitude' | 'longitude'>,
) => {
  const length = distanceKm(start, end)
  const angularDistance = distanceKm(start, point) / EARTH_RADIUS_KM
  const bearingDelta =
    initialBearingRadians(start, point) - initialBearingRadians(start, end)
  const along = Math.atan2(
    Math.sin(angularDistance) * Math.cos(bearingDelta),
    Math.cos(angularDistance),
  ) * EARTH_RADIUS_KM
  if (length === 0 || along < 0 || along > length) {
    return Math.min(distanceKm(point, start), distanceKm(point, end))
  }
  return Math.abs(Math.asin(Math.max(-1, Math.min(
    1, Math.sin(angularDistance) * Math.sin(bearingDelta),
  )))) * EARTH_RADIUS_KM
}

export const boundsAroundCenter = (
  center: AppCenter,
  radiusKm: number,
): [[number, number], [number, number]] => {
  const latitudeDelta = radiusKm / 111.32
  const longitudeDelta =
    radiusKm / (111.32 * Math.max(Math.cos(toRadians(center.latitude)), 0.01))

  return [
    [center.longitude - longitudeDelta, center.latitude - latitudeDelta],
    [center.longitude + longitudeDelta, center.latitude + latitudeDelta],
  ]
}
