import type { AppCenter } from '../config/appConfig'
import { centerFromCoordinates } from './center'

export type LocationInputResult =
  | { kind: 'coordinates'; center: AppCenter }
  | { kind: 'query'; query: string }
  | { kind: 'error'; message: string }

const DECIMAL_TOKEN = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)'
const COORDINATE_PATTERN = new RegExp(
  `^\\s*(${DECIMAL_TOKEN})\\s*,\\s*(${DECIMAL_TOKEN})\\s*$`,
)
const NUMERIC_LOOKING_TOKEN = new RegExp(
  `^(?:${DECIMAL_TOKEN}(?:e[+-]?\\d+)?|[+-]?(?:nan|infinity))$`,
  'i',
)

const coordinateLabel = (
  latitude: number,
  longitude: number,
  precision: number,
) => `${latitude.toFixed(precision)}, ${longitude.toFixed(precision)}`

const looksLikeMalformedCoordinates = (value: string) => {
  const tokens = value.split(',').map((token) => token.trim())
  if (tokens.length < 2) return false
  return tokens.every(
    (token) => token === '' || NUMERIC_LOOKING_TOKEN.test(token),
  )
}

export const parseLocationInput = (
  value: string,
  precision: number,
  maximumQueryLength: number,
): LocationInputResult => {
  const input = value.trim()
  if (!input) {
    return { kind: 'error', message: 'Enter a place or coordinates.' }
  }
  if (input.length > maximumQueryLength) {
    return {
      kind: 'error',
      message: `Location input must be ${maximumQueryLength} characters or fewer.`,
    }
  }

  const coordinateMatch = COORDINATE_PATTERN.exec(input)
  if (coordinateMatch) {
    const latitude = Number(coordinateMatch[1])
    const longitude = Number(coordinateMatch[2])
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return {
        kind: 'error',
        message:
          'Latitude must be -90 to 90 and longitude must be -180 to 180.',
      }
    }

    const rounded = centerFromCoordinates(
      { latitude, longitude },
      precision,
      '',
    )
    return {
      kind: 'coordinates',
      center: {
        ...rounded,
        label: coordinateLabel(
          rounded.latitude,
          rounded.longitude,
          precision,
        ),
      },
    }
  }

  if (looksLikeMalformedCoordinates(input)) {
    return {
      kind: 'error',
      message:
        'Enter decimal coordinates as latitude, longitude without exponent notation.',
    }
  }

  return { kind: 'query', query: input }
}
