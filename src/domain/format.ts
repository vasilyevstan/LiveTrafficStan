import type { WeatherVisibility } from './weatherObservations'
import {
  kilometersPerHourToKnots,
  metersPerSecondToFeetPerMinute,
  metersToFeet,
  type UnitSystem,
} from './units'

const wholeNumber = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
})

const oneDecimal = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export const formatAge = (timestamp: number | undefined, now: number) => {
  if (!timestamp) return 'not yet'

  const seconds = Math.max(0, Math.round((now - timestamp) / 1_000))
  if (seconds < 2) return 'just now'
  if (seconds < 60) return `${seconds} sec ago`

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.round(minutes / 60)
  return `${hours} hr ago`
}

export const formatAltitude = (
  meters: number,
  units: UnitSystem = 'metric',
) =>
  units === 'aviation-nautical'
    ? `${wholeNumber.format(metersToFeet(meters))} ft`
    : `${wholeNumber.format(meters)} m`

export const formatSpeed = (
  kilometersPerHour: number,
  units: UnitSystem = 'metric',
) =>
  units === 'aviation-nautical'
    ? `${wholeNumber.format(
        kilometersPerHourToKnots(kilometersPerHour),
      )} kn`
    : `${wholeNumber.format(kilometersPerHour)} km/h`

export const formatVesselSpeed = (kilometersPerHour: number) =>
  `${formatSpeed(kilometersPerHour)} · ${formatSpeed(
    kilometersPerHour,
    'aviation-nautical',
  )}`

export const formatVerticalSpeed = (
  metersPerSecond: number,
  units: UnitSystem = 'metric',
) => {
  const prefix = metersPerSecond > 0 ? '+' : ''
  if (units === 'aviation-nautical') {
    return `${prefix}${wholeNumber.format(
      metersPerSecondToFeetPerMinute(metersPerSecond),
    )} ft/min`
  }
  return `${prefix}${oneDecimal.format(metersPerSecond)} m/s`
}

export const formatHeading = (degrees: number) =>
  `${wholeNumber.format(degrees)} deg`

export const formatDimension = (meters: number) =>
  `${oneDecimal.format(meters)} m`

export const formatWeatherVisibility = (
  visibility: WeatherVisibility,
  units: UnitSystem,
) => {
  if (units === 'aviation-nautical') {
    return `${visibility.sourceToken} statute mi`
  }
  const qualifier =
    visibility.relation === 'at-least'
      ? 'at least '
      : visibility.relation === 'less-than'
        ? 'less than '
        : ''
  return `${qualifier}${oneDecimal.format(visibility.kilometers)} km`
}

export const formatTimestamp = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp)
