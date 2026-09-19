import type { AppCenter } from '../config/appConfig'
import {
  centerFromCoordinates,
  roundCoordinate,
  type Coordinates,
} from './center'
import { distanceKm } from './geo'

const RADIUS_EPSILON_KM = 0.000_001
const AREA_EPSILON = 1e-12
const LONGITUDE_SPAN_LIMIT = 180

export interface ViewportSample {
  center: Coordinates
  perimeter: readonly Coordinates[]
  pitchDegrees: number
}

export interface TrafficViewport {
  center: AppCenter
  enclosingRadiusKm: number
  polygon: readonly Coordinates[]
}

export type ViewportAssessment =
  | {
      kind: 'eligible'
      viewport: TrafficViewport
    }
  | {
      kind: 'ineligible'
      reason: 'too-wide' | 'invalid'
      message:
        | 'Zoom in to see live traffic'
        | 'Zoom in or reduce tilt to see live traffic'
    }

interface ViewportLimits {
  coordinatePrecision: number
  maximumRadiusKm: number
}

export const normalizeLongitude = (longitude: number) => {
  const normalized = ((longitude + 180) % 360 + 360) % 360 - 180
  return Object.is(normalized, -0) ? 0 : normalized
}

export const unwrapLongitude = (
  longitude: number,
  referenceLongitude: number,
) => {
  const normalized = normalizeLongitude(longitude)
  const turns = Math.round((referenceLongitude - normalized) / 360)
  return normalized + turns * 360
}

const ineligible = (
  reason: 'too-wide' | 'invalid',
  pitchDegrees: number,
): ViewportAssessment => ({
  kind: 'ineligible',
  reason,
  message:
    pitchDegrees > 0.5
      ? 'Zoom in or reduce tilt to see live traffic'
      : 'Zoom in to see live traffic',
})

const polygonArea = (polygon: readonly Coordinates[]) => {
  let twiceArea = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]
    twiceArea +=
      current.longitude * next.latitude -
      next.longitude * current.latitude
  }
  return Math.abs(twiceArea) / 2
}

const validSampleCoordinate = (coordinate: Coordinates) =>
  Number.isFinite(coordinate.latitude) &&
  Number.isFinite(coordinate.longitude) &&
  coordinate.latitude >= -90 &&
  coordinate.latitude <= 90

export const assessTrafficViewport = (
  sample: ViewportSample,
  limits: ViewportLimits,
): ViewportAssessment => {
  if (
    !validSampleCoordinate(sample.center) ||
    !Number.isFinite(sample.pitchDegrees) ||
    sample.perimeter.length < 4 ||
    sample.perimeter.some((coordinate) => !validSampleCoordinate(coordinate))
  ) {
    return ineligible('invalid', sample.pitchDegrees)
  }

  const normalizedCenterLongitude = normalizeLongitude(sample.center.longitude)
  const roundedCenter = centerFromCoordinates(
    {
      latitude: roundCoordinate(
        sample.center.latitude,
        limits.coordinatePrecision,
      ),
      longitude: normalizeLongitude(
        roundCoordinate(
          normalizedCenterLongitude,
          limits.coordinatePrecision,
        ),
      ),
    },
    limits.coordinatePrecision,
    'Map view',
  )
  const polygon = sample.perimeter.map((coordinate) => ({
    latitude: coordinate.latitude,
    longitude: unwrapLongitude(
      coordinate.longitude,
      roundedCenter.longitude,
    ),
  }))
  const longitudes = polygon.map((coordinate) => coordinate.longitude)
  const longitudeSpan = Math.max(...longitudes) - Math.min(...longitudes)

  if (
    longitudeSpan >= LONGITUDE_SPAN_LIMIT ||
    polygonArea(polygon) <= AREA_EPSILON
  ) {
    return ineligible(
      longitudeSpan >= LONGITUDE_SPAN_LIMIT ? 'too-wide' : 'invalid',
      sample.pitchDegrees,
    )
  }

  const enclosingRadiusKm = Math.max(
    ...polygon.map((coordinate) => distanceKm(roundedCenter, coordinate)),
  )
  if (
    !Number.isFinite(enclosingRadiusKm) ||
    enclosingRadiusKm - limits.maximumRadiusKm > RADIUS_EPSILON_KM
  ) {
    return ineligible('too-wide', sample.pitchDegrees)
  }

  return {
    kind: 'eligible',
    viewport: {
      center: roundedCenter,
      enclosingRadiusKm: Math.max(
        0.001,
        Math.min(
          limits.maximumRadiusKm,
          Math.ceil(enclosingRadiusKm * 1_000 - 1e-9) / 1_000,
        ),
      ),
      polygon,
    },
  }
}

const pointOnSegment = (
  point: Coordinates,
  first: Coordinates,
  second: Coordinates,
) => {
  const cross =
    (point.latitude - first.latitude) *
      (second.longitude - first.longitude) -
    (point.longitude - first.longitude) *
      (second.latitude - first.latitude)
  if (Math.abs(cross) > 1e-10) return false

  return (
    point.longitude >= Math.min(first.longitude, second.longitude) - 1e-10 &&
    point.longitude <= Math.max(first.longitude, second.longitude) + 1e-10 &&
    point.latitude >= Math.min(first.latitude, second.latitude) - 1e-10 &&
    point.latitude <= Math.max(first.latitude, second.latitude) + 1e-10
  )
}

export const isCoordinateInViewport = (
  coordinate: Coordinates,
  viewport: TrafficViewport,
) => {
  if (!validSampleCoordinate(coordinate)) return false

  const point = {
    latitude: coordinate.latitude,
    longitude: unwrapLongitude(
      coordinate.longitude,
      viewport.center.longitude,
    ),
  }
  const polygon = viewport.polygon
  let inside = false

  for (
    let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const current = polygon[currentIndex]
    const previous = polygon[previousIndex]
    if (pointOnSegment(point, previous, current)) return true

    const crossesLatitude =
      current.latitude > point.latitude !==
      previous.latitude > point.latitude
    if (!crossesLatitude) continue

    const crossingLongitude =
      ((previous.longitude - current.longitude) *
        (point.latitude - current.latitude)) /
        (previous.latitude - current.latitude) +
      current.longitude
    if (point.longitude < crossingLongitude) inside = !inside
  }

  return inside
}
