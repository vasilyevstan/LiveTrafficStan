import type {
  AircraftPhotoIdentity,
  AircraftPhotoLookupResult,
  AircraftPhotoViewState,
} from '../domain/aircraftPhoto'
import { aircraftPhotoIdentityKey } from '../domain/aircraftPhoto'
import {
  AircraftPhotoProviderError,
  type AircraftPhotoProvider,
} from '../providers/aircraftPhoto/planespottersPhotoProvider'

type Listener = (state: AircraftPhotoViewState) => void

interface AircraftPhotoControllerConfig {
  cacheMaxEntries: number
  cacheTtlMs: number
  rateLimitFallbackMs: number
}

interface AircraftPhotoControllerRuntime {
  now: () => number
}

interface CacheEntry {
  expiresAt: number
  result: AircraftPhotoLookupResult
}

const browserRuntime: AircraftPhotoControllerRuntime = {
  now: () => Date.now(),
}

const isAbortError = (error: unknown) =>
  (error instanceof DOMException || error instanceof Error) &&
  error.name === 'AbortError'

export class AircraftPhotoController {
  private readonly provider: AircraftPhotoProvider
  private readonly config: AircraftPhotoControllerConfig
  private readonly runtime: AircraftPhotoControllerRuntime
  private readonly cache = new Map<string, CacheEntry>()
  private state: AircraftPhotoViewState = { phase: 'idle' }
  private listener?: Listener
  private requestController?: AbortController
  private revision = 0
  private selectedIdentity?: AircraftPhotoIdentity
  private selectedIdentityKey?: string
  private blockedUntil = 0

  constructor(
    provider: AircraftPhotoProvider,
    config: AircraftPhotoControllerConfig,
    runtime: AircraftPhotoControllerRuntime = browserRuntime,
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

  select(identity: AircraftPhotoIdentity | undefined) {
    const identityKey = identity
      ? aircraftPhotoIdentityKey(identity)
      : undefined
    if (identityKey === this.selectedIdentityKey) return

    this.revision += 1
    this.requestController?.abort()
    this.requestController = undefined
    this.selectedIdentity = identity
    this.selectedIdentityKey = identityKey
    if (!identity || !identityKey) {
      this.publish({ phase: 'idle' })
      return
    }

    const cached = this.readCache(identityKey)
    if (cached) {
      this.publishResult(identityKey, cached)
      return
    }
    this.publish({ phase: 'idle', identityKey })
  }

  request(requestedIdentity: AircraftPhotoIdentity) {
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
      this.publish({
        phase: 'error',
        identityKey: this.selectedIdentityKey,
        reason: 'throttled',
        retryAt: this.blockedUntil,
      })
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
        if (
          result.kind === 'available' ||
          result.reason === 'not-found'
        ) {
          this.writeCache(identityKey, result)
        }
        this.publishResult(identityKey, result)
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
        if (error instanceof AircraftPhotoProviderError) {
          const retryAt =
            error.reason === 'throttled'
              ? this.runtime.now() +
                (error.retryAfterMs ??
                  this.config.rateLimitFallbackMs)
              : undefined
          if (retryAt !== undefined) {
            this.blockedUntil = Math.max(this.blockedUntil, retryAt)
          }
          this.publish({
            phase: 'error',
            identityKey,
            reason: error.reason,
            retryAt,
          })
          return
        }
        this.publish({
          phase: 'error',
          identityKey,
          reason: 'provider-error',
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

  private publishResult(
    identityKey: string,
    result: AircraftPhotoLookupResult,
  ) {
    this.publish(
      result.kind === 'available'
        ? {
            phase: 'available',
            identityKey,
            photo: result.photo,
          }
        : {
            phase: 'unavailable',
            identityKey,
            reason: result.reason,
          },
    )
  }

  private publish(state: AircraftPhotoViewState) {
    this.state = state
    this.listener?.(state)
  }

  private readCache(identityKey: string) {
    const entry = this.cache.get(identityKey)
    if (!entry) return undefined
    if (entry.expiresAt <= this.runtime.now()) {
      this.cache.delete(identityKey)
      return undefined
    }
    this.cache.delete(identityKey)
    this.cache.set(identityKey, entry)
    return entry.result
  }

  private writeCache(
    identityKey: string,
    result: AircraftPhotoLookupResult,
  ) {
    this.cache.delete(identityKey)
    this.cache.set(identityKey, {
      expiresAt: this.runtime.now() + this.config.cacheTtlMs,
      result,
    })
    while (this.cache.size > this.config.cacheMaxEntries) {
      const oldestKey = this.cache.keys().next().value
      if (typeof oldestKey !== 'string') break
      this.cache.delete(oldestKey)
    }
  }
}
