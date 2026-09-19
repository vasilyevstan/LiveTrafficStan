import { describe, expect, it } from 'vitest'
import { createMarineDiagnosticsCollector } from './marineDiagnostics'

describe('marine diagnostics', () => {
  it('keeps bounded aggregate message, batching, processing, and cache data', () => {
    const diagnostics = createMarineDiagnosticsCollector(undefined, 1_000)

    diagnostics.recordMessage({
      kind: 'location',
      payloadBytes: 10,
      accepted: true,
      batchable: true,
      processingMs: 1.5,
      locationCacheSize: 1,
      metadataCacheSize: 0,
    })
    diagnostics.recordMessage({
      kind: 'metadata',
      payloadBytes: 20,
      accepted: true,
      batchable: true,
      processingMs: 2.5,
      locationCacheSize: 1,
      metadataCacheSize: 1,
    })
    diagnostics.recordMessage({
      kind: 'other',
      payloadBytes: 3,
      accepted: false,
      batchable: false,
      processingMs: 0.5,
      locationCacheSize: 1,
      metadataCacheSize: 1,
    })
    diagnostics.recordFlush({
      reason: 'scheduled',
      processingMs: 3,
      emittedVessels: 1,
      expiredLocations: 0,
      locationCacheSize: 1,
      metadataCacheSize: 1,
    })
    diagnostics.recordMessage({
      kind: 'location',
      payloadBytes: 11,
      accepted: true,
      batchable: true,
      processingMs: 1,
      locationCacheSize: 2,
      metadataCacheSize: 1,
    })
    diagnostics.recordFlush({
      reason: 'immediate',
      processingMs: 4,
      emittedVessels: 0,
      expiredLocations: 2,
      locationCacheSize: 0,
      metadataCacheSize: 1,
    })

    expect(diagnostics.snapshot(11_000)).toEqual({
      startedAt: 1_000,
      sampledAt: 11_000,
      elapsedMs: 10_000,
      messages: {
        total: 4,
        accepted: 3,
        invalid: 1,
        payloadBytes: 44,
        byKind: {
          location: 2,
          metadata: 1,
          status: 0,
          other: 1,
        },
      },
      processing: {
        messageTotalMs: 5.5,
        messageMaxMs: 2.5,
        flushTotalMs: 7,
        flushMaxMs: 4,
      },
      batching: {
        flushes: 2,
        scheduledFlushes: 1,
        immediateFlushes: 1,
        messagesProcessedByFlush: 3,
        maxMessagesPerFlush: 2,
        emittedVessels: 1,
        maxEmittedVessels: 1,
      },
      cache: {
        locations: 0,
        maxLocations: 2,
        metadata: 1,
        maxMetadata: 1,
        expiredLocations: 2,
      },
    })
  })
})
