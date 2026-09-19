import { describe, expect, it } from 'vitest'
import type { Airport } from './airports'
import {
  displayWeatherObservations,
  selectWeatherStationIds,
  weatherObservationId,
  weatherObservationSummary,
  type WeatherObservation,
} from './weatherObservations'

const airport = (id: string, icaoCode?: string): Airport => ({
  id,
  name: `Airport ${id}`,
  kind: 'large',
  ident: icaoCode ?? `ID${id}`,
  icaoCode,
  isoCountry: 'EE',
  longitude: 24.75,
  latitude: 59.44,
})

const observation = (
  stationId: string,
  observedAt: number,
): WeatherObservation => ({
  id: weatherObservationId(stationId),
  stationId,
  siteName: stationId,
  longitude: 24.75,
  latitude: 59.44,
  observedAt,
  reportType: 'METAR',
  flightCategory: 'VFR',
  rawObservation: `METAR ${stationId}`,
})

describe('weather observations', () => {
  it('selects only explicit four-letter ICAO codes deterministically', () => {
    expect(
      selectWeatherStationIds(
        [
          airport('1', 'EETN'),
          airport('2', 'EFHK'),
          airport('3', 'EETN'),
          airport('4', 'K1AB'),
          airport('5'),
        ],
        50,
      ),
    ).toEqual({ kind: 'ready', stationIds: ['EETN', 'EFHK'] })
  })

  it('rejects an over-limit view without truncating it', () => {
    expect(
      selectWeatherStationIds(
        [airport('1', 'EETN'), airport('2', 'EFHK')],
        1,
      ),
    ).toEqual({ kind: 'too-many', count: 2, maximum: 1 })
  })

  it('marks stale observations and removes expired observations', () => {
    expect(
      displayWeatherObservations(
        [
          observation('EETN', 100_000),
          observation('EFHK', 50_000),
          observation('EGLL', 0),
        ],
        120_000,
        30_000,
        100_000,
      ),
    ).toEqual([
      expect.objectContaining({ stationId: 'EETN', freshness: 'current' }),
      expect.objectContaining({ stationId: 'EFHK', freshness: 'stale' }),
    ])
  })

  it('uses explicit weather IDs and non-color-only summaries', () => {
    const display = {
      ...observation('EETN', 100_000),
      freshness: 'current' as const,
    }
    expect(display.id).toBe('weather:EETN')
    expect(weatherObservationSummary(display)).toBe('EETN VFR')
  })
})
