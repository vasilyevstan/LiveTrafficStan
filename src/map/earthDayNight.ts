import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson'
import { EARTH_DAY_NIGHT_CONFIG } from '../config/appConfig'
import type { Coordinates } from '../domain/center'
import { ORBITAL_VIEW_MAXIMUM_LATITUDE } from '../domain/orbitalView'
import { normalizeLongitude } from '../domain/viewport'
import { splitJourneyLine } from './journeyStyle'

const RADIAN = Math.PI / 180
type Vertex = [number, number]

// USNO's approximate solar coordinates; UTC substitutes for UT1 for map context.
// https://aa.usno.navy.mil/faq/sun_approx
export const solarSubpoint = (time: number): Coordinates => {
  if (!Number.isFinite(time) || Math.abs(time) > 8.64e15) {
    throw new RangeError('Day/night time must be a valid UTC timestamp.')
  }
  const days = time / 86_400_000 + 2_440_587.5 - 2_451_545
  const meanLongitude = (280.459 + 0.98564736 * days) * RADIAN
  const anomaly = (357.529 + 0.98560028 * days) * RADIAN
  const longitude = meanLongitude + (1.915 * Math.sin(anomaly) + 0.020 * Math.sin(2 * anomaly)) * RADIAN
  const obliquity = (23.439 - 0.00000036 * days) * RADIAN
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(longitude), Math.cos(longitude))
  const siderealAngle = 280.46061837 + 360.98564736629 * days
  return {
    latitude: Math.asin(Math.sin(obliquity) * Math.sin(longitude)) / RADIAN,
    longitude: normalizeLongitude(rightAscension / RADIAN - siderealAngle),
  }
}

const clipLongitude = (points: readonly Vertex[], boundary: number, keepEast: boolean): Vertex[] => {
  const clipped: Vertex[] = []
  let previous = points.at(-1)
  if (!previous) return clipped
  for (const point of points) {
    const inside = keepEast ? point[0] >= boundary : point[0] <= boundary
    const previousInside = keepEast ? previous[0] >= boundary : previous[0] <= boundary
    if (inside !== previousInside) {
      const ratio = (boundary - previous[0]) / (point[0] - previous[0])
      clipped.push([boundary, previous[1] + (point[1] - previous[1]) * ratio])
    }
    if (inside) clipped.push(point)
    previous = point
  }
  return clipped
}

export const nightHemisphere = (sun: Coordinates): FeatureCollection<Polygon | LineString> => {
  if (!Number.isFinite(sun.latitude) || Math.abs(sun.latitude) > 90 || !Number.isFinite(sun.longitude)) {
    throw new RangeError('Invalid solar subpoint.')
  }
  const longitude = normalizeLongitude(sun.longitude)
  const tangent = Math.tan(sun.latitude * RADIAN)
  const limit = ORBITAL_VIEW_MAXIMUM_LATITUDE
  const latitudes = new Set([-limit, limit])
  const step = EARTH_DAY_NIGHT_CONFIG.geometryStepDegrees
  for (let latitude = -84; latitude <= 84; latitude += step) latitudes.add(latitude)
  const polarCircle = 90 - Math.abs(sun.latitude)
  if (polarCircle < limit) {
    latitudes.add(-polarCircle)
    latitudes.add(polarCircle)
  }
  // Sample both axes so the boundary remains smooth near equinox and the poles.
  if (tangent !== 0) for (let hourAngle = 0; hourAngle <= 180; hourAngle += step) {
    const latitude = Math.atan(-Math.cos(hourAngle * RADIAN) / tangent) / RADIAN
    if (Math.abs(latitude) <= limit) latitudes.add(latitude)
  }
  const rows = [...latitudes].sort((a, b) => a - b).map(latitude => {
    const cosine = -Math.tan(latitude * RADIAN) * tangent
    const angle = Math.acos(Math.max(-1, Math.min(1, cosine))) / RADIAN
    return { latitude, cosine, west: longitude + angle, east: longitude + 360 - angle }
  })
  const nightRows = rows.filter(row => row.east > row.west || Math.abs(row.cosine + 1) < 1e-12)
  const ring: Vertex[] = [
    ...nightRows.map((row): Vertex => [row.east, row.latitude]),
    ...[...nightRows].reverse().map((row): Vertex => [row.west, row.latitude]),
  ]
  const features: Feature<Polygon | LineString>[] = []
  for (const shift of [0, -360]) {
    const shifted = ring.map(([x, y]): Vertex => [x + shift, y])
    const clipped = clipLongitude(clipLongitude(shifted, -180, true), 180, false)
    const first = clipped[0]
    const area = clipped.reduce((sum, point, index) => {
      const next = clipped[(index + 1) % clipped.length]!
      return sum + point[0] * next[1] - next[0] * point[1]
    }, 0)
    if (first && clipped.length >= 3 && Math.abs(area) > 1e-10) {
      features.push({
        type: 'Feature', properties: {},
        geometry: { type: 'Polygon', coordinates: [[...clipped, first]] },
      })
    }
  }
  const boundaryRows = rows.filter(row => Math.abs(row.cosine) <= 1 + 1e-12)
  for (const edge of ['west', 'east'] as const) {
    const points = boundaryRows.map(row => ({
      latitude: row.latitude, longitude: normalizeLongitude(row[edge]),
    }))
    for (const coordinates of splitJourneyLine(points)) features.push({
      type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates },
    })
  }
  return { type: 'FeatureCollection', features }
}
