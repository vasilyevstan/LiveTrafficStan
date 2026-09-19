import { describe, expect, it } from 'vitest'
import { MAX_AIRCRAFT_RADIUS_NM } from '../../worker/aircraftProxy'
import { aircraftQueryRadiusNauticalMiles } from '../providers/aircraft/adsbLolProvider'
import { createAppConfig } from './appConfig'

describe('createAppConfig', () => {
  it('uses the Tallinn V1 defaults', () => {
    const config = createAppConfig({})

    expect(config.center).toEqual({
      latitude: 59.437,
      longitude: 24.7536,
      label: 'Tallinn, Estonia',
    })
    expect(config.defaultVesselLengthMeters).toBe(50)
    expect(config.navigation.coordinatePrecision).toBe(3)
    expect(config.navigation.viewportSettleMs).toBe(350)
    expect(config.navigation.geolocationTimeoutMs).toBe(20_000)
    expect(config.geocoder.endpointBaseUrl).toBe(
      'https://photon.komoot.io/api',
    )
    expect(config.geocoder.resultLimit).toBe(5)
    expect(config.geocoder.requestCooldownMs).toBe(1_000)
    expect(config.map.lightStyleUrl).toContain('/positron')
    expect(config.map.darkStyleUrl).toContain('/dark')
    expect(config.map.homeViewRadiusKm).toBe(20)
    expect(config.map.maximumViewportRadiusKm).toBe(100)
    expect(config.map.touchHitTolerancePx).toBe(8)
    expect(config.aircraft.refreshIntervalMs).toBe(20_000)
    expect(config.aircraft.rateLimitBackoffMaxMs).toBe(5 * 60_000)
    expect(config.aircraftMetadata).toMatchObject({
      baseUrl: '/aircraft-metadata/2026-09-13-v1',
      timeoutMs: 5_000,
      shardCacheEntries: 8,
      staleAfterDays: 45,
      futureToleranceHours: 24,
      sourceDatabaseVersion: 522,
    })
    expect(MAX_AIRCRAFT_RADIUS_NM).toBe(
      aircraftQueryRadiusNauticalMiles(config.map.maximumViewportRadiusKm),
    )
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
      VITE_GEOCODER_ENDPOINT: 'https://example.test/search/',
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
    expect(config.geocoder.endpointBaseUrl).toBe(
      'https://example.test/search',
    )

    expect(
      createAppConfig({
        VITE_GEOCODER_ENDPOINT: '/api/geocoder/',
      }).geocoder.endpointBaseUrl,
    ).toBe('/api/geocoder')
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
    expect(() =>
      createAppConfig({
        VITE_GEOCODER_ENDPOINT: '//protocol-relative.test/search',
      }),
    ).toThrow(/protocol-relative/)
    expect(() =>
      createAppConfig({
        VITE_GEOCODER_ENDPOINT: 'http://insecure.test/search',
      }),
    ).toThrow(/HTTPS/)
    expect(() =>
      createAppConfig({
        VITE_GEOCODER_ENDPOINT: 'https://user:secret@example.test/search',
      }),
    ).toThrow(/credentials/)
  })
})
