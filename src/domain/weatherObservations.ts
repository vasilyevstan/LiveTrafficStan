import type { Airport } from './airports'

export const WEATHER_OBSERVATION_RESULT_LIMIT = 20
export const ICAO_WEATHER_STATION_PATTERN = /^[A-Z]{4}$/

export type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | 'UNKNOWN'
export type ObservationFreshness = 'current' | 'stale'
export type WindDirection = number | 'VRB'

export interface WeatherObservation {
  id: string
  stationId: string
  siteName: string
  longitude: number
  latitude: number
  observedAt: number
  reportType: 'METAR' | 'SPECI'
  flightCategory: FlightCategory
  temperatureCelsius?: number
  dewpointCelsius?: number
  windDirection?: WindDirection
  windSpeedKnots?: number
  windGustKnots?: number
  visibility?: string | number
  altimeterHpa?: number
  rawObservation: string
}

export interface DisplayWeatherObservation extends WeatherObservation {
  freshness: ObservationFreshness
}

export interface WeatherObservationSource {
  name: string
  apiUrl: string
  documentationUrl: string
  termsUrl: string
  licenseName: string
}

export interface WeatherObservationDataset {
  observations: readonly WeatherObservation[]
  retrievedAt: number
  source: WeatherObservationSource
}

export type WeatherObservationsViewState =
  | { phase: 'idle' }
  | { phase: 'waiting'; stationKey: string; nextRequestAt: number }
  | { phase: 'loading'; stationKey: string }
  | {
      phase: 'ready'
      stationKey: string
      dataset: WeatherObservationDataset
    }
  | {
      phase: 'error'
      stationKey: string
      message: string
      nextRetryAt?: number
    }

export type WeatherStationSelection =
  | { kind: 'ready'; stationIds: readonly string[] }
  | { kind: 'too-many'; count: number; maximum: number }

export const weatherObservationId = (stationId: string) =>
  `weather:${stationId}`

export const selectWeatherStationIds = (
  airports: readonly Airport[],
  maximumStations: number,
): WeatherStationSelection => {
  const stationIds = [
    ...new Set(
      airports
        .map(({ icaoCode }) => icaoCode)
        .filter(
          (icaoCode): icaoCode is string =>
            typeof icaoCode === 'string' &&
            ICAO_WEATHER_STATION_PATTERN.test(icaoCode),
        ),
    ),
  ].sort()

  return stationIds.length > maximumStations
    ? {
        kind: 'too-many',
        count: stationIds.length,
        maximum: maximumStations,
      }
    : { kind: 'ready', stationIds }
}

export const displayWeatherObservations = (
  observations: readonly WeatherObservation[],
  now: number,
  staleAfterMs: number,
  expireAfterMs: number,
): DisplayWeatherObservation[] =>
  observations.flatMap((observation) => {
    const age = Math.max(0, now - observation.observedAt)
    if (age > expireAfterMs) return []
    return [{
      ...observation,
      freshness: age > staleAfterMs ? 'stale' : 'current',
    }]
  })

export const flightCategoryLabel = (category: FlightCategory) =>
  category === 'UNKNOWN' ? 'Category unavailable' : category

export const weatherObservationSummary = (
  observation: DisplayWeatherObservation,
) =>
  `${observation.stationId} ${flightCategoryLabel(
    observation.flightCategory,
  )}`
