import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ORBITAL_CATALOG_KEY,
  ORBITAL_REFRESH_INTERVAL_MS,
  ORBITAL_SOURCES,
  ORBITAL_UPSTREAM_TIMEOUT_MS,
  type OrbitalCatalogFetch,
  type OrbitalKeyValueStore,
} from './orbitalCatalog.js'
import {
  ORBITAL_COORDINATOR_PATH,
  ORBITAL_COORDINATOR_STATUS_PATH,
  ORBITAL_COORDINATOR_OBJECT_NAME,
  ORBITAL_COORDINATOR_LAST_OUTCOME_KEY,
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
import { SPACE_TRACK_GP_INITIAL_NOT_BEFORE_MS } from '../src/providers/orbital/spaceTrackCatalogContract.ts'
import { SPACE_TRACK_STARLINK_KEY } from './spaceTrackCatalog.ts'
import { SPACE_TRACK_LOGIN_URL } from './spaceTrackProtocol.ts'

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
  readonly values = new Map<string, unknown>()
  state: StateRow | undefined
  starlinkState: StarlinkStateRow | undefined
  recoveryState: RecoveryStateRow | undefined
  failOutcomeWrite = false
  failStarlinkReservation = false
  failRecoveryWrite = false
  failReservationWrite = false
  failDiagnosticWrite = false
  failDiagnosticRead = false

  async get(key: string) {
    if (this.failDiagnosticRead) throw new Error('Diagnostic read failed')
    return this.values.get(key)
  }

  async put(key: string, value: unknown) {
    if (this.failDiagnosticWrite) throw new Error('Diagnostic write failed')
    this.values.set(key, structuredClone(value))
  }

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
  source: 'celestrak' | 'space-track' = 'celestrak',
) =>
  new OrbitalCatalogCoordinator(
    { storage } as unknown as DurableObjectState,
    {
      ASSETS: { fetch: vi.fn() },
      ORBITAL_CATALOG: catalog,
      ORBITAL_CATALOG_ENABLED: 'true',
      ORBITAL_CATALOG_SOURCE: source,
      ...(source === 'space-track' ? {
        SPACE_TRACK_USERNAME: 'protected-user',
        SPACE_TRACK_PASSWORD: 'protected-password',
      } : {}),
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

const previousChildFailure = (at: number) => ({
  kind: 'failed',
  startedAtMs: at - STARLINK_REFRESH_INTERVAL_MS - 60_000,
  completedAtMs: at - STARLINK_REFRESH_INTERVAL_MS - 30_000,
  reason: 'Previous CelesTrak acquisition failed',
  curatedPublication: 'not-attempted',
  starlinkKind: 'failed',
  starlinkReason: 'Previous CelesTrak GP returned HTTP 522',
  starlinkSource: 'starlink-gp',
  starlinkStatus: 522,
  starlinkPublication: 'not-attempted',
  starlinkStartedAtMs: at - STARLINK_REFRESH_INTERVAL_MS - 50_000,
  starlinkCompletedAtMs: at - STARLINK_REFRESH_INTERVAL_MS - 30_000,
})

describe('orbital catalog coordinator', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('composes the qualification not-before instant with preserved native operational clocks', async () => {
    vi.useFakeTimers()
    const initial = SPACE_TRACK_GP_INITIAL_NOT_BEFORE_MS
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const empty = new FakeStorage()
    vi.setSystemTime(initial - 1)
    expect(await (await createCoordinator(empty, new MemoryKv(), true, 'space-track').fetch(request())).json())
      .toEqual({ kind: 'not-due', nextAllowedAtMs: initial })
    expect(empty.state).toBeUndefined()
    const preserved = new FakeStorage()
    preserved.state = {
      schemaVersion: 1, sourceContractVersion: 1, attemptSequence: 8, attemptId: null,
      lastStartedAtMs: initial - ORBITAL_REFRESH_INTERVAL_MS / 2,
      nextAllowedAtMs: initial + ORBITAL_REFRESH_INTERVAL_MS / 2,
      blockedStatus: null, blockedAtMs: null,
    }
    const before = { ...preserved.state }
    vi.setSystemTime(initial)
    expect(await (await createCoordinator(preserved, new MemoryKv(), true, 'space-track').fetch(request())).json())
      .toEqual({ kind: 'not-due', nextAllowedAtMs: before.nextAllowedAtMs })
    expect(preserved.state).toEqual(before)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not apply the historical CelesTrak recovery authorization to a different selected source', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(SPACE_TRACK_GP_INITIAL_NOT_BEFORE_MS + ORBITAL_REFRESH_INTERVAL_MS)
    const storage = reviewedBlockedStorage()
    const prior = structuredClone(storage.state)
    const child = structuredClone(storage.starlinkState)
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await createCoordinator(storage, new MemoryKv(), true, 'space-track').fetch(request())
    expect(await response.json()).toEqual({ kind: 'blocked', status: 403 })
    expect(storage.state).toEqual(prior)
    expect(storage.starlinkState).toEqual(child)
    expect(storage.recoveryState).toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('records native Starlink-only fulfillment without rewriting the curated publication fact', async () => {
    vi.useFakeTimers()
    const at = SPACE_TRACK_GP_INITIAL_NOT_BEFORE_MS + ORBITAL_REFRESH_INTERVAL_MS
    vi.setSystemTime(at)
    const storage = new FakeStorage()
    storage.values.set(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY, previousChildFailure(at))
    const catalog = new MemoryKv()
    const native = starlinkGpRecords.map((record) => ({
      ...record,
      OBJECT_NAME: `STARLINK-${record.NORAD_CAT_ID}`,
      OBJECT_TYPE: 'PAYLOAD',
      EPOCH: new Date(at - 60_000).toISOString().replace('Z', ''),
      DECAY_DATE: null,
    }))
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => String(input) === SPACE_TRACK_LOGIN_URL
      ? new Response('""', { headers: { 'Set-Cookie': 'session=private; Path=/; Secure' } })
      : Response.json(native))
    vi.stubGlobal('fetch', fetchImpl)
    const response = await createCoordinator(storage, catalog, true, 'space-track').fetch(request())
    expect(await response.json()).toMatchObject({
      kind: 'published', publicationResults: { curated: 'not-attempted', starlink: 'fulfilled' },
    })
    expect(storage.values.get(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY)).toMatchObject({
      kind: 'published', curatedPublication: 'not-attempted', starlinkPublication: 'fulfilled',
      starlinkKind: 'published', starlinkStartedAtMs: at,
    })
    expect([...catalog.values.keys()]).toEqual([SPACE_TRACK_STARLINK_KEY])
    expect(storage.state?.nextAllowedAtMs).toBe(at + ORBITAL_REFRESH_INTERVAL_MS)
    expect(storage.starlinkState?.nextAllowedAtMs).toBe(at + STARLINK_REFRESH_INTERVAL_MS)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const replacement = storage.values.get(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY)
    expect(replacement).not.toHaveProperty('starlinkStatus')
    expect(replacement).not.toHaveProperty('starlinkSource')
    expect(replacement).not.toHaveProperty('starlinkReason')
    vi.setSystemTime(at + ORBITAL_REFRESH_INTERVAL_MS)
    fetchImpl.mockImplementation(async (input) => String(input) === SPACE_TRACK_LOGIN_URL
      ? new Response('""', { headers: { 'Set-Cookie': 'session=private; Path=/' } })
      : Response.json([]))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await createCoordinator(storage, catalog, true, 'space-track').fetch(request())
    expect(storage.values.get(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY)).toMatchObject({
      starlinkKind: 'published', starlinkPublication: 'fulfilled', starlinkStartedAtMs: at,
    })
    expect(storage.values.get(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY)).not.toHaveProperty('starlinkStatus')
  })

  it('replaces an old HTTP child failure with a new native no-HTTP failure without inheriting its status or source', async () => {
    vi.useFakeTimers()
    const at = SPACE_TRACK_GP_INITIAL_NOT_BEFORE_MS + ORBITAL_REFRESH_INTERVAL_MS
    vi.setSystemTime(at)
    const storage = new FakeStorage()
    storage.values.set(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY, previousChildFailure(at))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === SPACE_TRACK_LOGIN_URL) {
        return new Response('""', { headers: { 'Set-Cookie': 'session=private; Path=/' } })
      }
      throw new Error('Network unavailable')
    }))
    await createCoordinator(storage, new MemoryKv(), true, 'space-track').fetch(request())
    const replacement = storage.values.get(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY)
    expect(replacement).toMatchObject({
      starlinkKind: 'failed', starlinkStartedAtMs: at,
      starlinkReason: 'Space-Track Starlink GP acquisition or publication failed',
    })
    expect(replacement).not.toHaveProperty('starlinkStatus')
    expect(replacement).not.toHaveProperty('starlinkSource')
  })

  it('retains a transient source failure across actor recreation without confusing idle with publication', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(nowMs)
    const storage = new FakeStorage()
    const catalog = new MemoryKv()
    const upstream = vi.fn(async () => new Response('PRIVATE PROVIDER BODY', {
      status: 502,
    }))
    vi.stubGlobal('fetch', upstream)
    const coordinator = createCoordinator(storage, catalog)
    const response = await coordinator.fetch(request())
    expect(await response.json()).toEqual({
      kind: 'failed', reason: 'Orbital upstream request failed',
      source: 'visual-gp', status: 502,
    })
    expect(storage.state?.attemptId).toBeNull()
    expect(storage.state?.nextAllowedAtMs).toBe(nowMs + ORBITAL_REFRESH_INTERVAL_MS)
    expect(catalog.values.size).toBe(0)

    const recreated = createCoordinator(storage, catalog)
    const result = await withOrbitalRefreshStatus(
      new Request('https://app.example/api/orbits/catalog'),
      new Response('unchanged catalog', { status: 200, headers: { ETag: '"same"' } }),
      {
        ASSETS: { fetch: vi.fn() }, ORBITAL_CATALOG_ENABLED: 'true',
        ORBITAL_CATALOG_COORDINATOR: {
          idFromName: () => 'existing',
          get: () => ({ fetch: (input) => recreated.fetch(input) }),
        },
      },
    )
    expect(result.headers.get('x-livetrafficstan-orbital-refresh-state')).toBe('idle')
    expect(result.headers.get('x-livetrafficstan-orbital-refresh-last-outcome')).toBe('failed')
    expect(result.headers.get('x-livetrafficstan-orbital-refresh-last-outcome-reason')).toBe('Orbital upstream request failed')
    expect(result.headers.get('x-livetrafficstan-orbital-refresh-last-outcome-source')).toBe('visual-gp')
    expect(result.headers.get('x-livetrafficstan-orbital-refresh-last-outcome-status')).toBe('502')
    expect(result.headers.get('etag')).toBe('"same"')
    expect(await result.text()).toBe('unchanged catalog')
    expect(upstream).toHaveBeenCalledTimes(1)
    const stored = JSON.stringify(storage.values.get(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY))
    expect(stored).not.toContain('PRIVATE')
    expect(stored).not.toContain('attemptId')
    expect(stored).not.toContain('https:')
  })

  it('records Starlink failure separately from successful curated publication', async () => {
    vi.useFakeTimers()
    const startedAtMs = Date.parse('2026-10-16T20:17:00Z')
    vi.setSystemTime(startedAtMs)
    const storage = new FakeStorage()
    const catalog = new MemoryKv()
    vi.stubGlobal('fetch', vi.fn(async (input) =>
      String(input) === STARLINK_GP_SOURCE_URL
        ? new Response('PRIVATE DENIAL', { status: 503 })
        : sourceResponse(String(input)),
    ))
    const coordinator = createCoordinator(storage, catalog, true)
    expect(await (await coordinator.fetch(request())).json()).toMatchObject({
      kind: 'published',
      starlink: {
        kind: 'failed', source: 'starlink-gp', status: 503,
        reason: 'Starlink upstream request failed',
      },
    })
    expect(catalog.values.has(ORBITAL_CATALOG_KEY)).toBe(true)
    expect(catalog.values.has(STARLINK_CATALOG_PUBLICATION_KEY)).toBe(false)
    expect(storage.values.get(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY)).toEqual({
      kind: 'published', startedAtMs, completedAtMs: startedAtMs,
      curatedPublication: 'fulfilled', starlinkPublication: 'not-attempted',
      starlinkKind: 'failed', starlinkReason: 'Starlink upstream request failed',
      starlinkSource: 'starlink-gp', starlinkStatus: 503,
      starlinkStartedAtMs: startedAtMs, starlinkCompletedAtMs: startedAtMs,
    })
    expect(storage.starlinkState?.nextAllowedAtMs).toBe(startedAtMs + STARLINK_REFRESH_INTERVAL_MS)
  })

  it('records a fresh Starlink publication after the exact curated timeout across actor recreation', async () => {
    vi.useFakeTimers()
    const startedAtMs = Date.parse('2026-10-16T22:17:00Z')
    vi.setSystemTime(startedAtMs)
    const storage = new FakeStorage()
    const catalog = new MemoryKv()
    catalog.values.set(ORBITAL_CATALOG_KEY, 'prior-curated')
    const upstream = vi.fn<OrbitalCatalogFetch>(async (input, init) => {
      if (String(input) !== ORBITAL_SOURCES[0].gpSourceUrl) return sourceResponse(String(input))
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) throw new Error('Expected bounded request signal')
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    })
    vi.stubGlobal('fetch', upstream)
    const pending = createCoordinator(storage, catalog, true).fetch(request())
    await vi.advanceTimersByTimeAsync(ORBITAL_UPSTREAM_TIMEOUT_MS)
    expect(await (await pending).json()).toMatchObject({
      kind: 'failed', reason: 'Orbital upstream timed out', source: 'visual-gp',
      publicationResults: { curated: 'not-attempted', starlink: 'fulfilled' },
      starlink: { kind: 'published', recordCount: STARLINK_V2_SAMPLE_LIMIT },
    })
    const childStartedAtMs = startedAtMs + ORBITAL_UPSTREAM_TIMEOUT_MS
    expect(storage.values.get(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY)).toEqual({
      kind: 'failed', reason: 'Orbital upstream timed out', source: 'visual-gp',
      startedAtMs, completedAtMs: childStartedAtMs,
      curatedPublication: 'not-attempted', starlinkPublication: 'fulfilled',
      starlinkKind: 'published', starlinkStartedAtMs: childStartedAtMs,
      starlinkCompletedAtMs: childStartedAtMs,
    })
    expect(catalog.values.get(ORBITAL_CATALOG_KEY)).toBe('prior-curated')
    expect(catalog.values.has(STARLINK_CATALOG_PUBLICATION_KEY)).toBe(true)
    const recreated = createCoordinator(storage, catalog, true)
    const status = await recreated.fetch(new Request(
      `https://orbital.internal${ORBITAL_COORDINATOR_STATUS_PATH}`,
    ))
    expect(await status.json()).toMatchObject({
      phase: 'idle',
      lastStartedAtMs: startedAtMs,
      nextAllowedAtMs: startedAtMs + ORBITAL_REFRESH_INTERVAL_MS,
      starlinkLastStartedAtMs: childStartedAtMs,
      starlinkNextAllowedAtMs: childStartedAtMs + STARLINK_REFRESH_INTERVAL_MS,
      lastOutcome: { starlinkKind: 'published', curatedPublication: 'not-attempted' },
    })
    expect(upstream).toHaveBeenCalledTimes(3)
  })

  it.each([403, 429])('records the actual child %s stop after curated failure', async (status) => {
    vi.useFakeTimers()
    const startedAtMs = Date.parse('2026-10-16T22:17:00Z')
    vi.setSystemTime(startedAtMs)
    const storage = new FakeStorage()
    const catalog = new MemoryKv()
    const upstream = vi.fn<OrbitalCatalogFetch>(async (input) =>
      new Response(null, String(input) === ORBITAL_SOURCES[0].gpSourceUrl
        ? { status: 502 }
        : { status, headers: { 'Retry-After': '10800' } }),
    )
    vi.stubGlobal('fetch', upstream)
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      expect(await (await createCoordinator(storage, catalog, true).fetch(request())).json())
        .toMatchObject({ kind: status === 403 ? 'blocked' : 'rate-limited' })
      expect(storage.values.get(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY)).toMatchObject({
        kind: status === 403 ? 'blocked' : 'rate-limited',
        curatedPublication: 'not-attempted', starlinkPublication: 'not-attempted',
        starlinkKind: 'failed', starlinkStatus: status,
        starlinkStartedAtMs: startedAtMs, starlinkCompletedAtMs: startedAtMs,
      })
      expect(upstream).toHaveBeenCalledTimes(2)
      expect(catalog.values.size).toBe(0)
    } finally {
      warning.mockRestore()
    }
  })

  it('does not overwrite the last admitted result on early duplicate events', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(nowMs)
    const storage = new FakeStorage()
    const catalog = new MemoryKv()
    const upstream = vi.fn(async (input) => sourceResponse(String(input)))
    vi.stubGlobal('fetch', upstream)
    const coordinator = createCoordinator(storage, catalog)
    expect(await (await coordinator.fetch(request())).json()).toMatchObject({ kind: 'published' })
    const original = structuredClone(storage.values.get(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY))
    vi.setSystemTime(nowMs + 60_000)
    expect(await (await coordinator.fetch(request())).json()).toMatchObject({ kind: 'not-due' })
    expect(storage.values.get(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY)).toEqual(original)
    expect(upstream).toHaveBeenCalledTimes(10)
  })

  it('retains the last actual Starlink result when a newer curated failure finds the child not due', async () => {
    vi.useFakeTimers()
    const startedAtMs = Date.parse('2026-10-16T20:17:00Z')
    vi.setSystemTime(startedAtMs)
    const storage = new FakeStorage()
    const catalog = new MemoryKv()
    const upstream = vi.fn(async (input) =>
      String(input) === STARLINK_GP_SOURCE_URL
        ? new Response(null, { status: 503 })
        : sourceResponse(String(input)),
    )
    vi.stubGlobal('fetch', upstream)
    const coordinator = createCoordinator(storage, catalog, true)
    await coordinator.fetch(request())
    vi.setSystemTime(startedAtMs + ORBITAL_REFRESH_INTERVAL_MS)
    upstream.mockImplementation(async () => new Response(null, { status: 502 }))
    await coordinator.fetch(request())
    expect(storage.values.get(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY)).toMatchObject({
      kind: 'failed', startedAtMs: startedAtMs + ORBITAL_REFRESH_INTERVAL_MS,
      curatedPublication: 'not-attempted', source: 'visual-gp', status: 502,
      starlinkKind: 'failed', starlinkSource: 'starlink-gp', starlinkStatus: 503,
      starlinkPublication: 'not-attempted',
      starlinkStartedAtMs: startedAtMs, starlinkCompletedAtMs: startedAtMs,
    })
    expect(storage.starlinkState?.lastStartedAtMs).toBe(startedAtMs)
  })

  it('fences an obsolete diagnostic callback after a newer admitted attempt completes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(nowMs)
    const storage = new FakeStorage()
    const catalog = new MemoryKv()
    vi.stubGlobal('fetch', vi.fn(async (input) => sourceResponse(String(input))))
    let releaseRead = () => {}
    const gate = new Promise<void>((resolve) => { releaseRead = resolve })
    let markReading = () => {}
    const reading = new Promise<void>((resolve) => { markReading = resolve })
    const read = vi.spyOn(storage, 'get').mockImplementationOnce(async () => {
      markReading()
      await gate
      return undefined
    })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const coordinator = createCoordinator(storage, catalog)
    const first = coordinator.fetch(request())
    try {
      await reading
      vi.setSystemTime(nowMs + ORBITAL_REFRESH_INTERVAL_MS)
      expect(await (await coordinator.fetch(request())).json()).toMatchObject({ kind: 'published' })
      releaseRead()
      expect(await (await first).json()).toMatchObject({ kind: 'published' })
      expect(storage.values.get(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY)).toMatchObject({
        kind: 'published', startedAtMs: nowMs + ORBITAL_REFRESH_INTERVAL_MS,
      })
      expect(warning).toHaveBeenCalledWith('Orbital refresh outcome diagnostic write unavailable')
    } finally {
      releaseRead()
      read.mockRestore()
      warning.mockRestore()
    }
  })

  it.each(['curated', 'starlink', 'both'])(
    'records settled publication results when %s storage fails without exposing its exception',
    async (failed) => {
      vi.useFakeTimers()
      const startedAtMs = Date.parse('2026-10-16T20:17:00Z')
      vi.setSystemTime(startedAtMs)
      const storage = new FakeStorage()
      const catalog = new MemoryKv()
      vi.spyOn(catalog, 'put').mockImplementation(async (key, value) => {
        if (failed === 'both' ||
          (failed === 'curated' && key === ORBITAL_CATALOG_KEY) ||
          (failed === 'starlink' && key === STARLINK_CATALOG_PUBLICATION_KEY)
        ) throw new Error('PRIVATE STORAGE ERROR https://private.example')
        catalog.values.set(key, value)
      })
      vi.stubGlobal('fetch', vi.fn(async (input) => sourceResponse(String(input))))
      const coordinator = createCoordinator(storage, catalog, true)
      expect(await (await coordinator.fetch(request())).json()).toMatchObject({ kind: 'failed' })
      const diagnostic = storage.values.get(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY)
      expect(diagnostic).toMatchObject({
        kind: 'failed',
        curatedPublication: failed === 'curated' || failed === 'both' ? 'rejected' : 'fulfilled',
        starlinkPublication: failed === 'starlink' || failed === 'both' ? 'rejected' : 'fulfilled',
        starlinkKind: failed === 'curated' ? 'published' : 'failed',
        starlinkStartedAtMs: startedAtMs,
      })
      expect(JSON.stringify(diagnostic)).not.toContain('PRIVATE')
      expect(JSON.stringify(diagnostic)).not.toContain('https:')
      expect(storage.state?.nextAllowedAtMs).toBe(startedAtMs + ORBITAL_REFRESH_INTERVAL_MS)
      expect(storage.starlinkState?.nextAllowedAtMs).toBe(startedAtMs + STARLINK_REFRESH_INTERVAL_MS)
    },
  )

  it('keeps acquisition gates and successful publication when optional diagnostic storage fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(nowMs)
    const storage = new FakeStorage()
    storage.failDiagnosticWrite = true
    const catalog = new MemoryKv()
    vi.stubGlobal('fetch', vi.fn(async (input) => sourceResponse(String(input))))
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const coordinator = createCoordinator(storage, catalog)
      expect(await (await coordinator.fetch(request())).json()).toMatchObject({ kind: 'published' })
      expect(catalog.values.has(ORBITAL_CATALOG_KEY)).toBe(true)
      expect(storage.state?.nextAllowedAtMs).toBe(nowMs + ORBITAL_REFRESH_INTERVAL_MS)
      expect(warning).toHaveBeenCalledWith('Orbital refresh outcome diagnostic write unavailable')
    } finally {
      warning.mockRestore()
    }
  })

  it('rejects malformed or private outcome diagnostics without acquiring or rewriting state', async () => {
    const storage = new FakeStorage()
    storage.values.set(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY, {
      kind: 'failed', startedAtMs: nowMs, completedAtMs: nowMs,
      source: 'https://private.example/?lat=59.12345', reason: 'PRIVATE\nBODY',
    })
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const coordinator = createCoordinator(storage, new MemoryKv())
      const result = await coordinator.fetch(new Request(
        `https://orbital.internal${ORBITAL_COORDINATOR_STATUS_PATH}`,
      ))
      expect(result.status).toBe(503)
      expect(await result.text()).not.toContain('PRIVATE')
      expect(storage.state).toBeUndefined()
      expect(upstream).not.toHaveBeenCalled()
      expect(warning).toHaveBeenCalledWith('Orbital refresh outcome diagnostic read unavailable')
    } finally {
      warning.mockRestore()
    }
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
      .toEqual({
        kind: 'blocked', status: 403,
        publicationResults: { curated: 'fulfilled' },
        starlink: {
          kind: 'failed', reason: 'Starlink upstream access stopped',
          status: 403, source: 'starlink-satcat',
        },
      })
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
    const fetchImpl = vi.fn<OrbitalCatalogFetch>(async () => limited
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
    expect(fetchImpl).toHaveBeenCalledTimes(limited ? 1 : 2)
    if (!limited) {
      expect(fetchImpl.mock.calls[1]?.[0]).toBe(STARLINK_GP_SOURCE_URL)
      expect(storage.starlinkState?.lastStartedAtMs).toBe(now)
    }
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

  it.each([false, true])('atomically admits one concurrent delivery (curated failed: %s)', async (curatedFailed) => {
    vi.useFakeTimers()
    const startedAtMs = curatedFailed ? Date.parse('2026-10-16T22:17:00Z') : nowMs
    vi.setSystemTime(startedAtMs)
    const storage = new FakeStorage()
    const catalog = new MemoryKv()
    const coordinator = createCoordinator(storage, catalog, curatedFailed)
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
        const url = String(input)
        if (curatedFailed && url === ORBITAL_SOURCES[0].gpSourceUrl) {
          return new Response(null, { status: 502 })
        }
        if (url === (curatedFailed ? STARLINK_GP_SOURCE_URL : ORBITAL_SOURCES[0].gpSourceUrl)) {
          markGpStarted()
          await gpGate
        }
        return sourceResponse(url)
      },
    )
    vi.stubGlobal('fetch', fetchImpl)

    const first = coordinator.fetch(request())
    await gpStarted
    const duplicate = await (curatedFailed
      ? createCoordinator(storage, catalog, true)
      : coordinator).fetch(request())

    expect(await duplicate.json()).toEqual({
      kind: 'not-due',
      nextAllowedAtMs: Number.MAX_SAFE_INTEGER,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(curatedFailed ? 2 : 1)

    releaseGp()
    const published = await first
    expect(await published.json()).toMatchObject(curatedFailed
      ? { kind: 'failed', source: 'visual-gp', starlink: { kind: 'published' } }
      : { kind: 'published', recordCount: 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(curatedFailed ? 3 : 10)
    expect(catalog.values.has(ORBITAL_CATALOG_KEY)).toBe(!curatedFailed)
    expect(catalog.values.has(STARLINK_CATALOG_PUBLICATION_KEY)).toBe(curatedFailed)
    expect(storage.state?.nextAllowedAtMs).toBe(
      startedAtMs + ORBITAL_REFRESH_INTERVAL_MS,
    )
    expect(storage.state).toMatchObject({
      schemaVersion: ORBITAL_COORDINATOR_STATE_SCHEMA_VERSION,
      sourceContractVersion:
        ORBITAL_COORDINATOR_STATE_CONTRACT_VERSION,
      attemptSequence: 1,
      attemptId: null,
      lastStartedAtMs: startedAtMs,
      blockedStatus: null,
      blockedAtMs: null,
    })
    expect(storage.starlinkState).toEqual(curatedFailed ? {
      schemaVersion: STARLINK_COORDINATOR_STATE_SCHEMA_VERSION,
      sourceContractVersion: STARLINK_COORDINATOR_STATE_CONTRACT_VERSION,
      lastStartedAtMs: startedAtMs,
      nextAllowedAtMs: startedAtMs + STARLINK_REFRESH_INTERVAL_MS,
    } : undefined)
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
      publicationResults: { curated: 'fulfilled' },
      starlink: {
        kind: 'failed', reason: 'Starlink upstream requested a later retry', status: 429,
      },
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
