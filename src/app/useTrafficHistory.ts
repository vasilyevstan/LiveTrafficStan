import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import type { AppConfig } from '../config/appConfig'
import type { TrafficEntity } from '../domain/traffic'
import {
  HistoryRepositoryError,
  IndexedDbHistoryRepository,
  type HistoryDatabaseMetadata,
} from '../history/indexedDbHistory'
import {
  historicalObservationKey,
  type HistoricalObservation,
} from '../history/observations'
import { PendingHistoryWrites } from '../history/pendingWrites'
import {
  boundHistoricalObservations,
  createObservationIndex,
  historicalRange,
  historicalSnapshotFromIndexes,
  historicalTrailSegmentsFromIndexes,
  initialPlaybackState,
  playbackReducer,
  type PlaybackSpeed,
} from '../history/playback'
import {
  SessionObservationHistory,
  type SessionHistorySnapshot,
} from '../history/sessionHistory'
import {
  HISTORY_INVALIDATION_STORAGE_KEY,
  HISTORY_SETTINGS_STORAGE_KEY,
  readHistoryPersistenceSettings,
  removeHistoryPersistenceSettings,
  storeHistoryPersistenceSettings,
  type HistoryPersistencePhase,
  type HistoryPersistenceSettings,
  type HistoryPersistenceStatus,
  type HistoryRetentionHours,
} from '../history/settings'
import {
  parseHistoryInvalidation,
  SerialTaskQueue,
  type HistoryInvalidationMessage,
  type HistoryInvalidationOperation,
} from '../history/synchronization'

const initialStatus: HistoryPersistenceStatus = {
  phase: 'initializing',
  recordCount: 0,
  logicalBytes: 0,
}

const browserStorage = () => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

const createSessionId = () => {
  try {
    return crypto.randomUUID()
  } catch {
    return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

const retentionMs = (hours: HistoryRetentionHours) =>
  hours * 60 * 60_000

const statusFromMetadata = (
  metadata: HistoryDatabaseMetadata,
  phase: HistoryPersistencePhase,
  options: Pick<
    HistoryPersistenceStatus,
    'message' | 'invalidRecordsRemoved' | 'pendingGap'
  > = {},
): HistoryPersistenceStatus => ({
  phase,
  recordCount: metadata.recordCount,
  logicalBytes: metadata.logicalBytes,
  ...options,
})

export const useTrafficHistory = (
  entities: readonly TrafficEntity[],
  resetRevision: number,
  config: AppConfig['history'],
) => {
  const [settings, setSettings] = useState<HistoryPersistenceSettings>(() =>
    readHistoryPersistenceSettings(browserStorage()),
  )
  const settingsRef = useRef(settings)
  const [status, setStatus] = useState<HistoryPersistenceStatus>(initialStatus)
  const [sessionSnapshot, setSessionSnapshot] =
    useState<SessionHistorySnapshot>(() => ({
    records: [] as readonly HistoricalObservation[],
    logicalBytes: 0,
    oldestObservedAt: undefined as number | undefined,
    newestObservedAt: undefined as number | undefined,
    }))
  const [durableRecords, setDurableRecords] = useState<
    readonly HistoricalObservation[]
  >([])
  const [playback, dispatchPlayback] = useReducer(
    playbackReducer,
    initialPlaybackState,
  )
  const sessionIdRef = useRef(createSessionId())
  const sessionHistoryRef = useRef(
    new SessionObservationHistory({
      retentionMs: config.sessionRetentionMs,
      maxRecords: config.sessionMaxRecords,
      maxLogicalBytes: config.sessionMaxLogicalBytes,
      sampleIntervalMs: config.sampleIntervalMs,
    }),
  )
  const recordingEpochRef = useRef(0)
  const writeAllowedRef = useRef(false)
  const writeSuspensionRef = useRef<
    | {
        phase: 'quota-exceeded' | 'error'
        message: string
      }
    | undefined
  >(undefined)
  const pendingWritesRef = useRef(
    new PendingHistoryWrites(
      config.pendingWriteMaxRecords,
      config.pendingWriteMaxLogicalBytes,
    ),
  )
  const committedRecordsRef = useRef(
    new Map<string, HistoricalObservation>(),
  )
  const flushingRef = useRef(false)
  const mountedRef = useRef(true)
  const operationIntentRef = useRef(0)
  const reloadRequestRef = useRef(0)
  const invalidationSequenceRef = useRef(0)
  const invalidationRevisionsRef = useRef(new Map<string, number>())
  const lifecycleQueueRef = useRef(new SerialTaskQueue())
  const invalidationChannelRef = useRef<BroadcastChannel | undefined>(
    undefined,
  )
  const [reloadRevision, setReloadRevision] = useState(0)
  const [repository] = useState(() =>
    typeof indexedDB === 'undefined'
      ? undefined
      : new IndexedDbHistoryRepository(),
  )

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    repository?.setCallbacks({
      onBlocked: () => {
        if (!mountedRef.current) return
        setStatus((current) => ({
          ...current,
          phase: 'blocked',
          message:
            'Close other LiveTrafficStan tabs so local history can be opened.',
        }))
      },
      onVersionChange: () => {
        writeAllowedRef.current = false
        if (!mountedRef.current) return
        setStatus((current) => ({
          ...current,
          phase: 'stale-tab',
          message:
            'Local history changed in another tab. Reload this tab before recording.',
        }))
      },
    })
    return () => repository?.setCallbacks({})
  }, [repository])

  const notifyInvalidation = useCallback(
    (
      operation: HistoryInvalidationOperation,
      metadata?: HistoryDatabaseMetadata,
      clearedAt?: number,
    ) => {
      const message: HistoryInvalidationMessage = {
        version: 1,
        source: sessionIdRef.current,
        revision: ++invalidationSequenceRef.current,
        operation,
        epoch: metadata?.recordingEpoch,
        clearedAt,
      }
      invalidationChannelRef.current?.postMessage(message)
      try {
        window.localStorage.setItem(
          HISTORY_INVALIDATION_STORAGE_KEY,
          JSON.stringify(message),
        )
      } catch {
        // BroadcastChannel remains the primary path when storage is unavailable.
      }
    },
    [],
  )

  const reloadRepository = useCallback(() => {
    const revision = ++reloadRequestRef.current
    setReloadRevision(revision)
  }, [])

  const handleInvalidation = useCallback(
    (value: unknown) => {
      const message = parseHistoryInvalidation(value)
      if (!message || message.source === sessionIdRef.current) return
      const previousRevision =
        invalidationRevisionsRef.current.get(message.source) ?? 0
      if (message.revision <= previousRevision) return
      invalidationRevisionsRef.current.set(
        message.source,
        message.revision,
      )

      if (
        (message.operation === 'clear' ||
          message.operation === 'disable') &&
        (message.epoch ?? -1) < recordingEpochRef.current
      ) {
        reloadRepository()
        return
      }

      if (message.operation === 'clear') {
        sessionHistoryRef.current.clear(message.clearedAt as number)
        setSessionSnapshot(sessionHistoryRef.current.snapshot())
        pendingWritesRef.current.clear()
        committedRecordsRef.current.clear()
        writeAllowedRef.current = false
        writeSuspensionRef.current = undefined
        recordingEpochRef.current = message.epoch as number
        setDurableRecords([])
        dispatchPlayback({ type: 'pause' })
        setStatus({
          phase: 'initializing',
          recordCount: 0,
          logicalBytes: 0,
          message: 'History was cleared in another tab.',
        })
      } else if (message.operation === 'disable') {
        pendingWritesRef.current.clear()
        committedRecordsRef.current.clear()
        writeAllowedRef.current = false
        writeSuspensionRef.current = undefined
        recordingEpochRef.current = message.epoch as number
        const nextSettings = {
          ...settingsRef.current,
          enabled: false,
        }
        settingsRef.current = nextSettings
        setSettings(nextSettings)
        setDurableRecords([])
        setStatus({
          phase: 'disabled',
          recordCount: 0,
          logicalBytes: 0,
        })
      } else if (message.operation === 'enable') {
        pendingWritesRef.current.clear()
        writeAllowedRef.current = false
      }

      reloadRepository()
    },
    [reloadRepository],
  )

  useEffect(() => {
    mountedRef.current = true
    const pendingWrites = pendingWritesRef.current
    const committedRecords = committedRecordsRef.current
    const handleStorage = (event: StorageEvent) => {
      if (event.key === HISTORY_INVALIDATION_STORAGE_KEY) {
        if (!event.newValue) return
        try {
          handleInvalidation(JSON.parse(event.newValue))
        } catch {
          // Ignore malformed cross-tab messages.
        }
      } else if (event.key === HISTORY_SETTINGS_STORAGE_KEY) {
        const storedSettings = readHistoryPersistenceSettings(
          browserStorage(),
        )
        if (!storedSettings.enabled) {
          pendingWritesRef.current.clear()
          committedRecordsRef.current.clear()
          writeAllowedRef.current = false
          setDurableRecords([])
        }
        reloadRepository()
      }
    }
    window.addEventListener('storage', handleStorage)

    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('livetrafficstan-history')
      channel.onmessage = (event) => handleInvalidation(event.data)
      invalidationChannelRef.current = channel
    }

    return () => {
      mountedRef.current = false
      operationIntentRef.current += 1
      reloadRequestRef.current += 1
      writeAllowedRef.current = false
      pendingWrites.clear()
      committedRecords.clear()
      invalidationChannelRef.current?.close()
      invalidationChannelRef.current = undefined
      repository?.close()
      window.removeEventListener('storage', handleStorage)
    }
  }, [handleInvalidation, reloadRepository, repository])

  useEffect(() => {
    if (!repository) {
      setStatus({
        phase: 'error',
        recordCount: 0,
        logicalBytes: 0,
        message: 'IndexedDB is unavailable in this browser context.',
      })
      return
    }

    const intent = operationIntentRef.current
    const requestRevision = reloadRevision
    const load = async () => {
      try {
        if (!mountedRef.current) return
        const storedSettings = readHistoryPersistenceSettings(browserStorage())
        let result = await repository.readAll(
          storedSettings.enabled
            ? {
                retentionMs: retentionMs(
                  storedSettings.retentionHours,
                ),
                limits: {
                  maxRecords: config.durableMaxRecords,
                  maxLogicalBytes: config.durableMaxLogicalBytes,
                },
              }
            : undefined,
        )
        if (result.metadata.recordingEnabled !== storedSettings.enabled) {
          const metadata = await repository.setRecordingEnabled(
            storedSettings.enabled,
          )
          result = storedSettings.enabled
            ? { ...result, metadata }
            : { records: [], metadata, invalidRecordsRemoved: 0 }
        }

        if (
          !mountedRef.current ||
          intent !== operationIntentRef.current ||
          requestRevision !== reloadRequestRef.current
        ) {
          return
        }
        settingsRef.current = storedSettings
        setSettings(storedSettings)
        recordingEpochRef.current = result.metadata.recordingEpoch
        writeAllowedRef.current =
          storedSettings.enabled && result.metadata.recordingEnabled
        if (!storedSettings.enabled) {
          writeSuspensionRef.current = undefined
          committedRecordsRef.current.clear()
        } else {
          const loadedKeys = new Set(
            result.records.map(historicalObservationKey),
          )
          for (const key of committedRecordsRef.current.keys()) {
            if (loadedKeys.has(key)) {
              committedRecordsRef.current.delete(key)
            }
          }
          const boundedCommitted = boundHistoricalObservations(
            [...committedRecordsRef.current.values()],
            retentionMs(storedSettings.retentionHours),
            config.durableMaxRecords,
            config.durableMaxLogicalBytes,
            Date.now(),
          )
          committedRecordsRef.current.clear()
          for (const record of boundedCommitted) {
            committedRecordsRef.current.set(
              historicalObservationKey(record),
              record,
            )
          }
        }
        setDurableRecords(
          storedSettings.enabled ? result.records : [],
        )
        const suspension = writeSuspensionRef.current
        setStatus(
          statusFromMetadata(
            result.metadata,
            storedSettings.enabled
              ? (suspension?.phase ?? 'ready')
              : 'disabled',
            {
              invalidRecordsRemoved:
                result.invalidRecordsRemoved || undefined,
              message:
                suspension?.message ??
                (result.invalidRecordsRemoved
                  ? `${result.invalidRecordsRemoved} invalid local-history record(s) were removed.`
                  : undefined),
            },
          ),
        )
      } catch (error) {
        if (
          !mountedRef.current ||
          intent !== operationIntentRef.current ||
          requestRevision !== reloadRequestRef.current
        ) {
          return
        }
        writeAllowedRef.current = false
        setStatus({
          phase:
            error instanceof HistoryRepositoryError &&
            error.code === 'unsupported-version'
              ? 'stale-tab'
              : 'error',
          recordCount: 0,
          logicalBytes: 0,
          message:
            error instanceof Error
              ? error.message
              : 'Local history could not be loaded.',
        })
      }
    }
    void lifecycleQueueRef.current.run(load)
  }, [
    config.durableMaxLogicalBytes,
    config.durableMaxRecords,
    reloadRevision,
    repository,
  ])

  const flushPending = useCallback(async () => {
    if (
      !repository ||
      flushingRef.current ||
      !writeAllowedRef.current ||
      writeSuspensionRef.current
    ) {
      return
    }

    flushingRef.current = true
    try {
      while (
        mountedRef.current &&
        writeAllowedRef.current &&
        !writeSuspensionRef.current &&
        pendingWritesRef.current.hasRecords
      ) {
        const batch = pendingWritesRef.current.take(
          config.writeBatchRecords,
        )
        if (!batch) break
        if (mountedRef.current) {
          setStatus((current) => ({ ...current, phase: 'writing' }))
        }

        try {
          const result = await repository.writeBatch(
            batch.records,
            batch.epoch,
            retentionMs(settingsRef.current.retentionHours),
            {
              maxRecords: config.durableMaxRecords,
              maxLogicalBytes: config.durableMaxLogicalBytes,
            },
          )
          const committed = pendingWritesRef.current.commit(batch)
          if (
            !committed ||
            !mountedRef.current ||
            !writeAllowedRef.current ||
            batch.epoch !== recordingEpochRef.current
          ) {
            continue
          }
          for (const record of batch.records) {
            committedRecordsRef.current.set(
              historicalObservationKey(record),
              record,
            )
          }
          setStatus((current) =>
            statusFromMetadata(result.metadata, 'ready', {
              pendingGap: current.pendingGap,
              message: current.pendingGap ? current.message : undefined,
            }),
          )
          notifyInvalidation('write', result.metadata)
          if (result.quotaPruned) reloadRepository()
        } catch (error) {
          const restored = pendingWritesRef.current.restore(batch)
          if (
            error instanceof HistoryRepositoryError &&
            (error.code === 'stale-epoch' ||
              error.code === 'recording-disabled')
          ) {
            pendingWritesRef.current.clear()
            writeAllowedRef.current = false
            reloadRepository()
            break
          }
          if (
            !restored ||
            !mountedRef.current ||
            !writeAllowedRef.current ||
            batch.epoch !== recordingEpochRef.current
          ) {
            break
          }
          if (
            error instanceof HistoryRepositoryError &&
            error.code === 'quota-exceeded'
          ) {
            const suspension = {
              phase: 'quota-exceeded' as const,
              message:
                'Browser quota is full. Durable writes are suspended; clear local history to retry.',
            }
            writeSuspensionRef.current = suspension
            setStatus((current) => ({ ...current, ...suspension }))
            break
          }
          const suspension = {
            phase: 'error' as const,
            message:
              error instanceof Error
                ? error.message
                : 'A local history write failed.',
          }
          writeSuspensionRef.current = suspension
          setStatus((current) => ({ ...current, ...suspension }))
          break
        }
      }
    } finally {
      flushingRef.current = false
    }
  }, [
    config.durableMaxLogicalBytes,
    config.durableMaxRecords,
    config.writeBatchRecords,
    notifyInvalidation,
    reloadRepository,
    repository,
  ])

  const enqueueDurableRecords = useCallback(
    (records: readonly HistoricalObservation[]) => {
      if (
        records.length === 0 ||
        !writeAllowedRef.current ||
        writeSuspensionRef.current
      ) {
        return
      }

      const dropped = pendingWritesRef.current.enqueue(
        records,
        recordingEpochRef.current,
      )
      if (dropped) {
        setStatus((current) => ({
          ...current,
          pendingGap: true,
          message:
            'The pending local-history queue overflowed; its oldest uncommitted observations were dropped.',
        }))
      }
      void flushPending()
    },
    [flushPending],
  )

  const mergeCommittedRecords = useCallback(() => {
    if (committedRecordsRef.current.size === 0) return
    const now = Date.now()
    const committed = boundHistoricalObservations(
      [...committedRecordsRef.current.values()],
      retentionMs(settingsRef.current.retentionHours),
      config.durableMaxRecords,
      config.durableMaxLogicalBytes,
      now,
    )
    committedRecordsRef.current.clear()
    if (committed.length === 0) return
    setDurableRecords((current) =>
      boundHistoricalObservations(
        [...current, ...committed],
        retentionMs(settingsRef.current.retentionHours),
        config.durableMaxRecords,
        config.durableMaxLogicalBytes,
        now,
      ),
    )
  }, [config.durableMaxLogicalBytes, config.durableMaxRecords])

  useEffect(() => {
    const { appended, removed } = sessionHistoryRef.current.ingest(
      entities,
      {
        sessionId: sessionIdRef.current,
        segmentId: `${sessionIdRef.current}:${resetRevision}`,
      },
      Date.now(),
    )
    if (appended.length > 0 || removed.length > 0) {
      setSessionSnapshot(sessionHistoryRef.current.snapshot())
    }
    if (appended.length > 0) {
      enqueueDurableRecords(appended)
    }
    if (removed.length > 0) mergeCommittedRecords()
  }, [
    enqueueDurableRecords,
    entities,
    mergeCommittedRecords,
    resetRevision,
  ])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const removed = sessionHistoryRef.current.prune(Date.now())
      if (removed.length > 0) {
        setSessionSnapshot(sessionHistoryRef.current.snapshot())
        mergeCommittedRecords()
      }
    }, 60_000)
    return () => window.clearInterval(interval)
  }, [mergeCommittedRecords])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!repository || !writeAllowedRef.current) return
      const intent = operationIntentRef.current
      void lifecycleQueueRef.current.run(async () => {
        if (
          !mountedRef.current ||
          !writeAllowedRef.current ||
          intent !== operationIntentRef.current
        ) {
          return
        }
        try {
          const metadata = await repository.prune(
            retentionMs(settingsRef.current.retentionHours),
            {
              maxRecords: config.durableMaxRecords,
              maxLogicalBytes: config.durableMaxLogicalBytes,
            },
          )
          if (
            !mountedRef.current ||
            intent !== operationIntentRef.current
          ) {
            return
          }
          if (
            metadata.recordingEpoch < recordingEpochRef.current ||
            !metadata.recordingEnabled
          ) {
            writeAllowedRef.current = false
            reloadRepository()
            return
          }
          recordingEpochRef.current = metadata.recordingEpoch
          const now = Date.now()
          setDurableRecords((current) =>
            boundHistoricalObservations(
              current,
              retentionMs(settingsRef.current.retentionHours),
              config.durableMaxRecords,
              config.durableMaxLogicalBytes,
              now,
            ),
          )
          const boundedCommitted = boundHistoricalObservations(
            [...committedRecordsRef.current.values()],
            retentionMs(settingsRef.current.retentionHours),
            config.durableMaxRecords,
            config.durableMaxLogicalBytes,
            now,
          )
          committedRecordsRef.current.clear()
          for (const record of boundedCommitted) {
            committedRecordsRef.current.set(
              historicalObservationKey(record),
              record,
            )
          }
          setStatus((current) =>
            statusFromMetadata(metadata, current.phase, {
              pendingGap: current.pendingGap,
              message: current.message,
            }),
          )
        } catch (error) {
          if (
            !mountedRef.current ||
            intent !== operationIntentRef.current
          ) {
            return
          }
          setStatus((current) => ({
            ...current,
            phase: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Local history maintenance failed.',
          }))
        }
      })
    }, config.maintenanceIntervalMs)
    return () => window.clearInterval(interval)
  }, [
    config.durableMaxLogicalBytes,
    config.durableMaxRecords,
    config.maintenanceIntervalMs,
    reloadRepository,
    repository,
  ])

  useEffect(() => {
    if (playback.mode !== 'history-playing') return
    let previous = performance.now()
    const interval = window.setInterval(() => {
      const current = performance.now()
      dispatchPlayback({ type: 'tick', elapsedMs: current - previous })
      previous = current
    }, config.playbackPublishIntervalMs)
    return () => window.clearInterval(interval)
  }, [config.playbackPublishIntervalMs, playback.mode])

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) dispatchPlayback({ type: 'pause' })
    }
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () =>
      document.removeEventListener('visibilitychange', pauseWhenHidden)
  }, [])

  const durableKeys = useMemo(
    () =>
      new Set(durableRecords.map(historicalObservationKey)),
    [durableRecords],
  )
  const observationCount = useMemo(
    () =>
      durableRecords.length +
      sessionSnapshot.records.reduce(
        (count, record) =>
          count +
          (durableKeys.has(historicalObservationKey(record)) ? 0 : 1),
        0,
      ),
    [durableKeys, durableRecords.length, sessionSnapshot.records],
  )
  const durableRange = useMemo(
    () => historicalRange(durableRecords),
    [durableRecords],
  )
  const range = useMemo(() => {
    const oldest = [
      durableRange?.oldest,
      sessionSnapshot.oldestObservedAt,
    ].filter((value): value is number => value !== undefined)
    const newest = [
      durableRange?.newest,
      sessionSnapshot.newestObservedAt,
    ].filter((value): value is number => value !== undefined)
    return oldest.length === 0 || newest.length === 0
      ? undefined
      : {
          oldest: Math.min(...oldest),
          newest: Math.max(...newest),
        }
  }, [
    durableRange,
    sessionSnapshot.newestObservedAt,
    sessionSnapshot.oldestObservedAt,
  ])
  const durableIndex = useMemo(
    () => createObservationIndex(durableRecords),
    [durableRecords],
  )
  const sessionIndex = useMemo(
    () => createObservationIndex(sessionSnapshot.records),
    [sessionSnapshot.records],
  )
  const historicalEntities = useMemo(
    () =>
      playback.mode === 'live'
        ? []
        : historicalSnapshotFromIndexes(
            [sessionIndex, durableIndex],
            playback.cursor,
          ),
    [durableIndex, playback, sessionIndex],
  )

  const persistSettings = useCallback(
    (nextSettings: HistoryPersistenceSettings) => {
      const storage = browserStorage()
      if (storeHistoryPersistenceSettings(storage, nextSettings)) {
        return true
      }
      return (
        !nextSettings.enabled &&
        removeHistoryPersistenceSettings(storage)
      )
    },
    [],
  )

  const setPersistenceEnabled = useCallback(
    async (enabled: boolean) => {
      const nextSettings = { ...settingsRef.current, enabled }
      if (!persistSettings(nextSettings)) {
        setStatus((current) => ({
          ...current,
          phase: enabled ? 'error' : 'deletion-failed',
          message: enabled
            ? 'Browser settings could not save local-history consent, so recording remains off.'
            : 'Browser settings could not save the disabled state.',
        }))
        return
      }

      const intent = ++operationIntentRef.current
      settingsRef.current = nextSettings
      setSettings(nextSettings)
      writeAllowedRef.current = false
      pendingWritesRef.current.clear()
      committedRecordsRef.current.clear()
      if (!enabled) setDurableRecords([])
      setStatus((current) => ({
        ...current,
        phase: enabled ? 'initializing' : 'deletion-pending',
        message: enabled
          ? 'Preparing private local history.'
          : 'Deleting private local history.',
      }))

      if (!repository) {
        setStatus((current) => ({
          ...current,
          phase: enabled ? 'error' : 'deletion-failed',
          message: 'IndexedDB is unavailable in this browser context.',
        }))
        return
      }

      return lifecycleQueueRef.current.run(async () => {
        try {
          const metadata = await repository.setRecordingEnabled(enabled)
          notifyInvalidation(
            enabled ? 'enable' : 'disable',
            metadata,
          )
          if (
            !mountedRef.current ||
            intent !== operationIntentRef.current
          ) {
            return
          }
          if (metadata.recordingEpoch < recordingEpochRef.current) {
            reloadRepository()
            return
          }
          recordingEpochRef.current = metadata.recordingEpoch
          writeAllowedRef.current = enabled
          writeSuspensionRef.current = undefined
          setStatus(
            statusFromMetadata(
              metadata,
              enabled ? 'ready' : 'disabled',
            ),
          )
        } catch (error) {
          if (
            !mountedRef.current ||
            intent !== operationIntentRef.current
          ) {
            return
          }
          setStatus((current) => ({
            ...current,
            phase: enabled ? 'error' : 'deletion-failed',
            message:
              error instanceof Error
                ? error.message
                : enabled
                  ? 'Local history could not be enabled.'
                  : 'Local history could not be deleted.',
          }))
        }
      })
    },
    [notifyInvalidation, persistSettings, reloadRepository, repository],
  )

  const setRetentionHours = useCallback(
    async (hours: HistoryRetentionHours) => {
      const nextSettings = {
        ...settingsRef.current,
        retentionHours: hours,
      }
      if (!persistSettings(nextSettings)) {
        setStatus((current) => ({
          ...current,
          phase: 'error',
          message: 'The browser could not save the retention setting.',
        }))
        return
      }
      const intent = ++operationIntentRef.current
      settingsRef.current = nextSettings
      setSettings(nextSettings)

      if (!repository || !nextSettings.enabled) {
        notifyInvalidation('retention')
        return
      }

      return lifecycleQueueRef.current.run(async () => {
        try {
          const metadata = await repository.prune(
            retentionMs(hours),
            {
              maxRecords: config.durableMaxRecords,
              maxLogicalBytes: config.durableMaxLogicalBytes,
            },
          )
          notifyInvalidation('retention', metadata)
          if (
            !mountedRef.current ||
            intent !== operationIntentRef.current
          ) {
            return
          }
          if (
            metadata.recordingEpoch < recordingEpochRef.current ||
            !metadata.recordingEnabled
          ) {
            writeAllowedRef.current = false
            reloadRepository()
            return
          }
          recordingEpochRef.current = metadata.recordingEpoch
          const now = Date.now()
          setDurableRecords((current) =>
            boundHistoricalObservations(
              current,
              retentionMs(hours),
              config.durableMaxRecords,
              config.durableMaxLogicalBytes,
              now,
            ),
          )
          const boundedCommitted = boundHistoricalObservations(
            [...committedRecordsRef.current.values()],
            retentionMs(hours),
            config.durableMaxRecords,
            config.durableMaxLogicalBytes,
            now,
          )
          committedRecordsRef.current.clear()
          for (const record of boundedCommitted) {
            committedRecordsRef.current.set(
              historicalObservationKey(record),
              record,
            )
          }
          const suspension = writeSuspensionRef.current
          setStatus((current) =>
            statusFromMetadata(
              metadata,
              suspension?.phase ?? 'ready',
              {
                pendingGap: current.pendingGap,
                message:
                  suspension?.message ??
                  (current.pendingGap ? current.message : undefined),
              },
            ),
          )
        } catch (error) {
          if (
            !mountedRef.current ||
            intent !== operationIntentRef.current
          ) {
            return
          }
          setStatus((current) => ({
            ...current,
            phase: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'The retention change could not be applied.',
          }))
        }
      })
    },
    [
      config.durableMaxLogicalBytes,
      config.durableMaxRecords,
      notifyInvalidation,
      persistSettings,
      reloadRepository,
      repository,
    ],
  )

  const clearHistory = useCallback(async () => {
    const intent = ++operationIntentRef.current
    const clearedAt = Date.now()
    sessionHistoryRef.current.clear(clearedAt)
    setSessionSnapshot(sessionHistoryRef.current.snapshot())
    pendingWritesRef.current.clear()
    committedRecordsRef.current.clear()
    writeAllowedRef.current = false
    setDurableRecords([])
    dispatchPlayback({ type: 'pause' })

    setStatus((current) => ({
      ...current,
      phase: 'deletion-pending',
      message: 'Clearing session and private local history.',
    }))
    if (!repository) {
      setStatus((current) => ({
        ...current,
        phase: 'deletion-failed',
        message: 'IndexedDB is unavailable in this browser context.',
      }))
      return
    }

    return lifecycleQueueRef.current.run(async () => {
      try {
        const metadata = await repository.clear()
        notifyInvalidation('clear', metadata, clearedAt)
        if (
          !mountedRef.current ||
          intent !== operationIntentRef.current
        ) {
          return
        }
        if (metadata.recordingEpoch < recordingEpochRef.current) {
          reloadRepository()
          return
        }
        recordingEpochRef.current = metadata.recordingEpoch
        writeAllowedRef.current =
          settingsRef.current.enabled && metadata.recordingEnabled
        writeSuspensionRef.current = undefined
        setStatus(
          statusFromMetadata(
            metadata,
            settingsRef.current.enabled ? 'ready' : 'disabled',
          ),
        )
      } catch (error) {
        if (
          !mountedRef.current ||
          intent !== operationIntentRef.current
        ) {
          return
        }
        setStatus((current) => ({
          ...current,
          phase: 'deletion-failed',
          message:
            error instanceof Error
              ? error.message
              : 'Local history could not be cleared.',
        }))
      }
    })
  }, [notifyInvalidation, reloadRepository, repository])

  const enterHistory = useCallback(() => {
    if (range) dispatchPlayback({ type: 'enter', range })
  }, [range])
  const returnToLive = useCallback(
    () => dispatchPlayback({ type: 'return-live' }),
    [],
  )
  const play = useCallback(() => dispatchPlayback({ type: 'play' }), [])
  const pause = useCallback(() => dispatchPlayback({ type: 'pause' }), [])
  const scrub = useCallback(
    (cursor: number) => dispatchPlayback({ type: 'scrub', cursor }),
    [],
  )
  const setSpeed = useCallback(
    (speed: PlaybackSpeed) =>
      dispatchPlayback({ type: 'set-speed', speed }),
    [],
  )
  const retryPersistence = useCallback(() => {
    operationIntentRef.current += 1
    writeSuspensionRef.current = undefined
    setStatus((current) => ({
      ...current,
      phase: 'initializing',
      message: 'Retrying private local history.',
    }))
    reloadRepository()
    void flushPending()
  }, [flushPending, reloadRepository])
  const trailSegments = useCallback(
    (selectedId: string | null, durationMs: number) =>
      playback.mode === 'live'
        ? []
        : historicalTrailSegmentsFromIndexes(
            [sessionIndex, durableIndex],
            selectedId,
            playback.cursor,
            durationMs,
            {
              aircraft: config.aircraftTrailGapMs,
              vessel: config.vesselTrailGapMs,
            },
          ),
    [
      config.aircraftTrailGapMs,
      config.vesselTrailGapMs,
      durableIndex,
      playback,
      sessionIndex,
    ],
  )

  return {
    settings,
    status,
    sessionSnapshot,
    observationCount,
    range,
    playback,
    historicalEntities,
    trailSegments,
    setPersistenceEnabled,
    setRetentionHours,
    clearHistory,
    retryPersistence,
    enterHistory,
    returnToLive,
    play,
    pause,
    scrub,
    setSpeed,
  }
}
