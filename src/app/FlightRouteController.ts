import type {
  FlightRouteErrorReason,
  FlightRouteIdentity,
  FlightRouteRecord,
  FlightRouteViewState,
} from '../domain/flightRoute'
import { flightRouteIdentityKey } from '../domain/flightRoute'
import {
  FlightRouteProviderError,
  type FlightRouteProvider,
} from '../providers/flightRoute/adsbLolFlightRouteProvider'

type Listener = (state: FlightRouteViewState) => void

export interface FlightRouteControllerConfig {
  cacheMaxEntries: number
  cacheTtlMs: number
  rateLimitFallbackMs: number
  rateLimitBackoffMaxMs: number
}

interface FlightRouteControllerRuntime {
  now: () => number
}

interface FlightRouteCacheEntry {
  expiresAt: number
  route: FlightRouteRecord
}

const browserRuntime: FlightRouteControllerRuntime = {
  now: () => Date.now(),
}

const isAbortError = (error: unknown) =>
  (error instanceof DOMException || error instanceof Error) &&
  error.name === 'AbortError'

export class FlightRouteController {
  private readonly provider: FlightRouteProvider
  private readonly config: FlightRouteControllerConfig
  private readonly runtime: FlightRouteControllerRuntime
  private readonly cache = new Map<string, FlightRouteCacheEntry>()
  private state: FlightRouteViewState = { phase: 'idle' }
  private listener?: Listener
  private requestController?: AbortController
  private revision = 0
  private selectedIdentity?: FlightRouteIdentity
  private selectedIdentityKey?: string
  private blockedUntil = 0
  private blockedReason: FlightRouteErrorReason = 'provider-error'

  constructor(
    provider: FlightRouteProvider,
    config: FlightRouteControllerConfig,
    runtime: FlightRouteControllerRuntime = browserRuntime,
  ) {
    this.provider = provider
    this.config = config
    this.runtime = runtime
  }

  subscribe(listener: Listener) {
    this.listener = listener
    listener(this.state)
    return () => {
      if (this.listener === listener) this.listener = undefined
    }
  }

  select(identity: FlightRouteIdentity | undefined) {
    const identityKey = identity
      ? flightRouteIdentityKey(identity)
      : undefined
    if (identityKey === this.selectedIdentityKey) {
      this.selectedIdentity = identity
      return
    }

    this.revision += 1
    this.requestController?.abort()
    this.requestController = undefined
    this.selectedIdentity = identity
    this.selectedIdentityKey = identityKey
    const cachedRoute = identityKey
      ? this.readCachedRoute(identityKey)
      : undefined
    const retryAt =
      identityKey && this.blockedUntil > this.runtime.now()
        ? this.blockedUntil
        : undefined
    this.publish(
      cachedRoute && identityKey
        ? {
            phase: 'available',
            identityKey,
            route: cachedRoute,
            ...(retryAt === undefined ? {} : { retryAt }),
          }
        : retryAt && identityKey
          ? {
              phase: 'error',
              identityKey,
              reason: this.blockedReason,
              retryAt,
            }
          : identityKey
            ? { phase: 'idle', identityKey }
            : { phase: 'idle' },
    )
  }

  request(requestedIdentity: FlightRouteIdentity) {
    this.select(requestedIdentity)
    if (
      !this.selectedIdentity ||
      !this.selectedIdentityKey ||
      this.state.phase === 'loading'
    ) {
      return
    }

    const now = this.runtime.now()
    if (this.blockedUntil > now) {
      this.publish(
        this.state.phase === 'available'
          ? { ...this.state, retryAt: this.blockedUntil }
          : {
              phase: 'error',
              identityKey: this.selectedIdentityKey,
              reason: this.blockedReason,
              retryAt: this.blockedUntil,
            },
      )
      return
    }
    this.blockedUntil = 0

    this.revision += 1
    const revision = this.revision
    const identity = this.selectedIdentity
    const identityKey = this.selectedIdentityKey
    const requestController = new AbortController()
    this.requestController?.abort()
    this.requestController = requestController
    this.publish({ phase: 'loading', identityKey })

    void this.provider.lookup(identity, requestController.signal).then(
      (result) => {
        if (
          revision !== this.revision ||
          requestController.signal.aborted ||
          identityKey !== this.selectedIdentityKey
        ) {
          return
        }
        this.requestController = undefined
        if (result.kind === 'available') {
          this.writeCachedRoute(identityKey, result.route)
          this.publish({
            phase: 'available',
            identityKey,
            route: result.route,
          })
        } else {
          this.publish({
            phase: 'unavailable',
            identityKey,
            reason: result.reason,
          })
        }
      },
      (error: unknown) => {
        if (
          revision !== this.revision ||
          requestController.signal.aborted ||
          identityKey !== this.selectedIdentityKey ||
          isAbortError(error)
        ) {
          return
        }
        this.requestController = undefined
        if (error instanceof FlightRouteProviderError) {
          this.publishBlockedError(
            identityKey,
            error.reason,
            error.retryAfterMs,
          )
          return
        }
        this.publishBlockedError(
          identityKey,
          'provider-error',
        )
      },
    )
  }

  dispose() {
    this.revision += 1
    this.selectedIdentity = undefined
    this.selectedIdentityKey = undefined
    this.requestController?.abort()
    this.requestController = undefined
    this.listener = undefined
    this.cache.clear()
    this.blockedUntil = 0
  }

  private publish(state: FlightRouteViewState) {
    this.state = state
    this.listener?.(state)
  }

  private readCachedRoute(identityKey: string) {
    const entry = this.cache.get(identityKey)
    if (!entry) return undefined
    if (entry.expiresAt <= this.runtime.now()) {
      this.cache.delete(identityKey)
      return undefined
    }

    this.cache.delete(identityKey)
    this.cache.set(identityKey, entry)
    return entry.route
  }

  private writeCachedRoute(
    identityKey: string,
    route: FlightRouteRecord,
  ) {
    this.cache.delete(identityKey)
    this.cache.set(identityKey, {
      expiresAt: this.runtime.now() + this.config.cacheTtlMs,
      route,
    })
    while (this.cache.size > this.config.cacheMaxEntries) {
      const oldestKey = this.cache.keys().next().value
      if (typeof oldestKey !== 'string') break
      this.cache.delete(oldestKey)
    }
  }

  private publishBlockedError(
    identityKey: string,
    reason: FlightRouteErrorReason,
    requestedRetryAfterMs?: number,
  ) {
    const retryAfterMs = Math.min(
      this.config.rateLimitBackoffMaxMs,
      Math.max(
        0,
        requestedRetryAfterMs ??
          this.config.rateLimitFallbackMs,
      ),
    )
    this.blockedUntil = this.runtime.now() + retryAfterMs
    this.blockedReason = reason
    this.publish({
      phase: 'error',
      identityKey,
      reason,
      retryAt: this.blockedUntil,
    })
  }
}
