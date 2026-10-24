import { describe, expect, it } from 'vitest'
import { EARTH_DAY_NIGHT_CONFIG } from '../config/appConfig'
import type { Coordinates } from '../domain/center'
import { normalizeLongitude } from '../domain/viewport'
import { nightShade, solarSubpoint } from './earthDayNight'

const RADIAN = Math.PI / 180
const size = EARTH_DAY_NIGHT_CONFIG.textureSize
const coordinate = (x: number, y: number): Coordinates => ({
  longitude: ((x + 0.5) / size * 2 - 1) * 180,
  latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / size))) / RADIAN,
})
const solarAltitude = (point: Coordinates, sun: Coordinates) => Math.asin(
  Math.sin(point.latitude * RADIAN) * Math.sin(sun.latitude * RADIAN) +
  Math.cos(point.latitude * RADIAN) * Math.cos(sun.latitude * RADIAN) *
  Math.cos((point.longitude - sun.longitude) * RADIAN),
) / RADIAN

describe('local approximate Earth day/night shading', () => {
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

  it('increases darkness smoothly behind sunset, with no polygon bands or overlapping fills', () => {
    const shade = nightShade({ latitude: 0, longitude: 0 })
    const row = shade.slice(size * (size / 2), size * (size / 2 + 1))
    const sunset = Math.floor(size * 3 / 4)
    expect(row[sunset - 1]).toBe(0)
    expect(row[sunset]).toBeLessThan(2)
    expect(row[sunset + Math.ceil(size * EARTH_DAY_NIGHT_CONFIG.transitionDegrees / 360)]).toBe(255)
    for (let x = sunset + 1; x < size; x++) expect(row[x]!).toBeGreaterThanOrEqual(row[x - 1]!)
    expect(new Set(shade).size).toBe(256)
  })

  for (const latitude of [-23.44, -0.000001, 0, 0.000001, 23.44]) {
    it.each([-179.9, -90, 0, 90, 179.9])(`shades solar depression at declination ${latitude}, longitude %s`, longitude => {
      const sun = { latitude, longitude }
      const shade = nightShade(sun)
      expect(shade.byteLength).toBe(512 * 512)
      for (const y of [0, 1, 32, 128, 255, 256, 383, 479, 510, 511]) {
        for (const x of [0, 1, 32, 64, 128, 192, 255, 256, 320, 384, 448, 479, 510, 511]) {
          const altitude = solarAltitude(coordinate(x, y), sun)
          const progress = Math.max(0, Math.min(1, -altitude / EARTH_DAY_NIGHT_CONFIG.transitionDegrees))
          expect(shade[y * size + x]).toBe(Math.round(255 * progress * progress * (3 - 2 * progress)))
          if (altitude >= 0) expect(shade[y * size + x]).toBe(0)
          if (altitude <= -EARTH_DAY_NIGHT_CONFIG.transitionDegrees) expect(shade[y * size + x]).toBe(255)
        }
      }
    })
  }

  it('normalizes wrapped solar longitude without changing the shade field', () => {
    expect(nightShade({ latitude: -23.44, longitude: 180 })).toEqual(nightShade({ latitude: -23.44, longitude: -180 }))
    expect(nightShade({ latitude: 12, longitude: 540 })).toEqual(nightShade({ latitude: 12, longitude: -180 }))
  })

  it.each([
    { latitude: NaN, longitude: 0 },
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: Infinity },
  ])('rejects an invalid solar point without partial shading: %s', point => {
    expect(() => nightShade(point)).toThrow(RangeError)
  })
})
