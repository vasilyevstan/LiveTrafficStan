import { DISCOVERY_CONFIG as config } from '../config/discoveryConfig'
import type { DiscoveryClass, DiscoveryResponse, LookupRequest } from '../domain/objectDiscovery'
import { ProviderError, errorMessage } from '../providers/errors'
import type { ObjectLookupProvider } from '../providers/discovery/objectLookupProvider'
import { normalizeLookupRequest } from '../providers/discovery/lookupContract'

export type ObjectLookupState =
  | { phase: 'idle' }
  | { phase: 'loading'; request: LookupRequest }
  | { phase: 'results'; request: LookupRequest; result: DiscoveryResponse }
  | { phase: 'error'; message: string; retryAt?: number }

interface LookupRuntime {
  now: () => number
  setTimeout: (callback: () => void, delayMs: number) => unknown
  clearTimeout: (timer: unknown) => void
}

const defaultRuntime: LookupRuntime = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (timer) => globalThis.clearTimeout(timer as ReturnType<typeof globalThis.setTimeout>),
}

export class ObjectLookupController {
  private readonly provider: ObjectLookupProvider
  private readonly onState: (state: ObjectLookupState) => void
  private readonly runtime: LookupRuntime
  private revision = 0
  private abortController?: AbortController
  private timer?: unknown
  private readonly nextAllowed = new Map<DiscoveryClass, number>()

  constructor(options: {
    provider: ObjectLookupProvider
    onState: (state: ObjectLookupState) => void
    runtime?: LookupRuntime
  }) {
    this.provider = options.provider
    this.onState = options.onState
    this.runtime = options.runtime ?? defaultRuntime
  }

  async lookup(objectClass: DiscoveryClass, by: string, query: string) {
    this.abort()
    const revision = ++this.revision
    let request: LookupRequest
    try {
      request = normalizeLookupRequest(objectClass, by, query)
    } catch (error) {
      this.onState({ phase: 'error', message: errorMessage(error) })
      return
    }
    const now = this.runtime.now()
    const nextAllowed = this.nextAllowed.get(objectClass) ?? 0
    if (nextAllowed > now) {
      this.limited(nextAllowed)
      return
    }
    const cooldown = objectClass === 'aircraft' ? config.aircraftCooldownMs : config.shipsCooldownMs
    this.nextAllowed.set(objectClass, now + cooldown)
    const controller = new AbortController()
    this.abortController = controller
    this.onState({ phase: 'loading', request })
    let timedOut = false
    const timer = this.runtime.setTimeout(() => {
      if (revision !== this.revision) return
      timedOut = true
      controller.abort(new Error('Lookup timed out'))
      this.onState({ phase: 'error', message: 'Lookup timed out. The map and local search still work.' })
    }, config.timeoutMs)
    this.timer = timer
    try {
      const result = await this.provider.lookup(request, controller.signal)
      if (revision !== this.revision || controller.signal.aborted || timedOut) return
      this.onState({ phase: 'results', request, result })
      return result
    } catch (error) {
      let retryAt: number | undefined
      if (error instanceof ProviderError &&
        (error.status === 429 || error.status === 503 && error.retryAfterMs !== undefined)) {
        retryAt = Math.max(
          this.nextAllowed.get(objectClass) ?? 0,
          this.runtime.now() + (error.retryAfterMs ?? config.rateLimitFallbackMs),
        )
        this.nextAllowed.set(objectClass, retryAt)
      }
      if (revision !== this.revision || controller.signal.aborted || timedOut) return
      if (retryAt !== undefined) {
        this.limited(retryAt)
      } else {
        this.onState({ phase: 'error', message: `Lookup unavailable. ${errorMessage(error)}` })
      }
    } finally {
      this.runtime.clearTimeout(timer)
      if (this.timer === timer) this.timer = undefined
      if (this.abortController === controller) this.abortController = undefined
    }
  }

  cancel() {
    this.stop()
    this.onState({ phase: 'idle' })
  }

  stop() {
    this.revision += 1
    this.abort()
  }

  private limited(retryAt: number) {
    const seconds = Math.max(1, Math.ceil((retryAt - this.runtime.now()) / 1_000))
    this.onState({ phase: 'error', message: `Lookup is limited. Try again in ${seconds}s.`, retryAt })
  }

  private abort() {
    this.abortController?.abort()
    this.abortController = undefined
    if (this.timer !== undefined) this.runtime.clearTimeout(this.timer)
    this.timer = undefined
  }
}
