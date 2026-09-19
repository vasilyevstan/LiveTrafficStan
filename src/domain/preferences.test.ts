import { describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY } from '../app/theme'
import {
  APP_PREFERENCES_STORAGE_KEY,
  clearAppPreferences,
  defaultAppPreferences,
  mergeAppPreferenceOverrides,
  readAppPreferences,
  resolveAppPreferences,
  storeAppPreferences,
} from './preferences'

describe('application preferences', () => {
  it('constructs a complete allowlisted schema from partial or invalid data', () => {
    expect(
      resolveAppPreferences({
        version: 1,
        theme: 'dark',
        units: 'aviation-nautical',
        radiusKm: 500,
        layers: {
          aircraftVisible: false,
          weatherVisible: 'yes',
        },
        vesselFilters: {
          category: 'cargo',
          minimumLengthMeters: 25,
          query: 'SECRET',
        },
        trail: {
          visible: false,
          durationMinutes: 60,
        },
      }),
    ).toEqual({
      version: 1,
      theme: 'dark',
      units: 'aviation-nautical',
      layers: {
        aircraftVisible: false,
        vesselsVisible: true,
        portsVisible: false,
        airportsVisible: false,
        clusteringEnabled: false,
        weatherVisible: false,
      },
      vesselFilters: {
        category: 'cargo',
        navigation: 'all',
        reportedSpeed: 'all',
        minimumLengthMeters: 25,
        maximumLengthMeters: null,
        includeUnknownLength: false,
      },
      trail: {
        visible: false,
        durationMinutes: 60,
      },
    })
  })

  it('rejects old versions without importing removed fields', () => {
    expect(
      resolveAppPreferences({
        version: 0,
        theme: 'dark',
        radiusKm: 25,
      }),
    ).toEqual(defaultAppPreferences())
  })

  it('loads the unified key before the legacy theme and migrates only when absent', () => {
    const storage = {
      getItem: vi.fn((key: string): string | null =>
        key === APP_PREFERENCES_STORAGE_KEY
          ? JSON.stringify({
              ...defaultAppPreferences(),
              theme: 'auto',
            })
          : 'dark',
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    expect(readAppPreferences(storage)).toMatchObject({
      preferences: { theme: 'auto' },
      migrateLegacyTheme: false,
    })

    storage.getItem.mockImplementation((key: string) =>
      key === APP_PREFERENCES_STORAGE_KEY ? null : 'dark',
    )
    expect(readAppPreferences(storage)).toMatchObject({
      preferences: { theme: 'dark' },
      migrateLegacyTheme: true,
    })
  })

  it('does not use the legacy key when unified storage is present but malformed', () => {
    const storage = {
      getItem: vi.fn((key: string) =>
        key === APP_PREFERENCES_STORAGE_KEY ? '{bad' : 'dark',
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    expect(readAppPreferences(storage)).toEqual({
      preferences: defaultAppPreferences(),
      migrateLegacyTheme: false,
    })
  })

  it('merges fragment overrides without mutating saved preferences', () => {
    const saved = defaultAppPreferences()
    const merged = mergeAppPreferenceOverrides(saved, {
      theme: 'dark',
      layers: { portsVisible: true },
      vesselFilters: { category: 'tanker' },
    })
    expect(merged).toMatchObject({
      theme: 'dark',
      layers: { portsVisible: true, aircraftVisible: true },
      vesselFilters: { category: 'tanker' },
    })
    expect(merged.vesselFilters).not.toHaveProperty('query')
    expect(saved).toEqual(defaultAppPreferences())
  })

  it('clears a maximum made incompatible by saved or shared minimum length', () => {
    expect(
      resolveAppPreferences({
        version: 1,
        vesselFilters: {
          minimumLengthMeters: 100,
          maximumLengthMeters: 49,
        },
      }).vesselFilters,
    ).toMatchObject({
      minimumLengthMeters: 100,
      maximumLengthMeters: null,
    })
    expect(
      mergeAppPreferenceOverrides(
        {
          ...defaultAppPreferences(),
          vesselFilters: {
            ...defaultAppPreferences().vesselFilters,
            maximumLengthMeters: 49,
          },
        },
        { vesselFilters: { minimumLengthMeters: 100 } },
      ).vesselFilters.maximumLengthMeters,
    ).toBeNull()
  })

  it('stores a complete schema, mirrors theme, and clears both keys', () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    const preferences = {
      ...defaultAppPreferences(),
      theme: 'auto' as const,
    }
    expect(storeAppPreferences(storage, preferences)).toBe(true)
    expect(storage.setItem).toHaveBeenNthCalledWith(
      1,
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    )
    expect(storage.setItem).toHaveBeenNthCalledWith(
      2,
      THEME_STORAGE_KEY,
      'auto',
    )
    expect(clearAppPreferences(storage)).toBe(true)
    expect(storage.removeItem).toHaveBeenCalledWith(
      APP_PREFERENCES_STORAGE_KEY,
    )
    expect(storage.removeItem).toHaveBeenCalledWith(THEME_STORAGE_KEY)
  })

  it('fails safely when storage is unavailable or throws', () => {
    expect(readAppPreferences(undefined).preferences).toEqual(
      defaultAppPreferences(),
    )
    expect(
      storeAppPreferences(
        {
          getItem: vi.fn(),
          setItem: () => {
            throw new Error('quota')
          },
          removeItem: vi.fn(),
        },
        defaultAppPreferences(),
      ),
    ).toBe(false)
    expect(
      clearAppPreferences({
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toBe(false)
  })
})
