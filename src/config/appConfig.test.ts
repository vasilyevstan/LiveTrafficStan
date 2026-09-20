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
    expect(config.map.clustering).toEqual({
      radiusPx: 42,
      minimumPoints: 3,
      maximumZoom: 10,
    })
    expect(config.aircraft.refreshIntervalMs).toBe(20_000)
    expect(config.aircraft.rateLimitBackoffMaxMs).toBe(5 * 60_000)
    expect(config.weather).toMatchObject({
      endpointBaseUrl: '/api/weather/metar',
      timeoutMs: 8_000,
      maximumBytes: 256 * 1_024,
      maximumStations: 50,
      requestCooldownMs: 60_000,
      staleAfterMs: 75 * 60_000,
      expireAfterMs: 120 * 60_000,
      sourceName: 'NOAA/NWS Aviation Weather Center',
    })
    expect(config.aircraftMetadata).toMatchObject({
      baseUrl: '/aircraft-metadata/2026-09-13-v1',
      timeoutMs: 5_000,
      shardCacheEntries: 8,
      staleAfterDays: 45,
      futureToleranceHours: 24,
      sourceDatabaseVersion: 522,
    })
    expect(config.flightRoute).toEqual({
      enabled: false,
      endpointUrl: '/api/flight-route',
      timeoutMs: 10_000,
      maximumBytes: 16 * 1_024,
      sourceName: 'aviationstack',
      sourceWebsiteUrl: 'https://aviationstack.com/',
    })
    expect(config.airports).toMatchObject({
      assetUrl:
        '/airports/ourairports-2026-09-19-v1/airports.geojson',
      timeoutMs: 5_000,
      expectedBytes: 1_329_838,
      expectedRecords: 5280,
      sourceLicenseName: 'Public domain',
    })
    expect(config.ports).toMatchObject({
      assetUrl: '/ports/natural-earth-v5.1.2-v1/ports.geojson',
      timeoutMs: 5_000,
      expectedRecords: 1081,
      sourceTag: 'v5.1.2',
      sourceLicenseName: 'Public domain',
    })
    expect(MAX_AIRCRAFT_RADIUS_NM).toBe(
      aircraftQueryRadiusNauticalMiles(config.map.maximumViewportRadiusKm),
    )
    expect(config.marine.mqttReconnectPeriodMs).toBe(15_000)
    expect(config.marine.queryRestRefreshIntervalMs).toBe(5 * 60_000)
    expect(config.trail).toEqual({
      durationOptionsMinutes: [5, 15, 30, 60],
      defaultDurationMinutes: 15,
      pointsPerMinute: 12,
      maxTotalPoints: 50_000,
    })
    expect(config.history).toMatchObject({
      sessionRetentionMs: 60 * 60_000,
      sessionMaxRecords: 50_000,
      sessionMaxLogicalBytes: 16 * 1_024 * 1_024,
      sampleIntervalMs: 10_000,
      durableMaxRecords: 100_000,
      durableMaxLogicalBytes: 32 * 1_024 * 1_024,
      pendingWriteMaxRecords: 5_000,
      pendingWriteMaxLogicalBytes: 4 * 1_024 * 1_024,
      playbackPublishIntervalMs: 100,
      aircraftTrailGapMs: 120_000,
      vesselTrailGapMs: 600_000,
    })
  })

  it('accepts explicit center and endpoint configuration', () => {
    const config = createAppConfig({
      VITE_CENTER_LATITUDE: '60',
      VITE_CENTER_LONGITUDE: '25',
      VITE_CENTER_LABEL: 'Test center',
      VITE_AIRCRAFT_ENDPOINT: 'https://example.test/aircraft/',
      VITE_GEOCODER_ENDPOINT: 'https://example.test/search/',
      VITE_MAP_DARK_STYLE_URL: 'https://example.test/dark/',
      VITE_FLIGHT_ROUTE_ENABLED: 'true',
      VITE_FLIGHT_ROUTE_ENDPOINT: '/edge/flight-route/',
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
    expect(config.flightRoute).toMatchObject({
      enabled: true,
      endpointUrl: '/edge/flight-route',
    })

    expect(
      createAppConfig({
        VITE_GEOCODER_ENDPOINT: '/api/geocoder/',
      }).geocoder.endpointBaseUrl,
    ).toBe('/api/geocoder')
    expect(
      createAppConfig({
        VITE_WEATHER_ENDPOINT: '/edge/metar/',
      }).weather.endpointBaseUrl,
    ).toBe('/edge/metar')
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
        VITE_WEATHER_ENDPOINT: '//collector.example/metar',
      }),
    ).toThrow(/protocol-relative/)
    expect(() =>
      createAppConfig({
        VITE_WEATHER_ENDPOINT: 'https://collector.example/metar',
      }),
    ).toThrow(/same-origin/)
    expect(() =>
      createAppConfig({
        VITE_WEATHER_ENDPOINT: '/api/weather/metar?format=json',
      }),
    ).toThrow(/without a query/)
    expect(() =>
      createAppConfig({
        VITE_FLIGHT_ROUTE_ENABLED: 'yes',
      }),
    ).toThrow(/VITE_FLIGHT_ROUTE_ENABLED/)
    expect(() =>
      createAppConfig({
        VITE_FLIGHT_ROUTE_ENDPOINT: 'https://collector.example/route',
      }),
    ).toThrow(/same-origin/)
    expect(() =>
      createAppConfig({
        VITE_GEOCODER_ENDPOINT: 'https://user:secret@example.test/search',
      }),
    ).toThrow(/credentials/)
  })
})
