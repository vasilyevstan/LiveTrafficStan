export type MarineDiagnosticMessageKind =
  | 'location'
  | 'metadata'
  | 'status'
  | 'other'

interface MessageCounts {
  location: number
  metadata: number
  status: number
  other: number
}

export interface MarineDiagnosticsSnapshot {
  startedAt: number
  sampledAt: number
  elapsedMs: number
  messages: {
    total: number
    accepted: number
    invalid: number
    payloadBytes: number
    byKind: MessageCounts
  }
  processing: {
    messageTotalMs: number
    messageMaxMs: number
    flushTotalMs: number
    flushMaxMs: number
  }
  batching: {
    flushes: number
    scheduledFlushes: number
    immediateFlushes: number
    messagesProcessedByFlush: number
    maxMessagesPerFlush: number
    emittedVessels: number
    maxEmittedVessels: number
  }
  cache: {
    locations: number
    maxLocations: number
    metadata: number
    maxMetadata: number
    expiredLocations: number
  }
}

export interface MarineDiagnosticsOptions {
  sampleIntervalMs?: number
  onSnapshot: (snapshot: MarineDiagnosticsSnapshot) => void
}

interface MessageRecord {
  kind: MarineDiagnosticMessageKind
  payloadBytes: number
  accepted: boolean
  batchable: boolean
  processingMs: number
  locationCacheSize: number
  metadataCacheSize: number
}

interface FlushRecord {
  reason: 'immediate' | 'scheduled'
  processingMs: number
  emittedVessels: number
  expiredLocations: number
  locationCacheSize: number
  metadataCacheSize: number
}

export interface MarineDiagnosticsCollector {
  recordMessage(record: MessageRecord): void
  recordCache(locationCacheSize: number, metadataCacheSize: number): void
  recordFlush(record: FlushRecord): void
  snapshot(sampledAt: number): MarineDiagnosticsSnapshot
  emit(sampledAt: number, force?: boolean): void
}

const emptyMessageCounts = (): MessageCounts => ({
  location: 0,
  metadata: 0,
  status: 0,
  other: 0,
})

export const createMarineDiagnosticsCollector = (
  options?: MarineDiagnosticsOptions,
  startedAt = Date.now(),
): MarineDiagnosticsCollector => {
  const byKind = emptyMessageCounts()
  let totalMessages = 0
  let acceptedMessages = 0
  let invalidMessages = 0
  let payloadBytes = 0
  let messageTotalMs = 0
  let messageMaxMs = 0
  let flushTotalMs = 0
  let flushMaxMs = 0
  let flushes = 0
  let scheduledFlushes = 0
  let immediateFlushes = 0
  let pendingBatchableMessages = 0
  let messagesProcessedByFlush = 0
  let maxMessagesPerFlush = 0
  let emittedVessels = 0
  let maxEmittedVessels = 0
  let locationCacheSize = 0
  let maxLocations = 0
  let metadataCacheSize = 0
  let maxMetadata = 0
  let expiredLocations = 0
  let lastEmission = 0

  const recordCache = (locations: number, metadata: number) => {
    locationCacheSize = locations
    metadataCacheSize = metadata
    maxLocations = Math.max(maxLocations, locations)
    maxMetadata = Math.max(maxMetadata, metadata)
  }

  const snapshot = (sampledAt: number): MarineDiagnosticsSnapshot => ({
    startedAt,
    sampledAt,
    elapsedMs: Math.max(0, sampledAt - startedAt),
    messages: {
      total: totalMessages,
      accepted: acceptedMessages,
      invalid: invalidMessages,
      payloadBytes,
      byKind: { ...byKind },
    },
    processing: {
      messageTotalMs,
      messageMaxMs,
      flushTotalMs,
      flushMaxMs,
    },
    batching: {
      flushes,
      scheduledFlushes,
      immediateFlushes,
      messagesProcessedByFlush,
      maxMessagesPerFlush,
      emittedVessels,
      maxEmittedVessels,
    },
    cache: {
      locations: locationCacheSize,
      maxLocations,
      metadata: metadataCacheSize,
      maxMetadata,
      expiredLocations,
    },
  })

  return {
    recordMessage(record) {
      totalMessages += 1
      byKind[record.kind] += 1
      payloadBytes += record.payloadBytes
      messageTotalMs += record.processingMs
      messageMaxMs = Math.max(messageMaxMs, record.processingMs)
      if (record.accepted) {
        acceptedMessages += 1
      } else {
        invalidMessages += 1
      }
      if (record.batchable) pendingBatchableMessages += 1
      recordCache(record.locationCacheSize, record.metadataCacheSize)
    },
    recordCache,
    recordFlush(record) {
      flushes += 1
      if (record.reason === 'scheduled') {
        scheduledFlushes += 1
      } else {
        immediateFlushes += 1
      }
      messagesProcessedByFlush += pendingBatchableMessages
      maxMessagesPerFlush = Math.max(
        maxMessagesPerFlush,
        pendingBatchableMessages,
      )
      pendingBatchableMessages = 0
      flushTotalMs += record.processingMs
      flushMaxMs = Math.max(flushMaxMs, record.processingMs)
      emittedVessels += record.emittedVessels
      maxEmittedVessels = Math.max(
        maxEmittedVessels,
        record.emittedVessels,
      )
      expiredLocations += record.expiredLocations
      recordCache(record.locationCacheSize, record.metadataCacheSize)
    },
    snapshot,
    emit(sampledAt, force = false) {
      if (!options) return
      const sampleIntervalMs = options.sampleIntervalMs ?? 60_000
      if (!force && sampledAt - lastEmission < sampleIntervalMs) return
      lastEmission = sampledAt
      options.onSnapshot(snapshot(sampledAt))
    },
  }
}
