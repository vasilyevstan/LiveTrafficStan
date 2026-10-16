import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ORBITAL_CATALOG_KEY,
  ORBITAL_REFRESH_INTERVAL_MS,
  ORBITAL_SOURCES,
  ORBITAL_TOTAL_REFRESH_TIMEOUT_MS,
  ORBITAL_UPSTREAM_TIMEOUT_MS,
  refreshOrbitalCatalog,
  type OrbitalCatalogFetch,
  type OrbitalKeyValueStore,
  type OrbitalRefreshCompletion,
  type OrbitalRefreshCoordinator,
  type OrbitalRefreshReservation,
  type StarlinkRefreshReservation,
} from './orbitalCatalog.js'
import {
  STARLINK_CATALOG_PUBLICATION_KEY,
  STARLINK_GP_SOURCE_URL,
  STARLINK_REFRESH_INTERVAL_MS,
  STARLINK_SATCAT_SOURCE_URL,
  STARLINK_V2_SAMPLE_LIMIT,
} from './starlinkCatalog.js'

const nowMs = Date.parse('2026-10-01T19:45:00.000Z')

const gpRecord = (
  id: number,
  overrides: Record<string, unknown> = {},
) => ({
  OBJECT_NAME: `TEST SAT ${id}`,
  OBJECT_ID: '2026-001A',
  OBJECT_TYPE: 'PAY',
  EPOCH: '2026-10-01T18:45:00.123456',
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

const starlinkPopulation = Array.from(
  { length: STARLINK_V2_SAMPLE_LIMIT },
  (_, index) => {
    const shellIndex = Math.floor(index / 128)
    const shellOffset = index % 128
    return gpRecord(90_000 + index, {
      INCLINATION: [43, 53, 70, 97.5][shellIndex],
      RA_OF_ASC_NODE:
        ((shellOffset % 16) + 0.5) * (360 / 16),
      MEAN_ANOMALY:
        ((Math.floor(shellOffset / 16) + 0.5) * 360) / 8,
      ARG_OF_PERICENTER: 0,
    })
  },
)
const starlinkSatcat = starlinkPopulation.map((row) =>
  satcatRecord(Number(row.NORAD_CAT_ID)),
)

const jsonResponse = (value: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(value), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

class EventKv implements OrbitalKeyValueStore {
  readonly values = new Map<string, string>()
  readonly events: string[]
  failPutKey: string | undefined

  constructor(events: string[]) {
    this.events = events
  }

  async get(key: string) {
    this.events.push(`get:${key}`)
    return this.values.get(key) ?? null
  }

  async put(key: string, value: string) {
    this.events.push(`put:${key}`)
    if (key === this.failPutKey || this.failPutKey === 'both') {
      throw new Error('put failed')
    }
    this.values.set(key, value)
  }
}

class EventCoordinator implements OrbitalRefreshCoordinator {
  readonly events: string[]
  nextAllowedAtMs = 0
  blockedStatus: number | undefined
  failComplete = false
  failStarlinkReserve = false
  starlinkLastStartedAtMs: number | undefined
  starlinkNextAllowedAtMs = 0
  private activeAttempt = ''
  private attemptSequence = 0

  constructor(events: string[]) {
    this.events = events
  }

  async reserve(now: number): Promise<OrbitalRefreshReservation> {
    this.events.push('reserve')
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
    this.activeAttempt = `${now}:${this.attemptSequence}`
    return { kind: 'admitted', attemptId: this.activeAttempt }
  }

  async reserveStarlink(
    attemptId: string,
    now: number,
  ): Promise<StarlinkRefreshReservation> {
    this.events.push('reserve-starlink')
    if (this.failStarlinkReserve) {
      throw new Error('storage failed')
    }
    if (attemptId !== this.activeAttempt) {
      throw new Error('obsolete')
    }
    if (this.starlinkNextAllowedAtMs > now) {
      return {
        kind: 'not-due',
        nextAllowedAtMs: this.starlinkNextAllowedAtMs,
      }
    }
    this.starlinkLastStartedAtMs = now
    this.starlinkNextAllowedAtMs =
      now + STARLINK_REFRESH_INTERVAL_MS
    return {
      kind: 'admitted',
      lastStartedAtMs: now,
      nextAllowedAtMs: this.starlinkNextAllowedAtMs,
    }
  }

  async complete(
    attemptId: string,
    completion: OrbitalRefreshCompletion,
  ) {
    this.events.push(`complete:${completion.kind}`)
    if (this.failComplete) throw new Error('complete failed')
    if (attemptId !== this.activeAttempt) throw new Error('obsolete')
    if (completion.kind === 'blocked') {
      this.blockedStatus = completion.status
      this.nextAllowedAtMs = Number.MAX_SAFE_INTEGER
      return
    }
    this.nextAllowedAtMs = completion.nextAllowedAtMs
  }
}

const sourceResponse = (url: string) => {
  const sourceIndex = ORBITAL_SOURCES.findIndex(
    (source) =>
      source.gpSourceUrl === url ||
      source.satcatSourceUrl === url,
  )
  if (sourceIndex >= 0) {
    const source = ORBITAL_SOURCES[sourceIndex]
    const id = 80_000 + sourceIndex
    return url === source?.gpSourceUrl
      ? jsonResponse([gpRecord(id)])
      : jsonResponse([satcatRecord(id)])
  }
  if (url === STARLINK_GP_SOURCE_URL) {
    return jsonResponse(starlinkPopulation)
  }
  if (url === STARLINK_SATCAT_SOURCE_URL) {
    return jsonResponse(starlinkSatcat)
  }
  throw new Error(`Unexpected URL: ${url}`)
}

const environment = (store: EventKv) => ({
  ASSETS: { fetch: vi.fn() },
  ORBITAL_CATALOG: store,
  ORBITAL_CATALOG_ENABLED: 'true',
  STARLINK_CATALOG_ENABLED: 'true',
})

describe('shared curated and Starlink refresh attempt', () => {
  afterEach(() => vi.useRealTimers())

  it('runs curated first, completes the shared gate, then publishes both keys', async () => {
    const events: string[] = []
    const store = new EventKv(events)
    const coordinator = new EventCoordinator(events)
    const curatedDurationMs = 45_000
    const starlinkStartMs = nowMs + curatedDurationMs
    const calls: string[] = []
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input)
      calls.push(url)
      events.push(`fetch:${url}`)
      return sourceResponse(url)
    })

    const outcome = await refreshOrbitalCatalog(
      environment(store),
      coordinator,
      {
        fetchImpl,
        nowMs,
        monotonicNow: () => 0,
        starlinkWallNow: () => starlinkStartMs,
        starlink: { monotonicNow: () => 0 },
      },
    )

    expect(outcome).toMatchObject({
      kind: 'published',
      recordCount: 5,
      starlink: {
        kind: 'published',
        populationCount: STARLINK_V2_SAMPLE_LIMIT,
        recordCount: STARLINK_V2_SAMPLE_LIMIT,
      },
    })
    expect(calls).toEqual([
      ...ORBITAL_SOURCES.flatMap((source) => [
        source.gpSourceUrl,
        source.satcatSourceUrl,
      ]),
      STARLINK_GP_SOURCE_URL,
      STARLINK_SATCAT_SOURCE_URL,
    ])
    expect(store.values.has(ORBITAL_CATALOG_KEY)).toBe(true)
    expect(
      store.values.has(STARLINK_CATALOG_PUBLICATION_KEY),
    ).toBe(true)
    const storedStarlink = JSON.parse(
      store.values.get(STARLINK_CATALOG_PUBLICATION_KEY) ??
        'null',
    )
    expect(storedStarlink).toMatchObject({
      schema1: {
        sources: {
          gp: {
            retrievedAt: new Date(starlinkStartMs).toISOString(),
          },
          satcat: {
            retrievedAt: new Date(starlinkStartMs).toISOString(),
          },
        },
        publishedAt: new Date(starlinkStartMs).toISOString(),
      },
      schema2: {
        recordCount: STARLINK_V2_SAMPLE_LIMIT,
      },
    })
    expect(coordinator.starlinkLastStartedAtMs).toBe(
      starlinkStartMs,
    )
    expect(coordinator.starlinkNextAllowedAtMs).toBe(
      starlinkStartMs + STARLINK_REFRESH_INTERVAL_MS,
    )
    expect(events.indexOf('reserve-starlink')).toBeLessThan(
      events.indexOf(`fetch:${STARLINK_GP_SOURCE_URL}`),
    )
    const completionIndex = events.indexOf('complete:next')
    expect(completionIndex).toBeGreaterThan(-1)
    expect(completionIndex).toBeLessThan(
      events.indexOf(`put:${ORBITAL_CATALOG_KEY}`),
    )
    expect(completionIndex).toBeLessThan(
      events.indexOf(
        `put:${STARLINK_CATALOG_PUBLICATION_KEY}`,
      ),
    )
    expect(
      calls.indexOf(STARLINK_GP_SOURCE_URL),
    ).toBeGreaterThanOrEqual(ORBITAL_SOURCES.length * 2)
    expect(coordinator.nextAllowedAtMs).toBe(
      nowMs + ORBITAL_REFRESH_INTERVAL_MS,
    )
  })

  it('keeps actual Starlink starts at least twelve hours apart', async () => {
    const events: string[] = []
    const store = new EventKv(events)
    const coordinator = new EventCoordinator(events)
    const calls: string[] = []
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input)
      calls.push(url)
      return sourceResponse(url)
    })
    const firstStarlinkStartMs = nowMs + 45_000

    await expect(
      refreshOrbitalCatalog(environment(store), coordinator, {
        fetchImpl,
        nowMs,
        monotonicNow: () => 0,
        starlinkWallNow: () => firstStarlinkStartMs,
        starlink: { monotonicNow: () => 0 },
      }),
    ).resolves.toMatchObject({
      kind: 'published',
      starlink: { kind: 'published' },
    })

    const earlyAttemptMs =
      firstStarlinkStartMs + STARLINK_REFRESH_INTERVAL_MS - 1
    await expect(
      refreshOrbitalCatalog(environment(store), coordinator, {
        fetchImpl,
        nowMs: earlyAttemptMs,
        monotonicNow: () => 0,
        starlinkWallNow: () => earlyAttemptMs,
        starlink: { monotonicNow: () => 0 },
      }),
    ).resolves.toMatchObject({
      kind: 'published',
      starlink: {
        kind: 'not-due',
        nextAllowedAtMs:
          firstStarlinkStartMs + STARLINK_REFRESH_INTERVAL_MS,
      },
    })
    expect(
      calls.filter((url) => url === STARLINK_GP_SOURCE_URL),
    ).toHaveLength(1)

    const secondStarlinkStartMs =
      earlyAttemptMs + ORBITAL_REFRESH_INTERVAL_MS
    await expect(
      refreshOrbitalCatalog(environment(store), coordinator, {
        fetchImpl,
        nowMs: secondStarlinkStartMs,
        monotonicNow: () => 0,
        starlinkWallNow: () => secondStarlinkStartMs,
        starlink: { monotonicNow: () => 0 },
      }),
    ).resolves.toMatchObject({
      kind: 'published',
      starlink: { kind: 'published' },
    })
    expect(
      secondStarlinkStartMs - firstStarlinkStartMs,
    ).toBeGreaterThanOrEqual(STARLINK_REFRESH_INTERVAL_MS)
    expect(coordinator.starlinkLastStartedAtMs).toBe(
      secondStarlinkStartMs,
    )
    expect(
      calls.filter((url) => url === STARLINK_GP_SOURCE_URL),
    ).toHaveLength(2)
  })

  it('persists a Starlink terminal state globally after retaining curated publication', async () => {
    const events: string[] = []
    const store = new EventKv(events)
    store.values.set(
      STARLINK_CATALOG_PUBLICATION_KEY,
      'prior-starlink',
    )
    const coordinator = new EventCoordinator(events)
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input)
      if (url === STARLINK_GP_SOURCE_URL) {
        return new Response(null, { status: 403 })
      }
      return sourceResponse(url)
    })

    await expect(
      refreshOrbitalCatalog(environment(store), coordinator, {
        fetchImpl,
        nowMs,
        monotonicNow: () => 0,
        starlinkWallNow: () => nowMs,
        starlink: { monotonicNow: () => 0 },
      }),
    ).resolves.toEqual({
      kind: 'blocked', status: 403,
      publicationResults: { curated: 'fulfilled' },
      starlink: {
        kind: 'failed', reason: 'Starlink upstream access stopped',
        status: 403, source: 'starlink-gp',
      },
    })
    expect(coordinator.blockedStatus).toBe(403)
    expect(store.values.has(ORBITAL_CATALOG_KEY)).toBe(true)
    expect(
      store.values.get(STARLINK_CATALOG_PUBLICATION_KEY),
    ).toBe('prior-starlink')
    expect(events.indexOf('complete:blocked')).toBeLessThan(
      events.indexOf(`put:${ORBITAL_CATALOG_KEY}`),
    )
  })

  it('applies Starlink Retry-After to the one shared coordinator', async () => {
    const events: string[] = []
    const store = new EventKv(events)
    const coordinator = new EventCoordinator(events)
    const starlinkStartMs = nowMs + 45_000
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input)
      if (url === STARLINK_SATCAT_SOURCE_URL) {
        return new Response(null, {
          status: 429,
          headers: { 'Retry-After': '10800' },
        })
      }
      return sourceResponse(url)
    })

    await expect(
      refreshOrbitalCatalog(environment(store), coordinator, {
        fetchImpl,
        nowMs,
        monotonicNow: () => 0,
        starlinkWallNow: () => starlinkStartMs,
        starlink: { monotonicNow: () => 0 },
      }),
    ).resolves.toEqual({
      kind: 'rate-limited',
      nextAllowedAtMs: starlinkStartMs + 10_800_000,
      publicationResults: { curated: 'fulfilled' },
      starlink: {
        kind: 'failed', reason: 'Starlink upstream requested a later retry', status: 429,
      },
    })
    expect(coordinator.nextAllowedAtMs).toBe(
      starlinkStartMs + 10_800_000,
    )
    expect(store.values.has(ORBITAL_CATALOG_KEY)).toBe(true)
    expect(
      store.values.has(STARLINK_CATALOG_PUBLICATION_KEY),
    ).toBe(false)
  })

  it('isolates a transient Starlink failure from a valid curated publication', async () => {
    const events: string[] = []
    const store = new EventKv(events)
    store.values.set(
      STARLINK_CATALOG_PUBLICATION_KEY,
      'prior-starlink',
    )
    const coordinator = new EventCoordinator(events)
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input)
      if (url === STARLINK_GP_SOURCE_URL) {
        return new Response(null, { status: 500 })
      }
      return sourceResponse(url)
    })

    const outcome = await refreshOrbitalCatalog(
      environment(store),
      coordinator,
      {
        fetchImpl,
        nowMs,
        monotonicNow: () => 0,
        starlinkWallNow: () => nowMs,
        starlink: { monotonicNow: () => 0 },
      },
    )

    expect(outcome).toMatchObject({
      kind: 'published',
      recordCount: 5,
      starlink: {
        kind: 'failed',
        reason: 'Starlink upstream request failed',
      },
    })
    expect(store.values.has(ORBITAL_CATALOG_KEY)).toBe(true)
    expect(
      store.values.get(STARLINK_CATALOG_PUBLICATION_KEY),
    ).toBe('prior-starlink')
    expect(coordinator.nextAllowedAtMs).toBe(
      nowMs + ORBITAL_REFRESH_INTERVAL_MS,
    )
  })

  it.each([false, true])(
    'does not let the production-shaped curated timeout starve due Starlink (put fails: %s)',
    async (putFails) => {
      vi.useFakeTimers()
      vi.setSystemTime(nowMs)
      const events: string[] = []
      const store = new EventKv(events)
      store.values.set(ORBITAL_CATALOG_KEY, 'prior-curated')
      store.values.set(STARLINK_CATALOG_PUBLICATION_KEY, 'prior-starlink')
      if (putFails) store.failPutKey = STARLINK_CATALOG_PUBLICATION_KEY
      const coordinator = new EventCoordinator(events)
      const complete = vi.spyOn(coordinator, 'complete')
      const fetchImpl = vi.fn<OrbitalCatalogFetch>(async (input, init) => {
        const url = String(input)
        if (url !== ORBITAL_SOURCES[0].gpSourceUrl) return sourceResponse(url)
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          if (!signal) throw new Error('Expected bounded request signal')
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      })
      const starlinkStartMs = nowMs + ORBITAL_UPSTREAM_TIMEOUT_MS
      const pending = refreshOrbitalCatalog(environment(store), coordinator, {
        fetchImpl, nowMs, monotonicNow: () => 0,
        starlinkWallNow: () => starlinkStartMs,
        starlink: { monotonicNow: () => 0 },
      })
      await vi.advanceTimersByTimeAsync(ORBITAL_UPSTREAM_TIMEOUT_MS - 1)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(events).not.toContain('reserve-starlink')
      await vi.advanceTimersByTimeAsync(1)
      expect(await pending).toMatchObject({
        kind: 'failed', reason: 'Orbital upstream timed out', source: 'visual-gp',
        publicationResults: {
          curated: 'not-attempted',
          starlink: putFails ? 'rejected' : 'fulfilled',
        },
        starlink: putFails
          ? { kind: 'failed', reason: 'Starlink snapshot publication failed' }
          : { kind: 'published', recordCount: STARLINK_V2_SAMPLE_LIMIT },
      })
      expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual([
        ORBITAL_SOURCES[0].gpSourceUrl,
        STARLINK_GP_SOURCE_URL,
        STARLINK_SATCAT_SOURCE_URL,
      ])
      expect(store.values.get(ORBITAL_CATALOG_KEY)).toBe('prior-curated')
      expect(store.values.get(STARLINK_CATALOG_PUBLICATION_KEY) === 'prior-starlink')
        .toBe(putFails)
      expect(events).not.toContain(`put:${ORBITAL_CATALOG_KEY}`)
      expect(events.indexOf('complete:next')).toBeLessThan(
        events.indexOf(`put:${STARLINK_CATALOG_PUBLICATION_KEY}`),
      )
      expect(complete).toHaveBeenCalledWith(expect.any(String), {
        kind: 'next', nextAllowedAtMs: nowMs + ORBITAL_REFRESH_INTERVAL_MS,
        reviewedSourcesValidated: false,
      })
      expect(coordinator.starlinkNextAllowedAtMs)
        .toBe(starlinkStartMs + STARLINK_REFRESH_INTERVAL_MS)
    },
  )

  it.each(['transient', 'malformed', 'validation'] as const)(
    'continues only the independent Starlink preparation after curated %s failure',
    async (failure) => {
      const events: string[] = []
      const store = new EventKv(events)
      store.values.set(ORBITAL_CATALOG_KEY, 'prior-curated')
      const coordinator = new EventCoordinator(events)
      const fetchImpl = vi.fn<OrbitalCatalogFetch>(async (input) => {
        const url = String(input)
        if (url !== ORBITAL_SOURCES[0].gpSourceUrl) return sourceResponse(url)
        if (failure === 'transient') return new Response(null, { status: 503 })
        if (failure === 'malformed') return new Response('not json', {
          headers: { 'Content-Type': 'application/json' },
        })
        return jsonResponse([gpRecord(80_000, { EPOCH: 'invalid' })])
      })
      expect(await refreshOrbitalCatalog(environment(store), coordinator, {
        fetchImpl, nowMs, monotonicNow: () => 0,
        starlinkWallNow: () => nowMs,
        starlink: { monotonicNow: () => 0 },
      })).toMatchObject({
        kind: 'failed',
        publicationResults: { curated: 'not-attempted', starlink: 'fulfilled' },
        starlink: { kind: 'published', recordCount: STARLINK_V2_SAMPLE_LIMIT },
      })
      expect(store.values.get(ORBITAL_CATALOG_KEY)).toBe('prior-curated')
      expect(events).not.toContain(`put:${ORBITAL_CATALOG_KEY}`)
      expect(fetchImpl.mock.calls.slice(-2).map(([input]) => String(input))).toEqual([
        STARLINK_GP_SOURCE_URL, STARLINK_SATCAT_SOURCE_URL,
      ])
    },
  )

  it('preserves both source cadences across repeated curated failures', async () => {
    const store = new EventKv([])
    const coordinator = new EventCoordinator([])
    const fetchImpl = vi.fn<OrbitalCatalogFetch>(async (input) =>
      String(input) === ORBITAL_SOURCES[0].gpSourceUrl
        ? new Response(null, { status: 502 })
        : sourceResponse(String(input)),
    )
    for (const offset of [0, ORBITAL_REFRESH_INTERVAL_MS, STARLINK_REFRESH_INTERVAL_MS]) {
      const startMs = nowMs + offset
      expect(await refreshOrbitalCatalog(environment(store), coordinator, {
        fetchImpl, nowMs: startMs, monotonicNow: () => 0,
        starlinkWallNow: () => startMs,
        starlink: { monotonicNow: () => 0 },
      })).toMatchObject({
        kind: 'failed',
        starlink: { kind: offset === ORBITAL_REFRESH_INTERVAL_MS ? 'not-due' : 'published' },
      })
      const count = fetchImpl.mock.calls.length
      expect(await refreshOrbitalCatalog(environment(store), coordinator, {
        fetchImpl, nowMs: startMs + ORBITAL_REFRESH_INTERVAL_MS - 1,
      })).toEqual({
        kind: 'not-due', nextAllowedAtMs: startMs + ORBITAL_REFRESH_INTERVAL_MS,
      })
      expect(fetchImpl).toHaveBeenCalledTimes(count)
    }
    expect(fetchImpl.mock.calls.filter(([input]) => String(input) === STARLINK_GP_SOURCE_URL))
      .toHaveLength(2)
    expect(coordinator.starlinkLastStartedAtMs).toBe(nowMs + STARLINK_REFRESH_INTERVAL_MS)
    expect(store.values.has(ORBITAL_CATALOG_KEY)).toBe(false)
  })

  it.each(['disabled', 'not-due', 'storage'] as const)(
    'does not create child requests after curated failure when Starlink is %s',
    async (state) => {
      const store = new EventKv([])
      const coordinator = new EventCoordinator([])
      const env = environment(store)
      if (state === 'disabled') env.STARLINK_CATALOG_ENABLED = 'false'
      if (state === 'not-due') coordinator.starlinkNextAllowedAtMs = nowMs + STARLINK_REFRESH_INTERVAL_MS
      if (state === 'storage') coordinator.failStarlinkReserve = true
      const fetchImpl = vi.fn<OrbitalCatalogFetch>(async () =>
        new Response(null, { status: 503 }),
      )
      const outcome = await refreshOrbitalCatalog(env, coordinator, {
        fetchImpl, nowMs, monotonicNow: () => 0, starlinkWallNow: () => nowMs,
      })
      expect(outcome).toMatchObject({ kind: 'failed', source: 'visual-gp', status: 503 })
      if (state !== 'disabled') {
        expect(outcome).toMatchObject({
          starlink: { kind: state === 'not-due' ? 'not-due' : 'skipped' },
        })
      }
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(store.values.size).toBe(0)
      expect(coordinator.starlinkLastStartedAtMs).toBeUndefined()
      expect(coordinator.nextAllowedAtMs).toBe(nowMs + ORBITAL_REFRESH_INTERVAL_MS)
    },
  )

  it.each([false, true])(
    'never publishes a constructed curated snapshot after late deadline or unexpected failure (%s)',
    async (unexpected) => {
      const events: string[] = []
      const store = new EventKv(events)
      const coordinator = new EventCoordinator(events)
      let elapsedMs = 0
      let digestCount = 0
      const digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle)
      const hash = vi.spyOn(globalThis.crypto.subtle, 'digest').mockImplementation(
        async (algorithm, data) => {
          const result = await digest(algorithm, data)
          digestCount += 1
          if (digestCount === 2) {
            if (unexpected) throw new Error('PRIVATE unexpected crypto failure')
            elapsedMs = ORBITAL_TOTAL_REFRESH_TIMEOUT_MS + 1
          }
          return result
        },
      )
      try {
        const fetchImpl = vi.fn<OrbitalCatalogFetch>(async (input) =>
          sourceResponse(String(input)),
        )
        const outcome = await refreshOrbitalCatalog(environment(store), coordinator, {
          fetchImpl, nowMs, monotonicNow: () => elapsedMs,
          starlinkWallNow: () => nowMs + elapsedMs,
          starlink: { monotonicNow: () => 0 },
        })
        expect(outcome).toMatchObject({
          kind: 'failed',
          reason: unexpected
            ? 'Orbital snapshot publication failed'
            : 'Orbital refresh exceeded its total deadline',
          ...(!unexpected ? {
            publicationResults: { curated: 'not-attempted', starlink: 'fulfilled' },
            starlink: { kind: 'published' },
          } : {}),
        })
        expect(store.values.has(ORBITAL_CATALOG_KEY)).toBe(false)
        expect(store.values.has(STARLINK_CATALOG_PUBLICATION_KEY)).toBe(!unexpected)
        expect(fetchImpl).toHaveBeenCalledTimes(ORBITAL_SOURCES.length * 2 + (unexpected ? 0 : 2))
      } finally {
        hash.mockRestore()
      }
    },
  )

  it.each([
    [302, undefined, 'blocked'],
    [403, undefined, 'blocked'],
    [404, undefined, 'blocked'],
    [429, undefined, 'rate-limited'],
    [429, '10800', 'rate-limited'],
    [503, '10800', 'deferred'],
    [503, '691200', 'blocked'],
  ] as const)(
    'does not start Starlink after curated %s with Retry-After %s',
    async (status, retryAfter, kind) => {
      const events: string[] = []
      const store = new EventKv(events)
      const coordinator = new EventCoordinator(events)
      const fetchImpl = vi.fn<OrbitalCatalogFetch>(async () =>
        new Response(null, {
          status, headers: retryAfter ? { 'Retry-After': retryAfter } : {},
        }),
      )
      expect(await refreshOrbitalCatalog(environment(store), coordinator, {
        fetchImpl, nowMs, monotonicNow: () => 0, starlinkWallNow: () => nowMs,
      })).toMatchObject({ kind })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(events).not.toContain('reserve-starlink')
      expect(store.values.size).toBe(0)
    },
  )

  it.each([
    [302, undefined, 'blocked'],
    [403, undefined, 'blocked'],
    [404, undefined, 'blocked'],
    [429, undefined, 'rate-limited'],
    [429, '10800', 'rate-limited'],
    [503, '10800', 'deferred'],
    [503, '691200', 'blocked'],
  ] as const)(
    'preserves the global Starlink %s outcome after a curated transient failure',
    async (status, retryAfter, kind) => {
      const store = new EventKv([])
      const coordinator = new EventCoordinator([])
      const fetchImpl = vi.fn<OrbitalCatalogFetch>(async (input) =>
        String(input) === ORBITAL_SOURCES[0].gpSourceUrl
          ? new Response(null, { status: 502 })
          : new Response(null, {
              status, headers: retryAfter ? { 'Retry-After': retryAfter } : {},
            }),
      )
      expect(await refreshOrbitalCatalog(environment(store), coordinator, {
        fetchImpl, nowMs, monotonicNow: () => 0, starlinkWallNow: () => nowMs,
        starlink: { monotonicNow: () => 0 },
      })).toMatchObject({
        kind,
        publicationResults: { curated: 'not-attempted' },
        starlink: { kind: 'failed', status },
      })
      expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual([
        ORBITAL_SOURCES[0].gpSourceUrl, STARLINK_GP_SOURCE_URL,
      ])
      expect(store.values.size).toBe(0)
      expect(coordinator.starlinkNextAllowedAtMs).toBe(nowMs + STARLINK_REFRESH_INTERVAL_MS)
      if (kind === 'blocked') {
        expect(coordinator.blockedStatus).toBe(status)
      } else {
        expect(coordinator.nextAllowedAtMs).toBe(
          nowMs + (retryAfter === '10800' ? 10_800_000 : ORBITAL_REFRESH_INTERVAL_MS),
        )
      }
    },
  )

  it('publishes curated data without provider work when the Starlink start gate fails', async () => {
    const events: string[] = []
    const store = new EventKv(events)
    const coordinator = new EventCoordinator(events)
    coordinator.failStarlinkReserve = true
    const fetchImpl = vi.fn(async (input) =>
      sourceResponse(String(input)),
    )

    const outcome = await refreshOrbitalCatalog(
      environment(store),
      coordinator,
      {
        fetchImpl,
        nowMs,
        monotonicNow: () => 0,
        starlinkWallNow: () => nowMs,
      },
    )

    expect(outcome).toMatchObject({
      kind: 'published',
      starlink: {
        kind: 'skipped',
        reason: 'Could not persist the Starlink start gate',
      },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(
      ORBITAL_SOURCES.length * 2,
    )
    expect(store.values.has(ORBITAL_CATALOG_KEY)).toBe(true)
    expect(
      store.values.has(STARLINK_CATALOG_PUBLICATION_KEY),
    ).toBe(false)
  })

  it.each([
    [
      'curated',
      ORBITAL_CATALOG_KEY,
      'Orbital snapshot publication failed',
    ],
    [
      'Starlink',
      STARLINK_CATALOG_PUBLICATION_KEY,
      'Starlink snapshot publication failed',
    ],
    ['both', 'both', 'Catalog snapshot publication failed'],
  ])(
    'attempts independent final puts when the %s put fails',
    async (_label, failedKey, reason) => {
      const events: string[] = []
      const store = new EventKv(events)
      store.values.set(ORBITAL_CATALOG_KEY, 'prior-curated')
      store.values.set(
        STARLINK_CATALOG_PUBLICATION_KEY,
        'prior-starlink',
      )
      store.failPutKey = failedKey
      const coordinator = new EventCoordinator(events)

      await expect(
        refreshOrbitalCatalog(environment(store), coordinator, {
          fetchImpl: vi.fn(async (input) =>
            sourceResponse(String(input)),
          ),
          nowMs,
          monotonicNow: () => 0,
          starlinkWallNow: () => nowMs,
          starlink: { monotonicNow: () => 0 },
        }),
      ).resolves.toEqual({
        kind: 'failed',
        reason,
        publicationResults: {
          curated: failedKey === ORBITAL_CATALOG_KEY || failedKey === 'both'
            ? 'rejected' : 'fulfilled',
          starlink: failedKey === STARLINK_CATALOG_PUBLICATION_KEY || failedKey === 'both'
            ? 'rejected' : 'fulfilled',
        },
        starlink: failedKey === STARLINK_CATALOG_PUBLICATION_KEY || failedKey === 'both'
          ? { kind: 'failed', reason: 'Starlink snapshot publication failed' }
          : {
              kind: 'published', recordCount: 512, populationCount: 512,
              digest: expect.stringMatching(/^[0-9a-f]{64}$/),
              publishedAt: new Date(nowMs).toISOString(),
            },
      })

      expect(events).toContain(`put:${ORBITAL_CATALOG_KEY}`)
      expect(events).toContain(
        `put:${STARLINK_CATALOG_PUBLICATION_KEY}`,
      )
      for (const key of [ORBITAL_CATALOG_KEY, STARLINK_CATALOG_PUBLICATION_KEY]) {
        const prior = key === ORBITAL_CATALOG_KEY ? 'prior-curated' : 'prior-starlink'
        if (failedKey === key || failedKey === 'both') {
          expect(store.values.get(key)).toBe(prior)
        } else {
          expect(store.values.get(key)).not.toBe(prior)
        }
      }
    },
  )

  it.each([false, true])('performs no final puts after shared completion fails (curated failed: %s)', async (curatedFailed) => {
    const events: string[] = []
    const store = new EventKv(events)
    const coordinator = new EventCoordinator(events)
    coordinator.failComplete = true

    await expect(
      refreshOrbitalCatalog(environment(store), coordinator, {
        fetchImpl: vi.fn(async (input) =>
          curatedFailed && String(input) === ORBITAL_SOURCES[0].gpSourceUrl
            ? new Response(null, { status: 502 })
            : sourceResponse(String(input))),
        nowMs,
        monotonicNow: () => 0,
        starlinkWallNow: () => nowMs,
        starlink: { monotonicNow: () => 0 },
      }),
    ).resolves.toEqual({
      kind: 'unavailable',
      reason: 'Could not persist the provider outcome',
    })
    expect(events).toContain('reserve-starlink')
    expect(events).not.toContain(`put:${ORBITAL_CATALOG_KEY}`)
    expect(events).not.toContain(
      `put:${STARLINK_CATALOG_PUBLICATION_KEY}`,
    )
  })
})
