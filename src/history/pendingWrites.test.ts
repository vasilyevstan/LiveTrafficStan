import { describe, expect, it } from 'vitest'
import type { Aircraft } from '../domain/traffic'
import {
  projectHistoricalObservation,
  type HistoricalObservation,
} from './observations'
import { PendingHistoryWrites } from './pendingWrites'

const record = (observedAt: number): HistoricalObservation =>
  projectHistoricalObservation(
    {
      id: `aircraft:${observedAt}`,
      kind: 'aircraft',
      provider: 'ADSB.lol',
      hex: String(observedAt),
      position: {
        observedAt,
        latitude: 59,
        longitude: 24,
      },
      receivedAt: observedAt,
      markerIcon: 'aircraft',
      markerScale: 1,
    } satisfies Aircraft,
    { sessionId: 'session', segmentId: 'segment' },
  ) as HistoricalObservation

describe('PendingHistoryWrites', () => {
  it('keeps enqueue epochs and restores a failed batch ahead of newer rows', () => {
    const queue = new PendingHistoryWrites(10, 100_000)
    queue.enqueue([record(1), record(2)], 4)
    const batch = queue.take(1)
    expect(batch?.epoch).toBe(4)
    expect(batch?.records.map((entry) => entry.observedAt)).toEqual([1])

    queue.enqueue([record(3)], 5)
    expect(batch && queue.restore(batch)).toBe(true)
    expect(queue.take(10)?.records.map((entry) => entry.observedAt)).toEqual(
      [1, 2],
    )
  })

  it('invalidates an in-flight batch when history is cleared', () => {
    const queue = new PendingHistoryWrites(10, 100_000)
    queue.enqueue([record(1)], 1)
    const batch = queue.take(10)
    queue.clear()

    expect(batch && queue.commit(batch)).toBe(false)
    expect(queue.hasRecords).toBe(false)
  })

  it('bounds queued rows while preserving the active batch', () => {
    const queue = new PendingHistoryWrites(2, 100_000)
    queue.enqueue([record(1)], 1)
    const batch = queue.take(1)
    expect(batch).toBeDefined()

    expect(queue.enqueue([record(2), record(3)], 1)).toBe(true)
    expect(batch && queue.restore(batch)).toBe(true)
    expect(queue.take(10)?.records.map((entry) => entry.observedAt)).toEqual(
      [1, 3],
    )
  })
})
