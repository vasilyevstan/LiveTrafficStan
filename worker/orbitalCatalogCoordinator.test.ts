import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ORBITAL_CATALOG_KEY,
  ORBITAL_REFRESH_INTERVAL_MS,
  ORBITAL_SOURCES,
  type OrbitalKeyValueStore,
} from './orbitalCatalog.js'
import {
  ORBITAL_COORDINATOR_PATH,
  ORBITAL_COORDINATOR_STATE_CONTRACT_VERSION,
  ORBITAL_COORDINATOR_STATE_SCHEMA_VERSION,
  STARLINK_COORDINATOR_STATE_CONTRACT_VERSION,
  STARLINK_COORDINATOR_STATE_SCHEMA_VERSION,
  OrbitalCatalogCoordinator,
} from './orbitalCatalogCoordinator.js'
import {
  STARLINK_BOOTSTRAP_GP_RETRIEVED_AT_MS,
  STARLINK_CATALOG_KEY,
  STARLINK_GP_SOURCE_URL,
  STARLINK_INITIAL_REFRESH_NOT_BEFORE_MS,
  STARLINK_REFRESH_INTERVAL_MS,
  STARLINK_SATCAT_SOURCE_URL,
} from './starlinkCatalog.js'

const nowMs = Date.parse('2026-09-28T18:45:00.000Z')

const gpRecord = {
  OBJECT_NAME: 'TEST SAT',
  OBJECT_ID: '2026-001A',
  OBJECT_TYPE: 'PAY',
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
}

const satcatRecord = {
  NORAD_CAT_ID: 100_831,
  OBJECT_NAME: 'TEST SAT',
  OBJECT_ID: '2026-001A',
  OBJECT_TYPE: 'PAY',
}

class MemoryKv implements OrbitalKeyValueStore {
  readonly values = new Map<string, string>()

  async get(key: string) {
    return this.values.get(key) ?? null
  }

  async put(key: string, value: string) {
    this.values.set(key, value)
  }
}

type StateRow = {
  schemaVersion: number
  sourceContractVersion: number
  attemptSequence: number
  attemptId: string | null
  lastStartedAtMs: number
  nextAllowedAtMs: number
  blockedStatus: number | null
  blockedAtMs: number | null
}

type StarlinkStateRow = {
  schemaVersion: number
  sourceContractVersion: number
  lastStartedAtMs: number
  nextAllowedAtMs: number
}

class FakeCursor<Row> implements Iterable<Row> {
  private readonly rows: Row[]

  constructor(rows: Row[]) {
    this.rows = rows
  }

  toArray() {
    return [...this.rows]
  }

  [Symbol.iterator]() {
    return this.rows[Symbol.iterator]()
  }
}

class FakeStorage {
  state: StateRow | undefined
  starlinkState: StarlinkStateRow | undefined
  failOutcomeWrite = false
  failStarlinkReservation = false

  readonly sql = {
    exec: <Row,>(
      query: string,
      ...bindings: Array<string | number | null>
    ) => {
      const normalized = query.replace(/\s+/g, ' ').trim()
      if (normalized.startsWith('CREATE TABLE')) {
        return new FakeCursor<Row>([])
      }
      if (
        normalized.startsWith('SELECT schema_version') &&
        normalized.includes('FROM orbital_refresh_state')
      ) {
        return new FakeCursor<Row>(
          this.state ? [{ ...this.state } as Row] : [],
        )
      }
      if (
        normalized.startsWith('SELECT schema_version') &&
        normalized.includes('FROM starlink_refresh_state')
      ) {
        return new FakeCursor<Row>(
          this.starlinkState
            ? [{ ...this.starlinkState } as Row]
            : [],
        )
      }
      if (normalized.startsWith('INSERT INTO orbital_refresh_state')) {
        const [
          schemaVersion,
          sourceContractVersion,
          attemptSequence,
          attemptId,
          lastStartedAtMs,
          nextAllowedAtMs,
        ] = bindings
        if (
          typeof schemaVersion !== 'number' ||
          typeof sourceContractVersion !== 'number' ||
          typeof attemptSequence !== 'number' ||
          typeof attemptId !== 'string' ||
          typeof lastStartedAtMs !== 'number' ||
          typeof nextAllowedAtMs !== 'number'
        ) {
          throw new Error('Invalid insert')
        }
        this.state = {
          schemaVersion,
          sourceContractVersion,
          attemptSequence,
          attemptId,
          lastStartedAtMs,
          nextAllowedAtMs,
          blockedStatus: null,
          blockedAtMs: null,
        }
        return new FakeCursor<Row>([])
      }
      if (
        normalized.startsWith('UPDATE orbital_refresh_state') &&
        normalized.includes('attempt_sequence = ?')
      ) {
        if (!this.state) throw new Error('Missing state')
        const [
          attemptSequence,
          attemptId,
          lastStartedAtMs,
          nextAllowedAtMs,
        ] = bindings
        if (
          typeof attemptSequence !== 'number' ||
          typeof attemptId !== 'string' ||
          typeof lastStartedAtMs !== 'number' ||
          typeof nextAllowedAtMs !== 'number'
        ) {
          throw new Error('Invalid reservation update')
        }
        this.state = {
          ...this.state,
          attemptSequence,
          attemptId,
          lastStartedAtMs,
          nextAllowedAtMs,
          blockedStatus: null,
          blockedAtMs: null,
        }
        return new FakeCursor<Row>([])
      }
      if (
        normalized.startsWith('UPDATE orbital_refresh_state') &&
        normalized.includes('blocked_status = ?')
      ) {
        if (this.failOutcomeWrite) throw new Error('Storage failed')
        if (!this.state) throw new Error('Missing state')
        const [nextAllowedAtMs, blockedStatus, blockedAtMs] = bindings
        if (
          typeof nextAllowedAtMs !== 'number' ||
          typeof blockedStatus !== 'number' ||
          typeof blockedAtMs !== 'number'
        ) {
          throw new Error('Invalid blocked update')
        }
        this.state = {
          ...this.state,
          attemptId: null,
          nextAllowedAtMs,
          blockedStatus,
          blockedAtMs,
        }
        return new FakeCursor<Row>([])
      }
      if (
        normalized.startsWith('UPDATE orbital_refresh_state') &&
        normalized.includes('blocked_status = NULL')
      ) {
        if (this.failOutcomeWrite) throw new Error('Storage failed')
        if (!this.state) throw new Error('Missing state')
        const [nextAllowedAtMs] = bindings
        if (typeof nextAllowedAtMs !== 'number') {
          throw new Error('Invalid completion update')
        }
        this.state = {
          ...this.state,
          attemptId: null,
          nextAllowedAtMs,
          blockedStatus: null,
          blockedAtMs: null,
        }
        return new FakeCursor<Row>([])
      }
      if (
        normalized.startsWith('INSERT INTO starlink_refresh_state')
      ) {
        if (this.failStarlinkReservation) {
          throw new Error('Storage failed')
        }
        const [
          schemaVersion,
          sourceContractVersion,
          lastStartedAtMs,
          nextAllowedAtMs,
        ] = bindings
        if (
          typeof schemaVersion !== 'number' ||
          typeof sourceContractVersion !== 'number' ||
          typeof lastStartedAtMs !== 'number' ||
          typeof nextAllowedAtMs !== 'number'
        ) {
          throw new Error('Invalid Starlink insert')
        }
        this.starlinkState = {
          schemaVersion,
          sourceContractVersion,
          lastStartedAtMs,
          nextAllowedAtMs,
        }
        return new FakeCursor<Row>([])
      }
      if (
        normalized.startsWith('UPDATE starlink_refresh_state')
      ) {
        if (this.failStarlinkReservation) {
          throw new Error('Storage failed')
        }
        if (!this.starlinkState) {
          throw new Error('Missing Starlink state')
        }
        const [lastStartedAtMs, nextAllowedAtMs] = bindings
        if (
          typeof lastStartedAtMs !== 'number' ||
          typeof nextAllowedAtMs !== 'number'
        ) {
          throw new Error('Invalid Starlink update')
        }
        this.starlinkState = {
          ...this.starlinkState,
          lastStartedAtMs,
          nextAllowedAtMs,
        }
        return new FakeCursor<Row>([])
      }
      throw new Error(`Unexpected SQL: ${normalized}`)
    },
  }

  transactionSync<Result>(callback: () => Result): Result {
    const state = this.state ? { ...this.state } : undefined
    const starlinkState = this.starlinkState
      ? { ...this.starlinkState }
      : undefined
    try {
      return callback()
    } catch (error) {
      this.state = state
      this.starlinkState = starlinkState
      throw error
    }
  }
}

const request = () =>
  new Request(`https://orbital.internal${ORBITAL_COORDINATOR_PATH}`, {
    method: 'POST',
  })

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const sourceResponse = (url: string) => {
  const source = ORBITAL_SOURCES.find(
    (candidate) =>
      candidate.gpSourceUrl === url ||
      candidate.satcatSourceUrl === url,
  )
  if (url === STARLINK_GP_SOURCE_URL) {
    return jsonResponse([gpRecord])
  }
  if (url === STARLINK_SATCAT_SOURCE_URL) {
    return jsonResponse([satcatRecord])
  }
  if (!source) throw new Error('Unexpected URL')
  return url === source.gpSourceUrl
    ? jsonResponse([gpRecord])
    : jsonResponse([satcatRecord])
}

const createCoordinator = (
  storage: FakeStorage,
  catalog: MemoryKv,
  starlinkEnabled = false,
) =>
  new OrbitalCatalogCoordinator(
    { storage } as unknown as DurableObjectState,
    {
      ASSETS: { fetch: vi.fn() },
      ORBITAL_CATALOG: catalog,
      ORBITAL_CATALOG_ENABLED: 'true',
      ...(starlinkEnabled
        ? { STARLINK_CATALOG_ENABLED: 'true' }
        : {}),
    },
  )

describe('orbital catalog coordinator', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('atomically admits only one concurrent scheduled delivery', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(nowMs)
    const storage = new FakeStorage()
    const catalog = new MemoryKv()
    const coordinator = createCoordinator(storage, catalog)
    let releaseGp: () => void = () => {}
    const gpGate = new Promise<void>((resolve) => {
      releaseGp = resolve
    })
    let markGpStarted: () => void = () => {}
    const gpStarted = new Promise<void>((resolve) => {
      markGpStarted = resolve
    })
    const fetchImpl = vi.fn(
      async (input: string | URL | Request) => {
        if (String(input) === ORBITAL_SOURCES[0].gpSourceUrl) {
          markGpStarted()
          await gpGate
          return jsonResponse([gpRecord])
        }
        return sourceResponse(String(input))
      },
    )
    vi.stubGlobal('fetch', fetchImpl)

    const first = coordinator.fetch(request())
    await gpStarted
    const duplicate = await coordinator.fetch(request())

    expect(await duplicate.json()).toEqual({
      kind: 'not-due',
      nextAllowedAtMs: Number.MAX_SAFE_INTEGER,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    releaseGp()
    const published = await first
    expect(await published.json()).toMatchObject({
      kind: 'published',
      recordCount: 1,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(10)
    expect(catalog.values.has(ORBITAL_CATALOG_KEY)).toBe(true)
    expect(storage.state?.nextAllowedAtMs).toBe(
      nowMs + ORBITAL_REFRESH_INTERVAL_MS,
    )
    expect(storage.state).toMatchObject({
      schemaVersion: ORBITAL_COORDINATOR_STATE_SCHEMA_VERSION,
      sourceContractVersion:
        ORBITAL_COORDINATOR_STATE_CONTRACT_VERSION,
      attemptSequence: 1,
      attemptId: null,
      lastStartedAtMs: nowMs,
      blockedStatus: null,
      blockedAtMs: null,
    })
    expect(storage.starlinkState).toBeUndefined()
  })

  it('preserves an existing schema-1 admission row during catalog v2 rollout', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(nowMs)
    const storage = new FakeStorage()
    storage.state = {
      schemaVersion: 1,
      sourceContractVersion: 1,
      attemptSequence: 7,
      attemptId: null,
      lastStartedAtMs: nowMs - ORBITAL_REFRESH_INTERVAL_MS,
      nextAllowedAtMs: nowMs,
      blockedStatus: null,
      blockedAtMs: null,
    }
    const existingState = { ...storage.state }
    const catalog = new MemoryKv()
    const coordinator = createCoordinator(storage, catalog)
    expect(storage.state).toEqual(existingState)
    expect(storage.starlinkState).toBeUndefined()
    const fetchImpl = vi.fn(async (input) =>
      sourceResponse(String(input)),
    )
    vi.stubGlobal('fetch', fetchImpl)

    const response = await coordinator.fetch(request())
    expect(await response.json()).toMatchObject({
      kind: 'published',
      recordCount: 1,
    })
    expect(storage.state).toMatchObject({
      schemaVersion: 1,
      sourceContractVersion: 1,
      attemptSequence: 8,
      attemptId: null,
      lastStartedAtMs: nowMs,
      nextAllowedAtMs: nowMs + ORBITAL_REFRESH_INTERVAL_MS,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(10)
  })

  it('durably blocks terminal responses before another provider request', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(nowMs)
    const storage = new FakeStorage()
    const catalog = new MemoryKv()
    const coordinator = createCoordinator(storage, catalog)
    const fetchImpl = vi.fn(async () => new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetchImpl)

    expect(await (await coordinator.fetch(request())).json()).toEqual({
      kind: 'blocked',
      status: 403,
    })

    vi.setSystemTime(nowMs + ORBITAL_REFRESH_INTERVAL_MS)
    expect(await (await coordinator.fetch(request())).json()).toEqual({
      kind: 'blocked',
      status: 403,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('applies a Starlink provider outcome to the same durable admission row', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(nowMs)
    const starlinkStartMs =
      STARLINK_INITIAL_REFRESH_NOT_BEFORE_MS + 45_000
    const storage = new FakeStorage()
    const catalog = new MemoryKv()
    const coordinator = createCoordinator(
      storage,
      catalog,
      true,
    )
    const lastCuratedSource =
      ORBITAL_SOURCES.at(-1)?.satcatSourceUrl
    let advancedToStarlinkStart = false
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input)
      if (
        url === lastCuratedSource &&
        !advancedToStarlinkStart
      ) {
        advancedToStarlinkStart = true
        vi.setSystemTime(starlinkStartMs)
      }
      return url === STARLINK_SATCAT_SOURCE_URL
        ? new Response(null, {
            status: 429,
            headers: { 'Retry-After': '10800' },
          })
        : sourceResponse(url)
    })
    vi.stubGlobal('fetch', fetchImpl)

    expect(await (await coordinator.fetch(request())).json()).toEqual({
      kind: 'rate-limited',
      nextAllowedAtMs: starlinkStartMs + 10_800_000,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(12)
    expect(catalog.values.has(ORBITAL_CATALOG_KEY)).toBe(true)
    expect(storage.state?.nextAllowedAtMs).toBe(
      starlinkStartMs + 10_800_000,
    )
    expect(storage.starlinkState).toEqual({
      schemaVersion: STARLINK_COORDINATOR_STATE_SCHEMA_VERSION,
      sourceContractVersion:
        STARLINK_COORDINATOR_STATE_CONTRACT_VERSION,
      lastStartedAtMs: starlinkStartMs,
      nextAllowedAtMs:
        starlinkStartMs + STARLINK_REFRESH_INTERVAL_MS,
    })

    vi.setSystemTime(nowMs + ORBITAL_REFRESH_INTERVAL_MS)
    expect(await (await coordinator.fetch(request())).json()).toEqual({
      kind: 'not-due',
      nextAllowedAtMs: starlinkStartMs + 10_800_000,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(12)

    vi.setSystemTime(starlinkStartMs + 10_800_000)
    expect(await (await coordinator.fetch(request())).json()).toMatchObject({
      kind: 'published',
      starlink: {
        kind: 'not-due',
        nextAllowedAtMs:
          starlinkStartMs + STARLINK_REFRESH_INTERVAL_MS,
      },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(22)
    expect(storage.starlinkState?.lastStartedAtMs).toBe(
      starlinkStartMs,
    )
  })

  it('seeds a fresh Starlink row from the immutable bootstrap before the first safe refresh', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(STARLINK_INITIAL_REFRESH_NOT_BEFORE_MS - 1)
    const storage = new FakeStorage()
    const catalog = new MemoryKv()
    const coordinator = createCoordinator(storage, catalog, true)
    const fetchImpl = vi.fn(async (input) =>
      sourceResponse(String(input)),
    )
    vi.stubGlobal('fetch', fetchImpl)

    expect(await (await coordinator.fetch(request())).json()).toMatchObject({
      kind: 'published',
      starlink: {
        kind: 'not-due',
        nextAllowedAtMs:
          STARLINK_INITIAL_REFRESH_NOT_BEFORE_MS,
      },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(10)
    expect(
      fetchImpl.mock.calls.some(
        ([input]) => String(input) === STARLINK_GP_SOURCE_URL,
      ),
    ).toBe(false)
    expect(catalog.values.has(STARLINK_CATALOG_KEY)).toBe(false)
    expect(storage.starlinkState).toEqual({
      schemaVersion: STARLINK_COORDINATOR_STATE_SCHEMA_VERSION,
      sourceContractVersion:
        STARLINK_COORDINATOR_STATE_CONTRACT_VERSION,
      lastStartedAtMs: STARLINK_BOOTSTRAP_GP_RETRIEVED_AT_MS,
      nextAllowedAtMs:
        STARLINK_INITIAL_REFRESH_NOT_BEFORE_MS,
    })
  })

  it.each([
    ['at', STARLINK_INITIAL_REFRESH_NOT_BEFORE_MS],
    ['after', STARLINK_INITIAL_REFRESH_NOT_BEFORE_MS + 1],
  ])(
    'admits a fresh Starlink row %s the bootstrap-derived boundary',
    async (_label, refreshAtMs) => {
      vi.useFakeTimers()
      vi.setSystemTime(refreshAtMs)
      const storage = new FakeStorage()
      const catalog = new MemoryKv()
      const coordinator = createCoordinator(
        storage,
        catalog,
        true,
      )
      const fetchImpl = vi.fn(async (input) =>
        sourceResponse(String(input)),
      )
      vi.stubGlobal('fetch', fetchImpl)

      expect(
        await (await coordinator.fetch(request())).json(),
      ).toMatchObject({
        kind: 'published',
        starlink: { kind: 'published', recordCount: 1 },
      })
      expect(fetchImpl).toHaveBeenCalledTimes(12)
      expect(catalog.values.has(STARLINK_CATALOG_KEY)).toBe(true)
      expect(storage.starlinkState).toEqual({
        schemaVersion:
          STARLINK_COORDINATOR_STATE_SCHEMA_VERSION,
        sourceContractVersion:
          STARLINK_COORDINATOR_STATE_CONTRACT_VERSION,
        lastStartedAtMs: refreshAtMs,
        nextAllowedAtMs:
          refreshAtMs + STARLINK_REFRESH_INTERVAL_MS,
      })
    },
  )

  it('skips Starlink provider work when its durable reservation fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(nowMs)
    const storage = new FakeStorage()
    storage.failStarlinkReservation = true
    const catalog = new MemoryKv()
    const coordinator = createCoordinator(storage, catalog, true)
    const fetchImpl = vi.fn(async (input) =>
      sourceResponse(String(input)),
    )
    vi.stubGlobal('fetch', fetchImpl)

    expect(await (await coordinator.fetch(request())).json()).toMatchObject({
      kind: 'published',
      starlink: {
        kind: 'skipped',
        reason: 'Could not persist the Starlink start gate',
      },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(10)
    expect(
      fetchImpl.mock.calls.some(
        ([input]) => String(input) === STARLINK_GP_SOURCE_URL,
      ),
    ).toBe(false)
    expect(catalog.values.has(ORBITAL_CATALOG_KEY)).toBe(true)
    expect(storage.starlinkState).toBeUndefined()
  })

  it('keeps the fail-closed admission lock when outcome storage fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(nowMs)
    const storage = new FakeStorage()
    storage.failOutcomeWrite = true
    const catalog = new MemoryKv()
    const coordinator = createCoordinator(storage, catalog)
    const fetchImpl = vi.fn(async () => new Response(null, { status: 429 }))
    vi.stubGlobal('fetch', fetchImpl)

    const failed = await coordinator.fetch(request())
    expect(failed.status).toBe(503)
    expect(await failed.json()).toEqual({
      kind: 'unavailable',
      reason: 'Could not persist the provider outcome',
    })
    expect(storage.state?.nextAllowedAtMs).toBe(Number.MAX_SAFE_INTEGER)

    vi.setSystemTime(nowMs + ORBITAL_REFRESH_INTERVAL_MS)
    const duplicate = await coordinator.fetch(request())
    expect(await duplicate.json()).toEqual({
      kind: 'not-due',
      nextAllowedAtMs: Number.MAX_SAFE_INTEGER,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
