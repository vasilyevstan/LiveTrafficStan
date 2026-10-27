import { describe, expect, it, vi } from 'vitest'
import {
  addSavedObject,
  clearSavedObjects,
  createSavedAirportObject,
  createSavedOrbitalObject,
  createSavedPortObject,
  createSavedTrafficObject,
  emptySavedObjectsDocument,
  parseSavedObject,
  readSavedObjects,
  removeSavedObject,
  SAVED_OBJECTS_STORAGE_KEY,
  savedObjectKey,
  type SavedObjectsLimits,
  type SavedObjectsStorage,
} from './savedObjects'

const limits: SavedObjectsLimits = {
  maxEntries: 5,
  maxMovingEntriesPerKind: 2,
  maxLabelLength: 80,
  maxRecordBytes: 512,
  maxDocumentBytes: 4_096,
}

const memoryStorage = (): SavedObjectsStorage => {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
  }
}

const aircraft = (hex = 'abc123') =>
  createSavedTrafficObject(
    {
      id: `aircraft:${hex}`,
      kind: 'aircraft',
      provider: 'ADSB.lol',
      position: { latitude: 59, longitude: 24, observedAt: 1 },
      receivedAt: 2,
      markerIcon: 'aircraft',
      markerScale: 1,
      hex,
      callsign: ' TEST\u202e123 ',
      registration: 'es-abc',
    },
    10,
    limits.maxLabelLength,
  )

describe('saved objects', () => {
  it('creates canonical identity-only projections without coordinates', () => {
    const entry = aircraft()
    expect(entry).toEqual({
      kind: 'aircraft',
      id: 'abc123',
      savedLabel: 'TEST 123',
      savedAt: 10,
      registration: 'ES-ABC',
    })
    expect(JSON.stringify(entry)).not.toContain('latitude')

    expect(
      createSavedTrafficObject(
        {
          id: 'vessel:257000001',
          kind: 'vessel',
          provider: 'Fintraffic Digitraffic',
          position: { latitude: 59, longitude: 24, observedAt: 1 },
          receivedAt: 2,
          markerIcon: 'vessel',
          markerScale: 1,
          mmsi: 257000001,
          vesselCategory: 'cargo',
          navigationCategory: 'underway',
          name: 'Example',
          imo: 9074729,
        },
        11,
        limits.maxLabelLength,
      ),
    ).toMatchObject({ kind: 'vessel', id: '257000001', imo: '9074729' })
  })

  it('creates canonical orbital and static catalog references', () => {
    expect(
      createSavedOrbitalObject(
        {
          id: 'orbital:starlink:25544',
          owner: 'starlink',
          noradCatalogId: '25544',
          name: 'ISS',
          internationalDesignator: '1998-067A',
          objectType: 'PAY',
          sourceGroups: ['stations'],
          displayOrder: 1,
          elementEpoch: 1,
          snapshotRetrievedAt: 2,
          snapshotSha256: 'a'.repeat(64),
          modeledFor: 3,
          latitude: 1,
          longitude: 2,
          altitudeKm: 400,
          velocityKmPerSecond: 7,
        },
        12,
        limits.maxLabelLength,
      ),
    ).toMatchObject({
      kind: 'orbital',
      id: '25544',
      preferredOwner: 'starlink',
    })
    expect(
      createSavedAirportObject(
        {
          id: '3',
          name: 'Airport',
          kind: 'large',
          ident: 'TEST',
          isoCountry: 'EE',
          longitude: 24,
          latitude: 59,
        },
        {
          name: 'OurAirports',
          repositoryUrl: 'https://example.test',
          commit: 'a',
          publishedAt: '2026-01-01',
          termsUrl: 'https://example.test',
          documentationUrl: 'https://example.test',
          licenseName: 'Public domain',
          outputVersion: 'airports-v1',
        },
        13,
        limits.maxLabelLength,
      ),
    ).toMatchObject({ kind: 'airport', id: '3', sourceVersion: 'airports-v1' })
    expect(
      createSavedPortObject(
        { id: '1730087247', name: 'Port', rank: 1, longitude: 24, latitude: 59 },
        {
          name: 'Natural Earth',
          repositoryUrl: 'https://example.test',
          tag: 'v1',
          commit: 'b',
          publishedAt: '2026-01-01',
          termsUrl: 'https://example.test',
          documentationUrl: 'https://example.test',
          licenseName: 'Public domain',
          outputVersion: 'ports-v1',
        },
        14,
        limits.maxLabelLength,
      ),
    ).toMatchObject({ kind: 'port', id: '1730087247' })
  })

  it('rejects coordinates, unknown fields, invalid identities, and bidi text', () => {
    expect(
      parseSavedObject(
        { ...aircraft(), latitude: 59 },
        limits,
      ),
    ).toBeUndefined()
    expect(
      parseSavedObject(
        { ...aircraft(), id: 'callsign' },
        limits,
      ),
    ).toBeUndefined()
    expect(
      parseSavedObject(
        { ...aircraft(), savedLabel: 'ABC\u202e123' },
        limits,
      ),
    ).toBeUndefined()
  })

  it('persists, deduplicates, removes, and clear-fences entries', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100)
    const storage = memoryStorage()
    const first = addSavedObject(storage, aircraft(), limits)
    expect(first.ok).toBe(true)
    expect(first.document.entries).toHaveLength(1)
    expect(addSavedObject(storage, aircraft(), limits).document.entries).toHaveLength(1)
    expect(readSavedObjects(storage, limits).phase).toBe('ready')

    const removed = removeSavedObject(
      storage,
      savedObjectKey(aircraft()),
      limits,
    )
    expect(removed.ok).toBe(true)
    expect(removed.document.entries).toEqual([])

    addSavedObject(storage, aircraft(), limits)
    const cleared = clearSavedObjects(storage, limits)
    expect(cleared.ok).toBe(true)
    expect(cleared.document.entries).toEqual([])
    expect(cleared.document.clearEpoch).toBe(100)
    expect(
      addSavedObject(storage, aircraft(), limits, 0),
    ).toMatchObject({
      ok: false,
      message: 'Saved was cleared after this object was removed. Undo was cancelled.',
    })
    vi.restoreAllMocks()
  })

  it('rejects capacity without evicting user-authored entries', () => {
    const storage = memoryStorage()
    addSavedObject(storage, aircraft('abc123'), limits)
    addSavedObject(storage, aircraft('abc124'), limits)
    const rejected = addSavedObject(storage, aircraft('abc125'), limits)
    expect(rejected.ok).toBe(false)
    expect(rejected.message).toContain('2 aircraft')
    expect(rejected.document.entries.map(savedObjectKey)).toEqual([
      'aircraft:abc123',
      'aircraft:abc124',
    ])
  })

  it('blocks unsupported schemas and keeps malformed current data read-only', () => {
    const storage = memoryStorage()
    storage.setItem(
      SAVED_OBJECTS_STORAGE_KEY,
      JSON.stringify({ version: 2, revision: 1, clearEpoch: 0, entries: [] }),
    )
    expect(readSavedObjects(storage, limits)).toMatchObject({
      phase: 'blocked',
    })
    expect(addSavedObject(storage, aircraft(), limits).ok).toBe(false)

    storage.setItem(
      SAVED_OBJECTS_STORAGE_KEY,
      JSON.stringify({
        ...emptySavedObjectsDocument(),
        entries: [aircraft(), { ...aircraft('abc124'), latitude: 59 }],
      }),
    )
    expect(readSavedObjects(storage, limits)).toMatchObject({
      phase: 'repair-needed',
      document: { entries: [aircraft()] },
    })

    storage.setItem(
      SAVED_OBJECTS_STORAGE_KEY,
      JSON.stringify({
        ...emptySavedObjectsDocument(),
        extra: 'not allowed',
      }),
    )
    expect(readSavedObjects(storage, limits)).toMatchObject({
      phase: 'blocked',
    })

    storage.setItem(
      SAVED_OBJECTS_STORAGE_KEY,
      JSON.stringify({
        ...emptySavedObjectsDocument(),
        entries: [aircraft('abc123'), aircraft('abc124'), aircraft('abc125')],
      }),
    )
    expect(readSavedObjects(storage, limits)).toMatchObject({
      phase: 'repair-needed',
    })
  })

  it('reports unavailable and quota failures without success-shaped state', () => {
    expect(readSavedObjects(undefined, limits).phase).toBe('unavailable')
    const storage = memoryStorage()
    ;(storage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    const result = addSavedObject(storage, aircraft(), limits)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('rejected')
  })
})
