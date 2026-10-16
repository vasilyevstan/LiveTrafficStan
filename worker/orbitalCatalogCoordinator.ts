import { DurableObject } from 'cloudflare:workers'
import {
  refreshOrbitalCatalog,
  ORBITAL_REFRESH_INTERVAL_MS,
  ORBITAL_SOURCES,
  type OrbitalCatalogEnvironment,
  type OrbitalRefreshCompletion,
  type OrbitalRefreshCoordinator,
  type OrbitalRefreshOutcome,
  type OrbitalRefreshReservation,
  type StarlinkRefreshReservation,
} from './orbitalCatalog.js'
import {
  STARLINK_BOOTSTRAP_GP_RETRIEVED_AT_MS,
  STARLINK_INITIAL_REFRESH_NOT_BEFORE_MS,
  STARLINK_REFRESH_INTERVAL_MS,
} from './starlinkCatalog.js'

export const ORBITAL_COORDINATOR_PATH = '/refresh'
export const ORBITAL_COORDINATOR_STATUS_PATH = '/status'
export const ORBITAL_COORDINATOR_STATE_SCHEMA_VERSION = 1
export const ORBITAL_COORDINATOR_STATE_CONTRACT_VERSION = 1
export const STARLINK_COORDINATOR_STATE_SCHEMA_VERSION = 1
export const STARLINK_COORDINATOR_STATE_CONTRACT_VERSION = 1
export const ORBITAL_COORDINATOR_OBJECT_NAME =
  'celestrak-visual-refresh-v2'
export const ORBITAL_COORDINATOR_MAX_OUTCOME_BYTES = 16 * 1_024
export const ORBITAL_COORDINATOR_LAST_OUTCOME_KEY =
  'orbital:last-admitted-outcome:v1'

export const ORBITAL_REVIEWED_RECOVERY = {
  id: 'reviewed-403-2026-10-14-v1',
  lastStartedAtMs: 1_791_814_673_618,
  blockedStatus: 403,
} as const

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

type RecoveryStateRow = {
  amendmentId: string
  priorStateJson: string
  attemptId: string
  phase: 'admitted' | 'verified' | 'held' | 'blocked'
  nextAllowedAtMs: number | null
  failureSource: string | null
}

const recoveryPhases = new Set(['admitted', 'verified', 'held', 'blocked'])
const upstreamSources = new Set<string>(
  [...ORBITAL_SOURCES.map(({ group }) => group), 'starlink'].flatMap(
    (group) => [`${group}-gp`, `${group}-satcat`],
  ),
)

interface OrbitalRefreshStatus {
  kind: 'status'
  phase: 'never-started' | 'in-progress' | 'blocked' | 'idle'
  lastStartedAtMs: number | null
  nextAllowedAtMs: number | null
  blockedStatus: number | null
  starlinkLastStartedAtMs: number | null
  starlinkNextAllowedAtMs: number | null
  recoveryPhase?: RecoveryStateRow['phase']
  recoveryNextAllowedAtMs?: number | null
  failureSource?: string | null
  lastOutcome?: OrbitalLastOutcome
}

interface OrbitalLastOutcome {
  kind: Exclude<OrbitalRefreshOutcome['kind'], 'disabled' | 'not-due'>
  startedAtMs: number
  completedAtMs: number
  reason?: string
  source?: string
  status?: number
  starlinkKind?: string
  starlinkReason?: string
  starlinkSource?: string
  starlinkStatus?: number
  curatedPublication: 'fulfilled' | 'rejected' | 'not-attempted'
  starlinkPublication?: 'fulfilled' | 'rejected' | 'not-attempted'
  starlinkStartedAtMs?: number
  starlinkCompletedAtMs?: number
}

const outcomeKinds = new Set([
  'published', 'failed', 'blocked', 'rate-limited', 'deferred', 'unavailable',
])
const starlinkOutcomeKinds = new Set([
  'published', 'failed', 'skipped', 'not-due', 'disabled',
])
const outcomeFields = new Set([
  'kind', 'startedAtMs', 'completedAtMs', 'reason', 'source', 'status',
  'starlinkKind', 'starlinkReason', 'starlinkSource', 'starlinkStatus',
  'curatedPublication', 'starlinkPublication',
  'starlinkStartedAtMs', 'starlinkCompletedAtMs',
])
const publicationKinds = new Set(['fulfilled', 'rejected', 'not-attempted'])

function validateLastOutcome(value: unknown): asserts value is OrbitalLastOutcome {
  if (
    !isRecord(value) ||
    Object.keys(value).some((field) => !outcomeFields.has(field)) ||
    typeof value.kind !== 'string' ||
    !outcomeKinds.has(value.kind) ||
    !isSafeInteger(value.startedAtMs) ||
    !isSafeInteger(value.completedAtMs) ||
    value.startedAtMs === 0 ||
    value.completedAtMs < value.startedAtMs ||
    typeof value.curatedPublication !== 'string' ||
    !publicationKinds.has(value.curatedPublication) ||
    (value.starlinkPublication !== undefined &&
      (typeof value.starlinkPublication !== 'string' ||
        !publicationKinds.has(value.starlinkPublication))) ||
    (value.starlinkStartedAtMs !== undefined &&
      (!isSafeInteger(value.starlinkStartedAtMs) ||
        !isSafeInteger(value.starlinkCompletedAtMs) ||
        value.starlinkCompletedAtMs < value.starlinkStartedAtMs ||
        value.starlinkCompletedAtMs > value.completedAtMs)) ||
    (value.starlinkKind !== undefined &&
      (typeof value.starlinkKind !== 'string' ||
        !starlinkOutcomeKinds.has(value.starlinkKind)))
  ) throw new Error('Invalid orbital refresh outcome diagnostic')
  for (const field of ['reason', 'starlinkReason']) {
    const reason = value[field]
    if (
      reason !== undefined &&
      (typeof reason !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9 _.,:/'()-]{0,159}$/.test(reason))
    ) throw new Error('Invalid orbital refresh outcome reason')
  }
  for (const field of ['source', 'starlinkSource']) {
    const source = value[field]
    if (source !== undefined &&
      (typeof source !== 'string' || !upstreamSources.has(source))
    ) throw new Error('Invalid orbital refresh outcome source')
  }
  for (const field of ['status', 'starlinkStatus']) {
    const status = value[field]
    if (status !== undefined &&
      (typeof status !== 'number' || !Number.isInteger(status) ||
        status < 100 || status > 599)
    ) throw new Error('Invalid orbital refresh outcome status')
  }
}

const lastOutcomeDiagnostic = (
  outcome: Exclude<OrbitalRefreshOutcome, { kind: 'disabled' | 'not-due' }>,
  startedAtMs: number,
): OrbitalLastOutcome => {
  const diagnostic: OrbitalLastOutcome = {
    kind: outcome.kind,
    startedAtMs,
    completedAtMs: Date.now(),
    curatedPublication: outcome.kind === 'published'
      ? 'fulfilled'
      : 'publicationResults' in outcome && outcome.publicationResults
        ? outcome.publicationResults.curated
        : 'not-attempted',
  }
  if ('reason' in outcome) diagnostic.reason = outcome.reason
  if ('source' in outcome) diagnostic.source = outcome.source
  if ('status' in outcome) diagnostic.status = outcome.status
  if (
    'starlink' in outcome &&
    outcome.starlink &&
    (outcome.starlink.kind === 'published' || outcome.starlink.kind === 'failed')
  ) {
    diagnostic.starlinkKind = outcome.starlink.kind
    diagnostic.starlinkPublication =
      outcome.starlink.kind === 'published'
        ? 'fulfilled'
        : 'publicationResults' in outcome && outcome.publicationResults?.starlink
          ? outcome.publicationResults.starlink
          : 'not-attempted'
    if ('reason' in outcome.starlink) {
      diagnostic.starlinkReason = outcome.starlink.reason
    }
    if ('source' in outcome.starlink) {
      diagnostic.starlinkSource = outcome.starlink.source
    }
    if ('status' in outcome.starlink) {
      diagnostic.starlinkStatus = outcome.starlink.status
    }
  }
  validateLastOutcome(diagnostic)
  return diagnostic
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
  private readonly recoveryEnabled: boolean

  constructor(storage: DurableObjectStorage, recoveryEnabled: boolean) {
    this.storage = storage
    this.recoveryEnabled = recoveryEnabled
  }

  async recordOutcome(attemptId: string, outcome: OrbitalRefreshOutcome) {
    if (outcome.kind === 'disabled' || outcome.kind === 'not-due') return
    const previous = await this.storage.get(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY)
    if (previous !== undefined) validateLastOutcome(previous)
    const current = this.readState()
    if (!current ||
      `${current.lastStartedAtMs}:${current.attemptSequence}` !== attemptId
    ) throw new Error('Obsolete orbital refresh outcome diagnostic')
    const diagnostic = lastOutcomeDiagnostic(outcome, current.lastStartedAtMs)
    const retained = previous ? {
      starlinkKind: previous.starlinkKind,
      starlinkReason: previous.starlinkReason,
      starlinkSource: previous.starlinkSource,
      starlinkStatus: previous.starlinkStatus,
      starlinkPublication: previous.starlinkPublication,
      starlinkStartedAtMs: previous.starlinkStartedAtMs,
      starlinkCompletedAtMs: previous.starlinkCompletedAtMs,
    } : {}
    const value = {
      ...retained,
      ...diagnostic,
      ...(diagnostic.starlinkKind ? {
        starlinkStartedAtMs: this.readStarlinkState()?.lastStartedAtMs,
        starlinkCompletedAtMs: diagnostic.completedAtMs,
      } : {}),
    }
    validateLastOutcome(value)
    await this.storage.put(ORBITAL_COORDINATOR_LAST_OUTCOME_KEY, value)
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

  private readRecovery() {
    const rows = this.storage.sql.exec<RecoveryStateRow>(
      `SELECT amendment_id AS amendmentId,
              prior_state_json AS priorStateJson,
              attempt_id AS attemptId,
              phase,
              next_allowed_at_ms AS nextAllowedAtMs,
              failure_source AS failureSource
       FROM orbital_refresh_recovery WHERE amendment_id = ?`,
      ORBITAL_REVIEWED_RECOVERY.id,
    ).toArray()
    const row = rows[0]
    if (
      rows.length > 1 ||
      (row && (
        row.amendmentId !== ORBITAL_REVIEWED_RECOVERY.id ||
        typeof row.priorStateJson !== 'string' ||
        row.priorStateJson.length > 2_048 ||
        !/^[1-9]\d*:[1-9]\d*$/.test(row.attemptId) ||
        !recoveryPhases.has(row.phase) ||
        (row.nextAllowedAtMs !== null && !isSafeInteger(row.nextAllowedAtMs)) ||
        (row.failureSource !== null && !upstreamSources.has(row.failureSource))
      ))
    ) throw new Error('Invalid reviewed orbital recovery state')
    return row
  }

  status(): OrbitalRefreshStatus {
    const current = this.readState()
    const starlink = this.readStarlinkState()
    const recovery = this.readRecovery()
    return {
      kind: 'status',
      phase: !current
        ? 'never-started'
        : recovery?.phase === 'held'
          ? 'blocked'
        : current.attemptId !== null
          ? 'in-progress'
          : current.blockedStatus !== null
            ? 'blocked'
            : 'idle',
      lastStartedAtMs: current?.lastStartedAtMs ?? null,
      nextAllowedAtMs: current?.nextAllowedAtMs ?? null,
      blockedStatus: current?.blockedStatus ?? null,
      starlinkLastStartedAtMs: starlink?.lastStartedAtMs ?? null,
      starlinkNextAllowedAtMs: starlink?.nextAllowedAtMs ?? null,
      ...(recovery ? {
        recoveryPhase: recovery.phase,
        recoveryNextAllowedAtMs: recovery.nextAllowedAtMs,
        failureSource: recovery.failureSource,
      } : {}),
    }
  }

  reserve(nowMs: number): Promise<OrbitalRefreshReservation> {
    if (!isSafeInteger(nowMs) || nowMs === 0) {
      return Promise.reject(new Error('Invalid orbital refresh time'))
    }

    return Promise.resolve(
      this.storage.transactionSync<OrbitalRefreshReservation>(() => {
        const current = this.readState()
        const recovery = this.readRecovery()
        const reviewedRecovery =
          this.recoveryEnabled &&
          !recovery &&
          current?.attemptId === null &&
          current.lastStartedAtMs === ORBITAL_REVIEWED_RECOVERY.lastStartedAtMs &&
          current.blockedStatus === ORBITAL_REVIEWED_RECOVERY.blockedStatus
        if (current && current.blockedStatus !== null && !reviewedRecovery) {
          return {
            kind: 'blocked',
            status: current.blockedStatus,
          }
        }
        const nextAllowedAtMs = reviewedRecovery && current
          ? Math.max(
              current.lastStartedAtMs + ORBITAL_REFRESH_INTERVAL_MS,
              this.readStarlinkState()?.nextAllowedAtMs ??
                STARLINK_INITIAL_REFRESH_NOT_BEFORE_MS,
            )
          : current?.nextAllowedAtMs
        if (nextAllowedAtMs !== undefined && nextAllowedAtMs > nowMs) {
          return {
            kind: 'not-due',
            nextAllowedAtMs,
          }
        }

        const attemptSequence = (current?.attemptSequence ?? 0) + 1
        if (!Number.isSafeInteger(attemptSequence)) {
          throw new Error('Invalid orbital refresh sequence')
        }
        const attemptId = `${nowMs}:${attemptSequence}`
        if (reviewedRecovery && current) {
          this.storage.sql.exec(
            `INSERT INTO orbital_refresh_recovery (
               amendment_id, prior_state_json, attempt_id, phase,
               next_allowed_at_ms, failure_source
             ) VALUES (?, ?, ?, 'admitted', NULL, NULL)`,
            ORBITAL_REVIEWED_RECOVERY.id,
            JSON.stringify(current),
            attemptId,
          )
        }
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
          if (
            !current &&
            nowMs < STARLINK_INITIAL_REFRESH_NOT_BEFORE_MS
          ) {
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
              STARLINK_BOOTSTRAP_GP_RETRIEVED_AT_MS,
              STARLINK_INITIAL_REFRESH_NOT_BEFORE_MS,
            )
            return {
              kind: 'not-due',
              nextAllowedAtMs:
                STARLINK_INITIAL_REFRESH_NOT_BEFORE_MS,
            }
          }
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
        const recovery = this.readRecovery()
        if (recovery?.phase === 'held') {
          throw new Error('Reviewed orbital recovery is held')
        }
        const completingRecovery = recovery?.attemptId === attemptId
        if (
          completion.kind === 'blocked' &&
          completion.source !== undefined &&
          !upstreamSources.has(completion.source)
        ) throw new Error('Invalid orbital failure source')

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
          if (recovery) {
            this.storage.sql.exec(
              `UPDATE orbital_refresh_recovery
               SET phase = ?, next_allowed_at_ms = ?, failure_source = ?
               WHERE amendment_id = ?`,
              completingRecovery ? 'blocked' : recovery.phase,
              null,
              completion.source ?? null,
              ORBITAL_REVIEWED_RECOVERY.id,
            )
          }
          console.warn('Orbital upstream access stopped', {
            source: completion.source ?? 'unknown',
            status: completion.status,
            receivedAtMs: completion.blockedAtMs,
          })
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
        if (completingRecovery) {
          const verified = completion.reviewedSourcesValidated === true
          this.storage.sql.exec(
            `UPDATE orbital_refresh_recovery
             SET phase = ?, next_allowed_at_ms = ?, failure_source = ?
             WHERE amendment_id = ?`,
            verified ? 'verified' : 'held',
            completion.nextAllowedAtMs,
            null,
            ORBITAL_REVIEWED_RECOVERY.id,
          )
          if (!verified) return
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

const jsonResponse = (outcome: OrbitalRefreshOutcome | OrbitalRefreshStatus, status: number) =>
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
  private readonly outcomeStorage: DurableObjectStorage
  private initializationFailed = false

  constructor(
    state: DurableObjectState,
    environment: OrbitalCatalogEnvironment,
  ) {
    super(state, environment)
    this.outcomeStorage = state.storage
    this.coordinator = new SqlOrbitalRefreshCoordinator(
      state.storage,
      environment.STARLINK_CATALOG_ENABLED === 'true',
    )
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
      state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS orbital_refresh_recovery (
          amendment_id TEXT PRIMARY KEY,
          prior_state_json TEXT NOT NULL,
          attempt_id TEXT NOT NULL,
          phase TEXT NOT NULL,
          next_allowed_at_ms INTEGER,
          failure_source TEXT
        )
      `)
    } catch {
      this.initializationFailed = true
    }
  }

  async fetch(request: Request) {
    const url = new URL(request.url)
    if (url.pathname === ORBITAL_COORDINATOR_STATUS_PATH && !url.search) {
      if (request.method !== 'GET') {
        return textResponse('Method not allowed', 405, { Allow: 'GET' })
      }
      if (this.initializationFailed) {
        return textResponse('Coordinator storage is unavailable', 503)
      }
      const status = this.coordinator.status()
      try {
        const lastOutcome = await this.outcomeStorage.get(
          ORBITAL_COORDINATOR_LAST_OUTCOME_KEY,
        )
        if (lastOutcome !== undefined) {
          validateLastOutcome(lastOutcome)
          status.lastOutcome = lastOutcome
        }
      } catch {
        console.warn('Orbital refresh outcome diagnostic read unavailable')
        return textResponse('Coordinator outcome diagnostic is unavailable', 503)
      }
      return jsonResponse(status, 200)
    }
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

export const withOrbitalRefreshStatus = async (
  request: Request,
  response: Response,
  environment: OrbitalScheduledEnvironment,
) => {
  if (
    request.method !== 'GET' ||
    environment.ORBITAL_CATALOG_ENABLED !== 'true' ||
    !environment.ORBITAL_CATALOG_COORDINATOR
  ) return response

  const headers = new Headers(response.headers)
  const namespace = environment.ORBITAL_CATALOG_COORDINATOR
  try {
    const statusResponse = await namespace.get(
      namespace.idFromName(ORBITAL_COORDINATOR_OBJECT_NAME),
    ).fetch(new Request(
      `https://orbital-catalog.internal${ORBITAL_COORDINATOR_STATUS_PATH}`,
      { method: 'GET', signal: request.signal },
    ))
    if (!statusResponse.ok) throw new Error('Coordinator status unavailable')
    const status = await readScheduledOutcome(statusResponse)
    if (
      status.kind !== 'status' ||
      typeof status.phase !== 'string' ||
      !['never-started', 'in-progress', 'blocked', 'idle'].includes(
        status.phase,
      )
    ) throw new Error('Coordinator status invalid')
    const fields = [
      ['lastStartedAtMs', 'Last-Started'],
      ['nextAllowedAtMs', 'Next-Allowed'],
      ['blockedStatus', 'Blocked-Status'],
      ['starlinkLastStartedAtMs', 'Starlink-Last-Started'],
      ['starlinkNextAllowedAtMs', 'Starlink-Next-Allowed'],
      ['recoveryNextAllowedAtMs', 'Recovery-Next-Allowed'],
    ] as const
    const values: Array<readonly [string, number]> = []
    for (const [field, label] of fields) {
      const value = status[field]
      if (
        value === null ||
        (field === 'recoveryNextAllowedAtMs' && value === undefined)
      ) continue
      if (!isSafeInteger(value)) throw new Error('Coordinator status invalid')
      values.push([label, value])
    }
    headers.set('X-LiveTrafficStan-Orbital-Refresh-State', status.phase)
    if (status.recoveryPhase !== undefined) {
      if (typeof status.recoveryPhase !== 'string' || !recoveryPhases.has(status.recoveryPhase)) {
        throw new Error('Coordinator recovery status invalid')
      }
      headers.set('X-LiveTrafficStan-Orbital-Refresh-Recovery-State', status.recoveryPhase)
    }
    if (status.failureSource !== undefined && status.failureSource !== null) {
      if (typeof status.failureSource !== 'string' || !upstreamSources.has(status.failureSource)) {
        throw new Error('Coordinator failure source invalid')
      }
      headers.set('X-LiveTrafficStan-Orbital-Refresh-Last-Failure-Source', status.failureSource)
    }
    for (const [label, value] of values) {
      headers.set(`X-LiveTrafficStan-Orbital-Refresh-${label}`, String(value))
    }
    if (status.lastOutcome !== undefined) {
      validateLastOutcome(status.lastOutcome)
      const outcomeLabels = [
        ['kind', 'Last-Outcome'],
        ['startedAtMs', 'Last-Outcome-Started'],
        ['completedAtMs', 'Last-Outcome-Completed'],
        ['reason', 'Last-Outcome-Reason'],
        ['source', 'Last-Outcome-Source'],
        ['status', 'Last-Outcome-Status'],
        ['starlinkKind', 'Last-Starlink-Outcome'],
        ['starlinkReason', 'Last-Starlink-Reason'],
        ['starlinkSource', 'Last-Starlink-Source'],
        ['starlinkStatus', 'Last-Starlink-Status'],
        ['curatedPublication', 'Last-Curated-Publication'],
        ['starlinkPublication', 'Last-Starlink-Publication'],
        ['starlinkStartedAtMs', 'Last-Starlink-Started'],
        ['starlinkCompletedAtMs', 'Last-Starlink-Completed'],
      ] as const
      for (const [field, label] of outcomeLabels) {
        const value = status.lastOutcome[field]
        if (value !== undefined) {
          headers.set(`X-LiveTrafficStan-Orbital-Refresh-${label}`, String(value))
        }
      }
    }
  } catch {
    headers.set('X-LiveTrafficStan-Orbital-Refresh-State', 'unavailable')
    console.warn('Orbital refresh status read unavailable')
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
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
