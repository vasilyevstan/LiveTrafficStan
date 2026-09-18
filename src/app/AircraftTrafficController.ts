import type {
  Aircraft,
  ProviderStatus,
  TrafficProviderResult,
} from '../domain/traffic'
import type { AircraftDataProvider, TrafficQuery } from '../providers/types'
import {
  ProviderError,
  errorMessage,
} from '../providers/errors'

interface AircraftTrafficRuntime {
  now: () => number
  setTimeout: (callback: () => void, delayMs: number) => unknown
  clearTimeout: (handle: unknown) => void
}

interface AircraftTrafficControllerOptions {
  provider: AircraftDataProvider
  initialQuery: TrafficQuery
  refreshIntervalMs: number
  rateLimitBackoffMaxMs: number
  onResult: (result: TrafficProviderResult<Aircraft>) => void
  runtime?: AircraftTrafficRuntime
  onWarning?: (message: string) => void
}

const browserRuntime: AircraftTrafficRuntime = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
}

const initialResult: TrafficProviderResult<Aircraft> = {
  entities: [],
  status: {
    phase: 'idle',
    paused: false,
  },
}

const sameQuery = (first: TrafficQuery, second: TrafficQuery) =>
  first.radiusKm === second.radiusKm &&
  first.center.latitude === second.center.latitude &&
  first.center.longitude === second.center.longitude

export class AircraftTrafficController {
  private readonly provider: AircraftDataProvider
  private readonly refreshIntervalMs: number
  private readonly rateLimitBackoffMaxMs: number
  private readonly onResult: (
    result: TrafficProviderResult<Aircraft>,
  ) => void
  private readonly runtime: AircraftTrafficRuntime
  private readonly onWarning: (message: string) => void
  private result = initialResult
  private query: TrafficQuery
  private queryRevision = 0
  private running = false
  private paused = false
  private inFlight = false
  private timer?: unknown
  private controller?: AbortController
  private lastRequestStartedAt?: number
  private blockedUntil = 0
  private rateLimitFailures = 0
  private lastLoggedError?: string

  constructor(options: AircraftTrafficControllerOptions) {
    this.provider = options.provider
    this.query = options.initialQuery
    this.refreshIntervalMs = options.refreshIntervalMs
    this.rateLimitBackoffMaxMs = options.rateLimitBackoffMaxMs
    this.onResult = options.onResult
    this.runtime = options.runtime ?? browserRuntime
    this.onWarning =
      options.onWarning ??
      ((message) => console.warn(`Aircraft provider error: ${message}`))
  }

  start(paused = false) {
    if (this.running) return
    this.running = true
    this.paused = paused
    if (paused) {
      this.updateStatus({ paused: true })
      return
    }
    this.schedule()
  }

  stop() {
    this.running = false
    this.clearTimer()
    this.controller?.abort()
    this.controller = undefined
  }

  setPaused(paused: boolean) {
    if (!this.running || this.paused === paused) return

    this.paused = paused
    this.clearTimer()
    if (paused) {
      this.controller?.abort()
      this.updateStatus({ paused: true })
      return
    }

    this.updateStatus({ paused: false })
    this.schedule()
  }

  updateQuery(query: TrafficQuery) {
    if (sameQuery(this.query, query)) return

    this.query = query
    this.queryRevision += 1
    this.updateStatus({ updating: true })
    this.clearTimer()
    this.controller?.abort()
    this.schedule()
  }

  private clearTimer() {
    if (this.timer === undefined) return
    this.runtime.clearTimeout(this.timer)
    this.timer = undefined
  }

  private nextRequestAt() {
    const cadenceBoundary =
      this.lastRequestStartedAt === undefined
        ? 0
        : this.lastRequestStartedAt + this.refreshIntervalMs
    return Math.max(cadenceBoundary, this.blockedUntil)
  }

  private schedule() {
    this.clearTimer()
    if (!this.running || this.paused || this.inFlight) return

    const delayMs = Math.max(0, this.nextRequestAt() - this.runtime.now())
    if (delayMs === 0) {
      void this.run()
      return
    }

    this.timer = this.runtime.setTimeout(() => {
      this.timer = undefined
      void this.run()
    }, delayMs)
  }

  private async run() {
    if (!this.running || this.paused || this.inFlight) return

    const now = this.runtime.now()
    const nextRequestAt = this.nextRequestAt()
    if (now < nextRequestAt) {
      this.schedule()
      return
    }

    const requestRevision = this.queryRevision
    const requestQuery = this.query
    const controller = new AbortController()
    this.controller = controller
    this.inFlight = true
    this.lastRequestStartedAt = now

    if (!this.result.status.lastSuccessAt && this.result.status.phase !== 'error') {
      this.updateStatus({ phase: 'loading', paused: false })
    } else {
      this.updateStatus({ paused: false })
    }

    try {
      const entities = await this.provider.fetchSnapshot(
        requestQuery,
        controller.signal,
      )
      if (
        !this.running ||
        controller.signal.aborted ||
        requestRevision !== this.queryRevision
      ) {
        return
      }

      const completedAt = this.runtime.now()
      const lastDataAt = entities.reduce(
        (latest, entity) => Math.max(latest, entity.position.observedAt),
        0,
      )
      this.rateLimitFailures = 0
      this.blockedUntil = 0
      this.lastLoggedError = undefined
      this.setResult({
        entities,
        status: {
          phase: 'live',
          paused: false,
          updating: false,
          lastSuccessAt: completedAt,
          lastDataAt: lastDataAt || completedAt,
        },
      })
    } catch (error) {
      if (
        !this.running ||
        controller.signal.aborted ||
        requestRevision !== this.queryRevision
      ) {
        return
      }

      if (error instanceof ProviderError && error.status === 429) {
        this.rateLimitFailures += 1
        const exponentialBackoff = Math.min(
          this.refreshIntervalMs * 2 ** this.rateLimitFailures,
          this.rateLimitBackoffMaxMs,
        )
        const retryAfterMs = error.retryAfterMs ?? 0
        this.blockedUntil =
          this.runtime.now() + Math.max(exponentialBackoff, retryAfterMs)
      } else if (
        error instanceof ProviderError &&
        error.retryAfterMs !== undefined
      ) {
        this.blockedUntil = this.runtime.now() + error.retryAfterMs
      }

      const message = errorMessage(error)
      if (message !== this.lastLoggedError) {
        this.onWarning(message)
        this.lastLoggedError = message
      }
      this.updateStatus({
        phase: 'error',
        paused: false,
        updating: false,
        error: message,
      })
    } finally {
      if (this.controller === controller) this.controller = undefined
      this.inFlight = false
      this.schedule()
    }
  }

  private updateStatus(patch: Partial<ProviderStatus>) {
    this.setResult({
      ...this.result,
      status: {
        ...this.result.status,
        ...patch,
      },
    })
  }

  private setResult(result: TrafficProviderResult<Aircraft>) {
    this.result = result
    this.onResult(result)
  }
}
