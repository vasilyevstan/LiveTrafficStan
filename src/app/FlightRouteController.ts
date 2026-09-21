import type {
  FlightRouteIdentity,
  FlightRouteRecord,
  FlightRouteViewState,
} from '../domain/flightRoute'
import { flightRouteIdentityKey } from '../domain/flightRoute'
import {
  FlightRouteProviderError,
  type FlightRouteProvider,
} from '../providers/flightRoute/aviationstackFlightRouteProvider'

type Listener = (state: FlightRouteViewState) => void

interface FlightRouteControllerRuntime {
  now: () => number
}

interface FlightRouteCacheEntry {
  expiresAt: number
  route: FlightRouteRecord
}

const FLIGHT_ROUTE_CACHE_TTL_MS = 6 * 60 * 60_000
const FLIGHT_ROUTE_CACHE_MAX_ENTRIES = 32

const browserRuntime: FlightRouteControllerRuntime = {
  now: () => Date.now(),
}

const isAbortError = (error: unknown) =>
  (error instanceof DOMException || error instanceof Error) &&
  error.name === 'AbortError'

export class FlightRouteController {
  private readonly provider: FlightRouteProvider
  private readonly runtime: FlightRouteControllerRuntime
  private readonly cache = new Map<string, FlightRouteCacheEntry>()
  private state: FlightRouteViewState = { phase: 'idle' }
  private listener?: Listener
  private requestController?: AbortController
  private revision = 0
  private selectedIdentity?: FlightRouteIdentity
  private selectedIdentityKey?: string

  constructor(
    provider: FlightRouteProvider,
    runtime: FlightRouteControllerRuntime = browserRuntime,
  ) {
    this.provider = provider
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
    if (identityKey === this.selectedIdentityKey) return

    this.revision += 1
    this.requestController?.abort()
    this.requestController = undefined
    this.selectedIdentity = identity
    this.selectedIdentityKey = identityKey
    const cachedRoute = identityKey
      ? this.readCachedRoute(identityKey)
      : undefined
    this.publish(
      cachedRoute && identityKey
        ? {
            phase: 'available',
            identityKey,
            route: cachedRoute,
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
        this.publish({
          phase: 'error',
          identityKey,
          reason:
            error instanceof FlightRouteProviderError
              ? error.reason
              : 'provider-error',
        })
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
      expiresAt: this.runtime.now() + FLIGHT_ROUTE_CACHE_TTL_MS,
      route,
    })
    while (this.cache.size > FLIGHT_ROUTE_CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value
      if (typeof oldestKey !== 'string') break
      this.cache.delete(oldestKey)
    }
  }
}
