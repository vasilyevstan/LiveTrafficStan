import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isObjectShareToken, objectShareIdentityKey, parseObjectShareContext, readObjectShareIntent,
  shareOrbitalObject, shareTrafficObject, sharedOrbitalMatches, sharedTrafficMatches,
  type ObjectShareContext,
} from './objectShare'
import type { Aircraft, Vessel } from './traffic'
import { orbitalFeatureId, type ModeledOrbitalPosition, type OrbitalCatalogSnapshot } from './orbital'
import { DIGITRAFFIC_PROVIDER_NAME } from '../providers/marine/digitrafficCapabilities'

const now = Date.UTC(2026, 9, 23, 12)
const aircraft: Aircraft = {
  kind: 'aircraft', id: 'aircraft:abcdef', hex: 'ABCDEF', callsign: 'PUBLIC 1', registration: ' g-test ',
  provider: 'ADSB.lol', position: { latitude: 59.43729, longitude: 24.75369, observedAt: now - 4_000 },
  receivedAt: now, markerIcon: 'aircraft', markerScale: 1,
}
const vessel: Vessel = {
  kind: 'vessel', id: 'vessel:230123456', mmsi: 230123456, imo: 8919805, name: 'PUBLIC VESSEL',
  provider: DIGITRAFFIC_PROVIDER_NAME, attribution: 'Fintraffic Digitraffic / CC BY 4.0 | Open Waters AIS',
  position: aircraft.position, receivedAt: now, markerIcon: 'vessel', markerScale: 1,
  vesselCategory: 'passenger', navigationCategory: 'underway',
}
const snapshot: OrbitalCatalogSnapshot = {
  schemaVersion: 3, sourceContractVersion: 3, catalogId: 'test', sources: [], records: [], recordCount: 0,
  sha256: 'a'.repeat(64), retrievedAt: new Date(now - 20_000).toISOString(),
  publishedAt: new Date(now - 10_000).toISOString(), sourceProvider: 'space-track',
}
const position: ModeledOrbitalPosition = {
  id: orbitalFeatureId('12345', 'curated'), owner: 'curated', noradCatalogId: '12345', name: 'PUBLIC ORBIT',
  internationalDesignator: '2026-001A', objectType: 'R/B', sourceGroups: ['visual'], displayOrder: 0,
  elementEpoch: now - 60_000, snapshotRetrievedAt: now - 20_000, snapshotSha256: snapshot.sha256,
  modeledFor: now, latitude: 1, longitude: 2, altitudeKm: 550, velocityKmPerSecond: 7.6,
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now) })
afterEach(() => vi.useRealTimers())

describe('minimal public object context', () => {
  it('captures rounded reported positions and exact corroboration without extra live fields', () => {
    const context = shareTrafficObject(aircraft)
    expect(context).toEqual({
      version: 1, kind: 'aircraft', identifier: 'abcdef', label: 'PUBLIC 1', source: 'ADSB.lol',
      registration: 'G-TEST', position: { latitude: 59.437, longitude: 24.754, at: now - 4_000 },
    })
    expect(aircraft.position.latitude).toBe(59.43729)
    expect(parseObjectShareContext({ ...context, position: undefined }, now).position).toBeUndefined()
  })

  it('keeps contributing marine attribution separate from the winning position source', () => {
    expect(shareTrafficObject(vessel)).toMatchObject({
      kind: 'vessel', identifier: '230123456', imo: '8919805', source: DIGITRAFFIC_PROVIDER_NAME,
      contributors: [DIGITRAFFIC_PROVIDER_NAME, 'Open Waters AIS'],
    })
    for (const contributors of [['ADSB.lol'], ['AISStream'], [DIGITRAFFIC_PROVIDER_NAME, DIGITRAFFIC_PROVIDER_NAME], ['arbitrary text']]) {
      expect(() => parseObjectShareContext({ ...shareTrafficObject(vessel), contributors }, now)).toThrow()
    }
  })

  it('preserves fractional observation and monotonic-anchored modeled milliseconds without rejecting real clocks', () => {
    expect(shareTrafficObject({
      ...aircraft, position: { ...aircraft.position, observedAt: now - 4_000.25 },
    }).position?.at).toBe(now - 4_000.25)
    expect(shareOrbitalObject({ ...position, modeledFor: now - 0.5 }, snapshot).position?.at).toBe(now - 0.5)
    expect(() => parseObjectShareContext({
      ...shareTrafficObject(aircraft),
      position: { latitude: 1, longitude: 2, at: 8_640_000_000_000_001 },
    }, now)).toThrow()
  })

  it('never selects by callsign or name and vetoes contradictory valid corroboration', () => {
    const plane = shareTrafficObject(aircraft)
    expect(sharedTrafficMatches(plane, { ...aircraft, callsign: 'DIFFERENT', registration: 'G-TEST' })).toBe(true)
    expect(sharedTrafficMatches(plane, { ...aircraft, hex: '123456' })).toBe(false)
    expect(sharedTrafficMatches(plane, { ...aircraft, registration: 'OTHER' })).toBe(false)
    expect(sharedTrafficMatches(plane, { ...aircraft, registration: undefined })).toBe(true)
    const ship = shareTrafficObject(vessel)
    expect(sharedTrafficMatches(ship, { ...vessel, name: 'DIFFERENT' })).toBe(true)
    expect(sharedTrafficMatches(ship, { ...vessel, mmsi: 230999999 })).toBe(false)
    expect(sharedTrafficMatches(ship, { ...vessel, imo: 9074729 })).toBe(false)
    expect(sharedTrafficMatches(ship, { ...vessel, imo: undefined })).toBe(true)
    expect(sharedTrafficMatches(ship, aircraft)).toBe(false)
  })

  it('retains exact orbital owner, SATCAT type and clocks but no elements or optical claims', () => {
    const context = shareOrbitalObject(position, snapshot)
    expect(context).toMatchObject({
      kind: 'orbital', owner: 'curated', objectType: 'R/B', source: 'Space-Track.org / USSPACECOM',
      snapshot: { sha256: snapshot.sha256, retrievedAt: now - 20_000, elementEpoch: now - 60_000 },
      position: { latitude: 1, longitude: 2, at: now },
    })
    expect(JSON.stringify(context)).not.toContain('meanMotion')
    expect(() => shareOrbitalObject({ ...position, owner: 'starlink' }, snapshot)).toThrow()
    expect(() => shareOrbitalObject({ ...position, snapshotSha256: 'b'.repeat(64) }, snapshot)).toThrow()
    expect(() => shareOrbitalObject({ ...position, snapshotRetrievedAt: now }, snapshot)).toThrow()
    expect(() => parseObjectShareContext({ ...context, objectType: 'satellite' }, now)).toThrow()
    expect(() => parseObjectShareContext({ ...context, snapshot: { ...snapshot, epoch: now } }, now)).toThrow()
  })

  it('marks only explicit orbital viewpoints and keeps ordinary records and identity keys distinct', () => {
    const ordinary = shareOrbitalObject(position, snapshot)
    const view = shareOrbitalObject(position, snapshot, 'from-here')
    expect(ordinary).not.toHaveProperty('view')
    expect(view).toEqual({ ...ordinary, view: 'from-here' })
    expect(parseObjectShareContext(JSON.parse(JSON.stringify(view)), now)).toEqual(view)
    expect(objectShareIdentityKey(view)).not.toBe(objectShareIdentityKey(ordinary))
    for (const context of [shareTrafficObject(aircraft), shareTrafficObject(vessel)]) {
      expect(() => parseObjectShareContext({ ...context, view: 'from-here' }, now)).toThrow()
    }
    for (const view of ['map', 'from-there', '', null, true, { yaw: 90 }]) {
      expect(() => parseObjectShareContext({ ...ordinary, view }, now)).toThrow()
    }
    for (const extra of [{ camera: { zoom: 4 } }, { playing: false }, { look: [1, 2] }, { modeledFor: now }]) {
      expect(() => parseObjectShareContext({ ...view, ...extra }, now)).toThrow()
    }
  })

  it.each(['curated', 'starlink'] as const)('uses the current %s model, never the sender point or another owner', owner => {
    const original = { ...position, owner, id: orbitalFeatureId(position.noradCatalogId, owner) }
    const context = shareOrbitalObject(original, snapshot, 'from-here')
    const newer = { ...snapshot, sha256: 'b'.repeat(64), retrievedAt: new Date(now).toISOString() }
    const current = {
      ...original, latitude: -40, longitude: -120, modeledFor: now + 1_000,
      snapshotSha256: newer.sha256, snapshotRetrievedAt: now,
    }
    expect(context.position).toEqual({ latitude: 1, longitude: 2, at: now })
    expect(sharedOrbitalMatches(context, current, newer)).toBe(true)
    expect(sharedOrbitalMatches(context, { ...current, owner: owner === 'curated' ? 'starlink' : 'curated' }, newer)).toBe(false)
    expect(sharedOrbitalMatches(context, { ...current, internationalDesignator: '2026-002A' }, newer)).toBe(false)
    expect(sharedOrbitalMatches(context, current, snapshot)).toBe(false)
  })

  it('accepts a newer qualified same-owner snapshot, not a same-NORAD other-owner or contradictory designator', () => {
    const context = shareOrbitalObject(position, snapshot)
    const newer = { ...snapshot, sha256: 'b'.repeat(64), retrievedAt: new Date(now).toISOString() }
    const current = { ...position, snapshotSha256: newer.sha256, snapshotRetrievedAt: now }
    expect(sharedOrbitalMatches(context, current, newer)).toBe(true)
    expect(sharedOrbitalMatches(context, { ...current, id: orbitalFeatureId('12345', 'starlink') }, newer)).toBe(false)
    expect(sharedOrbitalMatches(context, { ...current, internationalDesignator: '2026-002A' }, newer)).toBe(false)
    expect(sharedOrbitalMatches(context, current, snapshot)).toBe(false)
    expect(objectShareIdentityKey(context)).not.toBe(objectShareIdentityKey({
      ...context, owner: 'starlink',
    } as ObjectShareContext))
  })

  it.each([
    { identifier: 'ABCDEF' }, { identifier: 'abcde' }, { label: 'bad\u202ename' }, { label: 'bad\nname' },
    { label: ' ' }, { label: 'x'.repeat(81) }, { source: 'unlisted' }, { home: [1, 2] },
    { registration: 'g-test' }, { position: { latitude: 91, longitude: 2, at: now } },
    { position: { latitude: 1, longitude: 2, at: now + 60_001 } },
    { position: { latitude: 1, longitude: 2, at: NaN } },
    { position: { latitude: 1, longitude: 2, at: now, altitude: 100 } },
  ])('rejects malformed, extra, private or unsafe fields: %j', override => {
    expect(() => parseObjectShareContext({ ...shareTrafficObject(aircraft), ...override }, now)).toThrow()
  })

  it('accepts only one exact object token, never appended legacy camera/preferences', () => {
    expect(readObjectShareIntent('#v=1&lat=59')).toBeUndefined()
    expect(readObjectShareIntent('#object=Ab9_-1234567')).toEqual({ token: 'Ab9_-1234567' })
    for (const hash of ['#object=bad', '#object=Ab9_-1234567&v=1', '#object=Ab9_-1234567&object=Ab9_-1234567']) {
      expect(readObjectShareIntent(hash)).toEqual({ token: undefined })
    }
    for (const token of ['../path', 'Ab9_-1234567/', 'a'.repeat(11), 'a'.repeat(13), 'abcdefghijkl?']) {
      expect(isObjectShareToken(token)).toBe(false)
    }
  })
})
