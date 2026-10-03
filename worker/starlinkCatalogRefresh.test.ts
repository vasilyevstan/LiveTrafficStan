import { describe, expect, it, vi } from 'vitest'
import {
  ORBITAL_CATALOG_KEY,
  ORBITAL_REFRESH_INTERVAL_MS,
  ORBITAL_SOURCES,
  refreshOrbitalCatalog,
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
    if (key === this.failPutKey) throw new Error('put failed')
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
    ).resolves.toEqual({ kind: 'blocked', status: 403 })
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
      ).resolves.toEqual({ kind: 'failed', reason })

      expect(events).toContain(`put:${ORBITAL_CATALOG_KEY}`)
      expect(events).toContain(
        `put:${STARLINK_CATALOG_PUBLICATION_KEY}`,
      )
      expect(store.values.get(failedKey)).toBe(
        failedKey === ORBITAL_CATALOG_KEY
          ? 'prior-curated'
          : 'prior-starlink',
      )
      const successfulKey =
        failedKey === ORBITAL_CATALOG_KEY
          ? STARLINK_CATALOG_PUBLICATION_KEY
          : ORBITAL_CATALOG_KEY
      expect(store.values.get(successfulKey)).not.toBe(
        successfulKey === ORBITAL_CATALOG_KEY
          ? 'prior-curated'
          : 'prior-starlink',
      )
    },
  )

  it('performs no final catalog puts after shared completion storage fails', async () => {
    const events: string[] = []
    const store = new EventKv(events)
    const coordinator = new EventCoordinator(events)
    coordinator.failComplete = true

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
