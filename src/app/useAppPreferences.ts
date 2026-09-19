import { useCallback, useEffect, useRef, useState } from 'react'
import {
  browserPreferenceStorage,
  clearAppPreferences,
  defaultAppPreferences,
  mergeAppPreferenceOverrides,
  readAppPreferences,
  storeAppPreferences,
  type AppPreferenceOverrides,
  type AppPreferencesV1,
} from '../domain/preferences'

export interface PreferenceStatus {
  kind: 'saved' | 'reset' | 'error'
  message: string
}

type PreferenceUpdater = (
  current: AppPreferencesV1,
) => AppPreferencesV1

export const useAppPreferences = (
  overrides: AppPreferenceOverrides | undefined,
) => {
  const [initial] = useState(() => {
    const storage = browserPreferenceStorage()
    const loaded = readAppPreferences(storage)
    return {
      storage,
      saved: loaded.preferences,
      effective: mergeAppPreferenceOverrides(
        loaded.preferences,
        overrides,
      ),
      migrateLegacyTheme: loaded.migrateLegacyTheme,
    }
  })
  const [preferences, setPreferences] = useState(initial.effective)
  const [status, setStatus] = useState<PreferenceStatus>()
  const preferencesRef = useRef(preferences)
  const userWriteRef = useRef(false)
  const migrationCompleteRef = useRef(false)

  useEffect(() => {
    preferencesRef.current = preferences
  }, [preferences])

  useEffect(() => {
    if (
      migrationCompleteRef.current ||
      !initial.migrateLegacyTheme ||
      userWriteRef.current
    ) {
      return
    }
    migrationCompleteRef.current = true
    if (!storeAppPreferences(initial.storage, initial.saved)) {
      setStatus({
        kind: 'error',
        message: 'Preferences could not be migrated in this browser.',
      })
    }
  }, [initial])

  const updatePreferences = useCallback(
    (updater: PreferenceUpdater) => {
      const next = updater(preferencesRef.current)
      preferencesRef.current = next
      userWriteRef.current = true
      setPreferences(next)
      setStatus(
        storeAppPreferences(initial.storage, next)
          ? {
              kind: 'saved',
              message: 'Preferences saved on this device.',
            }
          : {
              kind: 'error',
              message:
                'Preferences changed for this session but could not be saved.',
            },
      )
    },
    [initial.storage],
  )

  const resetPreferences = useCallback(() => {
    const defaults = defaultAppPreferences()
    preferencesRef.current = defaults
    userWriteRef.current = true
    setPreferences(defaults)
    setStatus(
      clearAppPreferences(initial.storage)
        ? {
            kind: 'reset',
            message: 'Preferences reset to defaults.',
          }
        : {
            kind: 'error',
            message:
              'Preferences reset for this session but saved values could not be removed.',
          },
    )
  }, [initial.storage])

  return {
    preferences,
    updatePreferences,
    resetPreferences,
    status,
  }
}
