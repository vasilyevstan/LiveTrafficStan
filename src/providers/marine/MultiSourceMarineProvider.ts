import { MARINE_STREAM_CONFIG } from '../../config/marineStreamConfig'
import { distanceKm } from '../../domain/geo'
import type { ProviderStatus, Vessel } from '../../domain/traffic'
import type { TrafficQuery } from '../types'
import {
  DigitrafficMarineProvider,
  type DigitrafficOptions,
} from './DigitrafficMarineProvider'
import { MarineStreamProvider } from './MarineStreamProvider'
import { mergeMarineVessels } from './marineFusion'

interface Controller {
  start(paused?: boolean): void
  stop(): void
  setPaused(paused: boolean): void
  updateQuery(query: TrafficQuery): void
}

interface Factories {
  digitraffic(options: DigitrafficOptions): Controller
  supplement(options: DigitrafficOptions): Controller
}

export class MultiSourceMarineProvider {
  private readonly options: DigitrafficOptions
  private readonly digitraffic: Controller
  private readonly supplement: Controller
  private query: TrafficQuery
  private running = false
  private paused = false
  private readonly records: [Vessel[], Vessel[]] = [[], []]
  private readonly statuses: [ProviderStatus, ProviderStatus] = [
    { phase: 'idle', paused: false },
    { phase: 'idle', paused: false },
  ]
  private previous = new Map<string, Vessel>()

  constructor(options: DigitrafficOptions, factories?: Factories) {
    this.options = options
    this.query = options.query
    const callbacks = (index: 0 | 1): DigitrafficOptions['callbacks'] => ({
      onSnapshot: (vessels) => {
        if (!this.running) return
        this.records[index] = vessels
        this.publish()
      },
      onStatus: (status) => {
        if (!this.running) return
        this.statuses[index] = status
        this.publishStatus()
      },
    })
    const primary = { ...options, callbacks: callbacks(0) }
    const extra = { ...options, callbacks: callbacks(1) }
    this.digitraffic = factories
      ? factories.digitraffic(primary) : new DigitrafficMarineProvider(primary)
    this.supplement = factories
      ? factories.supplement(extra) : new MarineStreamProvider(extra)
  }

  start(paused = false) {
    if (this.running) return
    this.running = true
    this.paused = paused
    this.digitraffic.start(paused)
    this.supplement.start(paused)
  }

  stop() {
    this.running = false
    this.digitraffic.stop()
    this.supplement.stop()
    this.records[0] = []
    this.records[1] = []
    this.previous.clear()
  }

  setPaused(paused: boolean) {
    if (!this.running || this.paused === paused) return
    this.paused = paused
    this.digitraffic.setPaused(paused)
    this.supplement.setPaused(paused)
    this.publishStatus()
  }

  updateQuery(query: TrafficQuery) {
    this.query = query
    this.digitraffic.updateQuery(query)
    this.supplement.updateQuery(query)
    this.publish()
  }

  private publish() {
    if (!this.running || this.paused) return
    const now = Date.now()
    for (const [id, vessel] of this.previous) {
      if (now - vessel.position.observedAt > this.options.config.expireAfterMs) {
        this.previous.delete(id)
      }
    }
    const current = new Map<string, Vessel>()
    for (const records of this.records) {
      for (const vessel of records) {
        if (
          vessel.position.observedAt > now + MARINE_STREAM_CONFIG.maximumFutureMs ||
          now - vessel.position.observedAt > this.options.config.expireAfterMs ||
          distanceKm(this.query.center, vessel.position) > this.query.radiusKm
        ) continue
        const previous = current.get(vessel.id)
        current.set(vessel.id, previous ? mergeMarineVessels(previous, vessel) : vessel)
      }
    }
    for (const [id, vessel] of current) {
      const previous = this.previous.get(id)
      if (previous && previous.position.observedAt > vessel.position.observedAt &&
        now - previous.position.observedAt <= this.options.config.expireAfterMs) {
        if (distanceKm(this.query.center, previous.position) <= this.query.radiusKm) {
          current.set(id, previous)
        } else {
          current.delete(id)
        }
      } else {
        this.previous.delete(id)
        this.previous.set(id, vessel)
      }
    }
    while (this.previous.size > MARINE_STREAM_CONFIG.maximumRecords) {
      const oldest = this.previous.keys().next().value
      if (oldest === undefined) break
      this.previous.delete(oldest)
    }
    this.options.callbacks.onSnapshot([...current.values()])
  }

  private publishStatus() {
    if (!this.running) return
    const live = this.statuses.some((status) => status.phase === 'live')
    const loading = this.statuses.some((status) => status.phase === 'loading')
    const errors = this.statuses.flatMap((status, index) =>
      status.error ? [index === 0 ? `Digitraffic: ${status.error}` : status.error] : [])
    const maximum = (key: 'lastSuccessAt' | 'lastDataAt') => {
      const values = this.statuses.flatMap((status) =>
        status[key] === undefined ? [] : [status[key]])
      return values.length ? Math.max(...values) : undefined
    }
    this.options.callbacks.onStatus({
      phase: live ? 'live' : loading ? 'loading'
        : this.statuses.some((status) => status.phase === 'error') ? 'error' : 'idle',
      paused: this.paused,
      updating: !this.paused && this.statuses.some((status) => status.updating),
      lastSuccessAt: maximum('lastSuccessAt'),
      lastDataAt: maximum('lastDataAt'),
      error: errors.length ? errors.join('; ') : undefined,
    })
  }
}
