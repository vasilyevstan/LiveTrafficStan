import type { AppCenter } from '../config/appConfig'

export interface Coordinates {
  latitude: number
  longitude: number
}

export const roundCoordinate = (value: number, precision: number) => {
  const factor = 10 ** precision
  const rounded = Math.round(value * factor) / factor
  return Object.is(rounded, -0) ? 0 : rounded
}

export const centerFromCoordinates = (
  coordinates: Coordinates,
  precision: number,
  label: string,
): AppCenter => ({
  latitude: roundCoordinate(coordinates.latitude, precision),
  longitude: roundCoordinate(coordinates.longitude, precision),
  label,
})

export const sameCenterCoordinates = (
  first: Coordinates,
  second: Coordinates,
) =>
  first.latitude === second.latitude &&
  first.longitude === second.longitude
