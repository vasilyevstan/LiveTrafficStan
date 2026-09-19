import type { HistoricalObservation } from './observations'

interface PendingWriteEntry {
  observation: HistoricalObservation
  epoch: number
}

export interface PendingHistoryWriteBatch {
  readonly entries: readonly PendingWriteEntry[]
  readonly records: readonly HistoricalObservation[]
  readonly epoch: number
  readonly logicalBytes: number
}

export class PendingHistoryWrites {
  private queued: PendingWriteEntry[] = []
  private inFlight?: PendingHistoryWriteBatch
  private logicalBytes = 0
  private readonly maxRecords: number
  private readonly maxLogicalBytes: number

  constructor(
    maxRecords: number,
    maxLogicalBytes: number,
  ) {
    this.maxRecords = maxRecords
    this.maxLogicalBytes = maxLogicalBytes
  }

  enqueue(
    observations: readonly HistoricalObservation[],
    epoch: number,
  ) {
    for (const observation of observations) {
      this.queued.push({ observation, epoch })
      this.logicalBytes += observation.logicalBytes
    }

    let dropped = false
    while (
      this.totalRecords > this.maxRecords ||
      this.logicalBytes > this.maxLogicalBytes
    ) {
      const removed = this.queued.shift()
      if (!removed) break
      this.logicalBytes -= removed.observation.logicalBytes
      dropped = true
    }
    return dropped
  }

  take(maxRecords: number): PendingHistoryWriteBatch | undefined {
    if (this.inFlight || this.queued.length === 0) return undefined
    const epoch = this.queued[0].epoch
    let count = 0
    while (
      count < this.queued.length &&
      count < maxRecords &&
      this.queued[count].epoch === epoch
    ) {
      count += 1
    }
    const entries = this.queued.splice(0, count)
    const records = entries.map((entry) => entry.observation)
    this.inFlight = {
      entries,
      records,
      epoch,
      logicalBytes: records.reduce(
        (total, record) => total + record.logicalBytes,
        0,
      ),
    }
    return this.inFlight
  }

  commit(batch: PendingHistoryWriteBatch) {
    if (this.inFlight !== batch) return false
    this.logicalBytes -= batch.logicalBytes
    this.inFlight = undefined
    return true
  }

  restore(batch: PendingHistoryWriteBatch) {
    if (this.inFlight !== batch) return false
    this.queued.unshift(...batch.entries)
    this.inFlight = undefined
    return true
  }

  clear() {
    this.queued = []
    this.inFlight = undefined
    this.logicalBytes = 0
  }

  get hasRecords() {
    return this.totalRecords > 0
  }

  private get totalRecords() {
    return this.queued.length + (this.inFlight?.entries.length ?? 0)
  }
}
