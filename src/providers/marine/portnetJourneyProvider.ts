import { JOURNEY_CONFIG as config } from '../../config/appConfig'
import type { MarineJourneyPort, MarineJourneyPorts } from '../../domain/marineJourney'
import type { Vessel } from '../../domain/traffic'
import { readBoundedJson } from '../boundedJson'
import { ProviderError, parseRetryAfterMs } from '../errors'
import { resolvePortnetCoordinate, selectPortnetJourneyLeg } from './portnetJourneyNormalization'
import { parseMarineMmsi } from './marineSourceNormalization'

export interface PortnetJourneyProvider {
  lookup(vessel: Pick<Vessel, 'mmsi' | 'imo' | 'position'>, signal: AbortSignal): Promise<MarineJourneyPorts>
}

export class DigitrafficJourneyProvider implements PortnetJourneyProvider {
  private notBefore = 0
  private readonly options: { fetchImpl?: typeof fetch; now?: () => number }
  private readonly cache = new Map<string, MarineJourneyPorts>()

  constructor(options: DigitrafficJourneyProvider['options'] = {}) { this.options = options }
  private now() { return (this.options.now ?? Date.now)() }

  private async get(path: string, signal: AbortSignal) {
    const response = await (this.options.fetchImpl ?? fetch)(`${config.portnetOrigin}${path}`, {
      method: 'GET', signal, credentials: 'omit', redirect: 'error',
      referrerPolicy: 'no-referrer', cache: 'no-store', headers: { Accept: 'application/json' },
    })
    if (response.status !== 200) {
      const retry = parseRetryAfterMs(response.headers.get('Retry-After'), this.now())
      if (response.status === 429 || response.status === 503 || retry !== undefined) {
        this.notBefore = Math.max(this.notBefore, this.now() + Math.max(1_000, retry ?? config.marineHistoryRetryMs))
      }
      void response.body?.cancel().catch(() => undefined)
      throw new ProviderError(`Portnet context is unavailable (HTTP ${response.status}).`, response.status, retry)
    }
    return readBoundedJson(response, config.portnetMaximumBytes)
  }

  async lookup(vessel: Pick<Vessel, 'mmsi' | 'imo' | 'position'>, signal: AbortSignal): Promise<MarineJourneyPorts> {
    if (signal.aborted) throw new DOMException('Portnet request cancelled', 'AbortError')
    const to = Math.floor(vessel.position.observedAt / 1_000) * 1_000
    if (parseMarineMmsi(vessel.mmsi) !== vessel.mmsi || !Number.isFinite(to) ||
        to - config.marineHistoryWindowMs <= 0 || to > this.now() ||
        this.now() - to > config.marineHistoryWindowMs) {
      throw new ProviderError('The ship identity or captured report time is invalid')
    }
    const key = `${vessel.mmsi}:${vessel.imo ?? ''}:${to}`
    const cached = this.cache.get(key)
    if (cached && cached.retrievedAt <= this.now() && this.now() - cached.retrievedAt < config.marineHistoryCacheMs) return cached
    this.cache.delete(key)
    if (this.now() < this.notBefore) throw new ProviderError('Portnet context is temporarily rate-limited. Try again later.', 429)
    const controller = new AbortController()
    const abort = () => controller.abort(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, config.portnetTimeoutMs)
    try {
      const query = new URLSearchParams({
        mmsi: String(vessel.mmsi), from: new Date(to - config.marineHistoryWindowMs).toISOString(),
        to: new Date(to).toISOString(),
      })
      const leg = selectPortnetJourneyLeg(
        await this.get(`/api/port-call/v1/port-calls?${query}`, controller.signal), vessel, to,
      )
      const resolved = await Promise.allSettled([leg.departure, leg.destination].map(reference =>
        reference ? this.get(`/api/port-call/v1/ports/${reference.locode}`, controller.signal)
          .then(value => resolvePortnetCoordinate(value, reference)) : Promise.resolve(undefined)))
      if (controller.signal.aborted) throw new DOMException('Portnet request cancelled', 'AbortError')
      const limitations = [...leg.limitations]
      const port = (index: number, label: string): MarineJourneyPort | undefined => {
        const result = resolved[index]!
        if (result.status === 'fulfilled') {
          if (!result.value && (index === 0 ? leg.departure : leg.destination)) {
            limitations.push(`${label} coordinates are unknown; no other port area was substituted.`)
          }
          return result.value
        }
        limitations.push(`${label} coordinates are unavailable because the reference lookup failed.`)
        return undefined
      }
      const result: MarineJourneyPorts = Object.freeze({
        departedAt: leg.departedAt, arrivedAt: leg.arrivedAt,
        departure: port(0, 'Departure'), destination: port(1, 'Destination'),
        retrievedAt: this.now(), limitations: Object.freeze(limitations),
      })
      if (resolved.every(value => value.status === 'fulfilled')) {
        this.cache.set(key, result)
        while (this.cache.size > config.marineHistoryCacheEntries) this.cache.delete(this.cache.keys().next().value!)
      }
      return result
    } catch (error) {
      if (signal.aborted) throw new DOMException('Portnet request cancelled', 'AbortError')
      if (timedOut) throw new ProviderError('Portnet context timed out; voyage endpoints are unavailable.')
      if (error instanceof ProviderError) throw error
      throw new ProviderError('Portnet returned unavailable or invalid voyage context.')
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
    }
  }
}
