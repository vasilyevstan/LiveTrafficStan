import type { Coordinates as ViewportCoordinate } from './center'

export interface OrbitalViewportSample {
  center: ViewportCoordinate
  perimeter: readonly ViewportCoordinate[]
  longitudeSpanDegrees: number
}

export type OrbitalViewport =
  | {
      kind: 'local'
      center: ViewportCoordinate
      polygon: readonly ViewportCoordinate[]
    }
  | {
      kind: 'world'
    }
  | {
      kind: 'invalid'
      reason:
        | 'invalid-geometry'
        | 'world-spanning'
        | 'degenerate'
      message: string
    }

const validCoordinate = ({ latitude, longitude }: ViewportCoordinate) =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90

export const normalizeOrbitalLongitude = (longitude: number) => {
  const normalized = ((longitude + 180) % 360 + 360) % 360 - 180
  return normalized === -180 ? 180 : normalized
}

export const unwrapOrbitalLongitude = (
  longitude: number,
  reference: number,
) => {
  const normalized = normalizeOrbitalLongitude(longitude)
  return normalized + 360 * Math.round((reference - normalized) / 360)
}

const rounded = (value: number, precision: number) =>
  Number(value.toFixed(precision))

const polygonArea = (polygon: readonly ViewportCoordinate[]) => {
  let area = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]
    area +=
      current.longitude * next.latitude -
      next.longitude * current.latitude
  }
  return Math.abs(area / 2)
}

export const assessOrbitalViewport = (
  sample: OrbitalViewportSample,
  coordinatePrecision: number,
): OrbitalViewport => {
  if (
    !validCoordinate(sample.center) ||
    sample.perimeter.length < 4 ||
    sample.perimeter.some((coordinate) => !validCoordinate(coordinate)) ||
    !Number.isFinite(sample.longitudeSpanDegrees)
  ) {
    return {
      kind: 'invalid',
      reason: 'invalid-geometry',
      message: 'Upcoming crossings are unavailable for this map geometry.',
    }
  }

  const latitudes = sample.perimeter.map(({ latitude }) => latitude)
  const coversMercatorLatitude =
    Math.min(...latitudes) <= -84.9 &&
    Math.max(...latitudes) >= 84.9
  if (
    sample.longitudeSpanDegrees >= 359.5 &&
    coversMercatorLatitude
  ) {
    return { kind: 'world' }
  }
  if (sample.longitudeSpanDegrees >= 180) {
    return {
      kind: 'invalid',
      reason: 'world-spanning',
      message:
        'Upcoming crossings are unavailable until the map shows either a local area or the whole world.',
    }
  }

  const center = {
    latitude: rounded(sample.center.latitude, coordinatePrecision),
    longitude: rounded(
      normalizeOrbitalLongitude(sample.center.longitude),
      coordinatePrecision,
    ),
  }
  const polygon = sample.perimeter.map((coordinate) => ({
    latitude: rounded(coordinate.latitude, coordinatePrecision + 2),
    longitude: rounded(
      unwrapOrbitalLongitude(coordinate.longitude, center.longitude),
      coordinatePrecision + 2,
    ),
  }))
  const longitudes = polygon.map(({ longitude }) => longitude)
  const longitudeSpan =
    Math.max(...longitudes) - Math.min(...longitudes)

  if (longitudeSpan >= 180) {
    return {
      kind: 'invalid',
      reason: 'world-spanning',
      message:
        'Upcoming crossings are unavailable until the map shows either a local area or the whole world.',
    }
  }
  if (polygonArea(polygon) < 1e-8) {
    return {
      kind: 'invalid',
      reason: 'degenerate',
      message: 'Upcoming crossings are unavailable for this map geometry.',
    }
  }

  return { kind: 'local', center, polygon }
}

export const orbitalViewportSignature = (viewport: OrbitalViewport) => {
  if (viewport.kind !== 'local') {
    return viewport.kind === 'world'
      ? 'world'
      : `${viewport.kind}:${viewport.reason}:${viewport.message}`
  }
  return [
    viewport.kind,
    viewport.center.latitude,
    viewport.center.longitude,
    ...viewport.polygon.flatMap((coordinate) => [
      coordinate.latitude,
      coordinate.longitude,
    ]),
  ].join(':')
}

export const orbitalPointInPolygon = (
  latitude: number,
  longitude: number,
  polygon: readonly ViewportCoordinate[],
) => {
  let inside = false
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const currentPoint = polygon[index]
    const previousPoint = polygon[previous]
    const intersects =
      currentPoint.latitude > latitude !==
        previousPoint.latitude > latitude &&
      longitude <
        ((previousPoint.longitude - currentPoint.longitude) *
          (latitude - currentPoint.latitude)) /
          (previousPoint.latitude - currentPoint.latitude) +
          currentPoint.longitude
    if (intersects) inside = !inside
  }
  return inside
}

const segmentIntersectionFraction = (
  start: ViewportCoordinate,
  end: ViewportCoordinate,
  edgeStart: ViewportCoordinate,
  edgeEnd: ViewportCoordinate,
) => {
  const segmentLongitude = end.longitude - start.longitude
  const segmentLatitude = end.latitude - start.latitude
  const edgeLongitude = edgeEnd.longitude - edgeStart.longitude
  const edgeLatitude = edgeEnd.latitude - edgeStart.latitude
  const denominator =
    segmentLongitude * edgeLatitude - segmentLatitude * edgeLongitude
  if (Math.abs(denominator) < 1e-12) return undefined

  const offsetLongitude = edgeStart.longitude - start.longitude
  const offsetLatitude = edgeStart.latitude - start.latitude
  const segmentFraction =
    (offsetLongitude * edgeLatitude - offsetLatitude * edgeLongitude) /
    denominator
  const edgeFraction =
    (offsetLongitude * segmentLatitude -
      offsetLatitude * segmentLongitude) /
    denominator
  return segmentFraction >= 0 &&
    segmentFraction <= 1 &&
    edgeFraction >= 0 &&
    edgeFraction <= 1
    ? segmentFraction
    : undefined
}

export const orbitalSegmentEntryFraction = (
  start: ViewportCoordinate,
  end: ViewportCoordinate,
  polygon: readonly ViewportCoordinate[],
) => {
  if (orbitalPointInPolygon(start.latitude, start.longitude, polygon)) {
    return 0
  }
  if (Math.abs(end.longitude - start.longitude) > 180) {
    return undefined
  }

  let first: number | undefined
  for (let index = 0; index < polygon.length; index += 1) {
    const fraction = segmentIntersectionFraction(
      start,
      end,
      polygon[index],
      polygon[(index + 1) % polygon.length],
    )
    if (fraction !== undefined && (first === undefined || fraction < first)) {
      first = fraction
    }
  }
  return first
}
