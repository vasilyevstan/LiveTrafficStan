export const HISTORY_SETTINGS_STORAGE_KEY =
  'livetrafficstan.history.settings.v1'
export const HISTORY_INVALIDATION_STORAGE_KEY =
  'livetrafficstan.history.invalidate.v1'
export const HISTORY_RETENTION_HOURS = [1, 6, 24] as const
export type HistoryRetentionHours =
  (typeof HISTORY_RETENTION_HOURS)[number]

export interface HistoryPersistenceSettings {
  version: 1
  enabled: boolean
  retentionHours: HistoryRetentionHours
}

export type HistoryPersistencePhase =
  | 'initializing'
  | 'disabled'
  | 'ready'
  | 'writing'
  | 'blocked'
  | 'stale-tab'
  | 'quota-exceeded'
  | 'error'
  | 'deletion-pending'
  | 'deletion-failed'

export interface HistoryPersistenceStatus {
  phase: HistoryPersistencePhase
  recordCount: number
  logicalBytes: number
  message?: string
  invalidRecordsRemoved?: number
  pendingGap?: boolean
}

export const DEFAULT_HISTORY_PERSISTENCE_SETTINGS: HistoryPersistenceSettings =
  {
    version: 1,
    enabled: false,
    retentionHours: 1,
  }

interface SettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface RemovableSettingsStorage extends SettingsStorage {
  removeItem(key: string): void
}

export const isHistoryRetentionHours = (
  value: unknown,
): value is HistoryRetentionHours =>
  typeof value === 'number' &&
  HISTORY_RETENTION_HOURS.some((hours) => hours === value)

export const resolveHistoryPersistenceSettings = (
  value: unknown,
): HistoryPersistenceSettings => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 1 ||
    !('enabled' in value) ||
    typeof value.enabled !== 'boolean' ||
    !('retentionHours' in value) ||
    !isHistoryRetentionHours(value.retentionHours)
  ) {
    return DEFAULT_HISTORY_PERSISTENCE_SETTINGS
  }

  return {
    version: 1,
    enabled: value.enabled,
    retentionHours: value.retentionHours,
  }
}

export const readHistoryPersistenceSettings = (
  storage: SettingsStorage | undefined,
) => {
  if (!storage) return DEFAULT_HISTORY_PERSISTENCE_SETTINGS
  try {
    const raw = storage.getItem(HISTORY_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_HISTORY_PERSISTENCE_SETTINGS
    return resolveHistoryPersistenceSettings(JSON.parse(raw))
  } catch {
    return DEFAULT_HISTORY_PERSISTENCE_SETTINGS
  }
}

export const storeHistoryPersistenceSettings = (
  storage: SettingsStorage | undefined,
  settings: HistoryPersistenceSettings,
) => {
  if (!storage) return false
  try {
    storage.setItem(
      HISTORY_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    )
    return true
  } catch {
    return false
  }
}

export const removeHistoryPersistenceSettings = (
  storage: RemovableSettingsStorage | undefined,
) => {
  if (!storage) return false
  try {
    storage.removeItem(HISTORY_SETTINGS_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
