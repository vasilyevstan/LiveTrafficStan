import { describe, expect, it } from 'vitest'
import { DISCOVERY_CONFIG } from '../../config/discoveryConfig'
import {
  normalizeAircraftLookup, normalizeLookupRequest, normalizeShipLookup, validateDiscoveryResponse,
} from './lookupContract'

const now = Date.UTC(2026, 9, 14, 12)
const aircraftRequest = { objectClass: 'aircraft', by: 'hex', query: 'abc123' } as const
const shipRequest = { objectClass: 'ships', by: 'name', query: 'TEST' } as const
const aircraft = (overrides: Record<string, unknown> = {}) => ({
  hex: 'ABC123', seen: 2, r: ' N123TS ', flight: ' TST123 ', lat: 59.44, lon: 24.75, seen_pos: 30, ...overrides,
})
const envelope = (records: unknown[] = [aircraft()], snapshotAt = now) => ({
  ac: records, total: records.length, now: snapshotAt, msg: 'No error',
})
const ship = (overrides: Record<string, unknown> = {}) => ({
  type: 'Feature', id: 230123456, geometry: { type: 'Point', coordinates: [24.75, 59.44] },
  properties: {
    kind: 'vessel', mmsi: 230123456, source: 'digitraffic:station', seen: new Date(now - 1_000).toISOString(),
    name: 'TEST SHIP', callsign: 'TEST', imo: 8919805, ...overrides,
  },
})
const collection = (features: unknown[] = [ship()], attribution: unknown = { digitraffic: 'Fintraffic · CC BY 4.0' }) => ({
  type: 'FeatureCollection', features, attribution,
})

describe('explicit object query contracts', () => {
  it.each([
    ['aircraft', 'hex', ' AbC123 ', 'abc123'],
    ['aircraft', 'reg', ' g-abcd ', 'G-ABCD'],
    ['aircraft', 'callsign', ' tst123 ', 'TST123'],
    ['ships', 'name', ' ÅLAND ', 'ÅLAND'],
    ['ships', 'mmsi', '001234567', '001234567'],
  ])('canonicalizes only %s %s', (objectClass, by, query, expected) => {
    expect(normalizeLookupRequest(objectClass, by, query)).toEqual({ objectClass, by, query: expected })
  })
  it.each([
    ['aircraft', 'hex', 'abc123,def456'], ['aircraft', 'hex', '~abc123'],
    ['aircraft', 'reg', '../G-ABCD'], ['aircraft', 'reg', 'G ABCD'],
    ['aircraft', 'callsign', 'TST/123'], ['aircraft', 'callsign', '123456789'],
    ['aircraft', 'name', 'Airbus'], ['ships', 'imo', '8919805'],
    ['ships', 'mmsi', '000000000'], ['ships', 'mmsi', '12345678'],
    ['ships', 'name', 'A'], ['ships', 'name', '🙂'],
    ['ships', 'name', 'X'.repeat(101)], ['ships', 'name', 'TEST\nSHIP'],
    ['ships', 'name', 'TEST\u0085SHIP'], ['ships', 'name', 'TEST\u007fSHIP'],
    ['ports', 'name', 'Tallinn'],
  ])('rejects unsupported or malformed %s %s', (kind, by, query) => {
    expect(() => normalizeLookupRequest(kind, by, query)).toThrow()
  })
})

describe('qualified ADSB.lol identities', () => {
  it('uses the millisecond snapshot and original seen_pos, never receipt or seen', () => {
    const result = normalizeAircraftLookup(envelope(), aircraftRequest, now + 5_000)
    expect(result.matches[0]).toMatchObject({
      identifiers: { icao24: 'abc123', registration: 'N123TS', callsign: 'TST123' },
      metadataReportedAt: now - 2_000,
      location: { latitude: 59.44, longitude: 24.75, reportedAt: now - 30_000 },
    })
    expect(result.matches[0]).not.toHaveProperty('position')
    expect(result.matches[0]).not.toHaveProperty('kind')
  })
  it.each([
    { seen_pos: undefined, seen: 0 }, { seen_pos: null }, { seen_pos: -1 }, { seen_pos: NaN },
    { seen_pos: 86_401 }, { lat: 91 }, { lon: 181 }, { lat: undefined, lastPosition: [24.75, 59.44] },
  ])('retains identity without inventing a position for %j', (overrides) => {
    expect(normalizeAircraftLookup(envelope([aircraft(overrides)]), aircraftRequest, now).matches[0].location).toBeNull()
  })
  it('retains old identity but withholds stale-snapshot geometry', () => {
    const stale = now - DISCOVERY_CONFIG.maximumAircraftSnapshotAgeMs - 1
    expect(normalizeAircraftLookup(envelope([aircraft({ seen_pos: 0 })], stale), aircraftRequest, now).matches[0].location).toBeNull()
  })
  it('matches exact case-normalized registration/callsign, without punctuation removal or fuzzy identity', () => {
    expect(normalizeAircraftLookup(envelope(), { objectClass: 'aircraft', by: 'reg', query: 'N123TS' }, now).matches).toHaveLength(1)
    expect(() => normalizeAircraftLookup(envelope(), { objectClass: 'aircraft', by: 'reg', query: 'N-123TS' }, now)).toThrow()
    expect(() => normalizeAircraftLookup(envelope(), { objectClass: 'aircraft', by: 'callsign', query: 'TST12' }, now)).toThrow()
  })
  it('distinguishes successful empty, rejected partial and all-invalid responses', () => {
    expect(normalizeAircraftLookup(envelope([]), aircraftRequest, now).matches).toEqual([])
    expect(normalizeAircraftLookup(envelope([aircraft(), aircraft({ hex: '~123456' })]), aircraftRequest, now).rejectedRecords).toBe(1)
    expect(() => normalizeAircraftLookup(envelope([aircraft({ hex: 'def456' })]), aircraftRequest, now)).toThrow()
    expect(() => normalizeAircraftLookup({ ...envelope(), total: 5 }, aircraftRequest, now)).toThrow()
    expect(() => normalizeAircraftLookup(envelope([], now + 120_001), aircraftRequest, now)).toThrow()
  })
  it('accepts documented missing optional identifiers without inventing them', () => {
    expect(normalizeAircraftLookup(envelope([aircraft({ r: null, flight: undefined })]), aircraftRequest, now).matches[0].name).toBeUndefined()
  })
})

describe('Open Waters identity-only contract', () => {
  it('discards all geometry and preserves original metadata time and matching source credit', () => {
    const result = normalizeShipLookup(collection(), shipRequest, now)
    expect(result.matches[0]).toMatchObject({
      identifiers: { mmsi: '230123456', imo: '8919805', callsign: 'TEST' },
      metadataReportedAt: now - 1_000, location: null,
      source: { name: 'Open Waters AIS', code: 'digitraffic:station', credit: 'Fintraffic · CC BY 4.0' },
    })
  })
  it('preserves leading-zero exact MMSI identity', () => {
    const feature = { ...ship({ mmsi: 1234567 }), id: 1234567, attribution: { digitraffic: 'Fintraffic' } }
    expect(normalizeShipLookup(feature, { objectClass: 'ships', by: 'mmsi', query: '001234567' }, now).matches[0].identifiers.mmsi).toBe('001234567')
  })
  it('accepts empty and known non-vessel scope exclusions without pretending unsupported records are empty', () => {
    expect(normalizeShipLookup(collection([]), shipRequest, now).matches).toEqual([])
    expect(normalizeShipLookup(collection(['aton', 'base', 'sar', 'gear'].map((kind) => ship({ kind }))), shipRequest, now).rejectedRecords).toBe(0)
    expect(() => normalizeShipLookup(collection([ship({ kind: 'future-kind' })]), shipRequest, now)).toThrow()
  })
  it('checks the original record cap before non-vessel filtering', () => {
    expect(() => normalizeShipLookup(collection(Array.from({ length: 501 }, () => ship({ kind: 'aton' }))), shipRequest, now)).toThrow()
  })
  it.each([
    { source: 'unknown:station' }, { source: '' }, { seen: 'invalid' },
    { seen: new Date(now + 120_001).toISOString() }, { mmsi: '230123456' },
    { mmsi: 1 }, { name: 12 }, { name: 'X'.repeat(257) }, { callsign: 'TEST\n' }, { imo: -1 },
  ])('rejects an all-invalid source response for %j', (overrides) => {
    expect(() => normalizeShipLookup(collection([ship(overrides)]), shipRequest, now)).toThrow()
  })
  it('never substitutes its own credit and keeps truncation/partiality', () => {
    expect(() => normalizeShipLookup(collection([ship()], { digitraffic: '' }), shipRequest, now)).toThrow()
    const features = Array.from({ length: 51 }, (_, index) => ({
      ...ship({ mmsi: 230123456 + index }), id: 230123456 + index,
    }))
    const result = normalizeShipLookup({ ...collection([...features, ship({ source: 'missing' })]), truncated: true }, shipRequest, now)
    expect(result.matches).toHaveLength(50)
    expect(result.truncated).toBe(true)
    expect(result.rejectedRecords).toBe(1)
  })
})

describe('owned lookup response validation', () => {
  it('projects consumed fields and prevents live-model/provider payload injection', () => {
    const result = normalizeAircraftLookup(envelope(), aircraftRequest, now)
    const match = { ...result.matches[0], kind: 'aircraft', history: ['secret'], payload: aircraft() }
    const validated = validateDiscoveryResponse({ ...result, matches: [match], raw: envelope() }, aircraftRequest, now)
    expect(validated).toEqual(result)
    expect(validated.matches[0]).not.toHaveProperty('kind')
    expect(validated.matches[0]).not.toHaveProperty('history')
  })
  it('rejects ship geometry, duplicate identities and wrong provenance', () => {
    const result = normalizeShipLookup(collection(), shipRequest, now)
    const match = result.matches[0]
    expect(() => validateDiscoveryResponse({ ...result, matches: [{ ...match, location: { latitude: 1, longitude: 1, reportedAt: now } }] }, shipRequest, now)).toThrow()
    expect(() => validateDiscoveryResponse({ ...result, matches: [match, match] }, shipRequest, now)).toThrow()
    expect(() => validateDiscoveryResponse({ ...result, matches: [{ ...match, source: { ...match.source, name: 'Digitraffic' } }] }, shipRequest, now)).toThrow()
    expect(() => validateDiscoveryResponse({ ...result, retrievedAt: now + 120_001 }, shipRequest, now)).toThrow()
    expect(() => validateDiscoveryResponse({ ...result, matches: [{ ...match, metadataReportedAt: now + 120_001 }] }, shipRequest, now)).toThrow()
  })
})
