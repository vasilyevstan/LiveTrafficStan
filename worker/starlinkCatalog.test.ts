import { performance } from 'node:perf_hooks'
import { describe, expect, it, vi } from 'vitest'
import {
  STARLINK_BOOTSTRAP_TIMEOUT_MS,
  STARLINK_BOOTSTRAP_PATH,
  STARLINK_CATALOG_KEY,
  STARLINK_CATALOG_MEDIA_TYPE,
  STARLINK_CATALOG_PATH,
  STARLINK_GP_SOURCE_URL,
  STARLINK_MAX_SNAPSHOT_BYTES,
  STARLINK_MAX_UPSTREAM_BYTES,
  STARLINK_MAX_UPSTREAM_RECORDS,
  STARLINK_SAMPLE_ALGORITHM,
  STARLINK_SAMPLE_LIMIT,
  STARLINK_SATCAT_SOURCE_URL,
  STARLINK_TOTAL_REFRESH_TIMEOUT_MS,
  STARLINK_UPSTREAM_USER_AGENT,
  createStarlinkCatalogSnapshot,
  handleStarlinkCatalog,
  prepareStarlinkCatalogRefresh,
  selectStarlinkCatalogCandidate,
  serializeStarlinkCatalogSnapshot,
  starlinkSystematicSampleIndices,
  validateStarlinkCatalogSnapshot,
  type StarlinkCatalogSourceInput,
} from './starlinkCatalog.js'
import type { OrbitalKeyValueStore } from './orbitalCatalog.js'

const nowMs = Date.parse('2026-10-01T19:45:00.000Z')

const gpRecord = (
  id: number,
  overrides: Record<string, unknown> = {},
) => ({
  OBJECT_NAME: `STARLINK ${id}`,
  OBJECT_ID: `2026-${String(id % 1_000).padStart(3, '0')}A`,
  OBJECT_TYPE: 'PAY',
  EPOCH: '2026-10-01T18:45:00.123456',
  MEAN_MOTION: 15.2,
  ECCENTRICITY: 0.001,
  INCLINATION: 53 + (id % 10) / 100,
  RA_OF_ASC_NODE: id % 361,
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
  OBJECT_NAME: `STARLINK ${id}`,
  OBJECT_ID: `2026-${String(id % 1_000).padStart(3, '0')}A`,
  OBJECT_TYPE: 'PAY',
  ...overrides,
})

const sourceInput = (
  gpValue: unknown[],
  satcatValue: unknown[],
  overrides: Partial<StarlinkCatalogSourceInput> = {},
): StarlinkCatalogSourceInput => ({
  gpValue,
  satcatValue,
  gpRetrievedAt: '2026-10-01T19:45:01.000Z',
  satcatRetrievedAt: '2026-10-01T19:45:02.000Z',
  gpDecodedBytes: 1_000,
  satcatDecodedBytes: 900,
  gpSha256: 'a'.repeat(64),
  satcatSha256: 'b'.repeat(64),
  ...overrides,
})

const snapshotFrom = (
  gpValue: unknown[],
  satcatValue: unknown[],
  overrides?: Partial<StarlinkCatalogSourceInput>,
  publishedAt = '2026-10-01T19:45:03.000Z',
) =>
  createStarlinkCatalogSnapshot(
    sourceInput(gpValue, satcatValue, overrides),
    publishedAt,
  )

class MemoryKv implements OrbitalKeyValueStore {
  readonly values = new Map<string, string>()
  readonly events: string[] = []
  failGetKey: string | undefined
  failPutKey: string | undefined

  async get(key: string) {
    this.events.push(`get:${key}`)
    if (key === this.failGetKey) throw new Error('get failed')
    return this.values.get(key) ?? null
  }

  async put(key: string, value: string) {
    this.events.push(`put:${key}`)
    if (key === this.failPutKey) throw new Error('put failed')
    this.values.set(key, value)
  }
}

const jsonResponse = (value: unknown, init: ResponseInit = {}) => {
  const body = JSON.stringify(value)
  return new Response(body, {
    ...init,
    headers: {
      'Content-Length': String(new TextEncoder().encode(body).byteLength),
      'Content-Type': 'application/json; charset=UTF-8',
      ...init.headers,
    },
  })
}

describe('Starlink catalog source contract', () => {
  it('uses the exact midpoint systematic sample math', () => {
    expect(starlinkSystematicSampleIndices(1)).toEqual([0])
    expect(starlinkSystematicSampleIndices(4)).toEqual([0, 1, 2, 3])
    expect(starlinkSystematicSampleIndices(10, 4)).toEqual([
      1, 3, 6, 8,
    ])
    const indices = starlinkSystematicSampleIndices(11_127)
    expect(indices).toHaveLength(STARLINK_SAMPLE_LIMIT)
    expect(indices[0]).toBe(37)
    expect(indices.at(-1)).toBe(11_089)
    expect(new Set(indices).size).toBe(STARLINK_SAMPLE_LIMIT)
  })

  it('sorts by inclination, normalized RAAN, and numeric ID before sampling', async () => {
    const population = Array.from({ length: 301 }, (_, index) => {
      const id = 70_000 + index
      return gpRecord(id, {
        INCLINATION: (index * 17) % 90,
        RA_OF_ASC_NODE:
          index % 13 === 0 ? 360 : (index * 29) % 360,
      })
    }).reverse()
    const satcat = population.map((row) =>
      satcatRecord(Number(row.NORAD_CAT_ID)),
    )
    const canonical = [...population].sort(
      (left, right) =>
        Number(left.INCLINATION) - Number(right.INCLINATION) ||
        (Number(left.RA_OF_ASC_NODE) % 360) -
          (Number(right.RA_OF_ASC_NODE) % 360) ||
        Number(left.NORAD_CAT_ID) - Number(right.NORAD_CAT_ID),
    )
    const expectedIds = starlinkSystematicSampleIndices(
      population.length,
    )
      .map((index) => String(canonical[index]?.NORAD_CAT_ID))
      .sort((left, right) => Number(left) - Number(right))

    const snapshot = await snapshotFrom(population, satcat)

    expect(snapshot.sampleAlgorithm).toBe(
      STARLINK_SAMPLE_ALGORITHM,
    )
    expect(snapshot.populationCount).toBe(301)
    expect(snapshot.recordCount).toBe(STARLINK_SAMPLE_LIMIT)
    expect(
      snapshot.records.map((record) => record.noradCatalogId),
    ).toEqual(expectedIds)
    expect(
      snapshot.records.every(
        (record) =>
          record.displayOrder === Number(record.noradCatalogId),
      ),
    ).toBe(true)
    await expect(
      validateStarlinkCatalogSnapshot(snapshot),
    ).resolves.toEqual(snapshot)
  })

  it('validates every joined and extra SATCAT row', async () => {
    const gpWithoutType = gpRecord(70_001)
    delete (
      gpWithoutType as Record<string, unknown>
    ).OBJECT_TYPE
    const gp = [gpWithoutType, gpRecord(70_002)]
    const satcat = [
      satcatRecord(70_001),
      satcatRecord(70_002),
      satcatRecord(80_001),
    ]
    const snapshot = await snapshotFrom(gp, satcat)

    expect(snapshot.populationCount).toBe(2)
    expect(snapshot.extraSatcatCount).toBe(1)
    expect(snapshot.recordCount).toBe(2)

    await expect(
      snapshotFrom(gp, [
        ...satcat,
        satcatRecord(80_002, { OBJECT_TYPE: 'INVALID' }),
      ]),
    ).rejects.toThrow('object type')
  })

  it.each([
    [
      'duplicate GP IDs',
      [gpRecord(70_001), gpRecord(70_001)],
      [satcatRecord(70_001)],
      'Duplicate Starlink GP',
    ],
    [
      'duplicate SATCAT IDs',
      [gpRecord(70_001)],
      [satcatRecord(70_001), satcatRecord(70_001)],
      'Duplicate Starlink SATCAT',
    ],
    [
      'missing joins',
      [gpRecord(70_001)],
      [satcatRecord(70_002)],
      'missing SATCAT',
    ],
    [
      'identity conflicts',
      [gpRecord(70_001)],
      [satcatRecord(70_001, { OBJECT_NAME: 'OTHER' })],
      'identity conflict',
    ],
    [
      'type conflicts',
      [gpRecord(70_001)],
      [satcatRecord(70_001, { OBJECT_TYPE: 'DEB' })],
      'type conflict',
    ],
    [
      'invalid epochs',
      [gpRecord(70_001, { EPOCH: '2026-02-30T00:00:00' })],
      [satcatRecord(70_001)],
      'Invalid epoch',
    ],
  ])('rejects %s', async (_label, gp, satcat, message) => {
    await expect(snapshotFrom(gp, satcat)).rejects.toThrow(message)
  })

  it('rejects record and source byte caps', async () => {
    await expect(
      snapshotFrom(
        Array.from(
          { length: STARLINK_MAX_UPSTREAM_RECORDS + 1 },
          (_, index) => gpRecord(100_000 + index),
        ),
        [satcatRecord(100_000)],
      ),
    ).rejects.toThrow('GP record count')

    await expect(
      snapshotFrom([gpRecord(70_001)], [satcatRecord(70_001)], {
        gpDecodedBytes: STARLINK_MAX_UPSTREAM_BYTES + 1,
      }),
    ).rejects.toThrow('source byte counts')
  })

  it('rejects source clocks that invert the sequential acquisition order', async () => {
    await expect(
      snapshotFrom(
        [gpRecord(70_001)],
        [satcatRecord(70_001)],
        {
          gpRetrievedAt: '2026-10-01T19:45:02.000Z',
          satcatRetrievedAt: '2026-10-01T19:45:01.000Z',
        },
      ),
    ).rejects.toThrow(
      'Starlink SATCAT retrieval precedes GP retrieval',
    )

    const valid = await snapshotFrom(
      [gpRecord(70_001)],
      [satcatRecord(70_001)],
    )
    await expect(
      validateStarlinkCatalogSnapshot({
        ...valid,
        sources: {
          ...valid.sources,
          gp: {
            ...valid.sources.gp,
            retrievedAt: '2026-10-01T19:45:03.000Z',
          },
        },
      }),
    ).rejects.toThrow(
      'Starlink SATCAT retrieval precedes GP retrieval',
    )
  })
})

describe('Starlink acquisition', () => {
  it('anchors two strictly sequential source reads to the admitted start', async () => {
    const store = new MemoryKv()
    let active = 0
    let maximumActive = 0
    const calls: string[] = []
    const fetchImpl = vi.fn(async (input, init) => {
      const url = String(input)
      calls.push(url)
      expect(init).toMatchObject({
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent': STARLINK_UPSTREAM_USER_AGENT,
        },
      })
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await Promise.resolve()
      active -= 1
      return url === STARLINK_GP_SOURCE_URL
        ? jsonResponse([gpRecord(70_001)])
        : jsonResponse([satcatRecord(70_001)])
    })
    const environment = {
      ASSETS: { fetch: vi.fn() },
      ORBITAL_CATALOG: store,
      ORBITAL_CATALOG_ENABLED: 'true',
      STARLINK_CATALOG_ENABLED: 'true',
    }

    const first = await prepareStarlinkCatalogRefresh(environment, {
      fetchImpl,
      nowMs,
      monotonicNow: () => 0,
    })
    expect(first).toMatchObject({
      kind: 'ready',
      snapshot: {
        populationCount: 1,
        recordCount: 1,
      },
    })
    expect(calls).toEqual([
      STARLINK_GP_SOURCE_URL,
      STARLINK_SATCAT_SOURCE_URL,
    ])
    expect(maximumActive).toBe(1)
    expect(first).toMatchObject({
      snapshot: {
        sources: {
          gp: { retrievedAt: new Date(nowMs).toISOString() },
          satcat: { retrievedAt: new Date(nowMs).toISOString() },
        },
        publishedAt: new Date(nowMs).toISOString(),
      },
    })
    expect(store.events).toEqual([])
  })

  it('skips provider work when the catalog binding is unavailable', async () => {
    const fetchImpl = vi.fn()
    const environment = {
      ASSETS: { fetch: vi.fn() },
      ORBITAL_CATALOG_ENABLED: 'true',
      STARLINK_CATALOG_ENABLED: 'true',
    }

    await expect(
      prepareStarlinkCatalogRefresh(environment, {
        fetchImpl,
        nowMs,
      }),
    ).resolves.toEqual({
      kind: 'skipped',
      reason: 'Starlink KV binding is unavailable',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('requires both deployment flags before state or provider work', async () => {
    const store = new MemoryKv()
    const fetchImpl = vi.fn()
    for (const environment of [
      {
        ASSETS: { fetch: vi.fn() },
        ORBITAL_CATALOG: store,
        ORBITAL_CATALOG_ENABLED: 'true',
      },
      {
        ASSETS: { fetch: vi.fn() },
        ORBITAL_CATALOG: store,
        STARLINK_CATALOG_ENABLED: 'true',
      },
    ]) {
      await expect(
        prepareStarlinkCatalogRefresh(environment, {
          fetchImpl,
          nowMs,
        }),
      ).resolves.toEqual({ kind: 'disabled' })
    }
    expect(store.events).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('enforces response, aggregate, record, and total deadline caps', async () => {
    const enabledEnvironment = (store: MemoryKv) => ({
      ASSETS: { fetch: vi.fn() },
      ORBITAL_CATALOG: store,
      ORBITAL_CATALOG_ENABLED: 'true',
      STARLINK_CATALOG_ENABLED: 'true',
    })

    const oversizedFetch = vi.fn(async () =>
      new Response('[]', {
        headers: {
          'Content-Length': String(
            STARLINK_MAX_UPSTREAM_BYTES + 1,
          ),
          'Content-Type': 'application/json',
        },
      }),
    )
    await expect(
      prepareStarlinkCatalogRefresh(
        enabledEnvironment(new MemoryKv()),
        {
          fetchImpl: oversizedFetch,
          nowMs,
          monotonicNow: () => 0,
        },
      ),
    ).resolves.toMatchObject({
      kind: 'failed',
      reason: expect.stringContaining('too large'),
    })
    expect(oversizedFetch).toHaveBeenCalledTimes(1)

    const recordFetch = vi.fn(async (input) =>
      String(input) === STARLINK_GP_SOURCE_URL
        ? jsonResponse([gpRecord(70_001), gpRecord(70_002)])
        : jsonResponse([
            satcatRecord(70_001),
            satcatRecord(70_002),
          ]),
    )
    await expect(
      prepareStarlinkCatalogRefresh(
        enabledEnvironment(new MemoryKv()),
        {
          fetchImpl: recordFetch,
          nowMs,
          maximumRecords: 1,
          monotonicNow: () => 0,
        },
      ),
    ).resolves.toMatchObject({
      kind: 'failed',
      reason: expect.stringContaining('record count'),
    })
    expect(recordFetch).toHaveBeenCalledTimes(1)

    const aggregateFetch = vi.fn(async (input) =>
      String(input) === STARLINK_GP_SOURCE_URL
        ? jsonResponse([gpRecord(70_001)])
        : jsonResponse([satcatRecord(70_001)]),
    )
    await expect(
      prepareStarlinkCatalogRefresh(
        enabledEnvironment(new MemoryKv()),
        {
          fetchImpl: aggregateFetch,
          nowMs,
          maximumAggregateBytes: 10,
          monotonicNow: () => 0,
        },
      ),
    ).resolves.toMatchObject({
      kind: 'failed',
      reason: expect.stringContaining('aggregate byte'),
    })
    expect(aggregateFetch).toHaveBeenCalledTimes(2)

    let clockRead = 0
    const deadlineTimes = [0, 0, 0, 0, 60_001]
    const deadlineFetch = vi.fn(async () =>
      jsonResponse([gpRecord(70_001)]),
    )
    await expect(
      prepareStarlinkCatalogRefresh(
        enabledEnvironment(new MemoryKv()),
        {
          fetchImpl: deadlineFetch,
          nowMs,
          totalTimeoutMs: STARLINK_TOTAL_REFRESH_TIMEOUT_MS,
          monotonicNow: () =>
            deadlineTimes[clockRead++] ?? 60_001,
        },
      ),
    ).resolves.toMatchObject({
      kind: 'failed',
      reason: expect.stringContaining('total deadline'),
    })
    expect(deadlineFetch).toHaveBeenCalledTimes(1)
  })
})

describe('same-origin Starlink catalog route', () => {
  it('serves fixed media, no-store, source, ETag, and 304 headers', async () => {
    const snapshot = await snapshotFrom(
      [gpRecord(70_001)],
      [satcatRecord(70_001)],
    )
    const store = new MemoryKv()
    store.values.set(
      STARLINK_CATALOG_KEY,
      serializeStarlinkCatalogSnapshot(snapshot),
    )
    const assetsFetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe(
        STARLINK_BOOTSTRAP_PATH,
      )
      return new Response(null, { status: 404 })
    })
    const environment = {
      ASSETS: { fetch: assetsFetch },
      ORBITAL_CATALOG: store,
      ORBITAL_CATALOG_ENABLED: 'true',
      STARLINK_CATALOG_ENABLED: 'true',
    }
    const request = new Request(
      `https://app.example${STARLINK_CATALOG_PATH}`,
    )

    const response = await handleStarlinkCatalog(
      request,
      environment,
      { nowMs },
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(
      STARLINK_CATALOG_MEDIA_TYPE,
    )
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(
      response.headers.get('x-livetrafficstan-starlink-source'),
    ).toBe('kv')
    expect(
      response.headers.get('x-livetrafficstan-starlink-digest'),
    ).toBe(snapshot.digest)
    expect(
      response.headers.get(
        'x-livetrafficstan-starlink-published-at',
      ),
    ).toBe(snapshot.publishedAt)
    expect(
      response.headers.get('x-livetrafficstan-served-at'),
    ).toBe(new Date(nowMs).toISOString())
    expect(response.headers.has('access-control-allow-origin')).toBe(
      false,
    )
    const etag = response.headers.get('etag')
    await expect(response.json()).resolves.toEqual(snapshot)

    const conditional = await handleStarlinkCatalog(
      new Request(request, {
        headers: { 'If-None-Match': etag ?? '' },
      }),
      environment,
      { nowMs },
    )
    expect(conditional.status).toBe(304)
    expect(conditional.headers.get('etag')).toBe(etag)
    expect(conditional.headers.get('cache-control')).toBe('no-store')
    expect(
      conditional.headers.get(
        'x-livetrafficstan-starlink-published-at',
      ),
    ).toBe(snapshot.publishedAt)
    expect(
      conditional.headers.get('x-livetrafficstan-served-at'),
    ).toBe(new Date(nowMs).toISOString())
  })

  it('rejects disabled, query, method, and equal-time conflicts', async () => {
    const assetsFetch = vi.fn()
    const disabled = await handleStarlinkCatalog(
      new Request(`https://app.example${STARLINK_CATALOG_PATH}`),
      { ASSETS: { fetch: assetsFetch } },
    )
    expect(disabled.status).toBe(404)
    expect(assetsFetch).not.toHaveBeenCalled()

    const snapshot = await snapshotFrom(
      [gpRecord(70_001)],
      [satcatRecord(70_001)],
    )
    const conflicting = await snapshotFrom(
      [gpRecord(70_002)],
      [satcatRecord(70_002)],
    )
    const older = await snapshotFrom(
      [gpRecord(70_003)],
      [satcatRecord(70_003)],
      {
        gpRetrievedAt: '2026-10-01T19:44:01.000Z',
        satcatRetrievedAt: '2026-10-01T19:44:02.000Z',
      },
      '2026-10-01T19:44:03.000Z',
    )
    const olderSourcesPublishedLater = await snapshotFrom(
      [gpRecord(70_004)],
      [satcatRecord(70_004)],
      {
        gpRetrievedAt: '2026-10-01T19:44:01.000Z',
        satcatRetrievedAt: '2026-10-01T19:44:02.000Z',
      },
      '2026-10-01T19:47:03.000Z',
    )
    const republishedSameGeneration = await snapshotFrom(
      [gpRecord(70_001)],
      [satcatRecord(70_001)],
      undefined,
      '2026-10-01T19:46:03.000Z',
    )
    expect(
      selectStarlinkCatalogCandidate(older, snapshot),
    ).toEqual({ snapshot, source: 'bootstrap' })
    expect(
      selectStarlinkCatalogCandidate(snapshot, older),
    ).toEqual({ snapshot, source: 'kv' })
    expect(
      selectStarlinkCatalogCandidate(
        snapshot,
        olderSourcesPublishedLater,
      ),
    ).toEqual({ snapshot, source: 'kv' })
    expect(
      selectStarlinkCatalogCandidate(
        olderSourcesPublishedLater,
        snapshot,
      ),
    ).toEqual({ snapshot, source: 'bootstrap' })
    expect(() =>
      selectStarlinkCatalogCandidate(snapshot, conflicting),
    ).toThrow('Equal-generation')
    expect(() =>
      selectStarlinkCatalogCandidate(
        snapshot,
        republishedSameGeneration,
      ),
    ).toThrow('Equal-generation')

    const store = new MemoryKv()
    store.values.set(
      STARLINK_CATALOG_KEY,
      serializeStarlinkCatalogSnapshot(snapshot),
    )
    const environment = {
      ASSETS: {
        fetch: vi.fn(async () =>
          jsonResponse(conflicting),
        ),
      },
      ORBITAL_CATALOG: store,
      ORBITAL_CATALOG_ENABLED: 'true',
      STARLINK_CATALOG_ENABLED: 'true',
    }
    expect(
      (
        await handleStarlinkCatalog(
          new Request(
            `https://app.example${STARLINK_CATALOG_PATH}?all=true`,
          ),
          environment,
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await handleStarlinkCatalog(
          new Request(
            `https://app.example${STARLINK_CATALOG_PATH}`,
            { method: 'POST' },
          ),
          environment,
        )
      ).status,
    ).toBe(405)
    expect(
      (
        await handleStarlinkCatalog(
          new Request(
            `https://app.example${STARLINK_CATALOG_PATH}`,
          ),
          environment,
        )
      ).status,
    ).toBe(503)
  })

  it('ignores future-dated candidates before source-generation selection', async () => {
    const current = await snapshotFrom(
      [gpRecord(70_001)],
      [satcatRecord(70_001)],
    )
    const futureSources = await snapshotFrom(
      [gpRecord(70_002)],
      [satcatRecord(70_002)],
      {
        gpRetrievedAt: '2026-10-01T19:51:01.000Z',
        satcatRetrievedAt: '2026-10-01T19:51:02.000Z',
      },
      '2026-10-01T19:51:03.000Z',
    )
    const futurePublication = await snapshotFrom(
      [gpRecord(70_003)],
      [satcatRecord(70_003)],
      undefined,
      '2026-10-01T19:50:01.000Z',
    )
    const request = new Request(
      `https://app.example${STARLINK_CATALOG_PATH}`,
    )

    const currentStore = new MemoryKv()
    currentStore.values.set(
      STARLINK_CATALOG_KEY,
      serializeStarlinkCatalogSnapshot(current),
    )
    const kvResponse = await handleStarlinkCatalog(
      request,
      {
        ASSETS: {
          fetch: vi.fn(async () => jsonResponse(futureSources)),
        },
        ORBITAL_CATALOG: currentStore,
        ORBITAL_CATALOG_ENABLED: 'true',
        STARLINK_CATALOG_ENABLED: 'true',
      },
      { nowMs },
    )
    expect(kvResponse.status).toBe(200)
    expect(
      kvResponse.headers.get(
        'x-livetrafficstan-starlink-source',
      ),
    ).toBe('kv')

    const futureStore = new MemoryKv()
    futureStore.values.set(
      STARLINK_CATALOG_KEY,
      serializeStarlinkCatalogSnapshot(futurePublication),
    )
    const bootstrapResponse = await handleStarlinkCatalog(
      request,
      {
        ASSETS: {
          fetch: vi.fn(async () => jsonResponse(current)),
        },
        ORBITAL_CATALOG: futureStore,
        ORBITAL_CATALOG_ENABLED: 'true',
        STARLINK_CATALOG_ENABLED: 'true',
      },
      { nowMs },
    )
    expect(bootstrapResponse.status).toBe(200)
    expect(
      bootstrapResponse.headers.get(
        'x-livetrafficstan-starlink-source',
      ),
    ).toBe('bootstrap')
  })

  it.each([
    [
      'partial response',
      () =>
        new Response('{}', {
          status: 206,
          headers: { 'Content-Type': 'application/json' },
        }),
    ],
    [
      'wrong media type',
      () =>
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
    ],
    [
      'malformed UTF-8',
      () =>
        new Response(new Uint8Array([0xc3, 0x28]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ],
  ])(
    'serves healthy KV when the bootstrap has a %s',
    async (_label: string, bootstrapResponse: () => Response) => {
      const snapshot = await snapshotFrom(
        [gpRecord(70_001)],
        [satcatRecord(70_001)],
      )
      const store = new MemoryKv()
      store.values.set(
        STARLINK_CATALOG_KEY,
        serializeStarlinkCatalogSnapshot(snapshot),
      )

      const response = await handleStarlinkCatalog(
        new Request(
          `https://app.example${STARLINK_CATALOG_PATH}`,
        ),
        {
          ASSETS: {
            fetch: vi.fn(async () => bootstrapResponse()),
          },
          ORBITAL_CATALOG: store,
          ORBITAL_CATALOG_ENABLED: 'true',
          STARLINK_CATALOG_ENABLED: 'true',
        },
        { nowMs },
      )

      expect(response.status).toBe(200)
      expect(
        response.headers.get(
          'x-livetrafficstan-starlink-source',
        ),
      ).toBe('kv')
    },
  )

  it('cancels an oversized bootstrap and serves healthy KV', async () => {
    const snapshot = await snapshotFrom(
      [gpRecord(70_001)],
      [satcatRecord(70_001)],
    )
    const store = new MemoryKv()
    store.values.set(
      STARLINK_CATALOG_KEY,
      serializeStarlinkCatalogSnapshot(snapshot),
    )
    const cancel = vi.fn()
    const oversizedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new Uint8Array(STARLINK_MAX_SNAPSHOT_BYTES),
        )
        controller.enqueue(new Uint8Array([0]))
      },
      cancel,
    })

    const response = await handleStarlinkCatalog(
      new Request(
        `https://app.example${STARLINK_CATALOG_PATH}`,
      ),
      {
        ASSETS: {
          fetch: vi.fn(
            async () =>
              new Response(oversizedBody, {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                },
              }),
          ),
        },
        ORBITAL_CATALOG: store,
        ORBITAL_CATALOG_ENABLED: 'true',
        STARLINK_CATALOG_ENABLED: 'true',
      },
      { nowMs },
    )

    expect(response.status).toBe(200)
    expect(
      response.headers.get(
        'x-livetrafficstan-starlink-source',
      ),
    ).toBe('kv')
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('bounds a slow bootstrap body and serves healthy KV', async () => {
    expect(STARLINK_BOOTSTRAP_TIMEOUT_MS).toBeLessThan(
      5_000,
    )
    const snapshot = await snapshotFrom(
      [gpRecord(70_001)],
      [satcatRecord(70_001)],
    )
    const store = new MemoryKv()
    store.values.set(
      STARLINK_CATALOG_KEY,
      serializeStarlinkCatalogSnapshot(snapshot),
    )
    const cancel = vi.fn()
    const slowBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{'))
      },
      cancel,
    })

    const response = await handleStarlinkCatalog(
      new Request(
        `https://app.example${STARLINK_CATALOG_PATH}`,
      ),
      {
        ASSETS: {
          fetch: vi.fn(
            async () =>
              new Response(slowBody, {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                },
              }),
          ),
        },
        ORBITAL_CATALOG: store,
        ORBITAL_CATALOG_ENABLED: 'true',
        STARLINK_CATALOG_ENABLED: 'true',
      },
      { nowMs, bootstrapTimeoutMs: 10 },
    )

    expect(response.status).toBe(200)
    expect(
      response.headers.get(
        'x-livetrafficstan-starlink-source',
      ),
    ).toBe('kv')
    expect(cancel).toHaveBeenCalled()
  })
})

describe('maximum Starlink fixture processing', () => {
  it(
    'processes two six-MiB, 15k-record responses within a deterministic bound',
    async () => {
      const count = STARLINK_MAX_UPSTREAM_RECORDS
      const gp = Array.from({ length: count }, (_, index) =>
        gpRecord(100_000 + index, {
          INCLINATION: 50 + (index % 5_000) / 100,
          RA_OF_ASC_NODE: (index * 13) % 361,
        }),
      )
      const satcat = Array.from({ length: count }, (_, index) =>
        satcatRecord(100_000 + index),
      )
      const padToMaximum = (rows: Array<Record<string, unknown>>) => {
        rows[0] = { ...rows[0], PADDING: '' }
        let text = JSON.stringify(rows)
        const currentBytes = new TextEncoder().encode(text).byteLength
        const remaining = STARLINK_MAX_UPSTREAM_BYTES - currentBytes
        expect(remaining).toBeGreaterThan(0)
        rows[0] = {
          ...rows[0],
          PADDING: 'x'.repeat(remaining),
        }
        text = JSON.stringify(rows)
        expect(new TextEncoder().encode(text).byteLength).toBe(
          STARLINK_MAX_UPSTREAM_BYTES,
        )
        return text
      }
      const gpText = padToMaximum(gp)
      const satcatText = padToMaximum(satcat)
      const store = new MemoryKv()
      const fetchImpl = vi.fn(async (input) => {
        const body =
          String(input) === STARLINK_GP_SOURCE_URL
            ? gpText
            : satcatText
        return new Response(body, {
          headers: {
            'Content-Length': String(
              STARLINK_MAX_UPSTREAM_BYTES,
            ),
            'Content-Type': 'application/json',
          },
        })
      })

      const startedAt = performance.now()
      const result = await prepareStarlinkCatalogRefresh(
        {
          ASSETS: { fetch: vi.fn() },
          ORBITAL_CATALOG: store,
          ORBITAL_CATALOG_ENABLED: 'true',
          STARLINK_CATALOG_ENABLED: 'true',
        },
        {
          fetchImpl,
          nowMs,
          monotonicNow: () => performance.now() - startedAt,
        },
      )
      const durationMs = performance.now() - startedAt

      expect(result.kind).toBe('ready')
      if (result.kind !== 'ready') return
      const serializedBytes = new TextEncoder().encode(
        serializeStarlinkCatalogSnapshot(result.snapshot),
      ).byteLength
      expect(result.snapshot.populationCount).toBe(count)
      expect(result.snapshot.recordCount).toBe(
        STARLINK_SAMPLE_LIMIT,
      )
      expect(serializedBytes).toBeLessThanOrEqual(
        STARLINK_MAX_SNAPSHOT_BYTES,
      )
      expect(durationMs).toBeLessThan(15_000)
      console.info(
        `Starlink maximum fixture: ${count} GP + ${count} SATCAT ` +
          `records, ${STARLINK_MAX_UPSTREAM_BYTES * 2} decoded bytes, ` +
          `${serializedBytes} snapshot bytes, ${durationMs.toFixed(1)} ms`,
      )
    },
    30_000,
  )
})
