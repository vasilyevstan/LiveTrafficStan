import { AIRPORT_BOARD_CONFIG as config } from '../config/airportBoardConfig'
import type { AirportBoardSnapshot, AirportBoardState } from '../domain/airportBoard'
import type { AirportBoardProvider } from '../providers/airportBoards/airportBoardProvider'
import { ProviderError } from '../providers/errors'

export class AirportBoardController {
  private state: AirportBoardState = { phase: 'idle' }
  private readonly listeners = new Set<(state: AirportBoardState) => void>()
  private airportIcao?: string
  private active = false
  private revision = 0
  private requestController?: AbortController
  private readonly provider: AirportBoardProvider
  private readonly now: () => number

  constructor(provider: AirportBoardProvider, now = Date.now) {
    this.provider = provider
    this.now = now
  }

  getState() { return this.state }

  subscribe(listener: (state: AirportBoardState) => void) {
    this.listeners.add(listener)
    listener(this.state)
    return () => { this.listeners.delete(listener) }
  }

  private publish(state: AirportBoardState) {
    this.state = state
    this.listeners.forEach(listener => listener(state))
  }

  private snapshot(): AirportBoardSnapshot | undefined {
    if (!('snapshot' in this.state) || !this.state.snapshot ||
      this.now() - this.state.snapshot.retrievedAt >= config.maximumDisplayAgeMs ||
      this.state.snapshot.retrievedAt > this.now() + config.maximumClockSkewMs) return undefined
    return this.state.snapshot
  }

  select(airportIcao: string | undefined, active: boolean) {
    if (this.airportIcao === airportIcao && this.active === active) return
    this.revision += 1
    this.requestController?.abort()
    this.requestController = undefined
    const previous = this.snapshot()
    const same = this.airportIcao === airportIcao
    this.airportIcao = airportIcao
    this.active = active
    if (!same || !airportIcao) this.publish({ phase: 'idle', airportIcao })
    else if (!active) {
      this.publish(this.state.phase === 'error'
        ? { ...this.state, snapshot: undefined }
        : { phase: 'idle', airportIcao })
    }
    else if (this.state.phase === 'loading') {
      this.publish(previous
        ? { phase: 'ready', airportIcao, snapshot: previous }
        : { phase: 'idle', airportIcao })
    }
  }

  expire() {
    if (!('snapshot' in this.state) || !this.state.snapshot || this.snapshot()) return
    const airportIcao = this.state.airportIcao
    if (this.state.phase === 'loading') this.publish({ phase: 'loading', airportIcao })
    else if (this.state.phase === 'error') this.publish({ ...this.state, snapshot: undefined })
    else this.publish({ phase: 'expired', airportIcao })
  }

  async request() {
    const airportIcao = this.airportIcao
    if (!airportIcao || !this.active || this.state.phase === 'loading') return
    const snapshot = this.snapshot()
    const empty = snapshot && (snapshot.arrivals?.length ?? 0) + (snapshot.departures?.length ?? 0) === 0
    if (snapshot && this.now() < snapshot.retrievedAt + (empty ? config.emptyCacheTtlMs : config.cacheTtlMs)) return
    const revision = ++this.revision
    const controller = new AbortController()
    this.requestController = controller
    this.publish({ phase: 'loading', airportIcao, snapshot })
    try {
      const result = await this.provider.lookup(airportIcao, controller.signal)
      if (controller.signal.aborted || revision !== this.revision || !this.active || this.airportIcao !== airportIcao) return
      this.publish({ phase: 'ready', airportIcao, snapshot: result })
    } catch (error) {
      if (controller.signal.aborted || revision !== this.revision || !this.active || this.airportIcao !== airportIcao) return
      this.publish({
        phase: 'error',
        airportIcao,
        snapshot: this.snapshot(),
        message: error instanceof ProviderError ? error.message : 'Airport boards are unavailable',
        retryAt: this.provider.retryAt > this.now() ? this.provider.retryAt : undefined,
      })
    } finally {
      if (this.requestController === controller) this.requestController = undefined
    }
  }

  dispose() {
    this.select(undefined, false)
    this.listeners.clear()
  }
}
