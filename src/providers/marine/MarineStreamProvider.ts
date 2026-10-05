import { MARINE_STREAM_CONFIG as config } from '../../config/marineStreamConfig'
import { distanceKm } from '../../domain/geo'
import type { ProviderStatus, Vessel } from '../../domain/traffic'
import type { TrafficQuery } from '../types'
import { enrichMarineVesselMetadata, mergeMarineVessels } from './marineFusion'
import {
  parseMarineStreamRetry,
  parseMarineStreamSnapshot,
} from './marineStreamProtocol'

interface Callbacks {
  onSnapshot(vessels: Vessel[]): void
  onStatus(status: ProviderStatus): void
}

export interface MarineBrowserSocket {
  send(data: string): void
  close(): void
  addEventListener(type: string, callback: (event: Event) => void): void
}

interface Options {
  query: TrafficQuery
  callbacks: Callbacks
  connect?: (url: string) => MarineBrowserSocket
}

type Timer = ReturnType<typeof setTimeout>
const cancelTimer = (timer: Timer | undefined) => {
  if (timer !== undefined) clearTimeout(timer)
}
const sourceLabels = { aisstream: 'AISStream', openwaters: 'Open Waters AIS' }

export class MarineStreamProvider {
  private readonly callbacks: Callbacks
  private readonly createSocket: (url: string) => MarineBrowserSocket
  private query: TrafficQuery
  private running = false
  private paused = false
  private generation = 0
  private revision = 0
  private lastSequence = 0
  private socket?: MarineBrowserSocket
  private connected = false
  private connectTimer?: Timer
  private retryTimer?: Timer
  private queryTimer?: Timer
  private lastAttemptAt = 0
  private retryAt = 0
  private failures = 0
  private lastQueryAt = 0
  private entities: Vessel[] = []
  private readonly retained = new Map<string, Vessel>()
  private status: ProviderStatus = { phase: 'idle', paused: false }

  constructor(options: Options) {
    this.query = options.query
    this.callbacks = options.callbacks
    this.createSocket = options.connect ?? ((url) => new WebSocket(url))
  }

  start(paused = false) {
    if (this.running) return
    this.running = true
    this.paused = paused
    this.status = { ...this.status, paused }
    this.callbacks.onStatus(this.status)
    if (!paused) this.scheduleConnect()
  }

  stop() {
    this.running = false
    this.disconnect()
    this.entities = []
    this.retained.clear()
  }

  setPaused(paused: boolean) {
    if (!this.running || paused === this.paused) return
    this.paused = paused
    this.status = { ...this.status, paused, updating: false }
    this.callbacks.onStatus(this.status)
    if (paused) this.disconnect()
    else this.scheduleConnect()
  }

  updateQuery(query: TrafficQuery) {
    if (
      query.center.latitude === this.query.center.latitude &&
      query.center.longitude === this.query.center.longitude &&
      query.radiusKm === this.query.radiusKm
    ) return
    this.query = query
    this.revision += 1
    this.publishEntities()
    this.scheduleQuery()
  }

  private active() {
    return this.running && !this.paused
  }

  private disconnect() {
    this.pruneRetained()
    if (this.connected) {
      // A cold relay cache is not a deletion. Retain raw observations without
      // extending their original expiry or repeatedly refreshing borrowed metadata.
      for (const vessel of this.entities) {
        if (!this.retained.has(vessel.id)) this.retained.set(vessel.id, vessel)
      }
      while (this.retained.size > config.maximumRecords) {
        const oldest = this.retained.keys().next().value
        if (oldest === undefined) break
        this.retained.delete(oldest)
      }
    }
    this.generation += 1
    this.connected = false
    cancelTimer(this.connectTimer)
    cancelTimer(this.retryTimer)
    cancelTimer(this.queryTimer)
    this.connectTimer = undefined
    this.retryTimer = undefined
    this.queryTimer = undefined
    const socket = this.socket
    this.socket = undefined
    socket?.close()
  }

  private scheduleConnect() {
    if (!this.active() || this.socket || this.retryTimer) return
    const deadline = Math.max(
      this.retryAt,
      this.lastAttemptAt ? this.lastAttemptAt + config.reconnectMinimumMs : 0,
    )
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      if (!this.active()) return
      if (Date.now() < deadline) this.scheduleConnect()
      else this.connect()
    }, Math.min(2_147_483_647, Math.max(0, deadline - Date.now())))
  }

  private connect() {
    if (!this.active()) return
    const generation = ++this.generation
    this.lastSequence = 0
    this.lastAttemptAt = Date.now()
    this.status = { ...this.status, phase: 'loading', updating: true, error: undefined }
    this.callbacks.onStatus(this.status)
    let socket: MarineBrowserSocket
    try {
      const url = new URL(config.path, window.location.href)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = this.createSocket(url.toString())
    } catch {
      this.failed(generation, 'Could not open the supplementary marine connection')
      return
    }
    this.socket = socket
    const current = () => this.active() && generation === this.generation
    this.connectTimer = setTimeout(() => {
      this.failed(generation, 'Supplementary marine connection timed out')
    }, config.connectTimeoutMs)
    socket.addEventListener('open', () => {
      if (!current()) return
      cancelTimer(this.connectTimer)
      this.connectTimer = undefined
      this.connected = true
      this.revision += 1
      this.sendQuery()
    })
    socket.addEventListener('message', (event) => {
      if (!current()) return
      if (!('data' in event) || typeof event.data !== 'string' ||
        new TextEncoder().encode(event.data).byteLength > config.maximumSnapshotBytes) {
        this.failed(generation, 'Supplementary marine response exceeded its safe format')
        return
      }
      let value: unknown
      try {
        value = JSON.parse(event.data)
      } catch {
        this.failed(generation, 'Supplementary marine response was malformed')
        return
      }
      const retry = parseMarineStreamRetry(value)
      if (retry) {
        this.retryAt = Math.max(this.retryAt, retry.retryAt)
        this.failed(generation, retry.error)
        return
      }
      const snapshot = parseMarineStreamSnapshot(value)
      if (!snapshot) {
        this.failed(generation, 'Supplementary marine response was invalid')
        return
      }
      try {
        socket.send(JSON.stringify({ version: 1, type: 'ack', sequence: snapshot.sequence }))
      } catch {
        this.failed(generation, 'Supplementary marine acknowledgement failed')
        return
      }
      if (snapshot.sequence <= this.lastSequence) return
      this.lastSequence = snapshot.sequence
      if (snapshot.revision !== this.revision) return
      this.failures = 0
      this.entities = snapshot.vessels
      const errors = snapshot.sources.filter((source) => source.error)
        .map((source) => `${sourceLabels[source.source]}: ${source.error}`)
      const live = snapshot.sources.some((source) => source.phase === 'live')
      const loading = snapshot.sources.some((source) => source.phase === 'loading')
      const successes = snapshot.sources.flatMap((source) =>
        source.lastSuccessAt === undefined ? [] : [source.lastSuccessAt])
      this.status = {
        phase: live ? 'live' : loading ? 'loading' : 'error',
        paused: false,
        updating: loading || snapshot.sources.some((source) => source.updating),
        lastSuccessAt: successes.length ? Math.max(...successes) : this.status.lastSuccessAt,
        lastDataAt: snapshot.vessels.length
          ? Math.max(...snapshot.vessels.map((vessel) => vessel.position.observedAt))
          : this.status.lastDataAt,
        error: errors.length ? errors.join('; ') : undefined,
      }
      this.callbacks.onStatus(this.status)
      this.publishEntities()
    })
    socket.addEventListener('close', () => {
      this.failed(generation, 'Supplementary marine connection was interrupted')
    })
    socket.addEventListener('error', () => {
      this.failed(generation, 'Supplementary marine connection is unavailable')
    })
  }

  private failed(generation: number, message: string) {
    if (!this.active() || generation !== this.generation) return
    this.disconnect()
    this.failures = Math.min(8, this.failures + 1)
    this.retryAt = Math.max(
      this.retryAt,
      Date.now() + Math.min(
        config.reconnectMaximumMs,
        config.reconnectMinimumMs * 2 ** (this.failures - 1),
      ),
    )
    this.status = {
      ...this.status, phase: 'error', paused: false,
      updating: false, error: message,
    }
    console.warn(message)
    this.callbacks.onStatus(this.status)
    this.scheduleConnect()
  }

  private scheduleQuery() {
    if (!this.active() || !this.connected || this.queryTimer) return
    this.queryTimer = setTimeout(() => {
      this.queryTimer = undefined
      this.sendQuery()
    }, Math.max(0, this.lastQueryAt + config.subscriptionIntervalMs - Date.now()))
  }

  private sendQuery() {
    if (!this.active() || !this.connected || !this.socket) return
    this.lastQueryAt = Date.now()
    try {
      this.socket.send(JSON.stringify({
        version: 1, type: 'view', revision: this.revision,
        center: {
          latitude: this.query.center.latitude,
          longitude: this.query.center.longitude,
        },
        radiusKm: this.query.radiusKm,
      }))
    } catch {
      this.failed(this.generation, 'Supplementary marine view could not be submitted')
    }
  }

  private publishEntities() {
    if (!this.active()) return
    this.pruneRetained()
    const current = new Map(this.retained)
    for (const vessel of this.entities) {
      const previous = current.get(vessel.id)
      current.delete(vessel.id)
      const merged = previous ? mergeMarineVessels(previous, vessel) : vessel
      current.set(vessel.id, previous
        ? enrichMarineVesselMetadata(merged, previous) : merged)
    }
    const now = Date.now()
    this.callbacks.onSnapshot([...current.values()].filter((vessel) =>
      now - vessel.position.observedAt <= config.expireAfterMs &&
      distanceKm(this.query.center, vessel.position) <= this.query.radiusKm)
      .slice(-config.maximumRecords))
  }

  private pruneRetained() {
    const now = Date.now()
    for (const [id, vessel] of this.retained) {
      if (now - vessel.position.observedAt > config.expireAfterMs ||
        distanceKm(this.query.center, vessel.position) > this.query.radiusKm) {
        this.retained.delete(id)
      }
    }
  }
}
