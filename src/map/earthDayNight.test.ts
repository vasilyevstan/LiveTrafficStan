import type { Position } from 'geojson'
import { describe, expect, it } from 'vitest'
import type { Coordinates } from '../domain/center'
import { ORBITAL_VIEW_MAXIMUM_LATITUDE } from '../domain/orbitalView'
import { normalizeLongitude } from '../domain/viewport'
import { nightHemisphere, solarSubpoint } from './earthDayNight'

const RADIAN = Math.PI / 180
const solarAltitudeSine = (point: Coordinates, sun: Coordinates) =>
  Math.sin(point.latitude * RADIAN) * Math.sin(sun.latitude * RADIAN) +
  Math.cos(point.latitude * RADIAN) * Math.cos(sun.latitude * RADIAN) *
  Math.cos((point.longitude - sun.longitude) * RADIAN)

const insideRing = (point: Coordinates, ring: readonly Position[]) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if ((yi! > point.latitude) !== (yj! > point.latitude) &&
      point.longitude < (xj! - xi!) * (point.latitude - yi!) / (yj! - yi!) + xi!) inside = !inside
  }
  return inside
}

describe('local approximate Earth day/night geometry', () => {
  it('places the Sun near the equator at the March equinox and the correct solstice hemisphere', () => {
    const equinox = solarSubpoint(Date.parse('2026-03-20T14:46:00Z'))
    expect(Math.abs(equinox.latitude)).toBeLessThan(0.05)
    expect(equinox.longitude).toBeCloseTo(-39.6, 0)
    const june = solarSubpoint(Date.parse('2026-06-21T12:00:00Z'))
    const december = solarSubpoint(Date.parse('2026-12-21T12:00:00Z'))
    expect(june.latitude).toBeCloseTo(23.44, 1)
    expect(december.latitude).toBeCloseTo(-23.44, 1)
    expect(Math.abs(june.longitude)).toBeLessThan(1)
    expect(Math.abs(december.longitude)).toBeLessThan(1)
  })

  it('moves the subsolar longitude west with UTC, independently of the browser time zone', () => {
    const time = Date.parse('2026-06-21T12:00:00Z')
    const first = solarSubpoint(time)
    const later = solarSubpoint(time + 6 * 60 * 60_000)
    expect(normalizeLongitude(later.longitude - first.longitude)).toBeCloseTo(-90, 0)
    expect(later.latitude).toBeCloseTo(first.latitude, 1)
  })

  it.each([NaN, Infinity, -Infinity, 8.64e15 + 1])('rejects invalid displayed time %s explicitly', time => {
    expect(() => solarSubpoint(time)).toThrow(RangeError)
  })

  for (const latitude of [-23.44, -0.000001, 0, 0.000001, 23.44]) {
    it.each([-179.9, -90, 0, 90, 179.9])(`shades only the night hemisphere at declination ${latitude}, longitude %s`, longitude => {
      const sun = { latitude, longitude }
      const data = nightHemisphere(sun)
      const polygons = data.features.flatMap(feature =>
        feature.geometry.type === 'Polygon' ? feature.geometry.coordinates : [])
      expect(polygons.length).toBeGreaterThan(0)
      for (const pointLatitude of [-80, -60, -30, 0, 30, 60, 80]) {
        for (let pointLongitude = -170; pointLongitude <= 170; pointLongitude += 20) {
          const point = { latitude: pointLatitude, longitude: pointLongitude }
          const altitude = solarAltitudeSine(point, sun)
          if (Math.abs(altitude) < 0.01) continue
          expect(polygons.some(ring => insideRing(point, ring)),
            `${JSON.stringify(point)} relative to ${JSON.stringify(sun)}`).toBe(altitude < 0)
        }
      }
      const coordinates = data.features.flatMap(feature =>
        feature.geometry.type === 'Polygon' ? feature.geometry.coordinates.flat() : feature.geometry.coordinates)
      expect(coordinates.length).toBeLessThan(3_000)
      for (const [x, y] of coordinates) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
        expect(Math.abs(x!)).toBeLessThanOrEqual(180)
        expect(Math.abs(y!)).toBeLessThanOrEqual(ORBITAL_VIEW_MAXIMUM_LATITUDE)
      }
      for (const ring of polygons) {
        expect(ring.length).toBeGreaterThanOrEqual(4)
        expect(ring[0]).toEqual(ring.at(-1))
        const area = ring.slice(0, -1).reduce((sum, point, index) => {
          const next = ring[index + 1]!
          return sum + point[0]! * next[1]! - next[0]! * point[1]!
        }, 0)
        expect(area).toBeGreaterThan(0)
      }
      const lines = data.features.flatMap(feature =>
        feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : [])
      expect(lines.length).toBeGreaterThan(0)
      for (const line of lines) {
        for (let index = 0; index < line.length; index++) {
          const point = line[index]!
          expect(Math.abs(solarAltitudeSine({ longitude: point[0]!, latitude: point[1]! }, sun))).toBeLessThan(0.0005)
          if (index) expect(Math.abs(point[0]! - line[index - 1]![0]!)).toBeLessThanOrEqual(180)
        }
      }
      expect(data.features.every(feature => Object.keys(feature.properties ?? {}).length === 0)).toBe(true)
    })
  }

  it.each([
    { latitude: NaN, longitude: 0 },
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: Infinity },
  ])('rejects an invalid solar point without partial geometry: %s', point => {
    expect(() => nightHemisphere(point)).toThrow(RangeError)
  })
})
