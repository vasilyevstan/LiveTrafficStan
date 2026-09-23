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

interface SharedAircraftPhotoSession {
  blockedUntil: number
  cache: Map<string, CacheEntry>
}

const browserRuntime: AircraftPhotoControllerRuntime = {
  now: () => Date.now(),
}

const sharedSessions = new WeakMap<
  AircraftPhotoProvider,
  SharedAircraftPhotoSession
>()

const sharedSessionFor = (provider: AircraftPhotoProvider) => {
  const existing = sharedSessions.get(provider)
  if (existing) return existing

  const session: SharedAircraftPhotoSession = {
    blockedUntil: 0,
    cache: new Map(),
  }
  sharedSessions.set(provider, session)
  return session
}

const isAbortError = (error: unknown) =>
  (error instanceof DOMException || error instanceof Error) &&
  error.name === 'AbortError'

export class AircraftPhotoController {
  private readonly provider: AircraftPhotoProvider
  private readonly config: AircraftPhotoControllerConfig
  private readonly runtime: AircraftPhotoControllerRuntime
  private readonly session: SharedAircraftPhotoSession
  private readonly automaticAttempts = new Map<string, number>()
  private state: AircraftPhotoViewState = { phase: 'idle' }
  private listener?: Listener
  private requestController?: AbortController
  private activeAutomaticIdentityKey?: string
  private revision = 0
  private selectedIdentity?: AircraftPhotoIdentity
  private selectedIdentityKey?: string

  constructor(
    provider: AircraftPhotoProvider,
    config: AircraftPhotoControllerConfig,
    runtime: AircraftPhotoControllerRuntime = browserRuntime,
  ) {
    this.provider = provider
    this.config = config
    this.runtime = runtime
    this.session = sharedSessionFor(provider)
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
    if (this.activeAutomaticIdentityKey) {
      this.automaticAttempts.delete(this.activeAutomaticIdentityKey)
      this.activeAutomaticIdentityKey = undefined
    }
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
      this.selectedIdentityKey &&
      (this.state.phase === 'idle' ||
        this.state.phase === 'error')
    ) {
      const cached = this.readCache(this.selectedIdentityKey)
      if (cached) {
        this.publishResult(this.selectedIdentityKey, cached)
        return
      }
    }
    this.startRequest()
  }

  requestIfMissing(requestedIdentity: AircraftPhotoIdentity) {
    this.select(requestedIdentity)
    if (
      !this.selectedIdentityKey ||
      this.state.phase !== 'idle' ||
      this.hasRecentAutomaticAttempt(this.selectedIdentityKey)
    ) {
      return
    }
    this.recordAutomaticAttempt(this.selectedIdentityKey)
    this.startRequest(true)
  }

  private startRequest(automatic = false) {
    if (
      !this.selectedIdentity ||
      !this.selectedIdentityKey ||
      this.state.phase === 'loading'
    ) {
      return
    }

    const now = this.runtime.now()
    if (this.session.blockedUntil > now) {
      this.publish({
        phase: 'error',
        identityKey: this.selectedIdentityKey,
        reason: 'throttled',
        retryAt: this.session.blockedUntil,
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
    this.activeAutomaticIdentityKey = automatic
      ? identityKey
      : undefined
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
        this.activeAutomaticIdentityKey = undefined
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
        this.activeAutomaticIdentityKey = undefined
        if (error instanceof AircraftPhotoProviderError) {
          const retryAt =
            error.reason === 'throttled'
              ? this.runtime.now() +
                (error.retryAfterMs ??
                  this.config.rateLimitFallbackMs)
              : undefined
          if (retryAt !== undefined) {
            this.session.blockedUntil = Math.max(
              this.session.blockedUntil,
              retryAt,
            )
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
    if (this.activeAutomaticIdentityKey) {
      this.automaticAttempts.delete(this.activeAutomaticIdentityKey)
      this.activeAutomaticIdentityKey = undefined
    }
    this.selectedIdentity = undefined
    this.selectedIdentityKey = undefined
    this.requestController?.abort()
    this.requestController = undefined
    this.listener = undefined
    this.automaticAttempts.clear()
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
    const entry = this.session.cache.get(identityKey)
    if (!entry) return undefined
    if (entry.expiresAt <= this.runtime.now()) {
      this.session.cache.delete(identityKey)
      return undefined
    }
    this.session.cache.delete(identityKey)
    this.session.cache.set(identityKey, entry)
    return entry.result
  }

  private writeCache(
    identityKey: string,
    result: AircraftPhotoLookupResult,
  ) {
    this.session.cache.delete(identityKey)
    this.session.cache.set(identityKey, {
      expiresAt: this.runtime.now() + this.config.cacheTtlMs,
      result,
    })
    while (this.session.cache.size > this.config.cacheMaxEntries) {
      const oldestKey = this.session.cache.keys().next().value
      if (typeof oldestKey !== 'string') break
      this.session.cache.delete(oldestKey)
    }
  }

  private hasRecentAutomaticAttempt(identityKey: string) {
    const expiresAt = this.automaticAttempts.get(identityKey)
    if (expiresAt === undefined) return false
    if (expiresAt <= this.runtime.now()) {
      this.automaticAttempts.delete(identityKey)
      return false
    }
    this.automaticAttempts.delete(identityKey)
    this.automaticAttempts.set(identityKey, expiresAt)
    return true
  }

  private recordAutomaticAttempt(identityKey: string) {
    this.automaticAttempts.delete(identityKey)
    this.automaticAttempts.set(
      identityKey,
      this.runtime.now() + this.config.cacheTtlMs,
    )
    while (this.automaticAttempts.size > this.config.cacheMaxEntries) {
      const oldestKey = this.automaticAttempts.keys().next().value
      if (typeof oldestKey !== 'string') break
      this.automaticAttempts.delete(oldestKey)
    }
  }
}
