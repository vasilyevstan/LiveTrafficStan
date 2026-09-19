import {
  isThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '../app/theme'
import {
  DEFAULT_LAYER_PREFERENCES,
  type LayerPreferences,
} from './layerPreferences'
import {
  DEFAULT_TRAIL_PREFERENCES,
  isTrailDurationMinutes,
  type TrailPreferences,
} from './trailPreferences'
import {
  DEFAULT_UNIT_SYSTEM,
  isUnitSystem,
  type UnitSystem,
} from './units'
import {
  DEFAULT_VESSEL_FILTERS,
  isVesselCategoryFilter,
  isVesselMaximumLength,
  isVesselMinimumLength,
  isVesselNavigationFilter,
  isVesselReportedSpeedFilter,
  type VesselFilterState,
} from './vesselFilters'

export const APP_PREFERENCES_VERSION = 1
export const APP_PREFERENCES_STORAGE_KEY =
  'livetrafficstan.preferences.v1'

export type StructuredVesselFilters = Omit<VesselFilterState, 'query'>

export interface AppPreferencesV1 {
  version: typeof APP_PREFERENCES_VERSION
  theme: ThemePreference
  units: UnitSystem
  layers: LayerPreferences
  vesselFilters: StructuredVesselFilters
  trail: TrailPreferences
}

export interface AppPreferenceOverrides {
  theme?: ThemePreference
  units?: UnitSystem
  layers?: Partial<LayerPreferences>
  vesselFilters?: Partial<StructuredVesselFilters>
  trail?: Partial<TrailPreferences>
}

export interface PreferenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface LoadedAppPreferences {
  preferences: AppPreferencesV1
  migrateLegacyTheme: boolean
}

const defaultStructuredVesselFilters = (): StructuredVesselFilters => ({
  category: DEFAULT_VESSEL_FILTERS.category,
  navigation: DEFAULT_VESSEL_FILTERS.navigation,
  reportedSpeed: DEFAULT_VESSEL_FILTERS.reportedSpeed,
  minimumLengthMeters: DEFAULT_VESSEL_FILTERS.minimumLengthMeters,
  maximumLengthMeters: DEFAULT_VESSEL_FILTERS.maximumLengthMeters,
  includeUnknownLength: DEFAULT_VESSEL_FILTERS.includeUnknownLength,
})

const normalizeStructuredVesselFilters = (
  filters: StructuredVesselFilters,
): StructuredVesselFilters => ({
  ...filters,
  maximumLengthMeters:
    filters.maximumLengthMeters !== null &&
    filters.maximumLengthMeters < filters.minimumLengthMeters
      ? null
      : filters.maximumLengthMeters,
})

export const defaultAppPreferences = (): AppPreferencesV1 => ({
  version: APP_PREFERENCES_VERSION,
  theme: 'light',
  units: DEFAULT_UNIT_SYSTEM,
  layers: { ...DEFAULT_LAYER_PREFERENCES },
  vesselFilters: defaultStructuredVesselFilters(),
  trail: { ...DEFAULT_TRAIL_PREFERENCES },
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const booleanOr = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback

const resolveLayers = (value: unknown): LayerPreferences => {
  const defaults = DEFAULT_LAYER_PREFERENCES
  if (!isRecord(value)) return { ...defaults }
  return {
    aircraftVisible: booleanOr(
      value.aircraftVisible,
      defaults.aircraftVisible,
    ),
    vesselsVisible: booleanOr(
      value.vesselsVisible,
      defaults.vesselsVisible,
    ),
    portsVisible: booleanOr(value.portsVisible, defaults.portsVisible),
    airportsVisible: booleanOr(
      value.airportsVisible,
      defaults.airportsVisible,
    ),
    clusteringEnabled: booleanOr(
      value.clusteringEnabled,
      defaults.clusteringEnabled,
    ),
    weatherVisible: booleanOr(
      value.weatherVisible,
      defaults.weatherVisible,
    ),
  }
}

const resolveVesselFilters = (
  value: unknown,
): StructuredVesselFilters => {
  const defaults = defaultStructuredVesselFilters()
  if (!isRecord(value)) return defaults
  return normalizeStructuredVesselFilters({
    category: isVesselCategoryFilter(value.category)
      ? value.category
      : defaults.category,
    navigation: isVesselNavigationFilter(value.navigation)
      ? value.navigation
      : defaults.navigation,
    reportedSpeed: isVesselReportedSpeedFilter(value.reportedSpeed)
      ? value.reportedSpeed
      : defaults.reportedSpeed,
    minimumLengthMeters: isVesselMinimumLength(
      value.minimumLengthMeters,
    )
      ? value.minimumLengthMeters
      : defaults.minimumLengthMeters,
    maximumLengthMeters: isVesselMaximumLength(
      value.maximumLengthMeters,
    )
      ? value.maximumLengthMeters
      : defaults.maximumLengthMeters,
    includeUnknownLength: booleanOr(
      value.includeUnknownLength,
      defaults.includeUnknownLength,
    ),
  })
}

const resolveTrail = (value: unknown): TrailPreferences => {
  const defaults = DEFAULT_TRAIL_PREFERENCES
  if (!isRecord(value)) return { ...defaults }
  return {
    visible: booleanOr(value.visible, defaults.visible),
    durationMinutes: isTrailDurationMinutes(value.durationMinutes)
      ? value.durationMinutes
      : defaults.durationMinutes,
  }
}

export const resolveAppPreferences = (
  value: unknown,
): AppPreferencesV1 => {
  const defaults = defaultAppPreferences()
  if (
    !isRecord(value) ||
    value.version !== APP_PREFERENCES_VERSION
  ) {
    return defaults
  }
  return {
    version: APP_PREFERENCES_VERSION,
    theme: isThemePreference(value.theme)
      ? value.theme
      : defaults.theme,
    units: isUnitSystem(value.units) ? value.units : defaults.units,
    layers: resolveLayers(value.layers),
    vesselFilters: resolveVesselFilters(value.vesselFilters),
    trail: resolveTrail(value.trail),
  }
}

export const mergeAppPreferenceOverrides = (
  preferences: AppPreferencesV1,
  overrides: AppPreferenceOverrides | undefined,
): AppPreferencesV1 => {
  if (!overrides) return preferences
  return {
    version: APP_PREFERENCES_VERSION,
    theme: overrides.theme ?? preferences.theme,
    units: overrides.units ?? preferences.units,
    layers: {
      ...preferences.layers,
      ...overrides.layers,
    },
    vesselFilters: normalizeStructuredVesselFilters({
      ...preferences.vesselFilters,
      ...overrides.vesselFilters,
    }),
    trail: {
      ...preferences.trail,
      ...overrides.trail,
    },
  }
}

export const readAppPreferences = (
  storage: PreferenceStorage | undefined,
): LoadedAppPreferences => {
  const defaults = defaultAppPreferences()
  if (!storage) {
    return { preferences: defaults, migrateLegacyTheme: false }
  }

  try {
    const stored = storage.getItem(APP_PREFERENCES_STORAGE_KEY)
    if (stored !== null) {
      try {
        return {
          preferences: resolveAppPreferences(JSON.parse(stored)),
          migrateLegacyTheme: false,
        }
      } catch {
        return { preferences: defaults, migrateLegacyTheme: false }
      }
    }

    const legacyTheme = storage.getItem(THEME_STORAGE_KEY)
    if (!isThemePreference(legacyTheme)) {
      return { preferences: defaults, migrateLegacyTheme: false }
    }
    return {
      preferences: {
        ...defaults,
        theme: legacyTheme,
      },
      migrateLegacyTheme: true,
    }
  } catch {
    return { preferences: defaults, migrateLegacyTheme: false }
  }
}

export const storeAppPreferences = (
  storage: PreferenceStorage | undefined,
  preferences: AppPreferencesV1,
) => {
  if (!storage) return false
  try {
    storage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    )
  } catch {
    return false
  }
  try {
    storage.setItem(THEME_STORAGE_KEY, preferences.theme)
  } catch {
    // The unified schema remains authoritative; this key only aids rollback.
  }
  return true
}

export const clearAppPreferences = (
  storage: PreferenceStorage | undefined,
) => {
  if (!storage) return false
  let cleared = true
  for (const key of [APP_PREFERENCES_STORAGE_KEY, THEME_STORAGE_KEY]) {
    try {
      storage.removeItem(key)
    } catch {
      cleared = false
    }
  }
  return cleared
}

export const browserPreferenceStorage = (): PreferenceStorage | undefined => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}
