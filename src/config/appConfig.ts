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
  radiusPresetsKm: readonly number[]
  defaultRadiusKm: number
  vesselLengthPresetsMeters: readonly number[]
  defaultVesselLengthMeters: number
  map: {
    styleUrl: string
  }
  navigation: {
    coordinatePrecision: number
    panSettleMs: number
    geolocationTimeoutMs: number
    geolocationMaximumAgeMs: number
  }
  aircraft: FreshnessThresholds & {
    endpointBaseUrl: string
    refreshIntervalMs: number
    rateLimitBackoffMaxMs: number
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
    durationMs: number
    maxPointsPerEntity: number
  }
  interpolationDurationMs: number
}

const DEFAULTS = {
  latitude: 59.437,
  longitude: 24.7536,
  mapStyleUrl: 'https://tiles.openfreemap.org/styles/positron',
  aircraftEndpoint: '/api/aircraft',
  marineRestEndpoint: 'https://meri.digitraffic.fi',
  marineMqttEndpoint: 'wss://meri.digitraffic.fi:443/mqtt',
} as const

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
    radiusPresetsKm: [10, 20, 50, 100],
    defaultRadiusKm: 20,
    vesselLengthPresetsMeters: [25, 50, 100, 150],
    defaultVesselLengthMeters: 50,
    map: {
      styleUrl: readEndpoint(
        env,
        'VITE_MAP_STYLE_URL',
        DEFAULTS.mapStyleUrl,
        ['https:'],
      ),
    },
    navigation: {
      coordinatePrecision: 3,
      panSettleMs: 350,
      geolocationTimeoutMs: 8_000,
      geolocationMaximumAgeMs: 5 * 60_000,
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
      durationMs: 15 * 60_000,
      maxPointsPerEntity: 180,
    },
    interpolationDurationMs: 1_500,
  }
}

export const APP_CONFIG = createAppConfig(import.meta.env)
