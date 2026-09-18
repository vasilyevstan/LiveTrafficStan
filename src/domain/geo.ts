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

  return (
    2 *
    EARTH_RADIUS_KM *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  )
}

export const radiusBounds = (
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

export const radiusPolygonCoordinates = (
  center: AppCenter,
  radiusKm: number,
  steps = 72,
) => {
  const angularDistance = radiusKm / EARTH_RADIUS_KM
  const centerLatitude = toRadians(center.latitude)
  const centerLongitude = toRadians(center.longitude)
  const coordinates: [number, number][] = []

  for (let index = 0; index <= steps; index += 1) {
    const bearing = (index / steps) * Math.PI * 2
    const latitude = Math.asin(
      Math.sin(centerLatitude) * Math.cos(angularDistance) +
        Math.cos(centerLatitude) *
          Math.sin(angularDistance) *
          Math.cos(bearing),
    )
    const longitude =
      centerLongitude +
      Math.atan2(
        Math.sin(bearing) *
          Math.sin(angularDistance) *
          Math.cos(centerLatitude),
        Math.cos(angularDistance) -
          Math.sin(centerLatitude) * Math.sin(latitude),
      )

    coordinates.push([(longitude * 180) / Math.PI, (latitude * 180) / Math.PI])
  }

  return coordinates
}
