import { describe, expect, it } from 'vitest'
import {
  matchesSavedObjectQuery,
  resolveSavedAircraft,
  resolveSavedAirport,
  resolveSavedOrbital,
  resolveSavedPort,
  resolveSavedVessel,
} from './savedObjectResolution'
import type { SavedObject } from './savedObjects'
import type { OrbitalControllerState } from './orbital'

const aircraftEntry: Extract<SavedObject, { kind: 'aircraft' }> = {
  kind: 'aircraft',
  id: 'abc123',
  savedLabel: 'TEST123',
  savedAt: 1,
  registration: 'ES-ABC',
}
const vesselEntry: Extract<SavedObject, { kind: 'vessel' }> = {
  kind: 'vessel',
  id: '257000001',
  savedLabel: 'Example',
  savedAt: 1,
  imo: '9074729',
}
const orbitalEntry: Extract<SavedObject, { kind: 'orbital' }> = {
  kind: 'orbital',
  id: '25544',
  savedLabel: 'ISS',
  savedAt: 1,
  internationalDesignator: '1998-067A',
}

const orbitalState = (
  phase: OrbitalControllerState['phase'],
): OrbitalControllerState => ({
  phase,
  acceptedCount: 0,
  positions: [],
  prediction: {
    mode: 'invalid',
    results: [],
    totalResults: 0,
    inViewCount: 0,
    futureCrossingCount: 0,
    trackSegments: [],
  },
})

describe('saved object resolution', () => {
  it('matches famous aliases by exact saved orbital identity without changing stored labels or ownership', () => {
    const saved: SavedObject = {
      kind: 'orbital', id: '20580', savedLabel: 'HST', savedAt: 1, preferredOwner: 'starlink',
    }
    const before = JSON.stringify(saved)
    for (const query of ['Hubble', 'Hubble Space Telescope', 'hub', 'telescope', '20580', 'HST']) {
      expect(matchesSavedObjectQuery(saved, query)).toBe(true)
    }
    expect(matchesSavedObjectQuery(saved, 'Huble')).toBe(false)
    expect(matchesSavedObjectQuery({ ...saved, id: '99999' }, 'Hubble')).toBe(false)
    expect(matchesSavedObjectQuery({ ...aircraftEntry, id: '20580' }, 'Hubble')).toBe(false)
    expect(JSON.stringify(saved)).toBe(before)
  })
  it('distinguishes current, stale, unavailable, and identity-conflict aircraft', () => {
    const entity = {
      id: 'aircraft:abc123',
      kind: 'aircraft' as const,
      provider: 'ADSB.lol',
      position: { latitude: 59, longitude: 24, observedAt: 10 },
      receivedAt: 11,
      markerIcon: 'aircraft' as const,
      markerScale: 1,
      hex: 'abc123',
      registration: 'ES-ABC',
      freshness: 'live' as const,
    }
    expect(
      resolveSavedAircraft(aircraftEntry, [entity], true, { available: true }, 9),
    ).toMatchObject({ state: 'current', status: 'Received now' })
    expect(
      resolveSavedAircraft(
        aircraftEntry,
        [{ ...entity, freshness: 'stale' }],
        true,
        { available: true },
      ),
    ).toMatchObject({ state: 'stale' })
    expect(
      resolveSavedAircraft(
        aircraftEntry,
        [{ ...entity, registration: 'ES-NEW' }],
        true,
        { available: true },
      ),
    ).toMatchObject({ state: 'conflict' })
    expect(
      resolveSavedAircraft(
        aircraftEntry,
        [],
        true,
        { available: false, message: 'Offline.' },
      ),
    ).toMatchObject({
      state: 'unavailable',
      detail: 'Offline.',
    })
    expect(
      resolveSavedAircraft(
        aircraftEntry,
        [entity],
        false,
        { available: true },
      ),
    ).toMatchObject({
      state: 'filtered',
      status: 'Received now · hidden by layer',
    })
  })

  it('distinguishes filtered ships and partial-coverage absence', () => {
    const entity = {
      id: 'vessel:257000001',
      kind: 'vessel' as const,
      provider: 'Fintraffic Digitraffic',
      position: { latitude: 59, longitude: 24, observedAt: 10 },
      receivedAt: 11,
      markerIcon: 'vessel' as const,
      markerScale: 1,
      mmsi: 257000001,
      imo: 9074729,
      vesselCategory: 'cargo' as const,
      navigationCategory: 'underway' as const,
      freshness: 'live' as const,
    }
    expect(
      resolveSavedVessel(
        vesselEntry,
        [entity],
        true,
        new Set(),
        { available: true },
      ),
    ).toMatchObject({
      state: 'filtered',
      status: 'Received now · filtered from display',
    })
    expect(
      resolveSavedVessel(
        vesselEntry,
        [],
        true,
        new Set(),
        { available: true },
      ),
    ).toMatchObject({
      state: 'missing',
      detail: 'Marine coverage is partial and regional.',
    })
    expect(
      resolveSavedVessel(
        vesselEntry,
        [entity],
        true,
        new Set(),
        {
          available: false,
          message: 'HISTORY · current ships list paused. Return to Live to resume.',
        },
      ),
    ).toMatchObject({
      state: 'filtered',
      status: 'Historical observation at playback cursor · filtered from display',
    })
    expect(
      resolveSavedVessel(
        vesselEntry,
        [entity],
        true,
        new Set(),
        {
          available: true,
          message: 'Offline · last received, unexpired observations only.',
        },
      ),
    ).toMatchObject({
      state: 'filtered',
      status: 'Received in retained data · filtered from display',
    })
    expect(
      resolveSavedVessel(
        vesselEntry,
        [entity],
        false,
        new Set([entity.id]),
        { available: true },
      ),
    ).toMatchObject({
      state: 'filtered',
      status: 'Received now · hidden by layer',
    })
  })

  it('keeps satellite state modeled and source-specific', () => {
    const record = {
      noradCatalogId: '25544',
      name: 'ISS',
      internationalDesignator: '1998-067A',
      objectType: 'PAY' as const,
      epoch: '2026-01-01T00:00:00.000Z',
      meanMotion: 1,
      eccentricity: 0,
      inclination: 1,
      rightAscensionOfAscendingNode: 1,
      argumentOfPericenter: 1,
      meanAnomaly: 1,
      ephemerisType: 0,
      classificationType: 'U',
      elementSetNumber: 1,
      revolutionAtEpoch: 1,
      bstar: 0,
      meanMotionDot: 0,
      meanMotionDdot: 0,
      sourceGroups: ['stations' as const],
      displayOrder: 1,
    }
    const snapshot = {
      schemaVersion: 1,
      sourceContractVersion: 1,
      catalogId: 'test',
      sources: [],
      retrievedAt: '2026-01-01T01:00:00.000Z',
      publishedAt: '2026-01-01T01:00:00.000Z',
      recordCount: 1,
      sha256: 'a'.repeat(64),
      records: [record],
    }
    const position = {
      id: 'orbital:25544',
      owner: 'curated' as const,
      noradCatalogId: '25544',
      name: 'ISS',
      internationalDesignator: '1998-067A',
      objectType: 'PAY' as const,
      sourceGroups: ['stations' as const],
      displayOrder: 1,
      elementEpoch: 1,
      snapshotRetrievedAt: 2,
      snapshotSha256: snapshot.sha256,
      modeledFor: 3,
      latitude: 1,
      longitude: 2,
      altitudeKm: 400,
      velocityKmPerSecond: 7,
    }
    expect(
      resolveSavedOrbital(
        orbitalEntry,
        [{ id: position.id, record, snapshot, owner: 'curated', position }],
        orbitalState('ready'),
        orbitalState('disabled'),
      ),
    ).toMatchObject({ state: 'current', status: 'Modeled now' })
    expect(
      resolveSavedOrbital(
        orbitalEntry,
        [{ id: position.id, record, snapshot, owner: 'curated', position }],
        orbitalState('stale'),
        orbitalState('disabled'),
      ),
    ).toMatchObject({
      state: 'stale',
      status: 'Modeled from stale catalog',
    })
    expect(
      resolveSavedOrbital(
        orbitalEntry,
        [{ id: position.id, record, snapshot, owner: 'curated' }],
        orbitalState('stale'),
        orbitalState('disabled'),
      ),
    ).toMatchObject({
      state: 'unavailable',
      status: 'Curated catalog stale; no safe current modeled position.',
    })
  })

  it('resolves static source IDs without treating them as monitored availability', () => {
    const airport = {
      id: '3',
      name: 'Airport',
      kind: 'large' as const,
      ident: 'TEST',
      isoCountry: 'EE',
      longitude: 24,
      latitude: 59,
    }
    expect(
      resolveSavedAirport(
        {
          kind: 'airport',
          id: '3',
          savedLabel: 'Airport',
          savedAt: 1,
          ident: 'TEST',
          sourceVersion: 'v1',
        },
        [airport],
        true,
        'v1',
      ),
    ).toMatchObject({
      state: 'catalog',
      status: 'Catalog reference available',
    })
    expect(
      resolveSavedAirport(
        {
          kind: 'airport',
          id: '3',
          savedLabel: 'Airport',
          savedAt: 1,
          ident: 'TEST',
          sourceVersion: 'v1',
        },
        [],
        false,
      ),
    ).toMatchObject({ status: 'Catalog not loaded' })
    expect(
      resolveSavedPort(
        {
          kind: 'port',
          id: '4',
          savedLabel: 'Port',
          savedAt: 1,
          sourceVersion: 'v1',
        },
        [],
        true,
        'v2',
      ),
    ).toMatchObject({ status: 'No longer in this catalog snapshot' })
  })
})
