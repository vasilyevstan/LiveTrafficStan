import { AIRPORT_BOARD_CONFIG as config } from '../../config/airportBoardConfig'
import type { AirportBoardSnapshot } from '../../domain/airportBoard'
import { readBoundedJson } from '../boundedJson'
import { isRecord } from '../guards'
import { ProviderError, parseRetryAfterMs } from '../errors'
import { isAirportBoardIcao, parseAirportBoardSnapshot } from './airportBoardNormalization'

export interface AirportBoardProvider {
  readonly retryAt: number
  lookup(icao: string, signal: AbortSignal): Promise<AirportBoardSnapshot>
}

export class SameOriginAirportBoardProvider implements AirportBoardProvider {
  private notBefore = 0
  private readonly options: {
    fetchImpl?: typeof fetch
    now?: () => number
  }

  constructor(options: SameOriginAirportBoardProvider['options'] = {}) {
    this.options = options
  }

  get retryAt() { return this.notBefore }
  private now() { return (this.options.now ?? Date.now)() }

  async lookup(icao: string, signal: AbortSignal) {
    if (!isAirportBoardIcao(icao)) throw new ProviderError('This airport has no supported ICAO code', 400)
    if (signal.aborted) throw new DOMException('Airport-board request canceled', 'AbortError')
    if (this.notBefore > this.now()) {
      throw new ProviderError('Airport boards are temporarily rate-limited', 429, this.notBefore - this.now())
    }
    const controller = new AbortController()
    const abort = () => controller.abort(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, config.clientTimeoutMs)
    try {
      const response = await (this.options.fetchImpl ?? fetch)(`${config.path}?icao=${icao}`, {
        method: 'GET',
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      if (response.status !== 200) {
        const retryAfterMs = Math.max(
          1_000,
          parseRetryAfterMs(response.headers.get('Retry-After'), this.now()) ?? config.retryFallbackMs,
        )
        this.notBefore = Math.max(this.notBefore, this.now() + retryAfterMs)
        const body = await readBoundedJson(response, 2_048)
        const message = isRecord(body) && typeof body.error === 'string' &&
          body.error.length <= 180 && !/\p{Cc}/u.test(body.error)
          ? body.error : 'Airport boards are unavailable'
        throw new ProviderError(message, response.status, retryAfterMs)
      }
      const snapshot = parseAirportBoardSnapshot(
        await readBoundedJson(response, config.maximumClientBytes), icao,
      )
      if (signal.aborted || controller.signal.aborted) throw new DOMException('Airport-board request canceled', 'AbortError')
      if (snapshot.retrievedAt > this.now() + config.maximumClockSkewMs ||
        this.now() - snapshot.retrievedAt >= config.maximumDisplayAgeMs) {
        throw new ProviderError('The returned airport board is expired or its clock is invalid')
      }
      return snapshot
    } catch (error) {
      if (signal.aborted) throw new DOMException('Airport-board request canceled', 'AbortError')
      if (timedOut) throw new ProviderError('Airport-board request timed out')
      if (error instanceof ProviderError) throw error
      throw new ProviderError('Airport boards are unavailable or returned invalid data')
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
    }
  }
}
