import type { AppConfig } from '../config/appConfig'
import {
  ProviderError,
  errorMessage,
} from '../providers/errors'
import type {
  PlaceSearchProvider,
  PlaceSearchResult,
} from '../providers/geocoding/photonProvider'

export type PlaceSearchState =
  | { phase: 'idle' }
  | { phase: 'loading'; query: string }
  | {
      phase: 'results'
      query: string
      results: readonly PlaceSearchResult[]
    }
  | { phase: 'empty'; query: string }
  | { phase: 'error'; message: string; retryAt?: number }

interface PlaceSearchRuntime {
  now: () => number
  setTimeout: (callback: () => void, delayMs: number) => unknown
  clearTimeout: (handle: unknown) => void
}

interface PlaceSearchControllerOptions {
  provider: PlaceSearchProvider
  config: AppConfig['geocoder']
  onState: (state: PlaceSearchState) => void
  runtime?: PlaceSearchRuntime
}

interface CacheEntry {
  expiresAt: number
  query: string
  results: readonly PlaceSearchResult[]
}

const browserRuntime: PlaceSearchRuntime = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
}

const normalizedQuery = (query: string) =>
  query.trim().replace(/\s+/g, ' ').toLowerCase()

const retryMessage = (retryAt: number, now: number) => {
  const seconds = Math.max(1, Math.ceil((retryAt - now) / 1_000))
  return `Place search is temporarily limited. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`
}

export class PlaceSearchController {
  private readonly provider: PlaceSearchProvider
  private readonly config: AppConfig['geocoder']
  private readonly onState: (state: PlaceSearchState) => void
  private readonly runtime: PlaceSearchRuntime
  private readonly cache = new Map<string, CacheEntry>()
  private revision = 0
  private controller?: AbortController
  private timeout?: unknown
  private lastRequestStartedAt?: number
  private blockedUntil = 0
  private phase: PlaceSearchState['phase'] = 'idle'

  constructor(options: PlaceSearchControllerOptions) {
    this.provider = options.provider
    this.config = options.config
    this.onState = options.onState
    this.runtime = options.runtime ?? browserRuntime
  }

  async search(query: string) {
    const canonicalQuery = query.trim().replace(/\s+/g, ' ')
    const cacheKey = normalizedQuery(canonicalQuery)
    const revision = ++this.revision
    this.abortCurrent()

    const cached = this.readCache(cacheKey)
    if (cached) {
      this.publishResults(cached.query, cached.results)
      return
    }

    const now = this.runtime.now()
    const cooldownUntil =
      this.lastRequestStartedAt === undefined
        ? 0
        : this.lastRequestStartedAt + this.config.requestCooldownMs
    const retryAt = Math.max(cooldownUntil, this.blockedUntil)
    if (retryAt > now) {
      this.publish({
        phase: 'error',
        message: retryMessage(retryAt, now),
        retryAt,
      })
      return
    }

    const controller = new AbortController()
    this.controller = controller
    this.lastRequestStartedAt = now
    this.publish({ phase: 'loading', query: canonicalQuery })
    let timedOut = false
    const timeout = this.runtime.setTimeout(() => {
      timedOut = true
      controller.abort(new Error('Place search timed out'))
      if (revision === this.revision) {
        this.publish({
          phase: 'error',
          message:
            'Place search timed out. Coordinates and the current map still work.',
        })
      }
    }, this.config.timeoutMs)
    this.timeout = timeout

    try {
      const results = await this.provider.search(
        canonicalQuery,
        controller.signal,
      )
      if (timedOut) return
      if (revision !== this.revision || controller.signal.aborted) return
      this.writeCache(cacheKey, canonicalQuery, results)
      this.publishResults(canonicalQuery, results)
    } catch (error) {
      if (revision !== this.revision || (!timedOut && controller.signal.aborted)) {
        return
      }

      if (timedOut) {
        return
      }

      if (error instanceof ProviderError && error.status === 429) {
        const retryAfterMs =
          Math.max(
            error.retryAfterMs ?? this.config.rateLimitFallbackMs,
            this.config.requestCooldownMs,
          )
        this.blockedUntil = Math.max(
          this.blockedUntil,
          this.runtime.now() + retryAfterMs,
        )
        this.publish({
          phase: 'error',
          message: retryMessage(this.blockedUntil, this.runtime.now()),
          retryAt: this.blockedUntil,
        })
        return
      }

      this.publish({
        phase: 'error',
        message: `Place search is unavailable; coordinates still work. ${errorMessage(error)}`,
      })
    } finally {
      if (this.controller === controller) this.controller = undefined
      if (this.timeout === timeout) {
        this.runtime.clearTimeout(timeout)
        this.timeout = undefined
      }
    }
  }

  cancel() {
    this.revision += 1
    this.abortCurrent()
    if (this.phase !== 'idle') this.publish({ phase: 'idle' })
  }

  stop() {
    this.revision += 1
    this.abortCurrent()
  }

  private publishResults(
    query: string,
    results: readonly PlaceSearchResult[],
  ) {
    if (results.length === 0) {
      this.publish({ phase: 'empty', query })
      return
    }
    this.publish({ phase: 'results', query, results })
  }

  private publish(state: PlaceSearchState) {
    this.phase = state.phase
    this.onState(state)
  }

  private readCache(key: string) {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= this.runtime.now()) {
      this.cache.delete(key)
      return undefined
    }

    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry
  }

  private writeCache(
    key: string,
    query: string,
    results: readonly PlaceSearchResult[],
  ) {
    this.cache.delete(key)
    this.cache.set(key, {
      expiresAt: this.runtime.now() + this.config.cacheTtlMs,
      query,
      results,
    })
    while (this.cache.size > this.config.cacheMaxEntries) {
      const oldestKey = this.cache.keys().next().value
      if (typeof oldestKey !== 'string') break
      this.cache.delete(oldestKey)
    }
  }

  private abortCurrent() {
    this.controller?.abort()
    this.controller = undefined
    this.clearTimeout()
  }

  private clearTimeout() {
    if (this.timeout === undefined) return
    this.runtime.clearTimeout(this.timeout)
    this.timeout = undefined
  }
}
