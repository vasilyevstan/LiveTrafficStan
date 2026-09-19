import type { TrafficEntity } from '../domain/traffic'
import {
  historicalEntityKey,
  projectHistoricalObservation,
  type HistoricalObservation,
  type ObservationProjectionContext,
} from './observations'

export interface SessionHistoryConfig {
  retentionMs: number
  maxRecords: number
  maxLogicalBytes: number
  sampleIntervalMs: number
}

export interface SessionHistorySnapshot {
  records: readonly HistoricalObservation[]
  logicalBytes: number
  oldestObservedAt?: number
  newestObservedAt?: number
}

interface EntitySamplingState {
  lastSeenObservedAt: number
  lastSampledObservedAt?: number
}

const byReceivedTime = (
  first: HistoricalObservation,
  second: HistoricalObservation,
) =>
  first.receivedAt - second.receivedAt ||
  first.observedAt - second.observedAt ||
  first.entityId.localeCompare(second.entityId)

export class SessionObservationHistory {
  private records: HistoricalObservation[] = []
  private logicalBytes = 0
  private readonly sampling = new Map<string, EntitySamplingState>()
  private minimumReceivedAt = Number.NEGATIVE_INFINITY
  private readonly config: SessionHistoryConfig

  constructor(config: SessionHistoryConfig) {
    this.config = config
  }

  ingest(
    entities: readonly TrafficEntity[],
    context: ObservationProjectionContext,
    now: number,
  ) {
    const appended: HistoricalObservation[] = []

    for (const entity of entities) {
      const key = `${entity.provider}\u0000${entity.id}`
      const state = this.sampling.get(key)
      const observedAt = entity.position.observedAt
      if (state && observedAt <= state.lastSeenObservedAt) continue

      const nextState = {
        lastSeenObservedAt: observedAt,
        lastSampledObservedAt: state?.lastSampledObservedAt,
      }
      this.sampling.delete(key)
      this.sampling.set(key, nextState)

      if (entity.receivedAt <= this.minimumReceivedAt) continue
      if (
        nextState.lastSampledObservedAt !== undefined &&
        observedAt - nextState.lastSampledObservedAt <
          this.config.sampleIntervalMs
      ) {
        continue
      }

      const observation = projectHistoricalObservation(entity, context)
      if (!observation) continue
      nextState.lastSampledObservedAt = observedAt
      appended.push(observation)
    }

    while (this.sampling.size > this.config.maxRecords) {
      const oldestKey = this.sampling.keys().next().value
      if (oldestKey === undefined) break
      this.sampling.delete(oldestKey)
    }

    if (appended.length > 0) {
      appended.sort(byReceivedTime)
      const last = this.records.at(-1)
      if (last && appended[0].receivedAt < last.receivedAt) {
        this.records = [...this.records, ...appended].sort(byReceivedTime)
      } else {
        this.records.push(...appended)
      }
      this.logicalBytes += appended.reduce(
        (total, observation) => total + observation.logicalBytes,
        0,
      )
    }

    const removed = this.prune(now)
    return { appended, removed }
  }

  prune(now: number) {
    const cutoff = now - this.config.retentionMs
    let removeCount = 0
    let removedBytes = 0

    while (removeCount < this.records.length) {
      const observation = this.records[removeCount]
      const overTime = observation.receivedAt < cutoff
      const overCount =
        this.records.length - removeCount > this.config.maxRecords
      const overBytes =
        this.logicalBytes - removedBytes > this.config.maxLogicalBytes
      if (!overTime && !overCount && !overBytes) break
      removedBytes += observation.logicalBytes
      removeCount += 1
    }

    const removed = this.records.slice(0, removeCount)
    if (removed.length > 0) {
      this.records.splice(0, removeCount)
      this.logicalBytes -= removedBytes
    }

    return removed
  }

  clear(receivedAfter: number) {
    this.records = []
    this.logicalBytes = 0
    this.sampling.clear()
    this.minimumReceivedAt = receivedAfter
  }

  snapshot(): SessionHistorySnapshot {
    let oldestObservedAt: number | undefined
    let newestObservedAt: number | undefined
    for (const record of this.records) {
      oldestObservedAt =
        oldestObservedAt === undefined
          ? record.observedAt
          : Math.min(oldestObservedAt, record.observedAt)
      newestObservedAt =
        newestObservedAt === undefined
          ? record.observedAt
          : Math.max(newestObservedAt, record.observedAt)
    }

    return {
      records: this.records.slice(),
      logicalBytes: this.logicalBytes,
      oldestObservedAt,
      newestObservedAt,
    }
  }

  latestObservedAt(provider: string, entityId: string) {
    return this.sampling.get(
      historicalEntityKey({ provider, entityId } as HistoricalObservation),
    )?.lastSeenObservedAt
  }
}
