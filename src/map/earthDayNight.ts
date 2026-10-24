import { EARTH_DAY_NIGHT_CONFIG } from '../config/appConfig'
import type { Coordinates } from '../domain/center'
import { normalizeLongitude } from '../domain/viewport'

const RADIAN = Math.PI / 180

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

export const nightShade = (sun: Coordinates): Uint8ClampedArray => {
  if (!Number.isFinite(sun.latitude) || Math.abs(sun.latitude) > 90 || !Number.isFinite(sun.longitude)) {
    throw new RangeError('Invalid solar subpoint.')
  }
  const longitude = normalizeLongitude(sun.longitude) * RADIAN
  const declination = sun.latitude * RADIAN
  const sine = Math.sin(declination)
  const cosine = Math.cos(declination)
  const { textureSize: size, transitionDegrees } = EARTH_DAY_NIGHT_CONFIG
  const pixels = new Uint8ClampedArray(size * size)
  const hourAngles = Array.from({ length: size }, (_, x) =>
    Math.cos(((x + 0.5) / size * 2 - 1) * Math.PI - longitude))
  for (let y = 0; y < size; y++) {
    // Sample Mercator pixel centers; native raster interpolation supplies the soft edge.
    const latitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / size)))
    const vertical = Math.sin(latitude) * sine
    const horizontal = Math.cos(latitude) * cosine
    for (let x = 0; x < size; x++) {
      const altitude = Math.asin(Math.max(-1, Math.min(1, vertical + horizontal * hourAngles[x]!)))
      const progress = Math.max(0, Math.min(1, -altitude / RADIAN / transitionDegrees))
      pixels[y * size + x] = Math.round(255 * progress * progress * (3 - 2 * progress))
    }
  }
  return pixels
}
