import { describe, expect, it } from 'vitest'
import { DISCOVERY_CONFIG } from '../../config/discoveryConfig'
import type { MarineMetadataRecord } from './digitrafficNormalization'
import { discoverDigitrafficMetadata } from './cachedMarineDiscovery'

const now = Date.UTC(2026, 9, 14, 12)
const metadata: MarineMetadataRecord = {
  mmsi: 230123456, timestamp: now - 60_000, name: 'TEST SHIP', callSign: 'TST123', imo: 8919805,
}
describe('read-only received Digitraffic identities', () => {
  it.each(['test ship', '230123456', '8919805', 'tst123'])('matches %s with original provenance/time, never a fabricated position', (query) => {
    const input = new Map([[metadata.mmsi, { ...metadata }]])
    const before = JSON.stringify([...input.values()])
    const result = discoverDigitrafficMetadata(input.values(), query, now)
    expect(result.matches[0]).toMatchObject({
      objectClass: 'ships', metadataReportedAt: metadata.timestamp, location: null,
      source: { name: 'Digitraffic' }, identifiers: { mmsi: '230123456' },
    })
    expect(JSON.stringify([...input.values()])).toBe(before)
    expect(result.matches[0]).not.toHaveProperty('position')
  })
  it('does not revive aged or future metadata, even while the original cache is paused', () => {
    const result = discoverDigitrafficMetadata([
      { ...metadata, timestamp: now - DISCOVERY_CONFIG.cachedMarineMetadataMaximumAgeMs - 1 },
      { ...metadata, timestamp: now + DISCOVERY_CONFIG.futureToleranceMs + 1 },
    ], 'TEST', now)
    expect(result.matches).toEqual([])
    expect(result.rejectedRecords).toBe(1)
  })
  it('keeps a successful empty result separate from invalid records and bounds output', () => {
    expect(discoverDigitrafficMetadata([metadata], 'NO MATCH', now).matches).toEqual([])
    const result = discoverDigitrafficMetadata(Array.from({ length: 51 }, (_, index) => ({ ...metadata, mmsi: metadata.mmsi + index })), 'TEST', now)
    expect(result.matches).toHaveLength(50)
    expect(result.truncated).toBe(true)
    expect(discoverDigitrafficMetadata([{ ...metadata, name: 'TEST\nSHIP' }], 'TEST', now).rejectedRecords).toBe(1)
  })
  it('does not scan records for an empty/single-character draft', () => {
    const records = { [Symbol.iterator]: () => { throw new Error('must not scan') } }
    expect(discoverDigitrafficMetadata(records, '', now).matches).toEqual([])
    expect(discoverDigitrafficMetadata(records, 'T', now).matches).toEqual([])
  })
})
