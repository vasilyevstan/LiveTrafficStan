import type { ThemePreference } from '../app/theme'
import type { LayerPreferences } from './layerPreferences'
import {
  isMapCameraState,
  MAP_CAMERA_LIMITS,
  roundMapCameraState,
  type MapCameraState,
} from './mapCamera'
import {
  APP_PREFERENCES_VERSION,
  type AppPreferenceOverrides,
  type AppPreferencesV1,
  type StructuredVesselFilters,
} from './preferences'
import {
  TRAIL_DURATION_OPTIONS_MINUTES,
  type TrailPreferences,
} from './trailPreferences'
import { isUnitSystem, type UnitSystem } from './units'
import {
  isVesselCategoryFilter,
  isVesselMaximumLength,
  isVesselNavigationFilter,
  isVesselReportedSpeedFilter,
  VESSEL_MAXIMUM_LENGTH_OPTIONS,
  VESSEL_MINIMUM_LENGTH_OPTIONS,
} from './vesselFilters'

export const MAXIMUM_SHARE_FRAGMENT_LENGTH = 2_048

export interface SharedAppState {
  camera?: MapCameraState
  preferences?: AppPreferenceOverrides
}

const SHARE_KEYS = new Set([
  'v',
  'lat',
  'lon',
  'zoom',
  'bearing',
  'pitch',
  'theme',
  'units',
  'aircraft',
  'vessels',
  'ports',
  'airports',
  'clusters',
  'weather',
  'vesselCategory',
  'vesselNavigation',
  'vesselSpeed',
  'vesselMinLength',
  'vesselMaxLength',
  'vesselUnknownLength',
  'trails',
  'trailMinutes',
])

const CAMERA_KEYS = ['lat', 'lon', 'zoom', 'bearing', 'pitch'] as const

const parseFiniteNumber = (
  value: string | null,
  minimum: number,
  maximum: number,
) => {
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) &&
    parsed >= minimum &&
    parsed <= maximum
    ? parsed
    : undefined
}

const parseBoolean = (value: string | null) =>
  value === '1' ? true : value === '0' ? false : undefined

const parseNumericOption = <Value extends number>(
  value: string | null,
  options: readonly Value[],
) =>
  value === null
    ? undefined
    : options.find((option) => String(option) === value)

const setLayerOverride = <Key extends keyof LayerPreferences>(
  overrides: AppPreferenceOverrides,
  key: Key,
  value: LayerPreferences[Key] | undefined,
) => {
  if (value === undefined) return true
  overrides.layers = {
    ...overrides.layers,
    [key]: value,
  }
  return true
}

const setVesselOverride = <Key extends keyof StructuredVesselFilters>(
  overrides: AppPreferenceOverrides,
  key: Key,
  value: StructuredVesselFilters[Key] | undefined,
) => {
  if (value === undefined) return true
  overrides.vesselFilters = {
    ...overrides.vesselFilters,
    [key]: value,
  }
  return true
}

const setTrailOverride = <Key extends keyof TrailPreferences>(
  overrides: AppPreferenceOverrides,
  key: Key,
  value: TrailPreferences[Key] | undefined,
) => {
  if (value === undefined) return true
  overrides.trail = {
    ...overrides.trail,
    [key]: value,
  }
  return true
}

const hasAnyPreferenceOverride = (overrides: AppPreferenceOverrides) =>
  overrides.theme !== undefined ||
  overrides.units !== undefined ||
  overrides.layers !== undefined ||
  overrides.vesselFilters !== undefined ||
  overrides.trail !== undefined

export const parseShareFragment = (
  fragment: string,
  coordinatePrecision = 3,
): SharedAppState | null => {
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment
  if (!raw || raw.length > MAXIMUM_SHARE_FRAGMENT_LENGTH) return null

  const params = new URLSearchParams(raw)
  for (const key of params.keys()) {
    if (!SHARE_KEYS.has(key) || params.getAll(key).length !== 1) return null
  }
  if (params.get('v') !== String(APP_PREFERENCES_VERSION)) return null

  const cameraValuesPresent = CAMERA_KEYS.filter((key) => params.has(key))
  let camera: MapCameraState | undefined
  if (cameraValuesPresent.length > 0) {
    if (cameraValuesPresent.length !== CAMERA_KEYS.length) return null
    const candidate = {
      latitude: parseFiniteNumber(
        params.get('lat'),
        MAP_CAMERA_LIMITS.minimumLatitude,
        MAP_CAMERA_LIMITS.maximumLatitude,
      ),
      longitude: parseFiniteNumber(
        params.get('lon'),
        MAP_CAMERA_LIMITS.minimumLongitude,
        MAP_CAMERA_LIMITS.maximumLongitude,
      ),
      zoom: parseFiniteNumber(
        params.get('zoom'),
        MAP_CAMERA_LIMITS.minimumZoom,
        MAP_CAMERA_LIMITS.maximumZoom,
      ),
      bearing: parseFiniteNumber(
        params.get('bearing'),
        MAP_CAMERA_LIMITS.minimumBearing,
        MAP_CAMERA_LIMITS.maximumBearing,
      ),
      pitch: parseFiniteNumber(
        params.get('pitch'),
        MAP_CAMERA_LIMITS.minimumPitch,
        MAP_CAMERA_LIMITS.maximumPitch,
      ),
    }
    if (!isMapCameraState(candidate)) return null
    camera = roundMapCameraState(candidate, coordinatePrecision)
  }

  const overrides: AppPreferenceOverrides = {}
  if (params.has('theme')) {
    const theme = params.get('theme')
    if (theme !== 'auto' && theme !== 'light' && theme !== 'dark') return null
    overrides.theme = theme satisfies ThemePreference
  }
  if (params.has('units')) {
    const units = params.get('units')
    if (!isUnitSystem(units)) return null
    overrides.units = units satisfies UnitSystem
  }

  const layerParameters: readonly [
    string,
    keyof LayerPreferences,
  ][] = [
    ['aircraft', 'aircraftVisible'],
    ['vessels', 'vesselsVisible'],
    ['ports', 'portsVisible'],
    ['airports', 'airportsVisible'],
    ['clusters', 'clusteringEnabled'],
    ['weather', 'weatherVisible'],
  ]
  for (const [parameter, key] of layerParameters) {
    if (!params.has(parameter)) continue
    const value = parseBoolean(params.get(parameter))
    if (value === undefined) return null
    setLayerOverride(overrides, key, value)
  }

  if (params.has('vesselCategory')) {
    const value = params.get('vesselCategory')
    if (!isVesselCategoryFilter(value)) return null
    setVesselOverride(overrides, 'category', value)
  }
  if (params.has('vesselNavigation')) {
    const value = params.get('vesselNavigation')
    if (!isVesselNavigationFilter(value)) return null
    setVesselOverride(overrides, 'navigation', value)
  }
  if (params.has('vesselSpeed')) {
    const value = params.get('vesselSpeed')
    if (!isVesselReportedSpeedFilter(value)) return null
    setVesselOverride(overrides, 'reportedSpeed', value)
  }
  if (params.has('vesselMinLength')) {
    const value = parseNumericOption(
      params.get('vesselMinLength'),
      VESSEL_MINIMUM_LENGTH_OPTIONS,
    )
    if (value === undefined) return null
    setVesselOverride(overrides, 'minimumLengthMeters', value)
  }
  if (params.has('vesselMaxLength')) {
    const rawMaximum = params.get('vesselMaxLength')
    const value =
      rawMaximum === 'none'
        ? null
        : parseNumericOption(
            rawMaximum,
            VESSEL_MAXIMUM_LENGTH_OPTIONS.filter(
              (option): option is Exclude<typeof option, null> =>
                option !== null,
            ),
          )
    if (!isVesselMaximumLength(value)) return null
    setVesselOverride(overrides, 'maximumLengthMeters', value)
  }
  if (params.has('vesselUnknownLength')) {
    const value = parseBoolean(params.get('vesselUnknownLength'))
    if (value === undefined) return null
    setVesselOverride(overrides, 'includeUnknownLength', value)
  }
  if (params.has('trails')) {
    const value = parseBoolean(params.get('trails'))
    if (value === undefined) return null
    setTrailOverride(overrides, 'visible', value)
  }
  if (params.has('trailMinutes')) {
    const value = parseNumericOption(
      params.get('trailMinutes'),
      TRAIL_DURATION_OPTIONS_MINUTES,
    )
    if (value === undefined) return null
    setTrailOverride(overrides, 'durationMinutes', value)
  }

  return {
    camera,
    preferences: hasAnyPreferenceOverride(overrides)
      ? overrides
      : undefined,
  }
}

const booleanValue = (value: boolean) => (value ? '1' : '0')

export const serializeShareFragment = (
  camera: MapCameraState,
  preferences: AppPreferencesV1,
  coordinatePrecision: number,
) => {
  const roundedCamera = roundMapCameraState(camera, coordinatePrecision)
  if (!isMapCameraState(roundedCamera)) {
    throw new RangeError('Cannot share an invalid map camera')
  }
  const params = new URLSearchParams()
  params.set('v', String(APP_PREFERENCES_VERSION))
  params.set(
    'lat',
    roundedCamera.latitude.toFixed(coordinatePrecision),
  )
  params.set(
    'lon',
    roundedCamera.longitude.toFixed(coordinatePrecision),
  )
  params.set('zoom', roundedCamera.zoom.toFixed(2))
  params.set('bearing', roundedCamera.bearing.toFixed(1))
  params.set('pitch', roundedCamera.pitch.toFixed(1))
  params.set('theme', preferences.theme)
  params.set('units', preferences.units)
  params.set('aircraft', booleanValue(preferences.layers.aircraftVisible))
  params.set('vessels', booleanValue(preferences.layers.vesselsVisible))
  params.set('ports', booleanValue(preferences.layers.portsVisible))
  params.set('airports', booleanValue(preferences.layers.airportsVisible))
  params.set(
    'clusters',
    booleanValue(preferences.layers.clusteringEnabled),
  )
  params.set('weather', booleanValue(preferences.layers.weatherVisible))
  params.set('vesselCategory', preferences.vesselFilters.category)
  params.set('vesselNavigation', preferences.vesselFilters.navigation)
  params.set('vesselSpeed', preferences.vesselFilters.reportedSpeed)
  params.set(
    'vesselMinLength',
    String(preferences.vesselFilters.minimumLengthMeters),
  )
  params.set(
    'vesselMaxLength',
    preferences.vesselFilters.maximumLengthMeters === null
      ? 'none'
      : String(preferences.vesselFilters.maximumLengthMeters),
  )
  params.set(
    'vesselUnknownLength',
    booleanValue(preferences.vesselFilters.includeUnknownLength),
  )
  params.set('trails', booleanValue(preferences.trail.visible))
  params.set('trailMinutes', String(preferences.trail.durationMinutes))
  return `#${params.toString()}`
}

export const createShareUrl = (
  location: Pick<Location, 'origin' | 'pathname'>,
  camera: MapCameraState,
  preferences: AppPreferencesV1,
  coordinatePrecision: number,
) =>
  `${location.origin}${location.pathname}${serializeShareFragment(
    camera,
    preferences,
    coordinatePrecision,
  )}`

export const readBrowserShareState = (coordinatePrecision = 3) => {
  try {
    return parseShareFragment(
      window.location.hash,
      coordinatePrecision,
    )
  } catch {
    return null
  }
}
