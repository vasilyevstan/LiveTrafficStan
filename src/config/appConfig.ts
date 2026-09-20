import type { StaticAircraftMetadataProviderConfig } from '../providers/aircraftMetadata/staticAircraftMetadataProvider'
import type { StaticAirportsProviderConfig } from '../providers/airports/staticAirportsProvider'
import type { StaticPortsProviderConfig } from '../providers/ports/staticPortsProvider'
import type { AwcMetarProviderConfig } from '../providers/weather/awcMetarProvider'
import type { AviationstackFlightRouteProviderConfig } from '../providers/flightRoute/aviationstackFlightRouteProvider'
import {
  DEFAULT_TRAIL_PREFERENCES,
  TRAIL_DURATION_OPTIONS_MINUTES,
} from '../domain/trailPreferences'
import aircraftMetadataSource from './aircraftMetadataSource.json'
import airportsSource from './airportsSource.json'
import portsSource from './portsSource.json'

export interface AppCenter {
  latitude: number
  longitude: number
  label: string
}

export interface FreshnessThresholds {
  staleAfterMs: number
  expireAfterMs: number
}

export interface AppConfig {
  center: AppCenter
  vesselLengthPresetsMeters: readonly number[]
  defaultVesselLengthMeters: number
  map: {
    lightStyleUrl: string
    darkStyleUrl: string
    homeViewRadiusKm: number
    maximumViewportRadiusKm: number
    touchHitTolerancePx: number
    clustering: {
      radiusPx: number
      minimumPoints: number
      maximumZoom: number
    }
  }
  navigation: {
    coordinatePrecision: number
    viewportSettleMs: number
    geolocationTimeoutMs: number
    geolocationMaximumAgeMs: number
  }
  geocoder: {
    endpointBaseUrl: string
    resultLimit: number
    maximumQueryLength: number
    requestCooldownMs: number
    timeoutMs: number
    rateLimitFallbackMs: number
    cacheMaxEntries: number
    cacheTtlMs: number
  }
  aircraft: FreshnessThresholds & {
    endpointBaseUrl: string
    refreshIntervalMs: number
    rateLimitBackoffMaxMs: number
  }
  aircraftMetadata: StaticAircraftMetadataProviderConfig
  flightRoute: AviationstackFlightRouteProviderConfig & {
    enabled: boolean
  }
  airports: StaticAirportsProviderConfig
  ports: StaticPortsProviderConfig
  weather: FreshnessThresholds &
    AwcMetarProviderConfig & {
      requestCooldownMs: number
    }
  marine: FreshnessThresholds & {
    restBaseUrl: string
    mqttUrl: string
    mqttConnectTimeoutMs: number
    mqttReconnectPeriodMs: number
    metadataRefreshIntervalMs: number
    queryRestRefreshIntervalMs: number
    restLookbackMs: number
    snapshotFlushIntervalMs: number
  }
  trail: {
    durationOptionsMinutes: readonly number[]
    defaultDurationMinutes: number
    pointsPerMinute: number
    maxTotalPoints: number
  }
  history: {
    sessionRetentionMs: number
    sessionMaxRecords: number
    sessionMaxLogicalBytes: number
    sampleIntervalMs: number
    durableMaxRecords: number
    durableMaxLogicalBytes: number
    pendingWriteMaxRecords: number
    pendingWriteMaxLogicalBytes: number
    writeBatchRecords: number
    maintenanceIntervalMs: number
    playbackPublishIntervalMs: number
    aircraftTrailGapMs: number
    vesselTrailGapMs: number
  }
  interpolationDurationMs: number
}

const DEFAULTS = {
  latitude: 59.437,
  longitude: 24.7536,
  lightMapStyleUrl: 'https://tiles.openfreemap.org/styles/positron',
  darkMapStyleUrl: 'https://tiles.openfreemap.org/styles/dark',
  geocoderEndpoint: 'https://photon.komoot.io/api',
  aircraftEndpoint: '/api/aircraft',
  flightRouteEndpoint: '/api/flight-route',
  weatherEndpoint: '/api/weather/metar',
  marineRestEndpoint: 'https://meri.digitraffic.fi',
  marineMqttEndpoint: 'wss://meri.digitraffic.fi:443/mqtt',
} as const

const readBoolean = (
  env: Record<string, string | undefined>,
  name: string,
  fallback: boolean,
) => {
  const value = env[name]?.trim()
  if (!value) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`${name} must be "true" or "false"`)
}

const readNumber = (
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const rawValue = env[name]?.trim()
  if (!rawValue) return fallback

  const value = Number(rawValue)
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be a number between ${minimum} and ${maximum}; received "${rawValue}"`,
    )
  }

  return value
}

const readEndpoint = (
  env: Record<string, string | undefined>,
  name: string,
  fallback: string,
  protocols: readonly string[],
) => {
  const value = env[name]?.trim() || fallback
  if (value.startsWith('/')) return value.replace(/\/+$/, '')

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid URL or root-relative path`)
  }

  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${name} must use one of: ${protocols.join(', ')}`)
  }

  return value.replace(/\/+$/, '')
}

const readPublicEndpoint = (
  env: Record<string, string | undefined>,
  name: string,
  fallback: string,
) => {
  const value = env[name]?.trim() || fallback
  if (value.startsWith('//')) {
    throw new Error(`${name} must not use a protocol-relative URL`)
  }
  if (value.startsWith('/')) return value.replace(/\/+$/, '')

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL or root-relative path`)
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS`)
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${name} must not include URL credentials`)
  }

  return value.replace(/\/+$/, '')
}

const readSameOriginEndpoint = (
  env: Record<string, string | undefined>,
  name: string,
  fallback: string,
) => {
  const value = env[name]?.trim() || fallback
  if (value.startsWith('//')) {
    throw new Error(`${name} must not use a protocol-relative URL`)
  }
  if (!value.startsWith('/')) {
    throw new Error(`${name} must use a root-relative same-origin path`)
  }

  const baseUrl = new URL('https://livetrafficstan.invalid')
  const parsed = new URL(value, baseUrl)
  if (
    parsed.origin !== baseUrl.origin ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname === '/'
  ) {
    throw new Error(
      `${name} must be a root-relative path without a query or fragment`,
    )
  }
  return parsed.pathname.replace(/\/+$/, '')
}

export const createAppConfig = (
  env: Record<string, string | undefined>,
): AppConfig => {
  const center = {
    latitude: readNumber(env, 'VITE_CENTER_LATITUDE', DEFAULTS.latitude, -90, 90),
    longitude: readNumber(
      env,
      'VITE_CENTER_LONGITUDE',
      DEFAULTS.longitude,
      -180,
      180,
    ),
    label: env.VITE_CENTER_LABEL?.trim() || 'Tallinn, Estonia',
  }

  return {
    center,
    vesselLengthPresetsMeters: [25, 50, 100, 150],
    defaultVesselLengthMeters: 50,
    map: {
      lightStyleUrl: readEndpoint(
        env,
        'VITE_MAP_STYLE_URL',
        DEFAULTS.lightMapStyleUrl,
        ['https:'],
      ),
      darkStyleUrl: readEndpoint(
        env,
        'VITE_MAP_DARK_STYLE_URL',
        DEFAULTS.darkMapStyleUrl,
        ['https:'],
      ),
      homeViewRadiusKm: 20,
      maximumViewportRadiusKm: 100,
      touchHitTolerancePx: 8,
      clustering: {
        radiusPx: 42,
        minimumPoints: 3,
        maximumZoom: 10,
      },
    },
    navigation: {
      coordinatePrecision: 3,
      viewportSettleMs: 350,
      geolocationTimeoutMs: 20_000,
      geolocationMaximumAgeMs: 5 * 60_000,
    },
    geocoder: {
      endpointBaseUrl: readPublicEndpoint(
        env,
        'VITE_GEOCODER_ENDPOINT',
        DEFAULTS.geocoderEndpoint,
      ),
      resultLimit: 5,
      maximumQueryLength: 100,
      requestCooldownMs: 1_000,
      timeoutMs: 8_000,
      rateLimitFallbackMs: 60_000,
      cacheMaxEntries: 20,
      cacheTtlMs: 15 * 60_000,
    },
    aircraft: {
      endpointBaseUrl: readEndpoint(
        env,
        'VITE_AIRCRAFT_ENDPOINT',
        DEFAULTS.aircraftEndpoint,
        ['https:'],
      ),
      refreshIntervalMs: 20_000,
      rateLimitBackoffMaxMs: 5 * 60_000,
      staleAfterMs: 45_000,
      expireAfterMs: 120_000,
    },
    aircraftMetadata: {
      baseUrl: `/aircraft-metadata/${aircraftMetadataSource.projection.outputVersion}`,
      timeoutMs: 5_000,
      indexMaximumBytes: 512 * 1_024,
      shardMaximumBytes: 512 * 1_024,
      shardCacheEntries: 8,
      schemaVersion: aircraftMetadataSource.projection.schemaVersion,
      outputVersion: aircraftMetadataSource.projection.outputVersion,
      sourceName: aircraftMetadataSource.source.name,
      sourceRepositoryUrl: aircraftMetadataSource.source.repositoryUrl,
      sourceCommit: aircraftMetadataSource.source.commit,
      sourcePublishedAt: aircraftMetadataSource.source.publishedAt,
      sourceDatabaseVersion: aircraftMetadataSource.source.databaseVersion,
      sourceLicenseName: aircraftMetadataSource.source.licenseName,
      sourceLicenseUrl: aircraftMetadataSource.source.licenseCanonicalUrl,
      sourceArchiveSha256: aircraftMetadataSource.source.archiveSha256,
      staleAfterDays: aircraftMetadataSource.projection.staleAfterDays,
      futureToleranceHours:
        aircraftMetadataSource.projection.futureToleranceHours,
      expectedCounts: aircraftMetadataSource.projection.expected,
    },
    flightRoute: {
      enabled: readBoolean(env, 'VITE_FLIGHT_ROUTE_ENABLED', false),
      endpointUrl: readSameOriginEndpoint(
        env,
        'VITE_FLIGHT_ROUTE_ENDPOINT',
        DEFAULTS.flightRouteEndpoint,
      ),
      timeoutMs: 10_000,
      maximumBytes: 16 * 1_024,
      sourceName: 'aviationstack',
      sourceWebsiteUrl: 'https://aviationstack.com/',
    },
    airports: {
      assetUrl: `/airports/${airportsSource.projection.outputVersion}/airports.geojson`,
      timeoutMs: 5_000,
      maximumBytes: 1_536 * 1_024,
      schemaVersion: airportsSource.projection.schemaVersion,
      outputVersion: airportsSource.projection.outputVersion,
      sourceName: airportsSource.source.name,
      sourceRepositoryUrl: airportsSource.source.repositoryUrl,
      sourceCommit: airportsSource.source.commit,
      sourcePublishedAt: airportsSource.source.publishedAt,
      sourceTermsUrl: airportsSource.source.termsUrl,
      sourceDocumentationUrl: airportsSource.source.documentationUrl,
      sourceLicenseName: airportsSource.source.licenseName,
      expectedBytes: airportsSource.projection.expected.rawBytes,
      expectedRecords: airportsSource.projection.expected.projectedRecords,
      expectedSha256: airportsSource.projection.expected.sha256,
      expectedKindCounts: airportsSource.projection.expected.kindCounts,
    },
    ports: {
      assetUrl: `/ports/${portsSource.projection.outputVersion}/ports.geojson`,
      timeoutMs: 5_000,
      maximumBytes: 512 * 1_024,
      schemaVersion: portsSource.projection.schemaVersion,
      outputVersion: portsSource.projection.outputVersion,
      sourceName: portsSource.source.name,
      sourceRepositoryUrl: portsSource.source.repositoryUrl,
      sourceTag: portsSource.source.tag,
      sourceCommit: portsSource.source.commit,
      sourcePublishedAt: portsSource.source.publishedAt,
      sourceTermsUrl: portsSource.source.termsUrl,
      sourceDocumentationUrl: portsSource.source.documentationUrl,
      sourceLicenseName: portsSource.source.licenseName,
      expectedRecords: portsSource.projection.expected.projectedRecords,
      expectedSha256: portsSource.projection.expected.sha256,
      expectedRankCounts: portsSource.projection.expected.rankCounts,
    },
    weather: {
      endpointBaseUrl: readSameOriginEndpoint(
        env,
        'VITE_WEATHER_ENDPOINT',
        DEFAULTS.weatherEndpoint,
      ),
      timeoutMs: 8_000,
      maximumBytes: 256 * 1_024,
      maximumStations: 50,
      futureToleranceMs: 10 * 60_000,
      requestCooldownMs: 60_000,
      staleAfterMs: 75 * 60_000,
      expireAfterMs: 120 * 60_000,
      sourceName: 'NOAA/NWS Aviation Weather Center',
      sourceApiUrl: 'https://aviationweather.gov/api/data/metar',
      sourceDocumentationUrl: 'https://aviationweather.gov/data/api/',
      sourceTermsUrl: 'https://www.weather.gov/disclaimer',
      sourceLicenseName: 'U.S. public domain unless marked otherwise',
    },
    marine: {
      restBaseUrl: readEndpoint(
        env,
        'VITE_MARINE_REST_ENDPOINT',
        DEFAULTS.marineRestEndpoint,
        ['https:'],
      ),
      mqttUrl: readEndpoint(
        env,
        'VITE_MARINE_MQTT_ENDPOINT',
        DEFAULTS.marineMqttEndpoint,
        ['wss:'],
      ),
      mqttConnectTimeoutMs: 10_000,
      mqttReconnectPeriodMs: 15_000,
      metadataRefreshIntervalMs: 5 * 60_000,
      queryRestRefreshIntervalMs: 5 * 60_000,
      restLookbackMs: 15 * 60_000,
      snapshotFlushIntervalMs: 1_000,
      staleAfterMs: 2 * 60_000,
      expireAfterMs: 10 * 60_000,
    },
    trail: {
      durationOptionsMinutes: TRAIL_DURATION_OPTIONS_MINUTES,
      defaultDurationMinutes: DEFAULT_TRAIL_PREFERENCES.durationMinutes,
      pointsPerMinute: 12,
      maxTotalPoints: 50_000,
    },
    history: {
      sessionRetentionMs: 60 * 60_000,
      sessionMaxRecords: 50_000,
      sessionMaxLogicalBytes: 16 * 1_024 * 1_024,
      sampleIntervalMs: 10_000,
      durableMaxRecords: 100_000,
      durableMaxLogicalBytes: 32 * 1_024 * 1_024,
      pendingWriteMaxRecords: 5_000,
      pendingWriteMaxLogicalBytes: 4 * 1_024 * 1_024,
      writeBatchRecords: 250,
      maintenanceIntervalMs: 5 * 60_000,
      playbackPublishIntervalMs: 100,
      aircraftTrailGapMs: 120_000,
      vesselTrailGapMs: 600_000,
    },
    interpolationDurationMs: 1_500,
  }
}

export const APP_CONFIG = createAppConfig(import.meta.env)
