import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ORBITAL_CATALOG_KEY,
  ORBITAL_REFRESH_INTERVAL_MS,
  ORBITAL_SOURCES,
  type OrbitalKeyValueStore,
} from './orbitalCatalog.js'
import {
  ORBITAL_COORDINATOR_PATH,
  ORBITAL_COORDINATOR_STATUS_PATH,
  ORBITAL_COORDINATOR_OBJECT_NAME,
  ORBITAL_COORDINATOR_STATE_CONTRACT_VERSION,
  ORBITAL_COORDINATOR_STATE_SCHEMA_VERSION,
  ORBITAL_REVIEWED_RECOVERY,
  STARLINK_COORDINATOR_STATE_CONTRACT_VERSION,
  STARLINK_COORDINATOR_STATE_SCHEMA_VERSION,
  OrbitalCatalogCoordinator,
  withOrbitalRefreshStatus,
} from './orbitalCatalogCoordinator.js'
import {
  STARLINK_BOOTSTRAP_GP_RETRIEVED_AT_MS,
  STARLINK_CATALOG_PUBLICATION_KEY,
  STARLINK_GP_SOURCE_URL,
  STARLINK_INITIAL_REFRESH_NOT_BEFORE_MS,
  STARLINK_REFRESH_INTERVAL_MS,
  STARLINK_SATCAT_SOURCE_URL,
  STARLINK_V2_SAMPLE_LIMIT,
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

const starlinkGpRecords = Array.from(
  { length: STARLINK_V2_SAMPLE_LIMIT },
  (_, index) => {
    const shellIndex = Math.floor(index / 128)
    const shellOffset = index % 128
    return {
      ...gpRecord,
      OBJECT_NAME: `STARLINK ${90_000 + index}`,
      OBJECT_ID: `2026-${String(index).padStart(3, '0')}A`,
      NORAD_CAT_ID: 90_000 + index,
      INCLINATION: [43, 53, 70, 97.5][shellIndex],
      RA_OF_ASC_NODE:
        ((shellOffset % 16) + 0.5) * (360 / 16),
      MEAN_ANOMALY:
        ((Math.floor(shellOffset / 16) + 0.5) * 360) / 8,
      ARG_OF_PERICENTER: 0,
    }
  },
)
const starlinkSatcatRecords = starlinkGpRecords.map((record) => ({
  ...satcatRecord,
  OBJECT_NAME: record.OBJECT_NAME,
  OBJECT_ID: record.OBJECT_ID,
  NORAD_CAT_ID: record.NORAD_CAT_ID,
}))

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

type RecoveryStateRow = {
  amendmentId: string
  priorStateJson: string
  attemptId: string
  phase: 'admitted' | 'verified' | 'held' | 'blocked'
  nextAllowedAtMs: number | null
  failureSource: string | null
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
  recoveryState: RecoveryStateRow | undefined
  failOutcomeWrite = false
  failStarlinkReservation = false
  failRecoveryWrite = false
  failReservationWrite = false

  readonly sql = {
    exec: <Row,>(
      query: string,
      ...bindings: Array<string | number | null>
    ) => {
      const normalized = query.replace(/\s+/g, ' ').trim()
      if (normalized.startsWith('CREATE TABLE')) {
        return new FakeCursor<Row>([])
      }
      if (normalized.startsWith('SELECT amendment_id')) {
        return new FakeCursor<Row>(
          this.recoveryState ? [{ ...this.recoveryState } as Row] : [],
        )
      }
      if (normalized.startsWith('INSERT INTO orbital_refresh_recovery')) {
        if (this.failRecoveryWrite || this.recoveryState) {
          throw new Error('Recovery storage failed')
        }
        const [amendmentId, priorStateJson, attemptId] = bindings
        if (
          typeof amendmentId !== 'string' ||
          typeof priorStateJson !== 'string' ||
          typeof attemptId !== 'string'
        ) throw new Error('Invalid recovery insert')
        this.recoveryState = {
          amendmentId, priorStateJson, attemptId, phase: 'admitted',
          nextAllowedAtMs: null, failureSource: null,
        }
        return new FakeCursor<Row>([])
      }
      if (normalized.startsWith('UPDATE orbital_refresh_recovery')) {
        if (this.failRecoveryWrite || !this.recoveryState) {
          throw new Error('Recovery storage failed')
        }
        const [phase, nextAllowedAtMs, failureSource] = bindings
        if (
          (phase !== 'verified' && phase !== 'held' && phase !== 'blocked') ||
          (nextAllowedAtMs !== null && typeof nextAllowedAtMs !== 'number') ||
          (failureSource !== null && typeof failureSource !== 'string')
        ) throw new Error('Invalid recovery update')
        this.recoveryState = {
          ...this.recoveryState, phase, nextAllowedAtMs, failureSource,
        }
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
        if (this.failReservationWrite) throw new Error('Reservation failed')
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
    const recoveryState = this.recoveryState
      ? { ...this.recoveryState }
      : undefined
    try {
      return callback()
    } catch (error) {
      this.state = state
      this.starlinkState = starlinkState
      this.recoveryState = recoveryState
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
    return jsonResponse(starlinkGpRecords)
  }
  if (url === STARLINK_SATCAT_SOURCE_URL) {
    return jsonResponse(starlinkSatcatRecords)
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

const reviewedBlockedStorage = () => {
  const storage = new FakeStorage()
  const lastStartedAtMs = ORBITAL_REVIEWED_RECOVERY.lastStartedAtMs
  storage.state = {
    schemaVersion: 1,
    sourceContractVersion: 1,
    attemptSequence: 17,
    attemptId: null,
    lastStartedAtMs,
    nextAllowedAtMs: Number.MAX_SAFE_INTEGER,
    blockedStatus: 403,
    blockedAtMs: lastStartedAtMs + 5_000,
  }
  storage.starlinkState = {
    schemaVersion: 1,
    sourceContractVersion: 1,
    lastStartedAtMs: lastStartedAtMs + 5_000,
    nextAllowedAtMs: lastStartedAtMs + 5_000 + STARLINK_REFRESH_INTERVAL_MS,
  }
  return storage
}

describe('orbital catalog coordinator', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('atomically consumes the exact reviewed stop once and excludes duplicate physical attempts', async () => {
    vi.useFakeTimers()
    const now = Date.parse('2026-10-14T06:00:00Z')
    vi.setSystemTime(now)
    const storage = reviewedBlockedStorage()
    const prior = { ...storage.state }
    const priorStarlink = { ...storage.starlinkState }
    const catalog = new MemoryKv()
    let release: (() => void) | undefined
    let started: (() => void) | undefined
    const pending = new Promise<void>((resolve) => { release = resolve })
    const beginning = new Promise<void>((resolve) => { started = resolve })
    const fetchImpl = vi.fn(async (input) => {
      if (fetchImpl.mock.calls.length === 1) {
        started?.()
        await pending
      }
      return sourceResponse(String(input))
    })
    vi.stubGlobal('fetch', fetchImpl)
    const coordinator = createCoordinator(storage, catalog, true)
    const first = coordinator.fetch(request())
    await beginning

    expect(JSON.parse(storage.recoveryState?.priorStateJson ?? '{}')).toEqual(prior)
    expect(storage.state?.attemptSequence).toBe(18)
    expect(storage.starlinkState).toEqual(priorStarlink)
    expect(await (await coordinator.fetch(request())).json()).toEqual({
      kind: 'not-due', nextAllowedAtMs: Number.MAX_SAFE_INTEGER,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    release?.()
    expect(await (await first).json()).toMatchObject({
      kind: 'published', starlink: { kind: 'published', recordCount: 512 },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(12)
    expect(storage.recoveryState?.phase).toBe('verified')
    expect(storage.state).toMatchObject({
      attemptSequence: 18, attemptId: null,
      lastStartedAtMs: now, nextAllowedAtMs: now + ORBITAL_REFRESH_INTERVAL_MS,
    })
    expect(storage.starlinkState).toMatchObject({
      lastStartedAtMs: now, nextAllowedAtMs: now + STARLINK_REFRESH_INTERVAL_MS,
    })
    const reconstructed = createCoordinator(storage, catalog, true)
    expect(await (await reconstructed.fetch(request())).json()).toMatchObject({
      kind: 'not-due',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(12)
  })

  it.each(['different-stop', 'different-status', 'in-progress', 'starlink-off'] as const)(
    'never amends an unreviewed or uncertain state: %s',
    async (scenario) => {
      vi.useFakeTimers()
      vi.setSystemTime(Date.parse('2026-10-14T06:00:00Z'))
      const storage = reviewedBlockedStorage()
      if (!storage.state) throw new Error('Missing fixture state')
      if (scenario === 'different-stop') storage.state.lastStartedAtMs -= 1
      if (scenario === 'different-status') storage.state.blockedStatus = 404
      if (scenario === 'in-progress') {
        storage.state.attemptId = `${storage.state.lastStartedAtMs}:17`
        storage.state.blockedStatus = null
        storage.state.blockedAtMs = null
      }
      const prior = { ...storage.state }
      const fetchImpl = vi.fn()
      vi.stubGlobal('fetch', fetchImpl)
      await createCoordinator(storage, new MemoryKv(), scenario !== 'starlink-off')
        .fetch(request())

      expect(storage.state).toEqual(prior)
      expect(storage.recoveryState).toBeUndefined()
      expect(fetchImpl).not.toHaveBeenCalled()
    },
  )

  it.each(['curated', 'starlink'] as const)('preserves the %s not-before boundary before consuming authorization', async (boundary) => {
    vi.useFakeTimers()
    const storage = reviewedBlockedStorage()
    const lastStarted = ORBITAL_REVIEWED_RECOVERY.lastStartedAtMs
    const next = boundary === 'curated'
      ? lastStarted + ORBITAL_REFRESH_INTERVAL_MS
      : lastStarted + 5_000 + STARLINK_REFRESH_INTERVAL_MS
    if (boundary === 'curated' && storage.starlinkState) {
      storage.starlinkState.lastStartedAtMs -= STARLINK_REFRESH_INTERVAL_MS
      storage.starlinkState.nextAllowedAtMs -= STARLINK_REFRESH_INTERVAL_MS
    }
    vi.setSystemTime(next - 1)
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await createCoordinator(storage, new MemoryKv(), true).fetch(request())
    expect(await response.json()).toEqual({ kind: 'not-due', nextAllowedAtMs: next })
    expect(storage.recoveryState).toBeUndefined()
    expect(storage.state?.blockedStatus).toBe(403)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each(['failRecoveryWrite', 'failReservationWrite'] as const)(
    'rolls back authorization and reservation together on %s',
    async (failure) => {
      vi.useFakeTimers()
      vi.setSystemTime(Date.parse('2026-10-14T06:00:00Z'))
      const storage = reviewedBlockedStorage()
      const prior = { ...storage.state }
      storage[failure] = true
      const fetchImpl = vi.fn()
      vi.stubGlobal('fetch', fetchImpl)
      const response = await createCoordinator(storage, new MemoryKv(), true).fetch(request())
      expect(await response.json()).toMatchObject({ kind: 'unavailable' })
      expect(storage.state).toEqual(prior)
      expect(storage.recoveryState).toBeUndefined()
      expect(fetchImpl).not.toHaveBeenCalled()
    },
  )

  it('reblocks a renewed denial and cannot replenish authorization after reconstruction', async () => {
    vi.useFakeTimers()
    const now = Date.parse('2026-10-14T06:00:00Z')
    vi.setSystemTime(now)
    const storage = reviewedBlockedStorage()
    const catalog = new MemoryKv()
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchImpl = vi.fn(async (input) =>
      String(input) === STARLINK_SATCAT_SOURCE_URL
        ? new Response('PRIVATE-DENIAL 203.0.113.42', { status: 403 })
        : sourceResponse(String(input)),
    )
    vi.stubGlobal('fetch', fetchImpl)
    expect(await (await createCoordinator(storage, catalog, true).fetch(request())).json())
      .toEqual({ kind: 'blocked', status: 403 })
    expect(storage.recoveryState).toMatchObject({
      phase: 'blocked', failureSource: 'starlink-satcat',
    })
    vi.setSystemTime(now + 24 * ORBITAL_REFRESH_INTERVAL_MS)
    expect(await (await createCoordinator(storage, catalog, true).fetch(request())).json())
      .toEqual({ kind: 'blocked', status: 403 })
    expect(fetchImpl).toHaveBeenCalledTimes(12)
    expect(JSON.stringify(warning.mock.calls)).not.toMatch(/PRIVATE-DENIAL|203\.0\.113\.42/)
    warning.mockRestore()
  })

  it.each([false, true])('holds an inconclusive diagnostic without losing finite guidance (rate limited: %s)', async (limited) => {
    vi.useFakeTimers()
    const now = Date.parse('2026-10-14T06:00:00Z')
    vi.setSystemTime(now)
    const storage = reviewedBlockedStorage()
    const catalog = new MemoryKv()
    const fetchImpl = vi.fn(async () => limited
      ? new Response(null, { status: 503, headers: { 'Retry-After': '10800' } })
      : new Response('malformed', { headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchImpl)
    const coordinator = createCoordinator(storage, catalog, true)
    await coordinator.fetch(request())
    expect(storage.recoveryState).toMatchObject({
      phase: 'held',
      nextAllowedAtMs: now + (limited ? 10_800_000 : ORBITAL_REFRESH_INTERVAL_MS),
    })
    expect(storage.state?.nextAllowedAtMs).toBe(Number.MAX_SAFE_INTEGER)
    expect(storage.state?.attemptId).not.toBeNull()
    const priorState = { ...storage.state }
    const priorRecovery = { ...storage.recoveryState }
    const status = await coordinator.fetch(new Request(
      `https://orbital.internal${ORBITAL_COORDINATOR_STATUS_PATH}`,
    ))
    expect(await status.json()).toMatchObject({
      phase: 'blocked',
      recoveryPhase: 'held',
      recoveryNextAllowedAtMs:
        now + (limited ? 10_800_000 : ORBITAL_REFRESH_INTERVAL_MS),
    })
    expect(storage.state).toEqual(priorState)
    expect(storage.recoveryState).toEqual(priorRecovery)
    vi.setSystemTime(now + 24 * ORBITAL_REFRESH_INTERVAL_MS)
    await createCoordinator(storage, catalog, true).fetch(request())
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(catalog.values.size).toBe(0)
  })

  it('retains the consumed authorization and physical fence when outcome persistence fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-10-14T06:00:00Z'))
    const storage = reviewedBlockedStorage()
    storage.failOutcomeWrite = true
    const catalog = new MemoryKv()
    const fetchImpl = vi.fn(async (input) => sourceResponse(String(input)))
    vi.stubGlobal('fetch', fetchImpl)
    const result = await createCoordinator(storage, catalog, true).fetch(request())
    expect(await result.json()).toMatchObject({ kind: 'unavailable' })
    expect(storage.recoveryState?.phase).toBe('admitted')
    expect(storage.state?.nextAllowedAtMs).toBe(Number.MAX_SAFE_INTEGER)
    await createCoordinator(storage, catalog, true).fetch(request())
    expect(fetchImpl).toHaveBeenCalledTimes(12)
    expect(catalog.values.size).toBe(0)
  })

  it('reads a terminal fence and Starlink deadline without acquiring, modifying or exposing its attempt identity', async () => {
    const storage = new FakeStorage()
    storage.state = {
      schemaVersion: ORBITAL_COORDINATOR_STATE_SCHEMA_VERSION,
      sourceContractVersion: ORBITAL_COORDINATOR_STATE_CONTRACT_VERSION,
      attemptSequence: 7,
      attemptId: null,
      lastStartedAtMs: nowMs,
      nextAllowedAtMs: Number.MAX_SAFE_INTEGER,
      blockedStatus: 403,
      blockedAtMs: nowMs + 10,
    }
    storage.starlinkState = {
      schemaVersion: STARLINK_COORDINATOR_STATE_SCHEMA_VERSION,
      sourceContractVersion: STARLINK_COORDINATOR_STATE_CONTRACT_VERSION,
      lastStartedAtMs: nowMs,
      nextAllowedAtMs: nowMs + STARLINK_REFRESH_INTERVAL_MS,
    }
    const before = structuredClone([storage.state, storage.starlinkState])
    const catalog = new MemoryKv()
    const put = vi.spyOn(catalog, 'put')
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const coordinator = createCoordinator(storage, catalog, true)
    const response = await coordinator.fetch(new Request(
      `https://orbital.internal${ORBITAL_COORDINATOR_STATUS_PATH}`,
    ))
    expect(await response.json()).toEqual({
      kind: 'status',
      phase: 'blocked',
      lastStartedAtMs: nowMs,
      nextAllowedAtMs: Number.MAX_SAFE_INTEGER,
      blockedStatus: 403,
      starlinkLastStartedAtMs: nowMs,
      starlinkNextAllowedAtMs: nowMs + STARLINK_REFRESH_INTERVAL_MS,
    })
    expect([storage.state, storage.starlinkState]).toEqual(before)
    expect(put).not.toHaveBeenCalled()
    expect(upstream).not.toHaveBeenCalled()
    expect((await coordinator.fetch(new Request(
      `https://orbital.internal${ORBITAL_COORDINATOR_STATUS_PATH}`,
      { method: 'POST' },
    ))).status).toBe(405)
  })

  it('does not initialize an admission row merely by inspecting an unused coordinator', async () => {
    const storage = new FakeStorage()
    const coordinator = createCoordinator(storage, new MemoryKv())
    const response = await coordinator.fetch(new Request(
      `https://orbital.internal${ORBITAL_COORDINATOR_STATUS_PATH}`,
    ))
    expect(await response.json()).toMatchObject({
      kind: 'status', phase: 'never-started', lastStartedAtMs: null,
    })
    expect(storage.state).toBeUndefined()
    expect(storage.starlinkState).toBeUndefined()
  })

  it.each([200, 304, 503])('preserves catalog status %i and only reads the existing named actor', async (statusCode) => {
    const status = {
      kind: 'status', phase: 'blocked', lastStartedAtMs: nowMs,
      nextAllowedAtMs: Number.MAX_SAFE_INTEGER, blockedStatus: 403,
      starlinkLastStartedAtMs: null, starlinkNextAllowedAtMs: null,
      recoveryPhase: 'blocked', recoveryNextAllowedAtMs: null,
      failureSource: 'starlink-satcat',
    }
    const inspect = vi.fn(async (input: Request) => {
      expect(input.method).toBe('GET')
      expect(new URL(input.url).pathname).toBe(ORBITAL_COORDINATOR_STATUS_PATH)
      return jsonResponse(status)
    })
    const identity = vi.fn(() => 'existing-actor')
    const result = await withOrbitalRefreshStatus(
      new Request('https://app.example/api/orbits/catalog'),
      new Response(statusCode === 304 ? null : 'original', {
        status: statusCode, headers: { ETag: '"original-digest"' },
      }),
      {
        ASSETS: { fetch: vi.fn() },
        ORBITAL_CATALOG_ENABLED: 'true',
        ORBITAL_CATALOG_COORDINATOR: {
          idFromName: identity, get: () => ({ fetch: inspect }),
        },
      },
    )
    expect(result.status).toBe(statusCode)
    expect(result.headers.get('etag')).toBe('"original-digest"')
    expect(result.headers.get('x-livetrafficstan-orbital-refresh-state')).toBe('blocked')
    expect(result.headers.get('x-livetrafficstan-orbital-refresh-blocked-status')).toBe('403')
    expect(result.headers.get('x-livetrafficstan-orbital-refresh-recovery-state')).toBe('blocked')
    expect(result.headers.get('x-livetrafficstan-orbital-refresh-last-failure-source')).toBe('starlink-satcat')
    expect(await result.text()).toBe(statusCode === 304 ? '' : 'original')
    expect(identity).toHaveBeenCalledWith(ORBITAL_COORDINATOR_OBJECT_NAME)
    expect(inspect).toHaveBeenCalledTimes(1)
  })

  it.each([
    { kind: 'status', phase: ['blocked'] },
    { kind: 'status', phase: 'idle' },
  ])('reports malformed diagnostics without relabeling valid catalog data as an acquisition success', async (status) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const result = await withOrbitalRefreshStatus(
        new Request('https://app.example/api/orbits/catalog'),
        new Response('catalog'),
        {
          ASSETS: { fetch: vi.fn() }, ORBITAL_CATALOG_ENABLED: 'true',
          ORBITAL_CATALOG_COORDINATOR: {
            idFromName: () => 'existing-actor',
            get: () => ({ fetch: async () => jsonResponse(status) }),
          },
        },
      )
      expect(result.headers.get('x-livetrafficstan-orbital-refresh-state')).toBe('unavailable')
      expect(await result.text()).toBe('catalog')
      expect(warning).toHaveBeenCalledWith('Orbital refresh status read unavailable')
    } finally {
      warning.mockRestore()
    }
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
    expect(
      catalog.values.has(STARLINK_CATALOG_PUBLICATION_KEY),
    ).toBe(false)
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
        starlink: {
          kind: 'published',
          recordCount: STARLINK_V2_SAMPLE_LIMIT,
        },
      })
      expect(fetchImpl).toHaveBeenCalledTimes(12)
      expect(
        catalog.values.has(STARLINK_CATALOG_PUBLICATION_KEY),
      ).toBe(true)
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
