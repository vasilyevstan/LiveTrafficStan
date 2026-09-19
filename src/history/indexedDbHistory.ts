import {
  ADSB_HISTORY_LICENSE_DECISION,
  DIGITRAFFIC_HISTORY_LICENSE_DECISION,
  HISTORY_NORMALIZATION_VERSION,
  HISTORY_SCHEMA_VERSION,
  historicalObservationKey,
  isCanonicalHistoricalObservation,
  validateHistoricalObservation,
  type HistoricalObservation,
} from './observations'

export const HISTORY_DATABASE_NAME = 'livetrafficstan-history'
export const HISTORY_DATABASE_VERSION = 1
const OBSERVATIONS_STORE = 'observations'
const METADATA_STORE = 'metadata'
const METADATA_KEY = 'state'

export interface DurableHistoryLimits {
  maxRecords: number
  maxLogicalBytes: number
}

export interface HistoryDatabaseMetadata {
  key: typeof METADATA_KEY
  schemaVersion: typeof HISTORY_SCHEMA_VERSION
  normalizationVersion: typeof HISTORY_NORMALIZATION_VERSION
  licenseDecisionIds: readonly [
    typeof ADSB_HISTORY_LICENSE_DECISION,
    typeof DIGITRAFFIC_HISTORY_LICENSE_DECISION,
  ]
  recordingEnabled: boolean
  recordingEpoch: number
  recordCount: number
  logicalBytes: number
  lastPrunedAt?: number
  lastWriteAt?: number
}

export interface DurableHistoryReadResult {
  records: readonly HistoricalObservation[]
  metadata: HistoryDatabaseMetadata
  invalidRecordsRemoved: number
}

export interface DurableHistoryReadOptions {
  retentionMs: number
  limits: DurableHistoryLimits
  now?: number
}

export interface DurableHistoryWriteResult {
  metadata: HistoryDatabaseMetadata
  quotaPruned: boolean
}

export type HistoryRepositoryErrorCode =
  | 'blocked'
  | 'open-failed'
  | 'unsupported-version'
  | 'stale-epoch'
  | 'recording-disabled'
  | 'quota-exceeded'
  | 'transaction-failed'

export class HistoryRepositoryError extends Error {
  readonly code: HistoryRepositoryErrorCode

  constructor(code: HistoryRepositoryErrorCode, message: string) {
    super(message)
    this.name = 'HistoryRepositoryError'
    this.code = code
  }
}

interface HistoryRepositoryCallbacks {
  onBlocked?: () => void
  onVersionChange?: () => void
}

interface HistoryRepositoryOptions extends HistoryRepositoryCallbacks {
  factory?: IDBFactory
  databaseName?: string
}

const currentMetadata = (
  overrides: Partial<HistoryDatabaseMetadata> = {},
): HistoryDatabaseMetadata => ({
  key: METADATA_KEY,
  schemaVersion: HISTORY_SCHEMA_VERSION,
  normalizationVersion: HISTORY_NORMALIZATION_VERSION,
  licenseDecisionIds: [
    ADSB_HISTORY_LICENSE_DECISION,
    DIGITRAFFIC_HISTORY_LICENSE_DECISION,
  ],
  recordingEnabled: false,
  recordingEpoch: 0,
  recordCount: 0,
  logicalBytes: 0,
  ...overrides,
})

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed'))
  })

const transactionComplete = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error('IndexedDB transaction was aborted'),
      )
    transaction.onerror = () => {
      if (transaction.error) reject(transaction.error)
    }
  })

const nextCursor = (
  cursor: IDBCursorWithValue,
): Promise<IDBCursorWithValue | null> => {
  const request = cursor.request as IDBRequest<IDBCursorWithValue | null>
  cursor.continue()
  return requestResult(request)
}

const isQuotaExceeded = (error: unknown) =>
  error instanceof DOMException && error.name === 'QuotaExceededError'

const isMetadata = (value: unknown): value is HistoryDatabaseMetadata => {
  if (typeof value !== 'object' || value === null) return false
  const metadata = value as Partial<HistoryDatabaseMetadata>
  return (
    metadata.key === METADATA_KEY &&
    metadata.schemaVersion === HISTORY_SCHEMA_VERSION &&
    metadata.normalizationVersion === HISTORY_NORMALIZATION_VERSION &&
    Array.isArray(metadata.licenseDecisionIds) &&
    metadata.licenseDecisionIds.includes(ADSB_HISTORY_LICENSE_DECISION) &&
    metadata.licenseDecisionIds.includes(
      DIGITRAFFIC_HISTORY_LICENSE_DECISION,
    ) &&
    typeof metadata.recordingEnabled === 'boolean' &&
    Number.isInteger(metadata.recordingEpoch) &&
    (metadata.recordingEpoch ?? -1) >= 0 &&
    Number.isInteger(metadata.recordCount) &&
    (metadata.recordCount ?? -1) >= 0 &&
    Number.isFinite(metadata.logicalBytes) &&
    (metadata.logicalBytes ?? -1) >= 0
  )
}

const observationKey = (observation: HistoricalObservation) => [
  observation.provider,
  observation.entityId,
  observation.observedAt,
]

const compareObservation = (
  first: HistoricalObservation,
  second: HistoricalObservation,
) =>
  first.observedAt - second.observedAt ||
  first.receivedAt - second.receivedAt ||
  first.entityId.localeCompare(second.entityId)

const compareReceivedObservation = (
  first: HistoricalObservation,
  second: HistoricalObservation,
) =>
  first.receivedAt - second.receivedAt ||
  first.observedAt - second.observedAt ||
  first.entityId.localeCompare(second.entityId) ||
  first.provider.localeCompare(second.provider)

const boundRecords = (
  records: readonly HistoricalObservation[],
  retentionMs: number,
  limits: DurableHistoryLimits,
  now: number,
) => {
  const sorted = [...records].sort(compareReceivedObservation)
  const cutoff = now - retentionMs
  let logicalBytes = sorted.reduce(
    (total, record) => total + record.logicalBytes,
    0,
  )
  let removeCount = 0
  while (removeCount < sorted.length) {
    const record = sorted[removeCount]
    const overTime = record.receivedAt < cutoff
    const overCount =
      sorted.length - removeCount > limits.maxRecords
    const overBytes = logicalBytes > limits.maxLogicalBytes
    if (!overTime && !overCount && !overBytes) break
    logicalBytes -= record.logicalBytes
    removeCount += 1
  }

  const removed = sorted.slice(0, removeCount)
  const removedKeys = new Set(removed.map(historicalObservationKey))
  return {
    records: records.filter(
      (record) => !removedKeys.has(historicalObservationKey(record)),
    ),
    removed,
    logicalBytes,
  }
}

export class IndexedDbHistoryRepository {
  private readonly factory: IDBFactory
  private readonly databaseName: string
  private callbacks: HistoryRepositoryCallbacks
  private databasePromise?: Promise<IDBDatabase>

  constructor(options: HistoryRepositoryOptions = {}) {
    this.factory = options.factory ?? indexedDB
    this.databaseName = options.databaseName ?? HISTORY_DATABASE_NAME
    this.callbacks = options
  }

  setCallbacks(callbacks: HistoryRepositoryCallbacks) {
    this.callbacks = callbacks
  }

  async readAll(
    options?: DurableHistoryReadOptions,
  ): Promise<DurableHistoryReadResult> {
    const database = await this.open()
    const transaction = database.transaction(
      [OBSERVATIONS_STORE, METADATA_STORE],
      'readwrite',
    )
    const completed = transactionComplete(transaction)
    const observations = transaction.objectStore(OBSERVATIONS_STORE)
    const metadataStore = transaction.objectStore(METADATA_STORE)
    const [storedRows, storedKeys, storedMetadata] = await Promise.all([
      requestResult(observations.getAll()),
      requestResult(observations.getAllKeys()),
      requestResult(metadataStore.get(METADATA_KEY)),
    ])

    if (
      typeof storedMetadata === 'object' &&
      storedMetadata !== null &&
      'schemaVersion' in storedMetadata &&
      typeof storedMetadata.schemaVersion === 'number' &&
      storedMetadata.schemaVersion > HISTORY_SCHEMA_VERSION
    ) {
      transaction.abort()
      await completed.catch(() => undefined)
      throw new HistoryRepositoryError(
        'unsupported-version',
        'Stored history uses a newer unsupported schema',
      )
    }

    const records: HistoricalObservation[] = []
    const invalidKeys: IDBValidKey[] = []
    const repairedRecords = new Map<string, HistoricalObservation>()
    for (const [index, row] of storedRows.entries()) {
      const observation = validateHistoricalObservation(row)
      if (observation) {
        records.push(observation)
        if (!isCanonicalHistoricalObservation(row, observation)) {
          repairedRecords.set(
            historicalObservationKey(observation),
            observation,
          )
        }
      } else {
        invalidKeys.push(storedKeys[index])
      }
    }

    const measuredBytes = records.reduce(
      (total, record) => total + record.logicalBytes,
      0,
    )
    const metadataMatches =
      isMetadata(storedMetadata) &&
      storedMetadata.recordCount === records.length &&
      storedMetadata.logicalBytes === measuredBytes
    const storedMetadataIsCurrent = isMetadata(storedMetadata)
    const metadata = currentMetadata({
      recordingEnabled: storedMetadataIsCurrent
        ? storedMetadata.recordingEnabled
        : false,
      recordingEpoch: storedMetadataIsCurrent
        ? storedMetadata.recordingEpoch
        : 0,
      recordCount: records.length,
      logicalBytes: measuredBytes,
      lastPrunedAt: storedMetadataIsCurrent
        ? storedMetadata.lastPrunedAt
        : undefined,
      lastWriteAt: storedMetadataIsCurrent
        ? storedMetadata.lastWriteAt
        : undefined,
    })

    let retainedRecords = records
    let removedRecords: readonly HistoricalObservation[] = []
    if (options) {
      const now = options.now ?? Date.now()
      const bounded = boundRecords(
        records,
        options.retentionMs,
        options.limits,
        now,
      )
      retainedRecords = bounded.records
      removedRecords = bounded.removed
      metadata.recordCount = retainedRecords.length
      metadata.logicalBytes = bounded.logicalBytes
      metadata.lastPrunedAt = now
    }

    const removedKeys = new Set(
      removedRecords.map(historicalObservationKey),
    )
    const mutations: Promise<unknown>[] = []
    for (const key of invalidKeys) {
      mutations.push(requestResult(observations.delete(key)))
    }
    for (const record of removedRecords) {
      mutations.push(
        requestResult(observations.delete(observationKey(record))),
      )
    }
    for (const [key, record] of repairedRecords) {
      if (!removedKeys.has(key)) {
        mutations.push(requestResult(observations.put(record)))
      }
    }
    if (
      !metadataMatches ||
      invalidKeys.length > 0 ||
      repairedRecords.size > 0 ||
      options
    ) {
      mutations.push(requestResult(metadataStore.put(metadata)))
    }
    await Promise.all(mutations)
    await completed
    retainedRecords.sort(compareObservation)

    return {
      records: retainedRecords,
      metadata,
      invalidRecordsRemoved: invalidKeys.length,
    }
  }

  async setRecordingEnabled(enabled: boolean) {
    const database = await this.open()
    const transaction = database.transaction(
      [OBSERVATIONS_STORE, METADATA_STORE],
      'readwrite',
    )
    const observations = transaction.objectStore(OBSERVATIONS_STORE)
    const metadataStore = transaction.objectStore(METADATA_STORE)
    const stored = await requestResult(metadataStore.get(METADATA_KEY))
    const metadata = isMetadata(stored) ? stored : currentMetadata()

    if (metadata.recordingEnabled !== enabled) {
      metadata.recordingEnabled = enabled
      metadata.recordingEpoch += 1
    }
    if (!enabled) {
      await requestResult(observations.clear())
      metadata.recordCount = 0
      metadata.logicalBytes = 0
      metadata.lastPrunedAt = Date.now()
    }
    await requestResult(metadataStore.put(metadata))
    await transactionComplete(transaction)
    return metadata
  }

  async clear() {
    const database = await this.open()
    const transaction = database.transaction(
      [OBSERVATIONS_STORE, METADATA_STORE],
      'readwrite',
    )
    const observations = transaction.objectStore(OBSERVATIONS_STORE)
    const metadataStore = transaction.objectStore(METADATA_STORE)
    const stored = await requestResult(metadataStore.get(METADATA_KEY))
    const metadata = isMetadata(stored) ? stored : currentMetadata()

    await requestResult(observations.clear())
    metadata.recordingEpoch += 1
    metadata.recordCount = 0
    metadata.logicalBytes = 0
    metadata.lastPrunedAt = Date.now()
    await requestResult(metadataStore.put(metadata))
    await transactionComplete(transaction)
    return metadata
  }

  async prune(
    retentionMs: number,
    limits: DurableHistoryLimits,
    now = Date.now(),
  ) {
    return this.pruneTransaction(retentionMs, limits, now)
  }

  async writeBatch(
    records: readonly HistoricalObservation[],
    expectedEpoch: number,
    retentionMs: number,
    limits: DurableHistoryLimits,
    now = Date.now(),
  ): Promise<DurableHistoryWriteResult> {
    if (records.length === 0) {
      return {
        metadata: (await this.readAll()).metadata,
        quotaPruned: false,
      }
    }

    try {
      return {
        metadata: await this.writeBatchOnce(
          records,
          expectedEpoch,
          retentionMs,
          limits,
          now,
        ),
        quotaPruned: false,
      }
    } catch (error) {
      if (!isQuotaExceeded(error)) throw this.normalizeTransactionError(error)
    }

    await this.pruneOldestFraction(0.25, now)
    try {
      return {
        metadata: await this.writeBatchOnce(
          records,
          expectedEpoch,
          retentionMs,
          limits,
          now,
        ),
        quotaPruned: true,
      }
    } catch (error) {
      if (isQuotaExceeded(error)) {
        throw new HistoryRepositoryError(
          'quota-exceeded',
          'Browser storage quota was exceeded after one cleanup retry',
        )
      }
      throw this.normalizeTransactionError(error)
    }
  }

  close() {
    void this.databasePromise?.then((database) => database.close())
    this.databasePromise = undefined
  }

  private open() {
    if (this.databasePromise) return this.databasePromise

    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(
        this.databaseName,
        HISTORY_DATABASE_VERSION,
      )

      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(OBSERVATIONS_STORE)) {
          const observations = database.createObjectStore(
            OBSERVATIONS_STORE,
            {
              keyPath: ['provider', 'entityId', 'observedAt'],
            },
          )
          observations.createIndex('observedAt', 'observedAt')
          observations.createIndex('receivedAt', 'receivedAt')
          observations.createIndex(
            'providerReceivedAt',
            ['provider', 'receivedAt'],
          )
        }
        if (!database.objectStoreNames.contains(METADATA_STORE)) {
          database.createObjectStore(METADATA_STORE, { keyPath: 'key' })
        }
      }
      request.onblocked = () => this.callbacks.onBlocked?.()
      request.onerror = () => {
        this.databasePromise = undefined
        reject(
          new HistoryRepositoryError(
            'open-failed',
            request.error?.message ?? 'Could not open local history',
          ),
        )
      }
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => {
          database.close()
          this.databasePromise = undefined
          this.callbacks.onVersionChange?.()
        }
        resolve(database)
      }
    })

    return this.databasePromise
  }

  private async writeBatchOnce(
    records: readonly HistoricalObservation[],
    expectedEpoch: number,
    retentionMs: number,
    limits: DurableHistoryLimits,
    now: number,
  ) {
    const database = await this.open()
    const transaction = database.transaction(
      [OBSERVATIONS_STORE, METADATA_STORE],
      'readwrite',
    )
    const observations = transaction.objectStore(OBSERVATIONS_STORE)
    const metadataStore = transaction.objectStore(METADATA_STORE)
    const stored = await requestResult(metadataStore.get(METADATA_KEY))
    const metadata = isMetadata(stored) ? stored : currentMetadata()

    if (!metadata.recordingEnabled) {
      transaction.abort()
      throw new HistoryRepositoryError(
        'recording-disabled',
        'Durable history recording is disabled',
      )
    }
    if (metadata.recordingEpoch !== expectedEpoch) {
      transaction.abort()
      throw new HistoryRepositoryError(
        'stale-epoch',
        'Durable history authorization changed before this batch committed',
      )
    }

    for (const record of records) {
      const validated = validateHistoricalObservation(record)
      if (!validated) continue
      const key = observationKey(validated)
      const existing = validateHistoricalObservation(
        await requestResult(observations.get(key)),
      )
      if (existing) {
        metadata.logicalBytes -= existing.logicalBytes
      } else {
        metadata.recordCount += 1
      }
      await requestResult(observations.put(validated))
      metadata.logicalBytes += validated.logicalBytes
    }
    metadata.lastWriteAt = now
    await this.pruneStore(
      observations,
      metadata,
      retentionMs,
      limits,
      now,
    )
    await requestResult(metadataStore.put(metadata))
    await transactionComplete(transaction)
    return metadata
  }

  private async pruneTransaction(
    retentionMs: number,
    limits: DurableHistoryLimits,
    now: number,
  ) {
    const database = await this.open()
    const transaction = database.transaction(
      [OBSERVATIONS_STORE, METADATA_STORE],
      'readwrite',
    )
    const observations = transaction.objectStore(OBSERVATIONS_STORE)
    const metadataStore = transaction.objectStore(METADATA_STORE)
    const stored = await requestResult(metadataStore.get(METADATA_KEY))
    const metadata = isMetadata(stored) ? stored : currentMetadata()
    await this.pruneStore(
      observations,
      metadata,
      retentionMs,
      limits,
      now,
    )
    await requestResult(metadataStore.put(metadata))
    await transactionComplete(transaction)
    return metadata
  }

  private async pruneStore(
    observations: IDBObjectStore,
    metadata: HistoryDatabaseMetadata,
    retentionMs: number,
    limits: DurableHistoryLimits,
    now: number,
  ) {
    const cutoff = now - retentionMs
    let cursor = await requestResult(
      observations.index('receivedAt').openCursor(),
    )

    while (cursor) {
      const record = validateHistoricalObservation(cursor.value)
      const overTime = !record || record.receivedAt < cutoff
      const overCount = metadata.recordCount > limits.maxRecords
      const overBytes = metadata.logicalBytes > limits.maxLogicalBytes
      if (!overTime && !overCount && !overBytes) break

      await requestResult(cursor.delete())
      if (record) {
        metadata.recordCount = Math.max(0, metadata.recordCount - 1)
        metadata.logicalBytes = Math.max(
          0,
          metadata.logicalBytes - record.logicalBytes,
        )
      }
      cursor = await nextCursor(cursor)
    }
    metadata.lastPrunedAt = now
  }

  private async pruneOldestFraction(fraction: number, now: number) {
    const database = await this.open()
    const transaction = database.transaction(
      [OBSERVATIONS_STORE, METADATA_STORE],
      'readwrite',
    )
    const observations = transaction.objectStore(OBSERVATIONS_STORE)
    const metadataStore = transaction.objectStore(METADATA_STORE)
    const stored = await requestResult(metadataStore.get(METADATA_KEY))
    const metadata = isMetadata(stored) ? stored : currentMetadata()
    let remaining = Math.ceil(metadata.recordCount * fraction)
    let cursor = await requestResult(
      observations.index('receivedAt').openCursor(),
    )
    while (cursor && remaining > 0) {
      const record = validateHistoricalObservation(cursor.value)
      await requestResult(cursor.delete())
      if (record) {
        metadata.recordCount = Math.max(0, metadata.recordCount - 1)
        metadata.logicalBytes = Math.max(
          0,
          metadata.logicalBytes - record.logicalBytes,
        )
      }
      remaining -= 1
      cursor = await nextCursor(cursor)
    }
    metadata.lastPrunedAt = now
    await requestResult(metadataStore.put(metadata))
    await transactionComplete(transaction)
  }

  private normalizeTransactionError(error: unknown) {
    if (error instanceof HistoryRepositoryError) return error
    return new HistoryRepositoryError(
      'transaction-failed',
      error instanceof Error
        ? error.message
        : 'Local history transaction failed',
    )
  }
}
