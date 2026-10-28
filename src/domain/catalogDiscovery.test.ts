import { describe, expect, it } from 'vitest'
import { APP_CONFIG } from '../config/appConfig'
import { DISCOVERY_CONFIG } from '../config/discoveryConfig'
import {
  discoverAirports, discoverLoadedOrbits, discoverPorts, loadedOrbitalCatalog,
} from './catalogDiscovery'
import {
  EMPTY_ORBITAL_PREDICTION, orbitalFeatureId,
  type ModeledOrbitalPosition, type OrbitalCatalogSnapshot, type OrbitalChannel, type OrbitalControllerState, type OrbitalObject,
} from './orbital'
import type { Airport } from './airports'

const now = Date.UTC(2026, 9, 14, 12)
const record: OrbitalObject = {
  noradCatalogId: '12345', name: 'TEST ORBIT', internationalDesignator: '2026-001A', objectType: 'PAY',
  epoch: new Date(now - 60_000).toISOString(), meanMotion: 15, eccentricity: 0.001, inclination: 53,
  rightAscensionOfAscendingNode: 0, argumentOfPericenter: 0, meanAnomaly: 0, ephemerisType: 0,
  classificationType: 'U', elementSetNumber: 1, revolutionAtEpoch: 1, bstar: 0, meanMotionDot: 0, meanMotionDdot: 0,
  sourceGroups: ['visual'], displayOrder: 0,
}
const snapshot = (digest: string): OrbitalCatalogSnapshot => ({
  schemaVersion: 1, sourceContractVersion: 1, catalogId: digest,
  sources: [], retrievedAt: new Date(now - 30_000).toISOString(), publishedAt: new Date(now - 20_000).toISOString(),
  recordCount: 1, sha256: digest.repeat(64), records: [record],
})
const state = (owner: OrbitalChannel, digest: string): OrbitalControllerState => {
  const catalog = snapshot(digest)
  const position: ModeledOrbitalPosition = {
    id: orbitalFeatureId(record.noradCatalogId, owner), owner, noradCatalogId: record.noradCatalogId,
    name: record.name, internationalDesignator: record.internationalDesignator, objectType: record.objectType,
    sourceGroups: record.sourceGroups, displayOrder: 0, elementEpoch: Date.parse(record.epoch),
    snapshotRetrievedAt: Date.parse(catalog.retrievedAt), snapshotSha256: catalog.sha256,
    modeledFor: now, latitude: 0, longitude: 0, altitudeKm: 550, velocityKmPerSecond: 7.6,
  }
  return { phase: 'ready', acceptedCount: 1, positions: [position], prediction: EMPTY_ORBITAL_PREDICTION, snapshot: catalog }
}
const find = (curated = state('curated', 'a'), starlink = state('starlink', 'b'), selectedId: string | null = null, at = now) =>
  loadedOrbitalCatalog(curated, starlink, selectedId, at, APP_CONFIG.orbital.expireAfterMs)

describe('whole loaded catalog discovery', () => {
  it('matches airport name/city/ICAO/IATA independently of viewport and layer filters', () => {
    const airport: Airport = {
      id: 'airport:1', name: 'Example Airport', municipality: 'Tallinn', ident: 'EETN', icaoCode: 'EETN', iataCode: 'TLL',
      isoCountry: 'EE', kind: 'large', latitude: 59.4, longitude: 24.7,
    }
    for (const query of ['example', 'Tallinn', 'EETN', 'tll']) expect(discoverAirports([airport], query)).toEqual([airport])
    expect(discoverAirports([airport], 'unmatched')).toEqual([])
    expect(discoverPorts([{ id: 'port:1', name: 'Tallinn', rank: 1, latitude: 59.4, longitude: 24.7 }], 'TALL')).toHaveLength(1)
  })
  it('uses exact NORAD ownership including explicit sample selection without splicing source clocks', () => {
    const curated = state('curated', 'a')
    const starlink = state('starlink', 'b')
    const normal = find(curated, starlink)
    expect(normal.entries).toHaveLength(1)
    expect(normal.entries[0].snapshot).toBe(curated.snapshot)
    expect(normal.entries[0].position).toBe(curated.positions[0])
    const selected = find(curated, starlink, starlink.positions[0].id)
    expect(selected.entries[0].snapshot).toBe(starlink.snapshot)
    expect(selected.entries[0].position).toBe(starlink.positions[0])
  })
  it('keeps catalog metadata browsable when ORBITS is off but offers no paused modeled point', () => {
    const disabled = { ...state('curated', 'a'), phase: 'disabled' as const }
    const entries = find(disabled, { ...state('starlink', 'b'), snapshot: undefined }).entries
    expect(entries).toHaveLength(1)
    expect(entries[0].position).toBeUndefined()
    expect(discoverLoadedOrbits(entries, '12345')).toEqual(entries)
    expect(discoverLoadedOrbits(entries, '2026-001A')).toEqual(entries)
  })
  it('fails closed at hard expiry and clock-invalid states without inventing catalog zero coverage', () => {
    expect(find(undefined, undefined, null, now + APP_CONFIG.orbital.expireAfterMs).entries).toEqual([])
    const invalid = { ...state('curated', 'a'), phase: 'clock-invalid' as const }
    expect(find(invalid, { ...state('starlink', 'b'), snapshot: undefined }).missing).toEqual(['curated', 'starlink'])
  })
  it('retains the exact expiry reason and timestamp while independently searching fresh Starlink', () => {
    const curated = state('curated', 'a')
    if (!curated.snapshot) throw new Error('Missing fixture snapshot')
    const retrievedAt = Date.parse(curated.snapshot.retrievedAt)
    const boundary = retrievedAt + APP_CONFIG.orbital.expireAfterMs
    expect(find(curated, { ...state('starlink', 'b'), snapshot: undefined }, null, boundary - 1).entries).toHaveLength(1)
    const starlink = state('starlink', 'b')
    if (!starlink.snapshot) throw new Error('Missing fixture snapshot')
    starlink.snapshot = { ...starlink.snapshot, retrievedAt: new Date(boundary - 30_000).toISOString() }
    for (const phase of ['ready', 'unavailable', 'disabled', 'paused-history', 'paused-hidden'] as const) {
      const result = find({ ...curated, phase }, starlink, null, boundary)
      expect(result.missing).toEqual(['curated'])
      expect(result.unavailable).toEqual([{
        owner: 'curated', reason: 'expired', retrievedAt: curated.snapshot.retrievedAt,
      }])
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].owner).toBe('starlink')
      expect(result.entries[0].position).toBeUndefined()
    }
  })
  it('does not alter duplicate ownership when an alias matches either loaded channel', () => {
    const identify = (owner: OrbitalChannel, digest: string) => {
      const value = state(owner, digest)
      if (!value.snapshot) throw new Error('Missing fixture snapshot')
      return {
        ...value,
        snapshot: { ...value.snapshot, records: [{ ...record, noradCatalogId: '20580', name: 'HST' }] },
        positions: [],
      }
    }
    const curated = identify('curated', 'a')
    const starlink = identify('starlink', 'b')
    for (const selected of [null, 'orbital:starlink:20580']) {
      const result = discoverLoadedOrbits(find(curated, starlink, selected).entries, 'Hubble')
      expect(result).toHaveLength(1)
      expect(result[0].owner).toBe(selected ? 'starlink' : 'curated')
      expect(result[0].record.name).toBe('HST')
      expect(result[0].position).toBeUndefined()
    }
  })
  it('withholds old, wrong-generation and wrong-epoch positions while retaining exact catalog identity', () => {
    for (const override of [
      { modeledFor: now - DISCOVERY_CONFIG.maximumModeledPositionAgeMs - 1 },
      { snapshotSha256: 'c'.repeat(64) },
      { elementEpoch: now - 120_000 },
      { snapshotRetrievedAt: now - 90_000 },
    ]) {
      const curated = state('curated', 'a')
      const changed = { ...curated, positions: [{ ...curated.positions[0], ...override }] }
      expect(find(changed, { ...state('starlink', 'b'), snapshot: undefined }).entries[0].position).toBeUndefined()
    }
  })
  it('never mutates catalog filters, element rows, clocks or arrays during independent draft matching', () => {
    const curated = state('curated', 'a')
    const before = JSON.stringify(curated)
    expect(discoverLoadedOrbits(find(curated).entries, 'TEST')).toHaveLength(1)
    expect(JSON.stringify(curated)).toBe(before)
  })
})
