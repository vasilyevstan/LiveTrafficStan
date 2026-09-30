import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ORBITAL_BOOTSTRAP_PATH,
  ORBITAL_CATALOG_ID,
  ORBITAL_CATALOG_KEY,
  ORBITAL_CATALOG_PATH,
  ORBITAL_CATALOG_PUBLICATION_VERSION,
  ORBITAL_CATALOG_V1_BOOTSTRAP_PATH,
  ORBITAL_CATALOG_V1_KEY,
  ORBITAL_CATALOG_V1_ROLLBACK_BOOTSTRAP_PATH,
  ORBITAL_CATALOG_V2_ACCEPT,
  ORBITAL_MAX_RECORDS,
  ORBITAL_MAX_RETRY_AFTER_MS,
  ORBITAL_MAX_UPSTREAM_RECORDS,
  ORBITAL_REFRESH_INTERVAL_MS,
  ORBITAL_SOURCES,
  ORBITAL_UPSTREAM_USER_AGENT,
  createLegacyOrbitalCatalogSnapshot,
  createOrbitalCatalogPublication,
  createOrbitalCatalogSnapshot,
  handleOrbitalCatalog,
  refreshOrbitalCatalog,
  selectLegacyOrbitalCatalogCandidate,
  selectOrbitalCatalogCandidate,
  serializeLegacyOrbitalCatalogSnapshot,
  serializeOrbitalCatalogPublication,
  serializeOrbitalCatalogSnapshot,
  type LegacyOrbitalCatalogSnapshot,
  validateLegacyOrbitalCatalogSnapshot,
  validateOrbitalCatalogPublication,
  validateOrbitalCatalogSnapshot,
  type OrbitalCatalogSourceInput,
  type OrbitalCatalogFetch,
  type OrbitalKeyValueStore,
  type OrbitalRefreshCompletion,
  type OrbitalRefreshCoordinator,
  type OrbitalRefreshReservation,
  type OrbitalSourceGroup,
} from './orbitalCatalog.js'

const nowMs = Date.parse('2026-09-30T18:25:59.094Z')
const readLegacySnapshot = (version: 'v1' | 'v2') => {
  const text = readFileSync(
    new URL(
      `../public/orbital-data/${version}/visual-catalog.json`,
      import.meta.url,
    ),
    'utf8',
  )
  return {
    text,
    snapshot: JSON.parse(text) as LegacyOrbitalCatalogSnapshot,
  }
}
const retainedLegacyV1 = readLegacySnapshot('v1')
const retainedLegacyV2 = readLegacySnapshot('v2')
const legacySnapshot = retainedLegacyV2.snapshot

const v2Request = (init?: RequestInit) => {
  const headers = new Headers(init?.headers)
  headers.set('Accept', ORBITAL_CATALOG_V2_ACCEPT)
  return new Request(`https://app.example${ORBITAL_CATALOG_PATH}`, {
    ...init,
    headers,
  })
}

const gpRecord = (
  id: number,
  overrides: Record<string, unknown> = {},
) => ({
  OBJECT_NAME: `TEST SAT ${id}`,
  OBJECT_ID: '2026-001A',
  EPOCH: '2026-09-30T17:45:00.123456',
  MEAN_MOTION: 15.2,
  ECCENTRICITY: 0.001,
  INCLINATION: 51.6,
  RA_OF_ASC_NODE: 120,
  ARG_OF_PERICENTER: 30,
  MEAN_ANOMALY: 40,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: id,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 123,
  BSTAR: 0.0001,
  MEAN_MOTION_DOT: 0.00001,
  MEAN_MOTION_DDOT: 0,
  ...overrides,
})

const satcatRecord = (
  id: number,
  overrides: Record<string, unknown> = {},
) => ({
  NORAD_CAT_ID: id,
  OBJECT_NAME: `TEST SAT ${id}`,
  OBJECT_ID: '2026-001A',
  OBJECT_TYPE: 'PAY',
  ...overrides,
})

const sourceInputs = (
  customize?: (
    group: OrbitalSourceGroup,
    index: number,
  ) => Partial<OrbitalCatalogSourceInput>,
) =>
  ORBITAL_SOURCES.map((source, index) => {
    const id = 100_831 + index
    return {
      group: source.group,
      gpValue: [gpRecord(id)],
      satcatValue: [satcatRecord(id)],
      ...customize?.(source.group, index),
    }
  })

const snapshotAt = (
  timeMs = nowMs,
  customize?: Parameters<typeof sourceInputs>[0],
) => {
  const time = new Date(timeMs).toISOString()
  return createOrbitalCatalogSnapshot(
    sourceInputs(customize),
    time,
    time,
  )
}

const legacySnapshotAt = (
  timeMs = nowMs,
  gpOverrides: Record<string, unknown> = {},
  satcatOverrides: Record<string, unknown> = {},
) =>
  createLegacyOrbitalCatalogSnapshot(
    [gpRecord(100_831, gpOverrides)],
    [satcatRecord(100_831, satcatOverrides)],
    new Date(timeMs).toISOString(),
  )

const publicationAt = async (timeMs = nowMs) =>
  createOrbitalCatalogPublication(
    await legacySnapshotAt(timeMs),
    await snapshotAt(timeMs),
  )

class MemoryKv implements OrbitalKeyValueStore {
  readonly values = new Map<string, string>()
  readonly puts: Array<{ key: string; value: string }> = []
  failPut = false

  async get(key: string) {
    return this.values.get(key) ?? null
  }

  async put(key: string, value: string) {
    if (this.failPut) throw new Error('unavailable')
    this.puts.push({ key, value })
    this.values.set(key, value)
  }
}

class MemoryCoordinator implements OrbitalRefreshCoordinator {
  nextAllowedAtMs = 0
  blockedStatus: number | undefined
  activeAttemptId: string | undefined
  attemptSequence = 0
  failReserve = false
  failComplete = false

  async reserve(now: number): Promise<OrbitalRefreshReservation> {
    if (this.failReserve) throw new Error('unavailable')
    if (this.blockedStatus !== undefined) {
      return { kind: 'blocked', status: this.blockedStatus }
    }
    if (this.nextAllowedAtMs > now) {
      return {
        kind: 'not-due',
        nextAllowedAtMs: this.nextAllowedAtMs,
      }
    }
    this.attemptSequence += 1
    this.activeAttemptId = `${now}:${this.attemptSequence}`
    this.nextAllowedAtMs = Number.MAX_SAFE_INTEGER
    return { kind: 'admitted', attemptId: this.activeAttemptId }
  }

  async complete(
    attemptId: string,
    completion: OrbitalRefreshCompletion,
  ) {
    if (this.failComplete) throw new Error('unavailable')
    if (attemptId !== this.activeAttemptId) throw new Error('obsolete')
    this.activeAttemptId = undefined
    if (completion.kind === 'blocked') {
      this.blockedStatus = completion.status
      this.nextAllowedAtMs = Number.MAX_SAFE_INTEGER
      return
    }
    this.nextAllowedAtMs = completion.nextAllowedAtMs
  }
}

const jsonResponse = (value: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(value), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

const sourceResponse = (url: string) => {
  const sourceIndex = ORBITAL_SOURCES.findIndex(
    (source) =>
      source.gpSourceUrl === url || source.satcatSourceUrl === url,
  )
  if (sourceIndex < 0) throw new Error(`Unexpected URL: ${url}`)
  const source = ORBITAL_SOURCES[sourceIndex]
  const id = 100_831 + sourceIndex
  return url === source?.gpSourceUrl
    ? jsonResponse([gpRecord(id)])
    : jsonResponse([satcatRecord(id)])
}

describe('orbital catalog source contract v2', () => {
  it('publishes the exact ordered sources and canonical record order', async () => {
    const result = await snapshotAt()

    expect(result).toMatchObject({
      schemaVersion: 2,
      sourceContractVersion: 2,
      catalogId: ORBITAL_CATALOG_ID,
      retrievedAt: '2026-09-30T18:25:59.094Z',
      publishedAt: '2026-09-30T18:25:59.094Z',
      recordCount: 5,
    })
    expect(result.sources).toEqual(
      ORBITAL_SOURCES.map((source) => ({
        ...source,
        gpRecordCount: 1,
        satcatRecordCount: 1,
      })),
    )
    expect(result.records.map((record) => record.noradCatalogId)).toEqual([
      '100831',
      '100832',
      '100833',
      '100834',
      '100835',
    ])
    expect(result.records.map((record) => record.displayOrder)).toEqual([
      100_831,
      1_000_100_832,
      2_000_100_833,
      3_000_100_834,
      4_000_100_835,
    ])
    expect(await validateOrbitalCatalogSnapshot(result)).toEqual(result)
  })

  it('normalizes only outer identity whitespace and keeps the newest OMM epoch', async () => {
    const overlapId = 20_580
    const result = await snapshotAt(nowMs, (group, index) => {
      if (group === 'visual') {
        return {
          gpValue: [
            gpRecord(overlapId, {
              OBJECT_NAME: ' HST ',
              OBJECT_ID: ' 1990-037B ',
              EPOCH: '2026-09-30T16:00:00',
              MEAN_MOTION: 14,
            }),
          ],
          satcatValue: [
            satcatRecord(overlapId, {
              OBJECT_NAME: 'HST',
              OBJECT_ID: '1990-037B',
            }),
          ],
        }
      }
      if (group === 'science') {
        return {
          gpValue: [
            gpRecord(overlapId, {
              OBJECT_NAME: 'HST',
              OBJECT_ID: '1990-037B',
              EPOCH: '2026-09-30T17:00:00',
              MEAN_MOTION: 15,
            }),
          ],
          satcatValue: [
            satcatRecord(overlapId, {
              OBJECT_NAME: ' HST ',
              OBJECT_ID: ' 1990-037B ',
            }),
          ],
        }
      }
      const id = 100_831 + index
      return {
        gpValue: [gpRecord(id)],
        satcatValue: [satcatRecord(id)],
      }
    })

    const hst = result.records.find(
      (record) => record.noradCatalogId === String(overlapId),
    )
    expect(hst).toMatchObject({
      name: 'HST',
      internationalDesignator: '1990-037B',
      epoch: '2026-09-30T17:00:00.000000Z',
      meanMotion: 15,
      sourceGroups: ['visual', 'science'],
      displayOrder: overlapId,
    })
  })

  it('bundles the exact visual predecessor before cross-group winner substitution', async () => {
    const overlapId = 20_580
    const inputs = sourceInputs((group, index) => {
      if (group === 'visual') {
        return {
          gpValue: [
            gpRecord(overlapId, {
              OBJECT_NAME: 'HST',
              OBJECT_ID: '1990-037B',
              EPOCH: '2026-09-30T16:00:00.1',
              MEAN_MOTION: 14,
            }),
          ],
          satcatValue: [
            satcatRecord(overlapId, {
              OBJECT_NAME: 'HST',
              OBJECT_ID: '1990-037B',
            }),
          ],
        }
      }
      if (group === 'science') {
        return {
          gpValue: [
            gpRecord(overlapId, {
              OBJECT_NAME: 'HST',
              OBJECT_ID: '1990-037B',
              EPOCH: '2026-09-30T17:00:00.2',
              MEAN_MOTION: 15,
            }),
          ],
          satcatValue: [
            satcatRecord(overlapId, {
              OBJECT_NAME: 'HST',
              OBJECT_ID: '1990-037B',
            }),
          ],
        }
      }
      const id = 100_831 + index
      return {
        gpValue: [gpRecord(id)],
        satcatValue: [satcatRecord(id)],
      }
    })
    const visual = inputs[0]
    if (!visual) throw new Error('Missing visual source fixture')
    const time = new Date(nowMs).toISOString()
    const publication = createOrbitalCatalogPublication(
      await createLegacyOrbitalCatalogSnapshot(
        visual.gpValue,
        visual.satcatValue,
        time,
      ),
      await createOrbitalCatalogSnapshot(inputs, time, time),
    )

    expect(publication.schema1.records[0]).toMatchObject({
      noradCatalogId: String(overlapId),
      epoch: '2026-09-30T16:00:00.1Z',
      meanMotion: 14,
    })
    expect(
      publication.schema2.records.find(
        ({ noradCatalogId }) =>
          noradCatalogId === String(overlapId),
      ),
    ).toMatchObject({
      epoch: '2026-09-30T17:00:00.200000Z',
      meanMotion: 15,
      sourceGroups: ['visual', 'science'],
    })
    await expect(
      validateOrbitalCatalogPublication(publication),
    ).resolves.toEqual(publication)

    await expect(
      createLegacyOrbitalCatalogSnapshot(
        [
          gpRecord(overlapId, {
            OBJECT_NAME: ' HST ',
            OBJECT_ID: '1990-037B',
          }),
        ],
        [
          satcatRecord(overlapId, {
            OBJECT_NAME: 'HST',
            OBJECT_ID: '1990-037B',
          }),
        ],
        time,
      ),
    ).rejects.toThrow('object name')
  })

  it('validates every group independently before allowing extra SATCAT rows', async () => {
    await expect(
      snapshotAt(nowMs, (group, index) => {
        const id = 100_831 + index
        if (group !== 'stations') return {}
        return {
          gpValue: [gpRecord(id)],
          satcatValue: [
            satcatRecord(id),
            satcatRecord(id + 10),
            satcatRecord(id + 10),
          ],
        }
      }),
    ).rejects.toThrow('Duplicate SATCAT')

    await expect(
      snapshotAt(nowMs, (group, index) => {
        const id = 100_831 + index
        if (group !== 'weather') return {}
        return {
          gpValue: [gpRecord(id), gpRecord(id)],
          satcatValue: [satcatRecord(id)],
        }
      }),
    ).rejects.toThrow('Duplicate GP')

    await expect(
      snapshotAt(nowMs, (group, index) => {
        const id = 100_831 + index
        if (group !== 'gnss') return {}
        return {
          gpValue: [gpRecord(id)],
          satcatValue: [satcatRecord(id + 10)],
        }
      }),
    ).rejects.toThrow('Missing SATCAT')

    await expect(
      snapshotAt(nowMs, (group, index) => {
        const id = 100_831 + index
        if (group !== 'science') return {}
        return {
          gpValue: [gpRecord(id)],
          satcatValue: [
            satcatRecord(id),
            satcatRecord(id + 10, { OBJECT_TYPE: 'INVALID' }),
          ],
        }
      }),
    ).rejects.toThrow('object type')
  })

  it('rejects identity, type, and equal-epoch propagation conflicts', async () => {
    const overlapId = 25_544
    const conflict = (
      group: OrbitalSourceGroup,
      index: number,
      kind: 'identity' | 'type' | 'propagation',
    ) => {
      if (group === 'visual') {
        return {
          gpValue: [gpRecord(overlapId)],
          satcatValue: [satcatRecord(overlapId)],
        }
      }
      if (group === 'stations') {
        const name =
          kind === 'identity' ? 'TEST  SAT 25544' : `TEST SAT ${overlapId}`
        return {
          gpValue: [
            gpRecord(overlapId, {
              OBJECT_NAME: name,
              MEAN_MOTION: kind === 'propagation' ? 15.3 : 15.2,
            }),
          ],
          satcatValue: [
            satcatRecord(overlapId, {
              OBJECT_NAME: name,
              OBJECT_TYPE: kind === 'type' ? 'DEB' : 'PAY',
            }),
          ],
        }
      }
      const id = 100_831 + index
      return {
        gpValue: [gpRecord(id)],
        satcatValue: [satcatRecord(id)],
      }
    }

    await expect(
      snapshotAt(nowMs, (group, index) =>
        conflict(group, index, 'identity'),
      ),
    ).rejects.toThrow('identity conflict')
    await expect(
      snapshotAt(nowMs, (group, index) =>
        conflict(group, index, 'type'),
      ),
    ).rejects.toThrow('type conflict')
    await expect(
      snapshotAt(nowMs, (group, index) =>
        conflict(group, index, 'propagation'),
      ),
    ).rejects.toThrow('Equal-epoch')
  })

  it('rejects a repeated older-epoch conflict hidden behind a newer winner', async () => {
    const overlapId = 25_544
    await expect(
      snapshotAt(nowMs, (group, index) => {
        if (group === 'visual') {
          return {
            gpValue: [
              gpRecord(overlapId, {
                EPOCH: '2026-09-30T16:00:00',
                MEAN_MOTION: 14,
              }),
            ],
            satcatValue: [satcatRecord(overlapId)],
          }
        }
        if (group === 'stations') {
          return {
            gpValue: [
              gpRecord(overlapId, {
                EPOCH: '2026-09-30T17:00:00',
                MEAN_MOTION: 15,
              }),
            ],
            satcatValue: [satcatRecord(overlapId)],
          }
        }
        if (group === 'weather') {
          return {
            gpValue: [
              gpRecord(overlapId, {
                EPOCH: '2026-09-30T16:00:00',
                MEAN_MOTION: 14.5,
              }),
            ],
            satcatValue: [satcatRecord(overlapId)],
          }
        }
        const id = 100_831 + index
        return {
          gpValue: [gpRecord(id)],
          satcatValue: [satcatRecord(id)],
        }
      }),
    ).rejects.toThrow('Equal-epoch orbital propagation conflict')
  })

  it('accepts agreeing older epochs while retaining the newer winner', async () => {
    const overlapId = 25_544
    const result = await snapshotAt(nowMs, (group, index) => {
      if (group === 'visual' || group === 'weather') {
        return {
          gpValue: [
            gpRecord(overlapId, {
              EPOCH: '2026-09-30T16:00:00',
              MEAN_MOTION: 14,
            }),
          ],
          satcatValue: [satcatRecord(overlapId)],
        }
      }
      if (group === 'stations') {
        return {
          gpValue: [
            gpRecord(overlapId, {
              EPOCH: '2026-09-30T17:00:00',
              MEAN_MOTION: 15,
            }),
          ],
          satcatValue: [satcatRecord(overlapId)],
        }
      }
      const id = 100_831 + index
      return {
        gpValue: [gpRecord(id)],
        satcatValue: [satcatRecord(id)],
      }
    })

    expect(
      result.records.find(
        (record) => record.noradCatalogId === String(overlapId),
      ),
    ).toMatchObject({
      epoch: '2026-09-30T17:00:00.000000Z',
      meanMotion: 15,
      sourceGroups: ['visual', 'stations', 'weather'],
    })
  })

  it('rejects source, ordering, digest, count, and record-cap changes', async () => {
    const valid = await snapshotAt()
    await expect(
      validateOrbitalCatalogSnapshot({
        ...valid,
        catalogId: 'other',
      }),
    ).rejects.toThrow('catalog ID')
    await expect(
      validateOrbitalCatalogSnapshot({
        ...valid,
        sources: [...valid.sources].reverse(),
      }),
    ).rejects.toThrow('source')
    await expect(
      validateOrbitalCatalogSnapshot({
        ...valid,
        records: [...valid.records].reverse(),
      }),
    ).rejects.toThrow()
    await expect(
      validateOrbitalCatalogSnapshot({
        ...valid,
        records: [
          { ...valid.records[0], name: 'CHANGED' },
          ...valid.records.slice(1),
        ],
      }),
    ).rejects.toThrow('digest')
    await expect(
      validateOrbitalCatalogSnapshot({
        ...valid,
        sources: valid.sources.map((source, index) =>
          index === 0
            ? {
                ...source,
                gpRecordCount: source.gpRecordCount + 1,
                satcatRecordCount: source.satcatRecordCount + 1,
              }
            : source,
        ),
      }),
    ).rejects.toThrow('membership')

    const tooManySourceRecords = Array.from(
      { length: ORBITAL_MAX_UPSTREAM_RECORDS + 1 },
      (_, index) => {
        const id = index + 1
        return gpRecord(id)
      },
    )
    const tooManySourceSatcat = tooManySourceRecords.map((row) =>
      satcatRecord(Number(row.NORAD_CAT_ID)),
    )
    await expect(
      snapshotAt(nowMs, (group) =>
        group === 'visual'
          ? {
              gpValue: tooManySourceRecords,
              satcatValue: tooManySourceSatcat,
            }
          : {},
      ),
    ).rejects.toThrow('GP record count')

    const tooManyPublished = Array.from(
      {
        length:
          ORBITAL_MAX_RECORDS - ORBITAL_SOURCES.length + 2,
      },
      (_, index) => gpRecord(index + 1),
    )
    const tooManyPublishedSatcat = tooManyPublished.map((row) =>
      satcatRecord(Number(row.NORAD_CAT_ID)),
    )
    await expect(
      snapshotAt(nowMs, (group) =>
        group === 'visual'
          ? {
              gpValue: tooManyPublished,
              satcatValue: tooManyPublishedSatcat,
            }
          : {},
      ),
    ).rejects.toThrow('published orbital record count')
  })
})

describe('scheduled curated orbital refresh', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('fetches the exact fixed sequence strictly serially and writes one atomic publication', async () => {
    const store = new MemoryKv()
    store.values.set(ORBITAL_CATALOG_V1_KEY, 'retained-v1')
    const coordinator = new MemoryCoordinator()
    const calls: string[] = []
    let active = 0
    let maximumActive = 0
    const fetchImpl = vi.fn(
      async (
        input: string | URL | Request,
        _init?: RequestInit,
      ) => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        calls.push(String(input))
        await Promise.resolve()
        const response = sourceResponse(String(input))
        active -= 1
        return response
      },
    )

    const result = await refreshOrbitalCatalog(
      {
        ASSETS: { fetch: vi.fn() },
        ORBITAL_CATALOG: store,
        ORBITAL_CATALOG_ENABLED: 'true',
      },
      coordinator,
      { fetchImpl, nowMs },
    )

    expect(result).toMatchObject({
      kind: 'published',
      recordCount: 5,
    })
    expect(calls).toEqual(
      ORBITAL_SOURCES.flatMap((source) => [
        source.gpSourceUrl,
        source.satcatSourceUrl,
      ]),
    )
    expect(maximumActive).toBe(1)
    expect(fetchImpl).toHaveBeenCalledTimes(10)
    for (const call of fetchImpl.mock.calls) {
      expect(call[1]).toMatchObject({
        method: 'GET',
        cache: 'no-store',
        redirect: 'manual',
        headers: {
          Accept: 'application/json',
          'User-Agent': ORBITAL_UPSTREAM_USER_AGENT,
        },
      })
      expect(new Headers(call[1]?.headers).has('cookie')).toBe(false)
      expect(new Headers(call[1]?.headers).has('authorization')).toBe(
        false,
      )
    }
    expect(store.puts).toHaveLength(1)
    expect(store.puts[0]?.key).toBe(ORBITAL_CATALOG_KEY)
    expect(store.values.get(ORBITAL_CATALOG_V1_KEY)).toBe('retained-v1')
    const publication = await validateOrbitalCatalogPublication(
      JSON.parse(store.puts[0]?.value ?? 'null'),
    )
    expect(publication).toMatchObject({
      publicationVersion: ORBITAL_CATALOG_PUBLICATION_VERSION,
      schema1: {
        recordCount: 1,
        retrievedAt: '2026-09-30T18:25:59.094Z',
      },
      schema2: {
        recordCount: 5,
        retrievedAt: '2026-09-30T18:25:59.094Z',
      },
    })
    expect(store.puts.some(({ key }) => key === ORBITAL_CATALOG_V1_KEY)).toBe(
      false,
    )

    await expect(
      refreshOrbitalCatalog(
        {
          ASSETS: { fetch: vi.fn() },
          ORBITAL_CATALOG: store,
          ORBITAL_CATALOG_ENABLED: 'true',
        },
        coordinator,
        { fetchImpl, nowMs: nowMs + 1_000 },
      ),
    ).resolves.toEqual({
      kind: 'not-due',
      nextAllowedAtMs: nowMs + ORBITAL_REFRESH_INTERVAL_MS,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(10)
  })

  it('keeps schema 1 current across successive schema 2 refreshes without another fetch or write target', async () => {
    const store = new MemoryKv()
    store.values.set(ORBITAL_CATALOG_V1_KEY, retainedLegacyV1.text)
    const coordinator = new MemoryCoordinator()
    const fetchImpl = vi.fn(async (input) =>
      sourceResponse(String(input)),
    )
    const bootstrapV2 = await snapshotAt(nowMs - 60_000)
    const assetsFetch = vi.fn(async (request: Request) => {
      const pathname = new URL(request.url).pathname
      if (pathname === ORBITAL_BOOTSTRAP_PATH) {
        return jsonResponse(bootstrapV2)
      }
      if (pathname === ORBITAL_CATALOG_V1_BOOTSTRAP_PATH) {
        return jsonResponse(retainedLegacyV2.snapshot)
      }
      if (
        pathname ===
        ORBITAL_CATALOG_V1_ROLLBACK_BOOTSTRAP_PATH
      ) {
        return jsonResponse(retainedLegacyV1.snapshot)
      }
      throw new Error(`Unexpected asset path: ${pathname}`)
    })
    const environment = {
      ASSETS: { fetch: assetsFetch },
      ORBITAL_CATALOG: store,
      ORBITAL_CATALOG_ENABLED: 'true',
    }
    const refreshTimes = [
      nowMs,
      nowMs + ORBITAL_REFRESH_INTERVAL_MS,
    ]

    for (const refreshTime of refreshTimes) {
      await expect(
        refreshOrbitalCatalog(
          environment,
          coordinator,
          { fetchImpl, nowMs: refreshTime },
        ),
      ).resolves.toMatchObject({
        kind: 'published',
        retrievedAt: new Date(refreshTime).toISOString(),
      })
      const publication = await validateOrbitalCatalogPublication(
        JSON.parse(
          store.values.get(ORBITAL_CATALOG_KEY) ?? 'null',
        ),
      )
      expect(publication.schema1.retrievedAt).toBe(
        publication.schema2.retrievedAt,
      )
      expect(publication.schema2.retrievedAt).toBe(
        new Date(refreshTime).toISOString(),
      )
      const [defaultResponse, v2Response] = await Promise.all([
        handleOrbitalCatalog(
          new Request(
            `https://app.example${ORBITAL_CATALOG_PATH}`,
          ),
          environment,
          { nowMs: refreshTime },
        ),
        handleOrbitalCatalog(v2Request(), environment, {
          nowMs: refreshTime,
        }),
      ])
      await expect(defaultResponse.json()).resolves.toEqual(
        publication.schema1,
      )
      await expect(v2Response.json()).resolves.toEqual(
        publication.schema2,
      )
    }

    expect(fetchImpl).toHaveBeenCalledTimes(20)
    expect(store.puts).toHaveLength(2)
    expect(
      new Set(store.puts.map(({ key }) => key)),
    ).toEqual(new Set([ORBITAL_CATALOG_KEY]))
    expect(store.values.get(ORBITAL_CATALOG_V1_KEY)).toBe(
      retainedLegacyV1.text,
    )
  })

  it('preserves the Workers runtime receiver for all default fetches', async () => {
    const store = new MemoryKv()
    const coordinator = new MemoryCoordinator()
    const runtimeFetch = vi.fn(function (
      this: typeof globalThis,
      input: string | URL | Request,
    ) {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(sourceResponse(String(input)))
    })
    vi.stubGlobal('fetch', runtimeFetch)

    await expect(
      refreshOrbitalCatalog(
        {
          ASSETS: { fetch: vi.fn() },
          ORBITAL_CATALOG: store,
          ORBITAL_CATALOG_ENABLED: 'true',
        },
        coordinator,
        { nowMs },
      ),
    ).resolves.toMatchObject({ kind: 'published', recordCount: 5 })
    expect(runtimeFetch).toHaveBeenCalledTimes(10)
    expect(runtimeFetch.mock.contexts).toEqual(
      Array.from({ length: 10 }, () => globalThis),
    )
  })

  it('enforces response, aggregate, total, and per-response deadlines', async () => {
    const prior = await snapshotAt(nowMs - 1_000)
    const run = (
      options: Parameters<typeof refreshOrbitalCatalog>[2],
      fetchImpl: OrbitalCatalogFetch,
    ) => {
      const store = new MemoryKv()
      store.values.set(
        ORBITAL_CATALOG_KEY,
        serializeOrbitalCatalogSnapshot(prior),
      )
      return {
        store,
        outcome: refreshOrbitalCatalog(
          {
            ASSETS: { fetch: vi.fn() },
            ORBITAL_CATALOG: store,
            ORBITAL_CATALOG_ENABLED: 'true',
          },
          new MemoryCoordinator(),
          { ...options, fetchImpl },
        ),
      }
    }

    const oversizedFetch = vi.fn(async () =>
      jsonResponse([{ padding: 'x'.repeat(100) }]),
    )
    const oversized = run(
      { nowMs, maximumUpstreamBytes: 20 },
      oversizedFetch,
    )
    await expect(oversized.outcome).resolves.toMatchObject({
      kind: 'failed',
      reason: expect.stringContaining('too large'),
    })
    expect(oversized.store.values.get(ORBITAL_CATALOG_KEY)).toBe(
      serializeOrbitalCatalogSnapshot(prior),
    )

    const tooManyRecordsFetch = vi.fn(async () =>
      jsonResponse(
        Array.from(
          { length: ORBITAL_MAX_UPSTREAM_RECORDS + 1 },
          () => ({}),
        ),
      ),
    )
    const tooManyRecords = run({ nowMs }, tooManyRecordsFetch)
    await expect(tooManyRecords.outcome).resolves.toMatchObject({
      kind: 'failed',
      reason: expect.stringContaining('record count'),
    })
    expect(tooManyRecordsFetch).toHaveBeenCalledTimes(1)
    expect(
      tooManyRecords.store.values.get(ORBITAL_CATALOG_KEY),
    ).toBe(serializeOrbitalCatalogSnapshot(prior))

    const aggregateFetch = vi.fn(async (input) =>
      sourceResponse(String(input)),
    )
    const aggregate = run(
      { nowMs, maximumAggregateBytes: 100 },
      aggregateFetch,
    )
    await expect(aggregate.outcome).resolves.toMatchObject({
      kind: 'failed',
      reason: expect.stringContaining('aggregate byte'),
    })
    expect(aggregateFetch.mock.calls.length).toBeLessThan(10)

    const totalFetch = vi.fn(async (input) =>
      sourceResponse(String(input)),
    )
    const monotonicNow = vi
      .fn<() => number>()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(91)
      .mockReturnValueOnce(91)
    const total = run(
      {
        nowMs,
        totalTimeoutMs: 90,
        monotonicNow,
      },
      totalFetch,
    )
    await expect(total.outcome).resolves.toMatchObject({
      kind: 'failed',
      reason: expect.stringContaining('total deadline'),
    })
    expect(totalFetch).toHaveBeenCalledTimes(2)

    let validationClockReads = 0
    const validationTimeoutFetch = vi.fn(async (input) =>
      sourceResponse(String(input)),
    )
    const validationTimeout = run(
      {
        nowMs,
        totalTimeoutMs: 90,
        monotonicNow: () =>
          validationClockReads++ === 32 ? 91 : 0,
      },
      validationTimeoutFetch,
    )
    await expect(validationTimeout.outcome).resolves.toMatchObject({
      kind: 'failed',
      reason: expect.stringContaining('total deadline'),
    })
    expect(validationTimeoutFetch).toHaveBeenCalledTimes(10)

    vi.useFakeTimers()
    const timeoutFetch = vi.fn(
      async (
        _input: string | URL | Request,
        init?: RequestInit,
      ) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          )
        }),
    )
    const timeout = run({ nowMs, timeoutMs: 10 }, timeoutFetch)
    await vi.advanceTimersByTimeAsync(10)
    await expect(timeout.outcome).resolves.toMatchObject({
      kind: 'failed',
      reason: expect.stringContaining('timed out'),
    })
    expect(timeoutFetch).toHaveBeenCalledTimes(1)
  })

  it('stops at the first failed position and preserves the prior snapshot', async () => {
    const prior = await snapshotAt(nowMs - 1_000)
    for (const response of [
      jsonResponse([], { status: 206 }),
      new Response(null, {
        status: 302,
        headers: { Location: 'https://example.invalid/' },
      }),
      new Response('not-json', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/jsonp' },
      }),
    ]) {
      const store = new MemoryKv()
      store.values.set(
        ORBITAL_CATALOG_KEY,
        serializeOrbitalCatalogSnapshot(prior),
      )
      const fetchImpl = vi.fn(async () => response.clone())
      const result = await refreshOrbitalCatalog(
        {
          ASSETS: { fetch: vi.fn() },
          ORBITAL_CATALOG: store,
          ORBITAL_CATALOG_ENABLED: 'true',
        },
        new MemoryCoordinator(),
        { fetchImpl, nowMs },
      )
      expect(result.kind).toBe(
        response.status === 302 ? 'blocked' : 'failed',
      )
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(store.values.get(ORBITAL_CATALOG_KEY)).toBe(
        serializeOrbitalCatalogSnapshot(prior),
      )
    }
  })

  it('preserves terminal, Retry-After, coordinator, and failed-KV behavior', async () => {
    const environment = (store: MemoryKv) => ({
      ASSETS: { fetch: vi.fn() },
      ORBITAL_CATALOG: store,
      ORBITAL_CATALOG_ENABLED: 'true',
    })

    const blockedStore = new MemoryKv()
    const blockedCoordinator = new MemoryCoordinator()
    const blockedFetch = vi.fn(async () =>
      new Response(null, { status: 403 }),
    )
    await expect(
      refreshOrbitalCatalog(
        environment(blockedStore),
        blockedCoordinator,
        { fetchImpl: blockedFetch, nowMs },
      ),
    ).resolves.toEqual({ kind: 'blocked', status: 403 })
    await expect(
      refreshOrbitalCatalog(
        environment(blockedStore),
        blockedCoordinator,
        {
          fetchImpl: blockedFetch,
          nowMs: nowMs + ORBITAL_REFRESH_INTERVAL_MS,
        },
      ),
    ).resolves.toEqual({ kind: 'blocked', status: 403 })
    expect(blockedFetch).toHaveBeenCalledTimes(1)

    const retryCoordinator = new MemoryCoordinator()
    await expect(
      refreshOrbitalCatalog(
        environment(new MemoryKv()),
        retryCoordinator,
        {
          fetchImpl: vi.fn(async () =>
            new Response(null, {
              status: 429,
              headers: { 'Retry-After': '10800' },
            }),
          ),
          nowMs,
          monotonicNow: () => 0,
        },
      ),
    ).resolves.toEqual({
      kind: 'rate-limited',
      nextAllowedAtMs: nowMs + 10_800_000,
    })

    await expect(
      refreshOrbitalCatalog(
        environment(new MemoryKv()),
        new MemoryCoordinator(),
        {
          fetchImpl: vi.fn(async () =>
            new Response(null, {
              status: 429,
              headers: {
                'Retry-After': String(
                  ORBITAL_MAX_RETRY_AFTER_MS / 1_000 + 1,
                ),
              },
            }),
          ),
          nowMs,
          monotonicNow: () => 0,
        },
      ),
    ).resolves.toEqual({ kind: 'blocked', status: 429 })

    const failedReserve = new MemoryCoordinator()
    failedReserve.failReserve = true
    const noFetch = vi.fn()
    await expect(
      refreshOrbitalCatalog(
        environment(new MemoryKv()),
        failedReserve,
        { fetchImpl: noFetch, nowMs },
      ),
    ).resolves.toEqual({
      kind: 'unavailable',
      reason: 'Could not persist the provider start gate',
    })
    expect(noFetch).not.toHaveBeenCalled()

    const priorPublication = await publicationAt(nowMs - 1_000)
    const priorPublicationText =
      serializeOrbitalCatalogPublication(priorPublication)
    const failedStore = new MemoryKv()
    failedStore.values.set(
      ORBITAL_CATALOG_KEY,
      priorPublicationText,
    )
    failedStore.failPut = true
    await expect(
      refreshOrbitalCatalog(
        environment(failedStore),
        new MemoryCoordinator(),
        {
          fetchImpl: vi.fn(async (input) =>
            sourceResponse(String(input)),
          ),
          nowMs,
        },
      ),
    ).resolves.toEqual({
      kind: 'failed',
      reason: 'Orbital snapshot publication failed',
    })
    expect(failedStore.puts).toHaveLength(0)
    expect(failedStore.values.get(ORBITAL_CATALOG_KEY)).toBe(
      priorPublicationText,
    )

    const assetsFetch = vi.fn(async (request: Request) => {
      const pathname = new URL(request.url).pathname
      if (pathname === ORBITAL_BOOTSTRAP_PATH) {
        return jsonResponse(priorPublication.schema2)
      }
      if (
        pathname === ORBITAL_CATALOG_V1_BOOTSTRAP_PATH ||
        pathname ===
          ORBITAL_CATALOG_V1_ROLLBACK_BOOTSTRAP_PATH
      ) {
        return jsonResponse(priorPublication.schema1)
      }
      throw new Error(`Unexpected asset path: ${pathname}`)
    })
    const failedEnvironment = {
      ASSETS: { fetch: assetsFetch },
      ORBITAL_CATALOG: failedStore,
      ORBITAL_CATALOG_ENABLED: 'true',
    }
    await expect(
      (
        await handleOrbitalCatalog(
          new Request(
            `https://app.example${ORBITAL_CATALOG_PATH}`,
          ),
          failedEnvironment,
          { nowMs },
        )
      ).json(),
    ).resolves.toEqual(priorPublication.schema1)
    await expect(
      (
        await handleOrbitalCatalog(
          v2Request(),
          failedEnvironment,
          { nowMs },
        )
      ).json(),
    ).resolves.toEqual(priorPublication.schema2)
  })

  it('anchors late Retry-After guidance to response receipt time', async () => {
    const environment = () => ({
      ASSETS: { fetch: vi.fn() },
      ORBITAL_CATALOG: new MemoryKv(),
      ORBITAL_CATALOG_ENABLED: 'true',
    })
    const lateResponse = (response: () => Response) => {
      let elapsedMs = 0
      let requestCount = 0
      const fetchImpl = vi.fn(async (input) => {
        requestCount += 1
        elapsedMs += requestCount === 9 ? 4_000 : 7_000
        return requestCount === 9
          ? response()
          : sourceResponse(String(input))
      })
      return {
        fetchImpl,
        monotonicNow: () => elapsedMs,
      }
    }

    const lateRateLimit = lateResponse(
      () =>
        new Response(null, {
          status: 429,
          headers: { 'Retry-After': '10800' },
        }),
    )
    await expect(
      refreshOrbitalCatalog(
        environment(),
        new MemoryCoordinator(),
        {
          ...lateRateLimit,
          nowMs,
        },
      ),
    ).resolves.toEqual({
      kind: 'rate-limited',
      nextAllowedAtMs: nowMs + 60_000 + 10_800_000,
    })
    expect(lateRateLimit.fetchImpl).toHaveBeenCalledTimes(9)

    const shortRateLimit = lateResponse(
      () =>
        new Response(null, {
          status: 429,
          headers: { 'Retry-After': '60' },
        }),
    )
    await expect(
      refreshOrbitalCatalog(
        environment(),
        new MemoryCoordinator(),
        {
          ...shortRateLimit,
          nowMs,
        },
      ),
    ).resolves.toEqual({
      kind: 'rate-limited',
      nextAllowedAtMs: nowMs + ORBITAL_REFRESH_INTERVAL_MS,
    })

    const retryAfter = new Date(
      nowMs + ORBITAL_MAX_RETRY_AFTER_MS + 30_000,
    ).toUTCString()
    const retryAtMs = Date.parse(retryAfter)
    const lateUnavailable = lateResponse(
      () =>
        new Response(null, {
          status: 503,
          headers: { 'Retry-After': retryAfter },
        }),
    )
    await expect(
      refreshOrbitalCatalog(
        environment(),
        new MemoryCoordinator(),
        {
          ...lateUnavailable,
          nowMs,
        },
      ),
    ).resolves.toEqual({
      kind: 'deferred',
      status: 503,
      nextAllowedAtMs: retryAtMs,
    })
    expect(lateUnavailable.fetchImpl).toHaveBeenCalledTimes(9)
  })
})

describe('same-origin orbital catalog route', () => {
  it('retains both predecessor snapshot bodies and digest validators', async () => {
    for (const retained of [
      retainedLegacyV1,
      retainedLegacyV2,
    ]) {
      const snapshot = await validateLegacyOrbitalCatalogSnapshot(
        retained.snapshot,
      )
      expect(serializeLegacyOrbitalCatalogSnapshot(snapshot)).toBe(
        retained.text,
      )
      expect(snapshot.sha256).toBe(retained.snapshot.sha256)
    }
  })

  it('retains default schema 1 and negotiates schema 2 with separate validators', async () => {
    const current = await snapshotAt()
    const store = new MemoryKv()
    store.values.set(
      ORBITAL_CATALOG_V1_KEY,
      `${JSON.stringify(legacySnapshot)}\n`,
    )
    store.values.set(
      ORBITAL_CATALOG_KEY,
      serializeOrbitalCatalogSnapshot(current),
    )
    const assetsFetch = vi.fn(async (request: Request) => {
      const pathname = new URL(request.url).pathname
      if (pathname === ORBITAL_CATALOG_V1_BOOTSTRAP_PATH) {
        return jsonResponse(legacySnapshot)
      }
      if (pathname === ORBITAL_BOOTSTRAP_PATH) {
        return jsonResponse(current)
      }
      throw new Error(`Unexpected asset path: ${pathname}`)
    })
    const environment = {
      ASSETS: { fetch: assetsFetch },
      ORBITAL_CATALOG: store,
      ORBITAL_CATALOG_ENABLED: 'true',
    }

    const defaultResponse = await handleOrbitalCatalog(
      new Request(`https://app.example${ORBITAL_CATALOG_PATH}`),
      environment,
      { nowMs },
    )
    expect(defaultResponse.status).toBe(200)
    expect(defaultResponse.headers.get('vary')).toBe('Accept')
    expect(defaultResponse.headers.get('x-livetrafficstan-orbital-schema')).toBe(
      '1',
    )
    expect(defaultResponse.headers.get('x-livetrafficstan-orbital-source')).toBe(
      'kv',
    )
    expect(await defaultResponse.json()).toEqual(legacySnapshot)
    const v1Etag = defaultResponse.headers.get('etag')

    const predecessorResponse = await handleOrbitalCatalog(
      new Request(`https://app.example${ORBITAL_CATALOG_PATH}`, {
        headers: { Accept: 'application/json' },
      }),
      environment,
      { nowMs },
    )
    expect(
      predecessorResponse.headers.get(
        'x-livetrafficstan-orbital-schema',
      ),
    ).toBe('1')

    const v2Response = await handleOrbitalCatalog(
      v2Request(),
      environment,
      { nowMs },
    )
    expect(v2Response.status).toBe(200)
    expect(v2Response.headers.get('vary')).toBe('Accept')
    expect(v2Response.headers.get('x-livetrafficstan-orbital-schema')).toBe(
      '2',
    )
    expect(await v2Response.json()).toEqual(current)
    const v2Etag = v2Response.headers.get('etag')
    expect(v2Etag).not.toBe(v1Etag)

    const v1Conditional = await handleOrbitalCatalog(
      new Request(`https://app.example${ORBITAL_CATALOG_PATH}`, {
        headers: { 'If-None-Match': v1Etag ?? '' },
      }),
      environment,
      { nowMs },
    )
    expect(v1Conditional.status).toBe(304)

    const v2Conditional = await handleOrbitalCatalog(
      v2Request({
        headers: { 'If-None-Match': v2Etag ?? '' },
      }),
      environment,
      { nowMs },
    )
    expect(v2Conditional.status).toBe(304)

    const crossRepresentation = await handleOrbitalCatalog(
      v2Request({
        headers: { 'If-None-Match': v1Etag ?? '' },
      }),
      environment,
      { nowMs },
    )
    expect(crossRepresentation.status).toBe(200)
  })

  it('serves both bundled representations with independent conditional validators', async () => {
    const publication = await publicationAt()
    const bootstrapV2 = await snapshotAt(nowMs - 60_000)
    const store = new MemoryKv()
    store.values.set(
      ORBITAL_CATALOG_KEY,
      serializeOrbitalCatalogPublication(publication),
    )
    store.values.set(
      ORBITAL_CATALOG_V1_KEY,
      retainedLegacyV1.text,
    )
    const assetsFetch = vi.fn(async (request: Request) => {
      const pathname = new URL(request.url).pathname
      if (pathname === ORBITAL_BOOTSTRAP_PATH) {
        return jsonResponse(bootstrapV2)
      }
      if (pathname === ORBITAL_CATALOG_V1_BOOTSTRAP_PATH) {
        return jsonResponse(retainedLegacyV2.snapshot)
      }
      if (
        pathname ===
        ORBITAL_CATALOG_V1_ROLLBACK_BOOTSTRAP_PATH
      ) {
        return jsonResponse(retainedLegacyV1.snapshot)
      }
      throw new Error(`Unexpected asset path: ${pathname}`)
    })
    const environment = {
      ASSETS: { fetch: assetsFetch },
      ORBITAL_CATALOG: store,
      ORBITAL_CATALOG_ENABLED: 'true',
    }

    const [defaultResponse, v2Response] = await Promise.all([
      handleOrbitalCatalog(
        new Request(
          `https://app.example${ORBITAL_CATALOG_PATH}`,
        ),
        environment,
        { nowMs },
      ),
      handleOrbitalCatalog(v2Request(), environment, { nowMs }),
    ])
    expect(await defaultResponse.json()).toEqual(
      publication.schema1,
    )
    expect(await v2Response.json()).toEqual(publication.schema2)
    const defaultEtag = defaultResponse.headers.get('etag') ?? ''
    const v2Etag = v2Response.headers.get('etag') ?? ''
    expect(defaultEtag).not.toBe(v2Etag)

    const [defaultConditional, v2Conditional] =
      await Promise.all([
        handleOrbitalCatalog(
          new Request(
            `https://app.example${ORBITAL_CATALOG_PATH}`,
            {
              headers: { 'If-None-Match': defaultEtag },
            },
          ),
          environment,
          { nowMs },
        ),
        handleOrbitalCatalog(
          v2Request({
            headers: { 'If-None-Match': v2Etag },
          }),
          environment,
          { nowMs },
        ),
      ])
    expect(defaultConditional.status).toBe(304)
    expect(v2Conditional.status).toBe(304)
    expect(defaultConditional.headers.get('vary')).toBe('Accept')
    expect(v2Conditional.headers.get('vary')).toBe('Accept')
  })

  it('selects the newest legacy candidate and fails closed on a newest equal-time conflict', async () => {
    const older = await legacySnapshotAt(nowMs - 1_000)
    const newer = await legacySnapshotAt(nowMs)
    expect(
      selectLegacyOrbitalCatalogCandidate([
        { snapshot: older, source: 'bootstrap' },
        { snapshot: newer, source: 'kv' },
      ]),
    ).toEqual({ snapshot: newer, source: 'kv' })

    const conflicting = await legacySnapshotAt(nowMs, {
      EPOCH: '2026-09-30T18:00:00.123456',
    })
    expect(() =>
      selectLegacyOrbitalCatalogCandidate([
        { snapshot: newer, source: 'kv' },
        { snapshot: conflicting, source: 'bootstrap' },
      ]),
    ).toThrow('Equal-time')

    const bundledOlder = await publicationAt(nowMs - 2_000)
    const retainedMiddle = await legacySnapshotAt(nowMs - 1_000)
    const storeWithOlderCandidates = new MemoryKv()
    storeWithOlderCandidates.values.set(
      ORBITAL_CATALOG_KEY,
      serializeOrbitalCatalogPublication(bundledOlder),
    )
    storeWithOlderCandidates.values.set(
      ORBITAL_CATALOG_V1_KEY,
      serializeLegacyOrbitalCatalogSnapshot(retainedMiddle),
    )
    const newestBootstrapResponse = await handleOrbitalCatalog(
      new Request(
        `https://app.example${ORBITAL_CATALOG_PATH}`,
      ),
      {
        ASSETS: {
          fetch: vi.fn(async (request: Request) => {
            const pathname = new URL(request.url).pathname
            if (
              pathname === ORBITAL_CATALOG_V1_BOOTSTRAP_PATH
            ) {
              return jsonResponse(newer)
            }
            if (
              pathname ===
              ORBITAL_CATALOG_V1_ROLLBACK_BOOTSTRAP_PATH
            ) {
              return jsonResponse(older)
            }
            throw new Error(`Unexpected asset path: ${pathname}`)
          }),
        },
        ORBITAL_CATALOG: storeWithOlderCandidates,
        ORBITAL_CATALOG_ENABLED: 'true',
      },
      { nowMs },
    )
    expect(
      newestBootstrapResponse.headers.get(
        'x-livetrafficstan-orbital-source',
      ),
    ).toBe('bootstrap')
    await expect(
      newestBootstrapResponse.json(),
    ).resolves.toEqual(newer)

    const publication = createOrbitalCatalogPublication(
      newer,
      await snapshotAt(nowMs),
    )
    const store = new MemoryKv()
    store.values.set(
      ORBITAL_CATALOG_KEY,
      serializeOrbitalCatalogPublication(publication),
    )
    store.values.set(
      ORBITAL_CATALOG_V1_KEY,
      serializeLegacyOrbitalCatalogSnapshot(conflicting),
    )
    const response = await handleOrbitalCatalog(
      new Request(
        `https://app.example${ORBITAL_CATALOG_PATH}`,
      ),
      {
        ASSETS: {
          fetch: vi.fn(async () =>
            new Response(null, { status: 404 }),
          ),
        },
        ORBITAL_CATALOG: store,
        ORBITAL_CATALOG_ENABLED: 'true',
      },
      { nowMs },
    )
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('300')
  })

  it('keeps the literal route and selects the newer compatible candidate', async () => {
    expect(ORBITAL_CATALOG_PATH).toBe('/api/orbits/catalog')
    const olderKv = await snapshotAt(nowMs - 10_000)
    const newerBootstrap = await snapshotAt(nowMs)
    const store = new MemoryKv()
    store.values.set(
      ORBITAL_CATALOG_KEY,
      serializeOrbitalCatalogSnapshot(olderKv),
    )
    const assetsFetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe(ORBITAL_BOOTSTRAP_PATH)
      return jsonResponse(newerBootstrap)
    })

    const response = await handleOrbitalCatalog(
      v2Request(),
      {
        ASSETS: { fetch: assetsFetch },
        ORBITAL_CATALOG: store,
        ORBITAL_CATALOG_ENABLED: 'true',
      },
      { nowMs },
    )

    expect(response.status).toBe(200)
    expect(
      response.headers.get('x-livetrafficstan-orbital-source'),
    ).toBe('bootstrap')
    expect(await response.json()).toEqual(newerBootstrap)
    expect(assetsFetch).toHaveBeenCalledTimes(1)

    const newerKv = await snapshotAt(nowMs + 10_000)
    store.values.set(
      ORBITAL_CATALOG_KEY,
      serializeOrbitalCatalogSnapshot(newerKv),
    )
    const kvResponse = await handleOrbitalCatalog(
      v2Request(),
      {
        ASSETS: { fetch: assetsFetch },
        ORBITAL_CATALOG: store,
        ORBITAL_CATALOG_ENABLED: 'true',
      },
      { nowMs },
    )
    expect(
      kvResponse.headers.get('x-livetrafficstan-orbital-source'),
    ).toBe('kv')
    expect(await kvResponse.json()).toEqual(newerKv)
  })

  it('fails closed on equal-time differing digests', async () => {
    const kv = await snapshotAt(nowMs)
    const bootstrap = await snapshotAt(nowMs, (group, index) => {
      if (group !== 'science') return {}
      const id = 100_831 + index
      return {
        gpValue: [
          gpRecord(id, {
            EPOCH: '2026-09-30T18:00:00',
          }),
        ],
        satcatValue: [satcatRecord(id)],
      }
    })
    expect(() =>
      selectOrbitalCatalogCandidate(kv, bootstrap),
    ).toThrow('Equal-time')

    const store = new MemoryKv()
    store.values.set(
      ORBITAL_CATALOG_KEY,
      serializeOrbitalCatalogSnapshot(kv),
    )
    const response = await handleOrbitalCatalog(
      v2Request(),
      {
        ASSETS: { fetch: vi.fn(async () => jsonResponse(bootstrap)) },
        ORBITAL_CATALOG: store,
        ORBITAL_CATALOG_ENABLED: 'true',
      },
    )
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('300')
  })

  it('serves equal identical KV with conditional caching and uses a valid fallback', async () => {
    const current = await snapshotAt()
    const store = new MemoryKv()
    store.values.set(
      ORBITAL_CATALOG_KEY,
      serializeOrbitalCatalogSnapshot(current),
    )
    const assetsFetch = vi.fn(async () => jsonResponse(current))
    const environment = {
      ASSETS: { fetch: assetsFetch },
      ORBITAL_CATALOG: store,
      ORBITAL_CATALOG_ENABLED: 'true',
    }

    const response = await handleOrbitalCatalog(
      v2Request(),
      environment,
      { nowMs },
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toBe(`W/"${current.sha256}"`)
    expect(
      response.headers.get('x-livetrafficstan-orbital-source'),
    ).toBe('kv')

    const conditional = await handleOrbitalCatalog(
      v2Request({
        headers: { 'If-None-Match': `W/"${current.sha256}"` },
      }),
      environment,
      { nowMs },
    )
    expect(conditional.status).toBe(304)
    expect(await conditional.text()).toBe('')

    store.values.set(ORBITAL_CATALOG_KEY, '{}')
    const fallback = await handleOrbitalCatalog(
      v2Request(),
      environment,
    )
    expect(
      fallback.headers.get('x-livetrafficstan-orbital-source'),
    ).toBe('bootstrap')
  })

  it('rejects disabled, non-GET, and query requests without asset work', async () => {
    const assetsFetch = vi.fn()

    expect(
      (
        await handleOrbitalCatalog(
          new Request(`https://app.example${ORBITAL_CATALOG_PATH}`),
          { ASSETS: { fetch: assetsFetch } },
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await handleOrbitalCatalog(
          new Request(`https://app.example${ORBITAL_CATALOG_PATH}`, {
            method: 'POST',
          }),
          {
            ASSETS: { fetch: assetsFetch },
            ORBITAL_CATALOG_ENABLED: 'true',
          },
        )
      ).status,
    ).toBe(405)
    expect(
      (
        await handleOrbitalCatalog(
          new Request(
            `https://app.example${ORBITAL_CATALOG_PATH}?group=active`,
          ),
          {
            ASSETS: { fetch: assetsFetch },
            ORBITAL_CATALOG_ENABLED: 'true',
          },
        )
      ).status,
    ).toBe(400)
    expect(assetsFetch).not.toHaveBeenCalled()
  })
})
