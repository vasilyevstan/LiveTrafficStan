import { describe, expect, it } from 'vitest'
import { createAppConfig } from './appConfig'

describe('createAppConfig', () => {
  it('uses the Tallinn V1 defaults', () => {
    const config = createAppConfig({})

    expect(config.center).toEqual({
      latitude: 59.437,
      longitude: 24.7536,
      label: 'Tallinn, Estonia',
    })
    expect(config.defaultRadiusKm).toBe(20)
    expect(config.radiusPresetsKm).toEqual([10, 20, 50, 100])
    expect(config.defaultVesselLengthMeters).toBe(50)
    expect(config.navigation.coordinatePrecision).toBe(3)
    expect(config.navigation.geolocationTimeoutMs).toBe(8_000)
    expect(config.map.lightStyleUrl).toContain('/positron')
    expect(config.map.darkStyleUrl).toContain('/dark')
    expect(config.aircraft.refreshIntervalMs).toBe(20_000)
    expect(config.aircraft.rateLimitBackoffMaxMs).toBe(5 * 60_000)
    expect(config.marine.mqttReconnectPeriodMs).toBe(15_000)
    expect(config.marine.queryRestRefreshIntervalMs).toBe(5 * 60_000)
    expect(config.trail.durationMs).toBe(15 * 60_000)
  })

  it('accepts explicit center and endpoint configuration', () => {
    const config = createAppConfig({
      VITE_CENTER_LATITUDE: '60',
      VITE_CENTER_LONGITUDE: '25',
      VITE_CENTER_LABEL: 'Test center',
      VITE_AIRCRAFT_ENDPOINT: 'https://example.test/aircraft/',
      VITE_MAP_DARK_STYLE_URL: 'https://example.test/dark/',
    })

    expect(config.center).toEqual({
      latitude: 60,
      longitude: 25,
      label: 'Test center',
    })
    expect(config.aircraft.endpointBaseUrl).toBe(
      'https://example.test/aircraft',
    )
    expect(config.map.darkStyleUrl).toBe('https://example.test/dark')
  })

  it('rejects invalid supplied configuration instead of silently masking it', () => {
    expect(() =>
      createAppConfig({ VITE_CENTER_LATITUDE: 'north' }),
    ).toThrow(/VITE_CENTER_LATITUDE/)
    expect(() =>
      createAppConfig({ VITE_MAP_STYLE_URL: 'http://insecure.test/style' }),
    ).toThrow(/https:/)
    expect(() =>
      createAppConfig({
        VITE_MAP_DARK_STYLE_URL: 'http://insecure.test/dark',
      }),
    ).toThrow(/https:/)
  })
})
