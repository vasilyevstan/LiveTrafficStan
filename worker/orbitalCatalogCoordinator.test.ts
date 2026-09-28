import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ORBITAL_CATALOG_KEY,
  ORBITAL_GP_URL,
  ORBITAL_REFRESH_INTERVAL_MS,
  ORBITAL_SATCAT_URL,
  type OrbitalKeyValueStore,
} from './orbitalCatalog.js'
import {
  ORBITAL_COORDINATOR_PATH,
  OrbitalCatalogCoordinator,
} from './orbitalCatalogCoordinator.js'

const nowMs = Date.parse('2026-09-28T18:45:00.000Z')

const gpRecord = {
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
}

const satcatRecord = {
  NORAD_CAT_ID: 100_831,
  OBJECT_NAME: 'TEST SAT',
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
  failOutcomeWrite = false

  readonly sql = {
    exec: <Row,>(
      query: string,
      ...bindings: Array<string | number | null>
    ) => {
      const normalized = query.replace(/\s+/g, ' ').trim()
      if (normalized.startsWith('CREATE TABLE')) {
        return new FakeCursor<Row>([])
      }
      if (normalized.startsWith('SELECT schema_version')) {
        return new FakeCursor<Row>(
          this.state ? [{ ...this.state } as Row] : [],
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
      throw new Error(`Unexpected SQL: ${normalized}`)
    },
  }

  transactionSync<Result>(callback: () => Result): Result {
    const state = this.state ? { ...this.state } : undefined
    try {
      return callback()
    } catch (error) {
      this.state = state
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

const createCoordinator = (storage: FakeStorage, catalog: MemoryKv) =>
  new OrbitalCatalogCoordinator(
    { storage } as unknown as DurableObjectState,
    {
      ASSETS: { fetch: vi.fn() },
      ORBITAL_CATALOG: catalog,
      ORBITAL_CATALOG_ENABLED: 'true',
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
        if (String(input) === ORBITAL_GP_URL) {
          markGpStarted()
          await gpGate
          return jsonResponse([gpRecord])
        }
        if (String(input) === ORBITAL_SATCAT_URL) {
          return jsonResponse([satcatRecord])
        }
        throw new Error('Unexpected URL')
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
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(catalog.values.has(ORBITAL_CATALOG_KEY)).toBe(true)
    expect(storage.state?.nextAllowedAtMs).toBe(
      nowMs + ORBITAL_REFRESH_INTERVAL_MS,
    )
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
