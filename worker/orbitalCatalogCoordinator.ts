import { DurableObject } from 'cloudflare:workers'
import {
  refreshOrbitalCatalog,
  type OrbitalCatalogEnvironment,
  type OrbitalRefreshCompletion,
  type OrbitalRefreshCoordinator,
  type OrbitalRefreshOutcome,
  type OrbitalRefreshReservation,
  type StarlinkRefreshReservation,
} from './orbitalCatalog.js'
import { STARLINK_REFRESH_INTERVAL_MS } from './starlinkCatalog.js'

export const ORBITAL_COORDINATOR_PATH = '/refresh'
export const ORBITAL_COORDINATOR_STATE_SCHEMA_VERSION = 1
export const ORBITAL_COORDINATOR_STATE_CONTRACT_VERSION = 1
export const STARLINK_COORDINATOR_STATE_SCHEMA_VERSION = 1
export const STARLINK_COORDINATOR_STATE_CONTRACT_VERSION = 1
export const ORBITAL_COORDINATOR_OBJECT_NAME =
  'celestrak-visual-refresh-v2'
export const ORBITAL_COORDINATOR_MAX_OUTCOME_BYTES = 16 * 1_024

export interface OrbitalCatalogCoordinatorStub {
  fetch(request: Request): Promise<Response>
}

export interface OrbitalCatalogCoordinatorNamespace {
  idFromName(name: string): unknown
  get(id: unknown): OrbitalCatalogCoordinatorStub
}

export interface OrbitalScheduledEnvironment
  extends OrbitalCatalogEnvironment {
  ORBITAL_CATALOG_COORDINATOR?: OrbitalCatalogCoordinatorNamespace
}

type RefreshStateRow = {
  schemaVersion: number
  sourceContractVersion: number
  attemptSequence: number
  attemptId: string | null
  lastStartedAtMs: number
  nextAllowedAtMs: number
  blockedStatus: number | null
  blockedAtMs: number | null
}

type StarlinkRefreshStateRow = {
  schemaVersion: number
  sourceContractVersion: number
  lastStartedAtMs: number
  nextAllowedAtMs: number
}

const isSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0

const validateState = (row: RefreshStateRow) => {
  if (
    row.schemaVersion !== ORBITAL_COORDINATOR_STATE_SCHEMA_VERSION ||
    row.sourceContractVersion !==
      ORBITAL_COORDINATOR_STATE_CONTRACT_VERSION ||
    !isSafeInteger(row.attemptSequence) ||
    row.attemptSequence < 1 ||
    !isSafeInteger(row.lastStartedAtMs) ||
    !isSafeInteger(row.nextAllowedAtMs) ||
    (row.attemptId !== null &&
      row.attemptId !== `${row.lastStartedAtMs}:${row.attemptSequence}`) ||
    (row.blockedStatus === null) !== (row.blockedAtMs === null) ||
    (row.blockedStatus !== null &&
      (!Number.isInteger(row.blockedStatus) ||
        row.blockedStatus < 300 ||
        row.blockedStatus > 599)) ||
    (row.blockedAtMs !== null && !isSafeInteger(row.blockedAtMs)) ||
    (row.blockedAtMs !== null &&
      row.blockedAtMs < row.lastStartedAtMs) ||
    row.nextAllowedAtMs <= row.lastStartedAtMs ||
    ((row.attemptId !== null || row.blockedStatus !== null) &&
      row.nextAllowedAtMs !== Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error('Invalid orbital refresh state')
  }
  return row
}

const validateStarlinkState = (row: StarlinkRefreshStateRow) => {
  if (
    row.schemaVersion !==
      STARLINK_COORDINATOR_STATE_SCHEMA_VERSION ||
    row.sourceContractVersion !==
      STARLINK_COORDINATOR_STATE_CONTRACT_VERSION ||
    !isSafeInteger(row.lastStartedAtMs) ||
    row.lastStartedAtMs === 0 ||
    !isSafeInteger(row.nextAllowedAtMs) ||
    row.nextAllowedAtMs !==
      row.lastStartedAtMs + STARLINK_REFRESH_INTERVAL_MS
  ) {
    throw new Error('Invalid Starlink refresh state')
  }
  return row
}

class SqlOrbitalRefreshCoordinator implements OrbitalRefreshCoordinator {
  private readonly storage: DurableObjectStorage

  constructor(storage: DurableObjectStorage) {
    this.storage = storage
  }

  private readState() {
    const rows = this.storage.sql
      .exec<RefreshStateRow>(`
        SELECT
          schema_version AS schemaVersion,
          source_contract_version AS sourceContractVersion,
          attempt_sequence AS attemptSequence,
          attempt_id AS attemptId,
          last_started_at_ms AS lastStartedAtMs,
          next_allowed_at_ms AS nextAllowedAtMs,
          blocked_status AS blockedStatus,
          blocked_at_ms AS blockedAtMs
        FROM orbital_refresh_state
        WHERE singleton = 1
      `)
      .toArray()
    if (rows.length > 1) {
      throw new Error('Invalid orbital refresh state')
    }
    return rows[0] ? validateState(rows[0]) : undefined
  }

  private readStarlinkState() {
    const rows = this.storage.sql
      .exec<StarlinkRefreshStateRow>(`
        SELECT
          schema_version AS schemaVersion,
          source_contract_version AS sourceContractVersion,
          last_started_at_ms AS lastStartedAtMs,
          next_allowed_at_ms AS nextAllowedAtMs
        FROM starlink_refresh_state
        WHERE singleton = 1
      `)
      .toArray()
    if (rows.length > 1) {
      throw new Error('Invalid Starlink refresh state')
    }
    return rows[0] ? validateStarlinkState(rows[0]) : undefined
  }

  reserve(nowMs: number): Promise<OrbitalRefreshReservation> {
    if (!isSafeInteger(nowMs) || nowMs === 0) {
      return Promise.reject(new Error('Invalid orbital refresh time'))
    }

    return Promise.resolve(
      this.storage.transactionSync<OrbitalRefreshReservation>(() => {
        const current = this.readState()
        if (current && current.blockedStatus !== null) {
          return {
            kind: 'blocked',
            status: current.blockedStatus,
          }
        }
        if (current && current.nextAllowedAtMs > nowMs) {
          return {
            kind: 'not-due',
            nextAllowedAtMs: current.nextAllowedAtMs,
          }
        }

        const attemptSequence = (current?.attemptSequence ?? 0) + 1
        if (!Number.isSafeInteger(attemptSequence)) {
          throw new Error('Invalid orbital refresh sequence')
        }
        const attemptId = `${nowMs}:${attemptSequence}`
        if (current) {
          this.storage.sql.exec(
            `UPDATE orbital_refresh_state
             SET
               attempt_sequence = ?,
               attempt_id = ?,
               last_started_at_ms = ?,
               next_allowed_at_ms = ?,
               blocked_status = NULL,
               blocked_at_ms = NULL
             WHERE singleton = 1`,
            attemptSequence,
            attemptId,
            nowMs,
            Number.MAX_SAFE_INTEGER,
          )
        } else {
          this.storage.sql.exec(
            `INSERT INTO orbital_refresh_state (
               singleton,
               schema_version,
               source_contract_version,
               attempt_sequence,
               attempt_id,
               last_started_at_ms,
               next_allowed_at_ms,
               blocked_status,
               blocked_at_ms
             ) VALUES (1, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
            ORBITAL_COORDINATOR_STATE_SCHEMA_VERSION,
            ORBITAL_COORDINATOR_STATE_CONTRACT_VERSION,
            attemptSequence,
            attemptId,
            nowMs,
            Number.MAX_SAFE_INTEGER,
          )
        }
        return { kind: 'admitted', attemptId }
      }),
    )
  }

  reserveStarlink(
    attemptId: string,
    nowMs: number,
  ): Promise<StarlinkRefreshReservation> {
    if (
      typeof attemptId !== 'string' ||
      attemptId.length === 0 ||
      !isSafeInteger(nowMs) ||
      nowMs === 0
    ) {
      return Promise.reject(
        new Error('Invalid Starlink refresh reservation'),
      )
    }

    return Promise.resolve(
      this.storage.transactionSync<StarlinkRefreshReservation>(
        () => {
          const currentAttempt = this.readState()
          if (
            !currentAttempt ||
            currentAttempt.attemptId !== attemptId
          ) {
            throw new Error('Obsolete orbital refresh attempt')
          }

          const current = this.readStarlinkState()
          if (current && current.nextAllowedAtMs > nowMs) {
            return {
              kind: 'not-due',
              nextAllowedAtMs: current.nextAllowedAtMs,
            }
          }

          const nextAllowedAtMs =
            nowMs + STARLINK_REFRESH_INTERVAL_MS
          if (!Number.isSafeInteger(nextAllowedAtMs)) {
            throw new Error('Invalid Starlink next refresh time')
          }
          if (current) {
            this.storage.sql.exec(
              `UPDATE starlink_refresh_state
               SET
                 last_started_at_ms = ?,
                 next_allowed_at_ms = ?
               WHERE singleton = 1`,
              nowMs,
              nextAllowedAtMs,
            )
          } else {
            this.storage.sql.exec(
              `INSERT INTO starlink_refresh_state (
                 singleton,
                 schema_version,
                 source_contract_version,
                 last_started_at_ms,
                 next_allowed_at_ms
               ) VALUES (1, ?, ?, ?, ?)`,
              STARLINK_COORDINATOR_STATE_SCHEMA_VERSION,
              STARLINK_COORDINATOR_STATE_CONTRACT_VERSION,
              nowMs,
              nextAllowedAtMs,
            )
          }
          return {
            kind: 'admitted',
            lastStartedAtMs: nowMs,
            nextAllowedAtMs,
          }
        },
      ),
    )
  }

  complete(
    attemptId: string,
    completion: OrbitalRefreshCompletion,
  ): Promise<void> {
    return Promise.resolve(
      this.storage.transactionSync(() => {
        const current = this.readState()
        if (!current || current.attemptId !== attemptId) {
          throw new Error('Obsolete orbital refresh attempt')
        }

        if (completion.kind === 'blocked') {
          if (
            !Number.isInteger(completion.status) ||
            completion.status < 300 ||
            completion.status > 599 ||
            !isSafeInteger(completion.blockedAtMs) ||
            completion.blockedAtMs < current.lastStartedAtMs
          ) {
            throw new Error('Invalid orbital blocked state')
          }
          this.storage.sql.exec(
            `UPDATE orbital_refresh_state
             SET
               attempt_id = NULL,
               next_allowed_at_ms = ?,
               blocked_status = ?,
               blocked_at_ms = ?
             WHERE singleton = 1`,
            Number.MAX_SAFE_INTEGER,
            completion.status,
            completion.blockedAtMs,
          )
          return
        }

        if (
          !isSafeInteger(completion.nextAllowedAtMs) ||
          completion.nextAllowedAtMs <= current.lastStartedAtMs
        ) {
          throw new Error('Invalid orbital next refresh time')
        }
        this.storage.sql.exec(
          `UPDATE orbital_refresh_state
           SET
             attempt_id = NULL,
             next_allowed_at_ms = ?,
             blocked_status = NULL,
             blocked_at_ms = NULL
           WHERE singleton = 1`,
          completion.nextAllowedAtMs,
        )
      }),
    )
  }
}

const jsonResponse = (outcome: OrbitalRefreshOutcome, status: number) =>
  new Response(JSON.stringify(outcome), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })

const textResponse = (
  message: string,
  status: number,
  headers?: Record<string, string>,
) =>
  new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  })

export class OrbitalCatalogCoordinator extends DurableObject<OrbitalCatalogEnvironment> {
  private readonly coordinator: SqlOrbitalRefreshCoordinator
  private initializationFailed = false

  constructor(
    state: DurableObjectState,
    environment: OrbitalCatalogEnvironment,
  ) {
    super(state, environment)
    this.coordinator = new SqlOrbitalRefreshCoordinator(state.storage)
    try {
      state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS orbital_refresh_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          schema_version INTEGER NOT NULL,
          source_contract_version INTEGER NOT NULL,
          attempt_sequence INTEGER NOT NULL,
          attempt_id TEXT,
          last_started_at_ms INTEGER NOT NULL,
          next_allowed_at_ms INTEGER NOT NULL,
          blocked_status INTEGER,
          blocked_at_ms INTEGER
        )
      `)
      state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS starlink_refresh_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          schema_version INTEGER NOT NULL,
          source_contract_version INTEGER NOT NULL,
          last_started_at_ms INTEGER NOT NULL,
          next_allowed_at_ms INTEGER NOT NULL
        )
      `)
    } catch {
      this.initializationFailed = true
    }
  }

  async fetch(request: Request) {
    const url = new URL(request.url)
    if (url.pathname !== ORBITAL_COORDINATOR_PATH || url.search) {
      return textResponse('Not found', 404)
    }
    if (request.method !== 'POST') {
      return textResponse('Method not allowed', 405, { Allow: 'POST' })
    }
    if (this.initializationFailed) {
      return jsonResponse(
        {
          kind: 'unavailable',
          reason: 'Coordinator storage is unavailable',
        },
        503,
      )
    }

    const outcome = await refreshOrbitalCatalog(
      this.env,
      this.coordinator,
    )
    return jsonResponse(
      outcome,
      outcome.kind === 'unavailable' ? 503 : 200,
    )
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readScheduledOutcome = async (response: Response) => {
  const mediaType = response.headers
    .get('Content-Type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase()
  if (mediaType !== 'application/json' || !response.body) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error('Orbital catalog refresh outcome was invalid')
  }
  const contentLength = response.headers.get('Content-Length')
  if (
    contentLength !== null &&
    (!/^(?:0|[1-9]\d*)$/.test(contentLength) ||
      Number(contentLength) >
        ORBITAL_COORDINATOR_MAX_OUTCOME_BYTES)
  ) {
    await response.body.cancel().catch(() => undefined)
    throw new Error('Orbital catalog refresh outcome was invalid')
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!(value instanceof Uint8Array)) {
        throw new Error('Orbital catalog refresh outcome was invalid')
      }
      totalBytes += value.byteLength
      if (totalBytes > ORBITAL_COORDINATOR_MAX_OUTCOME_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new Error('Orbital catalog refresh outcome was invalid')
      }
      chunks.push(value)
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // The oversized body has already been cancelled.
    }
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  let outcome: unknown
  try {
    outcome = JSON.parse(
      new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: false,
      }).decode(bytes),
    )
  } catch {
    throw new Error('Orbital catalog refresh outcome was invalid')
  }
  if (!isRecord(outcome) || typeof outcome.kind !== 'string') {
    throw new Error('Orbital catalog refresh outcome was invalid')
  }
  return outcome
}

const requireSuccessfulScheduledOutcome = (
  outcome: Record<string, unknown>,
) => {
  if (
    outcome.kind === 'disabled' ||
    outcome.kind === 'not-due'
  ) {
    return
  }
  if (outcome.kind === 'published') {
    if (outcome.starlink === undefined) return
    if (
      !isRecord(outcome.starlink) ||
      typeof outcome.starlink.kind !== 'string'
    ) {
      throw new Error('Orbital catalog refresh outcome was invalid')
    }
    if (
      outcome.starlink.kind === 'published' ||
      outcome.starlink.kind === 'not-due' ||
      outcome.starlink.kind === 'disabled'
    ) {
      return
    }
    if (outcome.starlink.kind === 'skipped') {
      throw new Error(
        'Scheduled orbital catalog refresh skipped Starlink work',
      )
    }
    if (outcome.starlink.kind === 'failed') {
      throw new Error(
        'Scheduled orbital catalog refresh reported a Starlink failure',
      )
    }
    throw new Error('Orbital catalog refresh outcome was invalid')
  }
  if (outcome.kind === 'rate-limited') {
    throw new Error(
      'Scheduled orbital catalog refresh was rate limited',
    )
  }
  if (outcome.kind === 'deferred') {
    throw new Error('Scheduled orbital catalog refresh was deferred')
  }
  if (outcome.kind === 'blocked') {
    throw new Error('Scheduled orbital catalog refresh was blocked')
  }
  if (outcome.kind === 'failed') {
    throw new Error('Scheduled orbital catalog refresh failed')
  }
  if (outcome.kind === 'unavailable') {
    throw new Error('Scheduled orbital catalog refresh was unavailable')
  }
  throw new Error('Orbital catalog refresh outcome was invalid')
}

export const runScheduledOrbitalCatalogRefresh = async (
  environment: OrbitalScheduledEnvironment,
) => {
  if (environment.ORBITAL_CATALOG_ENABLED !== 'true') return
  const namespace = environment.ORBITAL_CATALOG_COORDINATOR
  if (!namespace) {
    throw new Error('Orbital catalog coordinator binding is unavailable')
  }

  const id = namespace.idFromName(ORBITAL_COORDINATOR_OBJECT_NAME)
  const response = await namespace.get(id).fetch(
    new Request(
      `https://orbital-catalog.internal${ORBITAL_COORDINATOR_PATH}`,
      { method: 'POST' },
    ),
  )
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error('Orbital catalog refresh was unavailable')
  }
  requireSuccessfulScheduledOutcome(
    await readScheduledOutcome(response),
  )
}
