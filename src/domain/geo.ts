import type { AppCenter } from '../config/appConfig'
import type { GeoPosition } from './traffic'

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
