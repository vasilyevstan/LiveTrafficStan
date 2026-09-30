import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ORBITAL_BOOTSTRAP_PATH,
  ORBITAL_CATALOG_KEY,
  ORBITAL_GP_URL,
  ORBITAL_MAX_RETRY_AFTER_MS,
  ORBITAL_REFRESH_INTERVAL_MS,
  ORBITAL_SATCAT_URL,
  ORBITAL_UPSTREAM_USER_AGENT,
  createOrbitalCatalogSnapshot,
  handleOrbitalCatalog,
  refreshOrbitalCatalog,
  serializeOrbitalCatalogSnapshot,
  validateOrbitalCatalogSnapshot,
  type OrbitalKeyValueStore,
  type OrbitalRefreshCompletion,
  type OrbitalRefreshCoordinator,
  type OrbitalRefreshReservation,
} from './orbitalCatalog.js'

const nowMs = Date.parse('2026-09-28T18:45:00.000Z')

const gpRecord = (overrides: Record<string, unknown> = {}) => ({
  OBJECT_NAME: 'TEST SAT',
  OBJECT_ID: '2026-001A',
  EPOCH: '2026-09-28T17:45:00.123456',
  MEAN_MOTION: 15.2,
  ECCENTRICITY: 0.001,
  INCLINATION: 51.6,
  RA_OF_ASC_NODE: 120,
  ARG_OF_PERICENTER: 30,
  MEAN_ANOMALY: 40,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: 100_831,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 123,
  BSTAR: 0.0001,
  MEAN_MOTION_DOT: 0.00001,
  MEAN_MOTION_DDOT: 0,
  ...overrides,
})

const satcatRecord = (overrides: Record<string, unknown> = {}) => ({
  NORAD_CAT_ID: 100_831,
  OBJECT_NAME: 'TEST SAT',
  OBJECT_TYPE: 'PAY',
  ...overrides,
})

class MemoryKv implements OrbitalKeyValueStore {
  readonly values = new Map<string, string>()

  async get(key: string) {
    return this.values.get(key) ?? null
  }

  async put(key: string, value: string) {
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
    if (attemptId !== this.activeAttemptId) {
      throw new Error('obsolete')
    }
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

const snapshot = () =>
  createOrbitalCatalogSnapshot(
    [gpRecord()],
    [
      satcatRecord(),
      satcatRecord({
        NORAD_CAT_ID: 100_832,
        OBJECT_NAME: 'EXTRA METADATA',
        OBJECT_TYPE: 'R/B',
      }),
    ],
    new Date(nowMs).toISOString(),
  )

describe('orbital catalog normalization', () => {
  it('joins exact SATCAT type and preserves OMM precision', async () => {
    const result = await snapshot()

    expect(result.recordCount).toBe(1)
    expect(result.records[0]).toMatchObject({
      noradCatalogId: '100831',
      objectType: 'PAY',
      epoch: '2026-09-28T17:45:00.123456Z',
    })
    expect(await validateOrbitalCatalogSnapshot(result)).toEqual(result)
  })

  it('rejects missing metadata, duplicate IDs, and digest changes', async () => {
    await expect(
      createOrbitalCatalogSnapshot(
        [gpRecord()],
        [satcatRecord({ NORAD_CAT_ID: 100_900 })],
        new Date(nowMs).toISOString(),
      ),
    ).rejects.toThrow('Missing SATCAT metadata')

    await expect(
      createOrbitalCatalogSnapshot(
        [gpRecord(), gpRecord()],
        [satcatRecord()],
        new Date(nowMs).toISOString(),
      ),
    ).rejects.toThrow('Duplicate GP record')

    const valid = await snapshot()
    await expect(
      validateOrbitalCatalogSnapshot({
        ...valid,
        records: [{ ...valid.records[0], name: 'CHANGED' }],
      }),
    ).rejects.toThrow('digest')
    await expect(
      validateOrbitalCatalogSnapshot({
        ...valid,
        padding: 'not part of schema',
      }),
    ).rejects.toThrow('fields')
    await expect(
      validateOrbitalCatalogSnapshot({
        ...valid,
        records: [{ ...valid.records[0], padding: true }],
      }),
    ).rejects.toThrow('fields')
  })

  it('rejects inferred or unsupported object types', async () => {
    await expect(
      createOrbitalCatalogSnapshot(
        [gpRecord({ OBJECT_NAME: 'TEST R/B' })],
        [satcatRecord({ OBJECT_TYPE: 'ROCKET' })],
        new Date(nowMs).toISOString(),
      ),
    ).rejects.toThrow('object type')
  })
})

describe('scheduled orbital catalog refresh', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('publishes one complete snapshot and enforces the persisted cadence', async () => {
    const store = new MemoryKv()
    const coordinator = new MemoryCoordinator()
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === ORBITAL_GP_URL) {
        return jsonResponse([gpRecord()])
      }
      if (String(input) === ORBITAL_SATCAT_URL) {
        return jsonResponse([satcatRecord()])
      }
      throw new Error('Unexpected URL')
    })
    const environment = {
      ASSETS: { fetch: vi.fn() },
      ORBITAL_CATALOG: store,
      ORBITAL_CATALOG_ENABLED: 'true',
    }

    const result = await refreshOrbitalCatalog(
      environment,
      coordinator,
      {
        fetchImpl,
        nowMs,
      },
    )

    expect(result).toMatchObject({
      kind: 'published',
      recordCount: 1,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    for (const [url, callIndex] of [
      [ORBITAL_GP_URL, 1],
      [ORBITAL_SATCAT_URL, 2],
    ] as const) {
      expect(fetchImpl).toHaveBeenNthCalledWith(
        callIndex,
        url,
        expect.objectContaining({
          cache: 'no-store',
          redirect: 'manual',
          headers: {
            Accept: 'application/json',
            'User-Agent': ORBITAL_UPSTREAM_USER_AGENT,
          },
        }),
      )
    }
    const stored = JSON.parse(
      store.values.get(ORBITAL_CATALOG_KEY) ?? 'null',
    )
    expect(await validateOrbitalCatalogSnapshot(stored)).toMatchObject({
      recordCount: 1,
    })

    const notDue = await refreshOrbitalCatalog(
      environment,
      coordinator,
      {
        fetchImpl,
        nowMs: nowMs + 1_000,
      },
    )

    expect(notDue).toEqual({
      kind: 'not-due',
      nextAllowedAtMs: nowMs + ORBITAL_REFRESH_INTERVAL_MS,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('preserves the Workers runtime receiver for the default fetch', async () => {
    const store = new MemoryKv()
    const coordinator = new MemoryCoordinator()
    const runtimeFetch = vi.fn(function (
      this: typeof globalThis,
      input: string | URL | Request,
    ) {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation')
      }
      if (String(input) === ORBITAL_GP_URL) {
        return Promise.resolve(jsonResponse([gpRecord()]))
      }
      if (String(input) === ORBITAL_SATCAT_URL) {
        return Promise.resolve(jsonResponse([satcatRecord()]))
      }
      throw new Error('Unexpected URL')
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
    ).resolves.toMatchObject({
      kind: 'published',
      recordCount: 1,
    })
    expect(runtimeFetch.mock.contexts).toEqual([
      globalThis,
      globalThis,
    ])
    expect(store.values.has(ORBITAL_CATALOG_KEY)).toBe(true)
  })

  it('blocks reviewed terminal statuses without another upstream request', async () => {
    const store = new MemoryKv()
    const coordinator = new MemoryCoordinator()
    const fetchImpl = vi.fn(async () => new Response(null, { status: 403 }))
    const environment = {
      ASSETS: { fetch: vi.fn() },
      ORBITAL_CATALOG: store,
      ORBITAL_CATALOG_ENABLED: 'true',
    }

    expect(
      await refreshOrbitalCatalog(environment, coordinator, {
        fetchImpl,
        nowMs,
      }),
    ).toEqual({ kind: 'blocked', status: 403 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    expect(
      await refreshOrbitalCatalog(environment, coordinator, {
        fetchImpl,
        nowMs: nowMs + ORBITAL_REFRESH_INTERVAL_MS,
      }),
    ).toEqual({ kind: 'blocked', status: 403 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('honors a longer Retry-After and preserves the prior snapshot', async () => {
    const store = new MemoryKv()
    const coordinator = new MemoryCoordinator()
    const prior = await snapshot()
    store.values.set(
      ORBITAL_CATALOG_KEY,
      serializeOrbitalCatalogSnapshot(prior),
    )
    const fetchImpl = vi.fn(async () =>
      new Response(null, {
        status: 429,
        headers: { 'Retry-After': '10800' },
      }),
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

    expect(result).toEqual({
      kind: 'rate-limited',
      nextAllowedAtMs: nowMs + 10_800_000,
    })
    expect(store.values.get(ORBITAL_CATALOG_KEY)).toBe(
      serializeOrbitalCatalogSnapshot(prior),
    )
  })

  it('fails closed when coordinator state cannot be persisted', async () => {
    const fetchImpl = vi.fn()
    const store = new MemoryKv()
    const failedReserve = new MemoryCoordinator()
    failedReserve.failReserve = true

    expect(
      await refreshOrbitalCatalog(
        {
          ASSETS: { fetch: vi.fn() },
          ORBITAL_CATALOG: store,
          ORBITAL_CATALOG_ENABLED: 'true',
        },
        failedReserve,
        { fetchImpl, nowMs },
      ),
    ).toEqual({
      kind: 'unavailable',
      reason: 'Could not persist the provider start gate',
    })
    expect(fetchImpl).not.toHaveBeenCalled()

    const failedComplete = new MemoryCoordinator()
    failedComplete.failComplete = true
    fetchImpl.mockResolvedValueOnce(new Response(null, { status: 403 }))
    expect(
      await refreshOrbitalCatalog(
        {
          ASSETS: { fetch: vi.fn() },
          ORBITAL_CATALOG: store,
          ORBITAL_CATALOG_ENABLED: 'true',
        },
        failedComplete,
        { fetchImpl, nowMs },
      ),
    ).toEqual({
      kind: 'unavailable',
      reason: 'Could not persist the provider outcome',
    })
    expect(failedComplete.nextAllowedAtMs).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('rejects successful partial responses and non-JSON media types', async () => {
    const prior = await snapshot()
    for (const response of [
      jsonResponse([gpRecord()], { status: 206 }),
      new Response(JSON.stringify([gpRecord()]), {
        status: 200,
        headers: { 'Content-Type': 'application/jsonp' },
      }),
    ]) {
      const store = new MemoryKv()
      const coordinator = new MemoryCoordinator()
      store.values.set(
        ORBITAL_CATALOG_KEY,
        serializeOrbitalCatalogSnapshot(prior),
      )
      const fetchImpl = vi.fn(async () => response)

      const result = await refreshOrbitalCatalog(
        {
          ASSETS: { fetch: vi.fn() },
          ORBITAL_CATALOG: store,
          ORBITAL_CATALOG_ENABLED: 'true',
        },
        coordinator,
        { fetchImpl, nowMs },
      )

      expect(result.kind).toBe('failed')
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(store.values.get(ORBITAL_CATALOG_KEY)).toBe(
        serializeOrbitalCatalogSnapshot(prior),
      )
    }
  })

  it('honors bounded 5xx guidance and blocks excessive guidance', async () => {
    const store = new MemoryKv()
    const deferredCoordinator = new MemoryCoordinator()
    const deferred = await refreshOrbitalCatalog(
      {
        ASSETS: { fetch: vi.fn() },
        ORBITAL_CATALOG: store,
        ORBITAL_CATALOG_ENABLED: 'true',
      },
      deferredCoordinator,
      {
        fetchImpl: vi.fn(async () =>
          new Response(null, {
            status: 503,
            headers: { 'Retry-After': '21600' },
          }),
        ),
        nowMs,
      },
    )
    expect(deferred).toEqual({
      kind: 'deferred',
      status: 503,
      nextAllowedAtMs: nowMs + 21_600_000,
    })

    const blockedCoordinator = new MemoryCoordinator()
    const blocked = await refreshOrbitalCatalog(
      {
        ASSETS: { fetch: vi.fn() },
        ORBITAL_CATALOG: store,
        ORBITAL_CATALOG_ENABLED: 'true',
      },
      blockedCoordinator,
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
        nowMs: nowMs + ORBITAL_REFRESH_INTERVAL_MS,
      },
    )
    expect(blocked).toEqual({ kind: 'blocked', status: 429 })
  })
})

describe('same-origin orbital catalog route', () => {
  it('serves a validated KV snapshot with identity and conditional caching', async () => {
    const store = new MemoryKv()
    const current = await snapshot()
    store.values.set(
      ORBITAL_CATALOG_KEY,
      serializeOrbitalCatalogSnapshot(current),
    )
    const assetsFetch = vi.fn()
    const environment = {
      ASSETS: { fetch: assetsFetch },
      ORBITAL_CATALOG: store,
      ORBITAL_CATALOG_ENABLED: 'true',
    }

    const response = await handleOrbitalCatalog(
      new Request('https://app.example/api/orbits/catalog'),
      environment,
      { nowMs },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toBe(`W/"${current.sha256}"`)
    expect(response.headers.get('x-livetrafficstan-orbital-source')).toBe(
      'kv',
    )
    expect(response.headers.get('x-livetrafficstan-served-at')).toBe(
      new Date(nowMs).toISOString(),
    )
    expect(await response.json()).toEqual(current)
    expect(assetsFetch).not.toHaveBeenCalled()

    const conditional = await handleOrbitalCatalog(
      new Request('https://app.example/api/orbits/catalog', {
        headers: { 'If-None-Match': `W/"${current.sha256}"` },
      }),
      environment,
      { nowMs },
    )
    expect(conditional.status).toBe(304)
    expect(await conditional.text()).toBe('')
  })

  it('uses the exact-release bootstrap when KV is absent or invalid', async () => {
    const current = await snapshot()
    const assetsFetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe(ORBITAL_BOOTSTRAP_PATH)
      return jsonResponse(current)
    })
    const store = new MemoryKv()
    store.values.set(ORBITAL_CATALOG_KEY, '{}')

    const response = await handleOrbitalCatalog(
      new Request('https://app.example/api/orbits/catalog'),
      {
        ASSETS: { fetch: assetsFetch },
        ORBITAL_CATALOG: store,
        ORBITAL_CATALOG_ENABLED: 'true',
      },
      { nowMs },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-livetrafficstan-orbital-source')).toBe(
      'bootstrap',
    )
    expect(assetsFetch).toHaveBeenCalledTimes(1)
  })

  it('rejects disabled, non-GET, and query requests without provider work', async () => {
    const assetsFetch = vi.fn()

    expect(
      (
        await handleOrbitalCatalog(
          new Request('https://app.example/api/orbits/catalog'),
          { ASSETS: { fetch: assetsFetch } },
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await handleOrbitalCatalog(
          new Request('https://app.example/api/orbits/catalog', {
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
          new Request('https://app.example/api/orbits/catalog?group=active'),
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
