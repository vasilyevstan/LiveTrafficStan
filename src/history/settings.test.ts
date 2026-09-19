import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_HISTORY_PERSISTENCE_SETTINGS,
  HISTORY_SETTINGS_STORAGE_KEY,
  readHistoryPersistenceSettings,
  removeHistoryPersistenceSettings,
  resolveHistoryPersistenceSettings,
  storeHistoryPersistenceSettings,
} from './settings'

describe('history persistence settings', () => {
  it('validates only the versioned retention choices', () => {
    expect(
      resolveHistoryPersistenceSettings({
        version: 1,
        enabled: true,
        retentionHours: 6,
      }),
    ).toEqual({ version: 1, enabled: true, retentionHours: 6 })
    expect(
      resolveHistoryPersistenceSettings({
        version: 2,
        enabled: true,
        retentionHours: 12,
      }),
    ).toEqual(DEFAULT_HISTORY_PERSISTENCE_SETTINGS)
  })

  it('fails closed when storage is unavailable or malformed', () => {
    expect(
      readHistoryPersistenceSettings({
        getItem: () => '{bad json',
        setItem: vi.fn(),
      }),
    ).toEqual(DEFAULT_HISTORY_PERSISTENCE_SETTINGS)
    expect(readHistoryPersistenceSettings(undefined)).toEqual(
      DEFAULT_HISTORY_PERSISTENCE_SETTINGS,
    )
  })

  it('stores only the versioned opt-in settings', () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
    }
    expect(
      storeHistoryPersistenceSettings(storage, {
        version: 1,
        enabled: true,
        retentionHours: 24,
      }),
    ).toBe(true)
    expect(storage.setItem).toHaveBeenCalledWith(
      HISTORY_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        enabled: true,
        retentionHours: 24,
      }),
    )
  })

  it('can remove a stale opt-in when disabling fails to write settings', () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    expect(removeHistoryPersistenceSettings(storage)).toBe(true)
    expect(storage.removeItem).toHaveBeenCalledWith(
      HISTORY_SETTINGS_STORAGE_KEY,
    )
  })
})
