import { JOURNEY_CONFIG as config } from '../../config/appConfig'
import type { MarineJourneyHistory } from '../../domain/marineJourney'
import { readBoundedJson } from '../boundedJson'
import { ProviderError, parseRetryAfterMs } from '../errors'
import { parseMarineMmsi } from './marineSourceNormalization'
import { parseMarineJourneyHistory } from './marineJourneyNormalization'

export interface MarineJourneyProvider {
  lookup(mmsi: number, reportTime: number, signal: AbortSignal): Promise<MarineJourneyHistory>
}

export class OpenWatersJourneyProvider implements MarineJourneyProvider {
  private readonly cache = new Map<string, MarineJourneyHistory>()
  private notBefore = 0
  private readonly options: { fetchImpl?: typeof fetch; now?: () => number }

  constructor(options: OpenWatersJourneyProvider['options'] = {}) {
    this.options = options
  }

  private now() { return (this.options.now ?? Date.now)() }

  async lookup(mmsi: number, reportTime: number, signal: AbortSignal) {
    if (signal.aborted) throw new DOMException('Ship-history request cancelled', 'AbortError')
    const to = Math.floor(reportTime / 1_000) * 1_000
    const from = to - config.marineHistoryWindowMs
    if (parseMarineMmsi(mmsi) !== mmsi || !Number.isFinite(to) ||
        from <= 0 || to > this.now() || this.now() - to > config.marineHistoryWindowMs) {
      throw new ProviderError('The ship identity or captured report time is invalid')
    }
    const key = `${mmsi}:${to}`
    const cached = this.cache.get(key)
    if (cached && cached.retrievedAt <= this.now() &&
        this.now() - cached.retrievedAt < config.marineHistoryCacheMs) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      return cached
    }
    this.cache.delete(key)
    if (this.now() < this.notBefore) {
      throw new ProviderError('Ship history is temporarily rate-limited. Try again later.', 429, this.notBefore - this.now())
    }
    const controller = new AbortController()
    const abort = () => controller.abort(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, config.marineHistoryTimeoutMs)
    try {
      const url = new URL(`/v1/vessels/${mmsi}/track`, config.marineHistoryOrigin)
      url.search = new URLSearchParams({
        from: new Date(from).toISOString(), to: new Date(to).toISOString(),
        limit: String(config.maximumObservedPoints), format: 'geojson',
      }).toString()
      const response = await (this.options.fetchImpl ?? fetch)(url.toString(), {
        method: 'GET', signal: controller.signal, credentials: 'omit',
        redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store',
        headers: { Accept: 'application/geo+json' },
      })
      if (response.status !== 200) {
        const retryMs = parseRetryAfterMs(response.headers.get('Retry-After'), this.now())
        if (response.status === 429 || response.status === 503 || retryMs !== undefined) {
          this.notBefore = Math.max(this.notBefore, this.now() + Math.max(1_000, retryMs ?? config.marineHistoryRetryMs))
        }
        void response.body?.cancel().catch(() => undefined)
        throw new ProviderError(
          response.status === 404 ? 'Open Waters has no history for this MMSI.'
            : response.status === 429 ? 'Ship history is temporarily rate-limited. Try again later.'
              : `Ship history is unavailable (HTTP ${response.status}).`,
          response.status, retryMs,
        )
      }
      const history = parseMarineJourneyHistory(
        await readBoundedJson(response, config.marineHistoryMaximumBytes, ['application/geo+json', 'application/json']),
        mmsi, from, to, this.now(),
      )
      if (controller.signal.aborted) throw new DOMException('Ship-history request cancelled', 'AbortError')
      this.cache.set(key, history)
      while (this.cache.size > config.marineHistoryCacheEntries) this.cache.delete(this.cache.keys().next().value!)
      return history
    } catch (error) {
      if (signal.aborted) throw new DOMException('Ship-history request cancelled', 'AbortError')
      if (timedOut) throw new ProviderError('Ship history timed out. Try again later.')
      if (error instanceof ProviderError) throw error
      throw new ProviderError('Ship history is unavailable or returned invalid data.')
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
    }
  }
}
