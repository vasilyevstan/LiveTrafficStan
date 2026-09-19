import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { Aircraft } from '../domain/traffic'
import {
  HistoryRepositoryError,
  IndexedDbHistoryRepository,
} from './indexedDbHistory'
import {
  projectHistoricalObservation,
  type HistoricalObservation,
} from './observations'

const record = (
  observedAt: number,
  receivedAt = observedAt,
): HistoricalObservation =>
  projectHistoricalObservation(
    {
      id: 'aircraft:test',
      kind: 'aircraft',
      provider: 'ADSB.lol',
      hex: 'ABC123',
      position: {
        observedAt,
        latitude: 59,
        longitude: 24,
      },
      receivedAt,
      markerIcon: 'aircraft',
      markerScale: 1,
    } satisfies Aircraft,
    { sessionId: 'session', segmentId: 'segment' },
  ) as HistoricalObservation

const repository = () =>
  new IndexedDbHistoryRepository({
    databaseName: `history-test-${crypto.randomUUID()}`,
  })

const repositories = () => {
  const databaseName = `history-test-${crypto.randomUUID()}`
  return [
    new IndexedDbHistoryRepository({ databaseName }),
    new IndexedDbHistoryRepository({ databaseName }),
  ] as const
}

const limits = {
  maxRecords: 2,
  maxLogicalBytes: 1_000_000,
}

describe('IndexedDbHistoryRepository', () => {
  it('creates, authorizes, writes, reads, and prunes the bounded store', async () => {
    const history = repository()
    const initial = await history.readAll()
    expect(initial.records).toEqual([])
    expect(initial.metadata.recordingEnabled).toBe(false)

    const enabled = await history.setRecordingEnabled(true)
    await history.writeBatch(
      [record(1_000), record(2_000), record(3_000)],
      enabled.recordingEpoch,
      60_000,
      limits,
      3_000,
    )

    const stored = await history.readAll()
    expect(stored.records.map((entry) => entry.observedAt)).toEqual([
      2_000,
      3_000,
    ])
    expect(stored.metadata.recordCount).toBe(2)
    history.close()
  })

  it('increments the epoch on clear and rejects stale queued writes', async () => {
    const history = repository()
    const enabled = await history.setRecordingEnabled(true)
    const cleared = await history.clear()

    expect(cleared.recordingEpoch).toBe(enabled.recordingEpoch + 1)
    await expect(
      history.writeBatch(
        [record(10_000)],
        enabled.recordingEpoch,
        60_000,
        limits,
        10_000,
      ),
    ).rejects.toMatchObject({
      code: 'stale-epoch',
    } satisfies Partial<HistoryRepositoryError>)
    expect((await history.readAll()).records).toEqual([])
    history.close()
  })

  it('atomically disables recording and deletes observations', async () => {
    const history = repository()
    const enabled = await history.setRecordingEnabled(true)
    await history.writeBatch(
      [record(10_000)],
      enabled.recordingEpoch,
      60_000,
      limits,
      10_000,
    )

    const disabled = await history.setRecordingEnabled(false)
    expect(disabled.recordingEnabled).toBe(false)
    expect(disabled.recordCount).toBe(0)
    expect((await history.readAll()).records).toEqual([])
    history.close()
  })

  it('uses received time for retention pruning', async () => {
    const history = repository()
    const enabled = await history.setRecordingEnabled(true)
    await history.writeBatch(
      [record(100_000, 1_000), record(2_000, 2_000)],
      enabled.recordingEpoch,
      1_500,
      { ...limits, maxRecords: 10 },
      3_000,
    )

    expect((await history.readAll()).records.map((entry) => entry.observedAt)).toEqual(
      [2_000],
    )
    history.close()
  })

  it('rejects a stale write after another connection disables recording', async () => {
    const [first, second] = repositories()
    const enabled = await first.setRecordingEnabled(true)
    await second.readAll()
    await second.setRecordingEnabled(false)

    await expect(
      first.writeBatch(
        [record(10_000)],
        enabled.recordingEpoch,
        60_000,
        limits,
        10_000,
      ),
    ).rejects.toMatchObject({
      code: 'recording-disabled',
    } satisfies Partial<HistoryRepositoryError>)
    expect((await second.readAll()).records).toEqual([])
    first.close()
    second.close()
  })

  it('removes malformed rows and rebuilds metadata', async () => {
    const databaseName = `history-test-${crypto.randomUUID()}`
    const history = new IndexedDbHistoryRepository({ databaseName })
    await history.readAll()

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('observations', 'readwrite')
    transaction.objectStore('observations').put({
      provider: 'ADSB.lol',
      entityId: 'aircraft:broken',
      observedAt: 10_000,
      receivedAt: 10_000,
      latitude: 500,
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()

    const result = await history.readAll()
    expect(result.invalidRecordsRemoved).toBe(1)
    expect(result.records).toEqual([])
    expect(result.metadata).toMatchObject({
      recordCount: 0,
      logicalBytes: 0,
    })
    history.close()
  })

  it('does not roll metadata repair back over a concurrent disable', async () => {
    const databaseName = `history-test-${crypto.randomUUID()}`
    const first = new IndexedDbHistoryRepository({ databaseName })
    const second = new IndexedDbHistoryRepository({ databaseName })
    const enabled = await first.setRecordingEnabled(true)

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('observations', 'readwrite')
    transaction.objectStore('observations').put({
      provider: 'ADSB.lol',
      entityId: 'aircraft:broken',
      observedAt: 10_000,
      receivedAt: 10_000,
      latitude: 500,
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()

    const read = first.readAll()
    const disabled = second.setRecordingEnabled(false)
    const [, disabledMetadata] = await Promise.all([read, disabled])
    const final = await first.readAll()

    expect(disabledMetadata.recordingEpoch).toBe(
      enabled.recordingEpoch + 1,
    )
    expect(final.metadata).toMatchObject({
      recordingEnabled: false,
      recordingEpoch: disabledMetadata.recordingEpoch,
      recordCount: 0,
      logicalBytes: 0,
    })
    expect(final.records).toEqual([])
    first.close()
    second.close()
  })

  it('rewrites valid rows to the canonical field and byte allowlist', async () => {
    const databaseName = `history-test-${crypto.randomUUID()}`
    const history = new IndexedDbHistoryRepository({ databaseName })
    const projected = record(10_000)
    await history.readAll()

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction(
      ['observations', 'metadata'],
      'readwrite',
    )
    transaction.objectStore('observations').put({
      ...projected,
      logicalBytes: 1,
      destination: 'FORBIDDEN',
    })
    transaction.objectStore('metadata').put({
      key: 'state',
      schemaVersion: 1,
      normalizationVersion: '2026-09-19-v1',
      licenseDecisionIds: [
        'adsb-lol-odbl-local-playback-2026-09-19',
        'fintraffic-cc-by-local-playback-2026-09-19',
      ],
      recordingEnabled: true,
      recordingEpoch: 1,
      recordCount: 1,
      logicalBytes: 1,
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()

    const result = await history.readAll()
    expect(result.records).toEqual([projected])
    expect(result.metadata.logicalBytes).toBe(projected.logicalBytes)

    const reopened = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const stored = await new Promise<unknown>((resolve, reject) => {
      const request = reopened
        .transaction('observations', 'readonly')
        .objectStore('observations')
        .get(['ADSB.lol', projected.entityId, projected.observedAt])
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    expect(stored).toEqual(projected)
    reopened.close()
    history.close()
  })
})
