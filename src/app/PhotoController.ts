import type { PhotoLookupResult, PhotoViewState } from '../domain/photo'
import {
  PhotoProviderError,
  type PhotoProvider,
} from '../providers/photo'

type Listener<Photo> = (state: PhotoViewState<Photo>) => void

export interface PhotoControllerConfig {
  cacheMaxEntries: number
  cacheTtlMs: number
  rateLimitFallbackMs: number
}

export interface PhotoControllerRuntime {
  now: () => number
}

interface CacheEntry<Photo> {
  expiresAt: number
  result: PhotoLookupResult<Photo>
}

export interface SharedPhotoSession<Photo> {
  blockedUntil: number
  cache: Map<string, CacheEntry<Photo>>
  listeners: Set<
    (identityKey: string, result: PhotoLookupResult<Photo>) => void
  >
}

const browserRuntime: PhotoControllerRuntime = {
  now: () => Date.now(),
}

export const sharedPhotoSessionFor = <Identity, Photo>(
  provider: PhotoProvider<Identity, Photo>,
  sessions: WeakMap<PhotoProvider<Identity, Photo>, SharedPhotoSession<Photo>>,
) => {
  const existing = sessions.get(provider)
  if (existing) return existing

  const session: SharedPhotoSession<Photo> = {
    blockedUntil: 0,
    cache: new Map(),
    listeners: new Set(),
  }
  sessions.set(provider, session)
  return session
}

const isAbortError = (error: unknown) =>
  (error instanceof DOMException || error instanceof Error) &&
  error.name === 'AbortError'

export class PhotoController<Identity, Photo> {
  private readonly provider: PhotoProvider<Identity, Photo>
  private readonly config: PhotoControllerConfig
  private readonly runtime: PhotoControllerRuntime
  private readonly session: SharedPhotoSession<Photo>
  private readonly identityKey: (identity: Identity) => string
  private readonly automaticAttempts = new Map<string, number>()
  private state: PhotoViewState<Photo> = { phase: 'idle' }
  private listener?: Listener<Photo>
  private requestController?: AbortController
  private activeAutomaticIdentityKey?: string
  private revision = 0
  private selectedIdentity?: Identity
  private selectedIdentityKey?: string
  private readonly sharedResultListener = (
    identityKey: string,
    result: PhotoLookupResult<Photo>,
  ) => {
    if (
      identityKey !== this.selectedIdentityKey ||
      this.state.phase === 'loading'
    ) {
      return
    }
    this.publishResult(identityKey, result)
  }

  constructor(
    provider: PhotoProvider<Identity, Photo>,
    config: PhotoControllerConfig,
    identityKey: (identity: Identity) => string,
    session: SharedPhotoSession<Photo>,
    runtime: PhotoControllerRuntime = browserRuntime,
  ) {
    this.provider = provider
    this.config = config
    this.runtime = runtime
    this.session = session
    this.identityKey = identityKey
  }

  subscribe(listener: Listener<Photo>) {
    this.listener = listener
    this.session.listeners.add(this.sharedResultListener)
    listener(this.state)
    return () => {
      if (this.listener === listener) {
        this.listener = undefined
        this.session.listeners.delete(this.sharedResultListener)
      }
    }
  }

  select(identity: Identity | undefined) {
    const identityKey = identity
      ? this.identityKey(identity)
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

  request(requestedIdentity: Identity) {
    this.select(requestedIdentity)
    if (this.state.phase === 'available') return
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

  requestIfMissing(requestedIdentity: Identity) {
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
        if (error instanceof PhotoProviderError) {
          const retryAt =
            error.reason === 'throttled' || error.retryAfterMs !== undefined
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
    this.session.listeners.delete(this.sharedResultListener)
  }

  private publishResult(
    identityKey: string,
    result: PhotoLookupResult<Photo>,
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

  private publish(state: PhotoViewState<Photo>) {
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
    result: PhotoLookupResult<Photo>,
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
    for (const listener of this.session.listeners) {
      listener(identityKey, result)
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
