import type { TrainCourseLimits, TrainPosition, TrainSourceId } from '../domain/trains'
import { TRAIN_SOURCE_IDS, mapTrainSources, withDerivedCourses } from '../domain/trains'
import { ProviderError, errorMessage } from '../providers/errors'
import type { TrainProvider } from '../providers/rail/trainProviders'

export type TrainSourcePhase = 'idle' | 'loading' | 'live' | 'error'

export interface TrainSourceStatus {
  sourceId: TrainSourceId
  phase: TrainSourcePhase
  /** The current view can intersect this source's coverage. */
  active: boolean
  paused: boolean
  trains: readonly TrainPosition[]
  /** Browser receipt time of the last accepted response. */
  lastSuccessAt?: number
  error?: string
  nextRetryAt?: number
}

export type TrainSourceStatuses = Readonly<Record<TrainSourceId, TrainSourceStatus>>

export interface TrainControllerRuntime {
  now: () => number
  setTimeout: (callback: () => void, delayMs: number) => unknown
  clearTimeout: (handle: unknown) => void
}

export interface TrainControllerOptions {
  providers: Readonly<Record<TrainSourceId, TrainProvider>>
  pollIntervalMs: number
  rateLimitBackoffMaxMs: number
  course: TrainCourseLimits
  onChange: (statuses: TrainSourceStatuses) => void
  runtime?: TrainControllerRuntime
  onWarning?: (message: string) => void
}

const browserRuntime: TrainControllerRuntime = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
}

interface SourceRuntime {
  status: TrainSourceStatus
  generation: number
  inFlight: boolean
  timer?: unknown
  controller?: AbortController
  lastStartedAt?: number
  blockedUntil: number
  rateLimitFailures: number
  lastLoggedError?: string
}

export const initialTrainSourceStatuses = (): TrainSourceStatuses =>
  mapTrainSources((sourceId): TrainSourceStatus => ({
    sourceId,
    phase: 'idle',
    active: false,
    paused: true,
    trains: [],
  }))

/** Keeps the newer observation when a later poll returns an older one. */
const mergeObservations = (
  incoming: readonly TrainPosition[],
  previous: readonly TrainPosition[],
) => {
  if (previous.length === 0) return [...incoming]
  const prior = new Map(previous.map((train) => [train.id, train]))
  return incoming.map((train) => {
    const before = prior.get(train.id)
    return before && before.observedAt > train.observedAt ? before : train
  })
}

/**
 * Polls each rail source independently. One source's failure, rate limit, or
 * stale data never changes another source's lifecycle. Pausing aborts work
 * but keeps cadence and `Retry-After` boundaries.
 */
export class TrainController {
  private readonly providers: Readonly<Record<TrainSourceId, TrainProvider>>
  private readonly pollIntervalMs: number
  private readonly rateLimitBackoffMaxMs: number
  private readonly course: TrainCourseLimits
  private readonly onChange: (statuses: TrainSourceStatuses) => void
  private readonly runtime: TrainControllerRuntime
  private readonly onWarning: (message: string) => void
  private readonly sources: Record<TrainSourceId, SourceRuntime>
  private running = false
  private paused = true
  private activeSources = new Set<TrainSourceId>()

  constructor(options: TrainControllerOptions) {
    this.providers = options.providers
    this.pollIntervalMs = options.pollIntervalMs
    this.rateLimitBackoffMaxMs = options.rateLimitBackoffMaxMs
    this.course = options.course
    this.onChange = options.onChange
    this.runtime = options.runtime ?? browserRuntime
    this.onWarning =
      options.onWarning ??
      ((message) => console.warn(`Train provider error: ${message}`))
    const initial = initialTrainSourceStatuses()
    this.sources = mapTrainSources((sourceId): SourceRuntime => ({
      status: initial[sourceId],
      generation: 0,
      inFlight: false,
      blockedUntil: 0,
      rateLimitFailures: 0,
    }))
  }

  start(paused: boolean, activeSources: ReadonlySet<TrainSourceId>) {
    if (this.running) return
    this.running = true
    this.paused = paused
    this.activeSources = new Set(activeSources)
    for (const sourceId of TRAIN_SOURCE_IDS) this.reconcile(sourceId)
    this.emit()
  }

  stop() {
    if (!this.running) return
    this.running = false
    for (const sourceId of TRAIN_SOURCE_IDS) this.halt(sourceId)
  }

  setPaused(paused: boolean) {
    if (!this.running || this.paused === paused) return
    this.paused = paused
    for (const sourceId of TRAIN_SOURCE_IDS) this.reconcile(sourceId)
    this.emit()
  }

  setActiveSources(activeSources: ReadonlySet<TrainSourceId>) {
    if (
      activeSources.size === this.activeSources.size &&
      [...activeSources].every((sourceId) => this.activeSources.has(sourceId))
    ) {
      return
    }
    this.activeSources = new Set(activeSources)
    if (!this.running) return
    for (const sourceId of TRAIN_SOURCE_IDS) this.reconcile(sourceId)
    this.emit()
  }

  private shouldPoll(sourceId: TrainSourceId) {
    return this.running && !this.paused && this.activeSources.has(sourceId)
  }

  private reconcile(sourceId: TrainSourceId) {
    const source = this.sources[sourceId]
    const active = this.activeSources.has(sourceId)
    const polling = this.shouldPoll(sourceId)
    if (!polling) this.halt(sourceId)
    source.status = {
      ...source.status,
      active,
      paused: !polling,
      phase: !polling && source.status.phase === 'loading'
        ? source.status.lastSuccessAt === undefined ? 'idle' : 'live'
        : source.status.phase,
    }
    if (polling) this.schedule(sourceId)
  }

  private halt(sourceId: TrainSourceId) {
    const source = this.sources[sourceId]
    this.clearTimer(source)
    if (source.inFlight) {
      source.generation += 1
      source.controller?.abort()
      source.controller = undefined
      source.inFlight = false
    }
  }

  private clearTimer(source: SourceRuntime) {
    if (source.timer === undefined) return
    this.runtime.clearTimeout(source.timer)
    source.timer = undefined
  }

  private nextRequestAt(source: SourceRuntime) {
    const cadenceBoundary =
      source.lastStartedAt === undefined
        ? 0
        : source.lastStartedAt + this.pollIntervalMs
    return Math.max(cadenceBoundary, source.blockedUntil)
  }

  private schedule(sourceId: TrainSourceId) {
    const source = this.sources[sourceId]
    this.clearTimer(source)
    if (!this.shouldPoll(sourceId) || source.inFlight) return
    const delayMs = Math.max(0, this.nextRequestAt(source) - this.runtime.now())
    source.timer = this.runtime.setTimeout(() => {
      source.timer = undefined
      void this.run(sourceId)
    }, delayMs)
  }

  private async run(sourceId: TrainSourceId) {
    const source = this.sources[sourceId]
    if (!this.shouldPoll(sourceId) || source.inFlight) return
    const now = this.runtime.now()
    if (now < this.nextRequestAt(source)) {
      this.schedule(sourceId)
      return
    }

    const generation = ++source.generation
    const controller = new AbortController()
    source.controller = controller
    source.inFlight = true
    source.lastStartedAt = now
    if (source.status.lastSuccessAt === undefined && source.status.phase !== 'error') {
      this.update(sourceId, { phase: 'loading' })
    }

    try {
      const dataset = await this.providers[sourceId].load(controller.signal)
      if (generation !== source.generation || controller.signal.aborted) return
      const previous = source.status.trains
      const trains = mergeObservations(
        withDerivedCourses(dataset.trains, previous, this.course),
        previous,
      )
      source.rateLimitFailures = 0
      source.blockedUntil = 0
      source.lastLoggedError = undefined
      this.update(sourceId, {
        phase: 'live',
        trains,
        lastSuccessAt: dataset.retrievedAt,
        error: undefined,
        nextRetryAt: undefined,
      })
    } catch (error) {
      if (generation !== source.generation || controller.signal.aborted) return
      const failedAt = this.runtime.now()
      if (error instanceof ProviderError && error.status === 429) {
        source.rateLimitFailures += 1
        const backoffMs = Math.min(
          this.pollIntervalMs * 2 ** source.rateLimitFailures,
          this.rateLimitBackoffMaxMs,
        )
        source.blockedUntil = failedAt + Math.max(backoffMs, error.retryAfterMs ?? 0)
      } else if (error instanceof ProviderError && error.retryAfterMs !== undefined) {
        source.blockedUntil = failedAt + error.retryAfterMs
      }
      const message = errorMessage(error)
      if (message !== source.lastLoggedError) {
        this.onWarning(`${sourceId}: ${message}`)
        source.lastLoggedError = message
      }
      this.update(sourceId, {
        phase: 'error',
        error: message,
        nextRetryAt: source.blockedUntil > failedAt ? source.blockedUntil : undefined,
      })
    } finally {
      if (generation === source.generation) {
        if (source.controller === controller) source.controller = undefined
        source.inFlight = false
        this.schedule(sourceId)
      }
    }
  }

  private update(sourceId: TrainSourceId, patch: Partial<TrainSourceStatus>) {
    const source = this.sources[sourceId]
    source.status = { ...source.status, ...patch }
    this.emit()
  }

  private emit() {
    if (!this.running) return
    this.onChange(mapTrainSources((sourceId) => this.sources[sourceId].status))
  }
}
