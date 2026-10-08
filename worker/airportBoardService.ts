import { AIRPORT_BOARD_CONFIG as config } from '../src/config/airportBoardConfig.js'
import type { AirportBoardSnapshot } from '../src/domain/airportBoard.js'
import { isRecord } from '../src/providers/guards.js'
import { readBoundedJson } from '../src/providers/boundedJson.js'
import { parseRetryAfterMs } from '../src/providers/errors.js'
import { isAirportBoardIcao, normalizeAeroDataBoxBoard } from '../src/providers/airportBoards/airportBoardNormalization.js'

interface Quota {
  remaining: number
  resetAt: number
}

export interface AirportBoardAdmission {
  version: 1
  notBefore: number
  units?: Quota
  requests?: Quota
}

export interface AirportBoardStateStore {
  read(): AirportBoardAdmission | undefined
  write(state: AirportBoardAdmission): void
}

interface PendingBoard {
  icao: string
  promise: Promise<AirportBoardSnapshot>
  deadline: number
  controller: AbortController
  consumers: Set<symbol>
}

export class AirportBoardRequestError extends Error {
  readonly status: number
  readonly retryAt?: number

  constructor(
    message: string,
    status = 503,
    retryAt?: number,
  ) {
    super(message)
    this.name = 'AirportBoardRequestError'
    this.status = status
    this.retryAt = retryAt
  }
}

const counter = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export const parseAirportBoardAdmission = (value: unknown): AirportBoardAdmission => {
  if (!isRecord(value) || value.version !== 1 || !counter(value.notBefore)) {
    throw new Error('Invalid airport-board admission state')
  }
  const quota = (input: unknown, maximum: number): Quota | undefined => {
    if (input === undefined) return undefined
    if (!isRecord(input) || !counter(input.remaining) || input.remaining > maximum ||
      !counter(input.resetAt) || input.resetAt === 0) throw new Error('Invalid airport-board quota state')
    return { remaining: input.remaining, resetAt: input.resetAt }
  }
  return {
    version: 1,
    notBefore: value.notBefore,
    units: quota(value.units, config.monthlyUnits),
    requests: quota(value.requests, 500_000),
  }
}

const quotaHeaders = (headers: Headers, now: number) => {
  const number = (name: string) => {
    const value = headers.get(name)
    if (value === null || !/^\d{1,9}$/.test(value)) throw new Error('Airport-board quota headers unavailable')
    return Number(value)
  }
  if (number('x-ratelimit-api-units-limit') !== config.monthlyUnits ||
    number('x-ratelimit-rapid-free-plans-hard-limit-limit') < 1) {
    throw new Error('Airport-board free plan is not confirmed')
  }
  const quota = (name: string, maximum: number): Quota => {
    const limit = number(`${name}-limit`)
    const remaining = number(`${name}-remaining`)
    const reset = number(`${name}-reset`) * 1_000
    if (limit < 1 || limit > maximum || remaining > limit || reset > config.maximumQuotaResetMs) {
      throw new Error('Invalid airport-board quota headers')
    }
    // Receipt time plus one second is conservative against network delay and
    // the provider's whole-second reset countdown.
    return { remaining, resetAt: now + reset + 1_000 }
  }
  return {
    units: quota('x-ratelimit-api-units', config.monthlyUnits),
    requests: quota('x-ratelimit-requests', 500_000),
  }
}

const wait = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) {
    reject(signal.reason)
    return
  }
  const abort = () => { clearTimeout(timer); reject(signal.reason) }
  const timer = setTimeout(() => {
    signal.removeEventListener('abort', abort)
    resolve()
  }, Math.max(0, milliseconds))
  signal.addEventListener('abort', abort, { once: true })
})

export class AirportBoardService {
  private readonly cache = new Map<string, { snapshot: AirportBoardSnapshot; expiresAt: number }>()
  private pending?: PendingBoard
  private unavailable = false

  private readonly options: {
    state: AirportBoardStateStore
    key: string
    fetchImpl?: typeof fetch
    now?: () => number
  }

  constructor(options: AirportBoardService['options']) {
    this.options = options
  }

  private now() { return (this.options.now ?? Date.now)() }

  async load(icao: string, signal?: AbortSignal): Promise<AirportBoardSnapshot> {
    if (!isAirportBoardIcao(icao)) throw new AirportBoardRequestError('Invalid airport code', 400)
    if (signal?.aborted) throw new AirportBoardRequestError('Airport-board request canceled', 499)
    const now = this.now()
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now || entry.snapshot.retrievedAt > now) this.cache.delete(key)
    }
    const cached = this.cache.get(icao)
    if (cached) {
      this.cache.delete(icao)
      this.cache.set(icao, cached)
      return cached.snapshot
    }
    if (this.unavailable) throw new AirportBoardRequestError('Airport-board quota storage is unavailable')
    if (this.pending) {
      if (this.pending.icao === icao && this.pending.consumers.size < config.maximumWaiters &&
        !this.pending.controller.signal.aborted) return this.consume(this.pending, signal)
      throw new AirportBoardRequestError('Another airport board is loading; try again shortly', 429, this.pending.deadline)
    }
    let admission: AirportBoardAdmission
    try {
      const stored = this.options.state.read()
      admission = parseAirportBoardAdmission(stored === undefined ? { version: 1, notBefore: 0 } : stored)
    } catch {
      this.unavailable = true
      throw new AirportBoardRequestError('Airport-board quota storage is unavailable')
    }
    if (admission.notBefore > now) {
      throw new AirportBoardRequestError('Airport boards are temporarily rate-limited', 429, admission.notBefore)
    }
    for (const [quota, required] of [[admission.units, config.unitsPerBoard], [admission.requests, 1]] as const) {
      if (quota && quota.resetAt > now && quota.remaining < required) {
        throw new AirportBoardRequestError('The shared free airport-board allowance is exhausted', 429, quota.resetAt)
      }
    }
    const controller = new AbortController()
    const promise = this.retrieve(icao, admission, controller).finally(() => {
      if (this.pending?.controller === controller) this.pending = undefined
    })
    this.pending = { icao, promise, controller, consumers: new Set(), deadline: now + config.upstreamTimeoutMs }
    return this.consume(this.pending, signal)
  }

  private consume(pending: PendingBoard, signal?: AbortSignal): Promise<AirportBoardSnapshot> {
    return new Promise((resolve, reject) => {
      const consumer = Symbol()
      pending.consumers.add(consumer)
      const release = () => {
        pending.consumers.delete(consumer)
        signal?.removeEventListener('abort', abort)
      }
      const abort = () => {
        release()
        if (pending.consumers.size === 0) pending.controller.abort(new Error('Airport-board consumers canceled'))
        reject(new AirportBoardRequestError('Airport-board request canceled', 499))
      }
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
      pending.promise.then(
        value => { release(); resolve(value) },
        error => { release(); reject(error) },
      )
    })
  }

  private persist(state: AirportBoardAdmission) {
    try {
      this.options.state.write(parseAirportBoardAdmission(state))
    } catch {
      this.unavailable = true
      throw new AirportBoardRequestError('Airport-board quota storage is unavailable')
    }
  }

  private async retrieve(icao: string, admission: AirportBoardAdmission, controller: AbortController) {
    const startedAt = this.now()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort(new Error('Airport-board deadline exceeded'))
    }, config.upstreamTimeoutMs)
    const fetchImpl = this.options.fetchImpl ?? fetch
    const mergeQuota = (previous: Quota | undefined, next: Quota, now: number) =>
      !previous || previous.resetAt <= now
        ? next
        : { remaining: Math.min(previous.remaining, next.remaining), resetAt: Math.max(previous.resetAt, next.resetAt) }

    const request = async (url: URL, paid: boolean) => {
      await wait(admission.notBefore - this.now(), controller.signal)
      const now = this.now()
      if (controller.signal.aborted || now - startedAt >= config.upstreamTimeoutMs) {
        throw new AirportBoardRequestError('Airport-board request timed out', 504)
      }
      if (admission.requests && admission.requests.resetAt > now && admission.requests.remaining < 1) {
        throw new AirportBoardRequestError('The shared free airport-board allowance is exhausted', 429, admission.requests.resetAt)
      }
      if (paid && (!admission.units || admission.units.resetAt <= now ||
        admission.units.remaining < config.unitsPerBoard)) {
        throw new AirportBoardRequestError('The shared free airport-board allowance is exhausted', 429, admission.units?.resetAt)
      }
      if (paid && admission.units) admission.units.remaining -= config.unitsPerBoard
      if (admission.requests && admission.requests.resetAt > now) admission.requests.remaining -= 1
      admission.notBefore = now + config.upstreamTimeoutMs + config.minimumRequestIntervalMs
      this.persist(admission)
      const response = await fetchImpl(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'manual',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'X-RapidAPI-Key': this.options.key,
          'X-RapidAPI-Host': new URL(config.upstreamOrigin).host,
        },
      })
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel()
        throw new AirportBoardRequestError('Airport-board provider redirect rejected', 502)
      }
      const successful = response.status === 200 || response.status === 204
      try {
        const quotas = quotaHeaders(response.headers, this.now())
        admission.units = mergeQuota(admission.units, quotas.units, this.now())
        admission.requests = mergeQuota(admission.requests, quotas.requests, this.now())
      } catch {
        if (successful) {
          await response.body?.cancel()
          throw new AirportBoardRequestError('Airport-board free allowance could not be confirmed')
        }
      }
      this.persist(admission)
      if (!successful) {
        const retry = parseRetryAfterMs(response.headers.get('Retry-After'), this.now()) ?? 0
        const exhaustedAt = Math.max(
          admission.units && admission.units.remaining < config.unitsPerBoard ? admission.units.resetAt : 0,
          admission.requests?.remaining === 0 ? admission.requests.resetAt : 0,
        )
        await response.body?.cancel()
        throw new AirportBoardRequestError(
          exhaustedAt > this.now() ? 'The shared free airport-board allowance is exhausted'
            : response.status === 429 ? 'Airport boards are temporarily rate-limited' : 'Airport-board provider unavailable',
          response.status === 429 ? 429 : 502,
          Math.max(this.now() + Math.max(config.retryFallbackMs, retry), exhaustedAt),
        )
      }
      return { response, requestedAt: now }
    }

    try {
      if (!admission.units || admission.units.resetAt <= this.now() ||
        !admission.requests || admission.requests.resetAt <= this.now()) {
        const health = await request(new URL('/health/services/airports/EETN/feeds', config.upstreamOrigin), false)
        await health.response.body?.cancel()
        if (health.response.status !== 200) {
          throw new AirportBoardRequestError('Airport-board quota check is unavailable')
        }
        admission.notBefore = this.now() + config.minimumRequestIntervalMs
        this.persist(admission)
      }
      const url = new URL(`/flights/airports/icao/${icao}`, config.upstreamOrigin)
      url.search = new URLSearchParams({
        offsetMinutes: String(config.offsetMinutes),
        durationMinutes: String(config.durationMinutes),
        direction: 'Both',
        withLeg: 'true',
        withCancelled: 'true',
        withCodeshared: 'true',
        withCargo: 'true',
        withPrivate: 'true',
        withLocation: 'false',
      }).toString()
      const result = await request(url, true)
      const value = result.response.status === 204
        ? { arrivals: null, departures: null }
        : await readBoundedJson(result.response, config.maximumBytes)
      const retrievedAt = this.now()
      if (controller.signal.aborted || retrievedAt - startedAt >= config.upstreamTimeoutMs) {
        throw new AirportBoardRequestError('Airport-board request timed out', 504)
      }
      const snapshot = normalizeAeroDataBoxBoard(value, icao, result.requestedAt, retrievedAt)
      if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > config.maximumClientBytes) {
        throw new AirportBoardRequestError('The airport board exceeds the display size limit', 502)
      }
      admission.notBefore = retrievedAt + config.minimumRequestIntervalMs
      this.persist(admission)
      const empty = (snapshot.arrivals?.length ?? 0) + (snapshot.departures?.length ?? 0) === 0
      this.cache.set(icao, {
        snapshot,
        expiresAt: retrievedAt + (empty ? config.emptyCacheTtlMs : config.cacheTtlMs),
      })
      while (this.cache.size > config.maximumCacheEntries) {
        const oldest = this.cache.keys().next().value
        if (oldest === undefined) break
        this.cache.delete(oldest)
      }
      return snapshot
    } catch (error) {
      if (controller.signal.aborted && !timedOut) {
        if (!this.unavailable) this.persist(admission)
        throw new AirportBoardRequestError('Airport-board request canceled', 499)
      }
      const failure = error instanceof AirportBoardRequestError ? error
        : new AirportBoardRequestError(
          controller.signal.aborted ? 'Airport-board request timed out' : 'Airport-board provider returned unavailable or invalid data',
          controller.signal.aborted ? 504 : 502,
        )
      admission.notBefore = Math.max(admission.notBefore, this.now() + config.retryFallbackMs, failure.retryAt ?? 0)
      if (!this.unavailable) this.persist(admission)
      throw new AirportBoardRequestError(failure.message, failure.status, admission.notBefore)
    } finally {
      clearTimeout(timeout)
    }
  }
}
