import { MARINE_STREAM_CONFIG as config } from '../src/config/marineStreamConfig.js'
import { distanceKm } from '../src/domain/geo.js'
import type { Vessel } from '../src/domain/traffic.js'
import { ProviderError } from '../src/providers/errors.js'
import { isRecord } from '../src/providers/guards.js'
import {
  normalizeAisVessel,
  normalizeAisVesselMetadata,
  type AisMetadataRecord,
  type MarineLocationRecord,
} from '../src/providers/marine/digitrafficNormalization.js'
import { enrichMarineVesselMetadata, mergeMarineVessels } from '../src/providers/marine/marineFusion.js'
import {
  AISSTREAM_PROVIDER_NAME,
  OPENWATERS_PROVIDER_NAME,
  parseMarineSourceMessage,
  parseOpenWatersMetadataSnapshot,
  type MarineSourceObservation,
  type MarineStreamSource,
} from '../src/providers/marine/marineSourceNormalization.js'
import {
  compactMarineBoxes,
  marineBoxArea,
  marineQueryBoxes,
  parseMarineStreamView,
  parseMarineStreamAcknowledgement,
  type MarineBoundingBox,
  type MarineStreamSnapshot,
  type MarineStreamStatus,
  type MarineStreamView,
} from '../src/providers/marine/marineStreamProtocol.js'

export interface MarineSocket {
  send(data: string): void
  close(code: number, reason?: string): void
  addEventListener(type: string, listener: (event: Event) => void): void
}

export interface MarineUpstreamSocket extends MarineSocket {
  binaryType: string
  accept(): void
}

export interface MarineRetryState {
  notBefore: number
  failures: number
  metadataNotBefore?: number
}

export interface MarineRuntimeState {
  consume(messages: number, now: number): boolean
  readRetry(source: MarineStreamSource): MarineRetryState
  writeRetry(source: MarineStreamSource, value: MarineRetryState): void
}

export interface MarineHubDependencies {
  state: MarineRuntimeState
  aisstreamKey?: string
  openWatersToken?: string
  connect(
    source: MarineStreamSource,
    signal: AbortSignal,
  ): Promise<MarineUpstreamSocket>
  metadata(
    boxes: readonly MarineBoundingBox[],
    signal: AbortSignal,
  ): Promise<unknown>
}

type Timer = ReturnType<typeof setTimeout>
type MetadataField = Exclude<keyof AisMetadataRecord, 'mmsi' | 'timestamp'>
const metadataFields: readonly MetadataField[] = [
  'name', 'callSign', 'destination', 'imo', 'shipType',
  'referencePointA', 'referencePointB', 'referencePointC', 'referencePointD',
  'draught', 'eta', 'lengthMeters', 'widthMeters',
]
const sourceNames = {
  aisstream: AISSTREAM_PROVIDER_NAME,
  openwaters: OPENWATERS_PROVIDER_NAME,
} as const

interface LocationEntry {
  location: MarineLocationRecord
  receivedAt: number
  nameHint?: string
  attribution: string
}

interface MetadataEntry {
  value: AisMetadataRecord
  fieldTimes: Partial<Record<MetadataField, number>>
  receivedAt: number
  attribution: string
}

interface SourceState {
  id: MarineStreamSource
  status: MarineStreamStatus
  generation: number
  socket?: MarineUpstreamSocket
  controller?: AbortController
  connectTimer?: Timer
  retryTimer?: Timer
  subscriptionTimer?: Timer
  retry: MarineRetryState
  ready: boolean
  terminal: boolean
  lastSubscriptionAt: number
  subscriptionKey?: string
  locations: Map<number, LocationEntry>
  metadata: Map<number, MetadataEntry>
  cacheBytes: number
}

interface ClientState {
  socket: MarineSocket
  view?: MarineStreamView
  openWatersAllowed: boolean
  initialTimer?: Timer
  sequence: number
  lastSentAt: number
  pending?: { sequence: number; bytes: number; timer: Timer }
}

const utf8 = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })
const dayMs = 24 * 60 * 60_000
const cancelTimer = (timer: Timer | undefined) => {
  if (timer !== undefined) clearTimeout(timer)
}
const cacheBytes = (entry: LocationEntry | MetadataEntry) =>
  JSON.stringify(entry).length * 2 + 512
const timerDelay = (deadline: number) =>
  Math.min(2_147_483_647, Math.max(0, deadline - Date.now()))
const usableRetryDelay = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) && value >= 0 &&
    Math.ceil(value) <= Number.MAX_SAFE_INTEGER - Date.now()
    ? Math.ceil(value) : undefined
const viewQuery = (view: MarineStreamView) => ({
  center: { ...view.center, label: 'View' },
  radiusKm: view.radiusKm,
})
const boxesFor = (view: MarineStreamView) => marineQueryBoxes(viewQuery(view)) ?? []

export class MarineStreamHub {
  private readonly dependencies: MarineHubDependencies
  private readonly clients = new Map<MarineSocket, ClientState>()
  private readonly sources: Record<MarineStreamSource, SourceState>
  private publishTimer?: Timer
  private budgetUntil = 0
  private openWatersArea: number
  private metadataController?: AbortController
  private metadataTimer?: Timer
  private metadataTimeout?: Timer
  private metadataRevision = 0
  private metadataKey = ''
  private metadataLastStartedAt = 0
  private metadataError?: string
  private queuedClientBytes = 0

  constructor(dependencies: MarineHubDependencies) {
    this.dependencies = dependencies
    this.openWatersArea = dependencies.openWatersToken ? 400 : 100
    const source = (id: MarineStreamSource): SourceState => ({
      id, generation: 0, ready: false, terminal: false,
      lastSubscriptionAt: 0,
      status: { source: id, phase: 'idle', paused: false },
      retry: dependencies.state.readRetry(id),
      locations: new Map(),
      metadata: new Map(),
      cacheBytes: 0,
    })
    this.sources = { aisstream: source('aisstream'), openwaters: source('openwaters') }
  }

  get clientCount() {
    return this.clients.size
  }

  get retryAt() {
    return Math.max(this.budgetUntil, Date.now() + config.reconnectMinimumMs)
  }

  admitRequest() {
    return this.charge(20)
  }

  addClient(socket: MarineSocket) {
    if (this.clients.size >= config.maximumClients) return false
    const client: ClientState = {
      socket, openWatersAllowed: true, sequence: 0, lastSentAt: 0,
    }
    this.clients.set(socket, client)
    client.initialTimer = setTimeout(() => {
      if (!client.view) this.closeClient(client, 'A view subscription is required')
    }, config.connectTimeoutMs)
    socket.addEventListener('message', (event) => {
      if (!this.clients.has(socket) || !this.charge(1)) return
      if (!('data' in event) || typeof event.data !== 'string' ||
        utf8.encode(event.data).byteLength > config.maximumClientMessageBytes) {
        this.closeClient(client, 'Invalid marine subscription')
        return
      }
      let value: unknown
      try {
        value = JSON.parse(event.data)
      } catch {
        this.closeClient(client, 'Invalid marine subscription')
        return
      }
      const acknowledgement = parseMarineStreamAcknowledgement(value)
      if (acknowledgement !== undefined) {
        if (client.pending?.sequence === acknowledgement) {
          this.releasePending(client)
        }
        return
      }
      const view = parseMarineStreamView(value)
      if (!view) {
        this.closeClient(client, 'Invalid marine subscription')
        return
      }
      if (client.view && view.revision <= client.view.revision) return
      cancelTimer(client.initialTimer)
      client.view = view
      const otherBoxes = [...this.clients.values()]
        .filter((other) => other !== client && other.openWatersAllowed && other.view)
        .flatMap((other) => boxesFor(other.view!))
      client.openWatersAllowed = marineBoxArea(compactMarineBoxes([
        ...otherBoxes, ...boxesFor(view),
      ])) <= this.openWatersArea
      this.reconcile()
      this.publish()
    })
    socket.addEventListener('close', () => this.removeClient(socket))
    socket.addEventListener('error', () => this.removeClient(socket))
    return true
  }

  dispose() {
    for (const client of [...this.clients.values()]) {
      this.closeClient(client, 'Marine connection closed')
    }
    this.stopIdleWork()
  }

  private closeClient(client: ClientState, reason: string) {
    this.removeClient(client.socket)
    try {
      client.socket.close(1008, reason)
    } catch {
      console.warn('Marine client was already closed')
    }
  }

  private removeClient(socket: MarineSocket) {
    const client = this.clients.get(socket)
    if (!client) return
    cancelTimer(client.initialTimer)
    this.releasePending(client)
    this.clients.delete(socket)
    if (!this.clients.size) this.stopIdleWork()
    else this.reconcile()
  }

  private stopIdleWork() {
    cancelTimer(this.publishTimer)
    this.publishTimer = undefined
    this.cancelMetadata()
    this.metadataError = undefined
    for (const source of Object.values(this.sources)) {
      this.stopSource(source)
      source.locations.clear()
      source.metadata.clear()
      source.cacheBytes = 0
      source.status = { source: source.id, phase: 'idle', paused: false }
    }
  }

  private charge(messages: number) {
    const now = Date.now()
    let admitted = false
    let stateUnavailable = false
    try {
      admitted = this.dependencies.state.consume(messages, now)
    } catch {
      stateUnavailable = true
      console.error('Marine admission state is unavailable')
    }
    if (admitted) return true
    this.budgetUntil = stateUnavailable
      ? now + config.reconnectMinimumMs
      : (Math.floor(now / dayMs) + 1) * dayMs
    this.cancelMetadata()
    for (const source of Object.values(this.sources)) {
      this.stopSource(source)
      source.status = {
        ...source.status, phase: 'error', updating: false,
        error: stateUnavailable
          ? 'Marine admission state is temporarily unavailable'
          : 'Supplementary marine capacity is unavailable until the next UTC day',
      }
    }
    const error = stateUnavailable
      ? 'Marine admission state is temporarily unavailable'
      : 'Supplementary marine capacity is unavailable until the next UTC day'
    for (const client of [...this.clients.values()]) {
      try {
        client.socket.send(JSON.stringify({
          version: 1, type: 'retry', retryAt: this.budgetUntil, error,
        }))
      } catch {
        console.warn('Marine retry notification could not be delivered')
      }
      this.closeClient(client, 'Marine capacity is temporarily unavailable')
    }
    return false
  }

  private views(source: MarineStreamSource) {
    return [...this.clients.values()]
      .filter((client) => client.view &&
        (source !== 'openwaters' || client.openWatersAllowed))
      .map((client) => client.view!)
  }

  private boxes(source: MarineStreamSource) {
    return compactMarineBoxes(this.views(source).flatMap(boxesFor))
  }

  private inView(source: MarineStreamSource, location: MarineLocationRecord) {
    return this.views(source).some((view) =>
      distanceKm(view.center, location) <= view.radiusKm)
  }

  private reconcile() {
    if (this.budgetUntil > Date.now()) return
    for (const source of Object.values(this.sources)) {
      if (!this.views(source.id).length) {
        this.stopSource(source)
        continue
      }
      if (source.terminal) continue
      if (source.socket) this.scheduleSubscription(source)
      else if (!source.controller && !source.retryTimer) {
        if (source.status.phase === 'idle') {
          source.status = { ...source.status, phase: 'loading', updating: true }
        }
        const delay = timerDelay(source.retry.notBefore)
        source.retryTimer = setTimeout(() => {
          source.retryTimer = undefined
          void this.connect(source)
        }, delay)
      }
    }
    this.scheduleMetadata()
    this.ensurePublication()
  }

  private async connect(source: SourceState) {
    if (!this.views(source.id).length || this.budgetUntil > Date.now()) return
    if (Date.now() < source.retry.notBefore) {
      this.reconcile()
      return
    }
    if (source.id === 'aisstream' && !this.dependencies.aisstreamKey) {
      source.terminal = true
      source.status = {
        ...source.status, phase: 'error', error: 'AISStream is not configured',
      }
      return
    }
    if (!this.charge(20)) return
    const generation = ++source.generation
    source.retry.notBefore = Date.now() + config.reconnectMinimumMs
    if (!this.saveRetry(source)) return
    source.status = {
      ...source.status, phase: 'loading', updating: true, error: undefined,
    }
    const controller = new AbortController()
    source.controller = controller
    source.connectTimer = setTimeout(() => {
      this.fail(source, generation, 'Connection or subscription timed out')
    }, config.connectTimeoutMs)
    try {
      const socket = await this.dependencies.connect(source.id, controller.signal)
      if (generation !== source.generation || !this.views(source.id).length) {
        socket.accept()
        socket.close(1000, 'Inactive subscription')
        return
      }
      source.controller = undefined
      source.socket = socket
      socket.binaryType = 'arraybuffer'
      socket.addEventListener('message', (event) => {
        if (generation !== source.generation) return
        this.message(source, generation, 'data' in event ? event.data : undefined)
      })
      socket.addEventListener('close', () =>
        this.fail(source, generation, 'Provider connection closed'))
      socket.addEventListener('error', () =>
        this.fail(source, generation, 'Provider connection failed'))
      socket.accept()
      if (source.id === 'aisstream') this.sendSubscription(source)
    } catch (error) {
      if (generation !== source.generation) return
      this.fail(
        source, generation, 'Provider connection failed',
        error instanceof ProviderError ? error.retryAfterMs : undefined,
        error instanceof ProviderError && (error.status === 401 || error.status === 403),
      )
    }
  }

  private stopSource(source: SourceState) {
    source.generation += 1
    source.controller?.abort()
    source.controller = undefined
    cancelTimer(source.connectTimer)
    cancelTimer(source.retryTimer)
    cancelTimer(source.subscriptionTimer)
    source.connectTimer = undefined
    source.retryTimer = undefined
    source.subscriptionTimer = undefined
    source.ready = false
    source.subscriptionKey = undefined
    const socket = source.socket
    source.socket = undefined
    if (socket) {
      try {
        socket.close(1000, 'Subscription stopped')
      } catch {
        console.warn('Marine upstream was already closed')
      }
    }
  }

  private fail(
    source: SourceState,
    generation: number,
    message: string,
    retryAfterMs?: number,
    terminal = false,
  ) {
    if (generation !== source.generation) return
    this.stopSource(source)
    source.terminal = terminal
    source.retry.failures = Math.min(8, source.retry.failures + 1)
    const backoff = Math.min(
      config.reconnectMaximumMs,
      config.reconnectMinimumMs * 2 ** (source.retry.failures - 1),
    ) + Math.floor(Math.random() * 1_000)
    source.retry.notBefore = Math.max(
      source.retry.notBefore, Date.now() + backoff,
      Date.now() + (usableRetryDelay(retryAfterMs) ?? 0),
    )
    if (!this.saveRetry(source)) return
    source.status = {
      ...source.status, phase: 'error', updating: false, error: message,
    }
    console.warn(`Marine ${source.id}: ${message}`)
    this.reconcile()
  }

  private ready(source: SourceState) {
    cancelTimer(source.connectTimer)
    source.connectTimer = undefined
    source.ready = true
    source.retry.failures = 0
    if (!this.saveRetry(source)) return
    source.status = {
      ...source.status, phase: 'live', updating: false,
      lastSuccessAt: Date.now(), error: undefined,
    }
  }

  private saveRetry(source: SourceState) {
    try {
      this.dependencies.state.writeRetry(source.id, source.retry)
      return true
    } catch {
      this.stopSource(source)
      source.status = {
        ...source.status, phase: 'error', updating: false,
        error: 'Marine connection state is temporarily unavailable',
      }
      console.error('Marine connection deadline could not be recorded')
      if (this.views(source.id).length) {
        source.retryTimer = setTimeout(() => {
          source.retryTimer = undefined
          void this.connect(source)
        }, timerDelay(Math.max(
          Date.now() + config.reconnectMinimumMs, source.retry.notBefore,
        )))
      }
      return false
    }
  }

  private scheduleSubscription(source: SourceState) {
    if (!source.socket || (source.id === 'openwaters' && !source.ready)) return
    const key = JSON.stringify(this.boxes(source.id))
    if (key === source.subscriptionKey || source.subscriptionTimer) return
    source.subscriptionTimer = setTimeout(() => {
      source.subscriptionTimer = undefined
      this.sendSubscription(source)
    }, Math.max(0, source.lastSubscriptionAt + config.subscriptionIntervalMs - Date.now()))
  }

  private sendSubscription(source: SourceState) {
    const boxes = this.boxes(source.id)
    if (!source.socket || !boxes.length) return
    const key = JSON.stringify(boxes)
    if (key === source.subscriptionKey) return
    source.lastSubscriptionAt = Date.now()
    source.subscriptionKey = key
    try {
      source.socket.send(JSON.stringify(source.id === 'aisstream' ? {
        APIKey: this.dependencies.aisstreamKey,
        BoundingBoxes: boxes.map(([south, west, north, east]) =>
          [[south, west], [north, east]]),
        FilterMessageTypes: [
          'PositionReport', 'ShipStaticData', 'StandardClassBPositionReport',
          'ExtendedClassBPositionReport', 'StaticDataReport', 'LongRangeAisBroadcastMessage',
        ],
      } : { type: 'subscribe', bbox: boxes, snapshot: true }))
    } catch {
      this.fail(source, source.generation, 'Could not update the provider subscription')
    }
  }

  private message(source: SourceState, generation: number, data: unknown) {
    if (!this.charge(1)) return
    let value: unknown
    try {
      const bytes = typeof data === 'string'
        ? utf8.encode(data) : data instanceof ArrayBuffer ? new Uint8Array(data) : undefined
      if (!bytes || bytes.byteLength > config.maximumProviderMessageBytes) {
        source.locations.clear()
        source.metadata.clear()
        source.cacheBytes = 0
        this.fail(source, generation, 'Provider message exceeded the supported size')
        return
      }
      value = JSON.parse(decoder.decode(bytes))
    } catch {
      this.fail(source, generation, 'Provider sent a malformed message')
      return
    }
    if (!isRecord(value)) {
      this.fail(source, generation, 'Provider sent a malformed message')
      return
    }
    if (value.error || value.Error || value.type === 'error') {
      const detail = typeof value.error === 'string' ? value.error : ''
      this.fail(
        source, generation, 'Provider rejected the subscription',
        undefined, /key.*valid|token.*(invalid|revok)|unauthor/i.test(detail),
      )
      return
    }
    if (source.id === 'aisstream' && value.MessageType === 'SubscriptionConfirmation') {
      this.ready(source)
      return
    }
    if (source.id === 'openwaters' && value.type === 'welcome') {
      if (!isRecord(value.limits) ||
        (value.limits.area !== undefined &&
          (typeof value.limits.area !== 'number' ||
            !Number.isFinite(value.limits.area) || value.limits.area <= 0))) {
        this.fail(source, generation, 'Provider returned invalid subscription limits')
        return
      }
      this.openWatersArea = typeof value.limits.area === 'number'
        ? value.limits.area : Infinity
      const accepted: MarineBoundingBox[] = []
      for (const client of this.clients.values()) {
        if (!client.view) continue
        const boxes = compactMarineBoxes([...accepted, ...boxesFor(client.view)])
        client.openWatersAllowed = marineBoxArea(boxes) <= this.openWatersArea
        if (client.openWatersAllowed) accepted.splice(0, accepted.length, ...boxes)
      }
      this.ready(source)
      this.sendSubscription(source)
      this.scheduleMetadata()
      return
    }
    const observation = parseMarineSourceMessage(source.id, value)
    if (!observation) return
    const now = Date.now()
    if (observation.observedAt > now + config.maximumFutureMs) {
      console.warn(`Marine ${source.id}: ignored a future-dated observation`)
      return
    }
    source.status.lastSuccessAt = now
    this.observe(source, observation, now)
  }

  private observe(source: SourceState, observation: MarineSourceObservation, now: number) {
    if (observation.location &&
      now - observation.location.observedAt <= config.expireAfterMs &&
      this.inView(source.id, observation.location)) {
      const old = source.locations.get(observation.mmsi)
      if (!old || old.location.observedAt < observation.location.observedAt) {
        const next: LocationEntry = {
          location: observation.location, receivedAt: now,
          nameHint: observation.nameHint, attribution: observation.attribution,
        }
        source.cacheBytes += cacheBytes(next) - (old ? cacheBytes(old) : 0)
        source.locations.set(observation.mmsi, next)
        source.status.lastDataAt = Math.max(
          source.status.lastDataAt ?? 0, observation.location.observedAt,
        )
      }
    }
    if (observation.metadata) {
      if (!this.metadata(
        source, observation.metadata, observation.attribution,
        observation.observedAt, now, false,
      )) return
    }
    this.checkCapacity(source)
  }

  private checkCapacity(source: SourceState) {
    if (source.locations.size > config.maximumRecords ||
      source.metadata.size > config.maximumRecords ||
      source.cacheBytes > config.maximumSourceCacheBytes) {
      source.locations.clear()
      source.metadata.clear()
      source.cacheBytes = 0
      this.fail(source, source.generation, 'Provider exceeded the bounded in-memory capacity')
      return false
    }
    return true
  }

  private metadata(
    source: SourceState,
    record: AisMetadataRecord,
    attribution: string,
    observedAt: number,
    receivedAt: number,
    fillMissing: boolean,
  ) {
    const previous = source.metadata.get(record.mmsi)
    const previousBytes = previous ? cacheBytes(previous) : 0
    const entry = previous ?? {
      value: { mmsi: record.mmsi },
      fieldTimes: {}, receivedAt, attribution,
    }
    const assign = <Key extends MetadataField>(field: Key) => {
      if (!Object.hasOwn(record, field)) return
      if (fillMissing && (record[field] === undefined || entry.value[field] !== undefined)) return
      if (!fillMissing && (entry.fieldTimes[field] ?? 0) > observedAt) return
      entry.value[field] = record[field]
      if (!fillMissing) entry.fieldTimes[field] = observedAt
    }
    for (const field of metadataFields) assign(field)
    if (record.timestamp !== undefined) {
      entry.value.timestamp = Math.max(entry.value.timestamp ?? 0, record.timestamp)
    }
    entry.receivedAt = receivedAt
    entry.attribution = attribution
    source.metadata.set(record.mmsi, entry)
    source.cacheBytes += cacheBytes(entry) - previousBytes
    return this.checkCapacity(source)
  }

  private cancelMetadata() {
    this.metadataRevision += 1
    this.metadataController?.abort()
    this.metadataController = undefined
    cancelTimer(this.metadataTimer)
    cancelTimer(this.metadataTimeout)
    this.metadataTimer = undefined
    this.metadataTimeout = undefined
    this.metadataKey = ''
  }

  private scheduleMetadata() {
    const boxes = this.boxes('openwaters')
    if (!boxes.length || this.budgetUntil > Date.now() ||
      this.sources.openwaters.terminal) {
      this.cancelMetadata()
      return
    }
    const key = JSON.stringify(boxes)
    if (key !== this.metadataKey) {
      this.cancelMetadata()
      this.metadataKey = key
    } else if (this.metadataController || this.metadataTimer) return
    this.metadataTimer = setTimeout(() => {
      this.metadataTimer = undefined
      void this.refreshMetadata()
    }, timerDelay(Math.max(
      this.metadataLastStartedAt + config.metadataQueryIntervalMs,
      this.sources.openwaters.retry.metadataNotBefore ?? 0,
    )))
  }

  private async refreshMetadata() {
    const boxes = this.boxes('openwaters')
    if (!boxes.length || this.budgetUntil > Date.now() ||
      this.sources.openwaters.terminal || !this.charge(20)) return
    const source = this.sources.openwaters
    if ((source.retry.metadataNotBefore ?? 0) > Date.now()) {
      this.scheduleMetadata()
      return
    }
    source.retry.metadataNotBefore = Date.now() + config.metadataQueryIntervalMs
    if (!this.saveRetry(source)) return
    const revision = ++this.metadataRevision
    const controller = new AbortController()
    this.metadataController = controller
    this.metadataLastStartedAt = Date.now()
    this.metadataTimeout = setTimeout(() => controller.abort(), config.connectTimeoutMs)
    let delay: number = config.metadataRefreshIntervalMs
    try {
      const payload = await this.dependencies.metadata(boxes, controller.signal)
      if (revision !== this.metadataRevision || !this.boxes('openwaters').length) return
      const records = parseOpenWatersMetadataSnapshot(payload)
      if (records.length > config.maximumRecords) {
        throw new Error('Metadata capacity exceeded')
      }
      for (const record of records) {
        if (!this.metadata(
          this.sources.openwaters, record.metadata, record.attribution,
          0, Date.now(), true,
        )) return
      }
      this.metadataError = undefined
    } catch (error) {
      if (revision !== this.metadataRevision) return
      console.warn('Marine openwaters: metadata is temporarily unavailable')
      this.metadataError = 'Open Waters metadata is temporarily unavailable'
      delay = Math.max(
        config.metadataQueryIntervalMs,
        error instanceof ProviderError
          ? usableRetryDelay(error.retryAfterMs) ?? 60_000 : 60_000,
      )
      source.retry.metadataNotBefore = Date.now() + delay
      this.saveRetry(source)
      if (error instanceof ProviderError && (error.status === 401 || error.status === 403)) {
        this.fail(source, source.generation, 'Open Waters access was rejected', undefined, true)
      }
    } finally {
      if (revision === this.metadataRevision) {
        cancelTimer(this.metadataTimeout)
        this.metadataTimeout = undefined
        this.metadataController = undefined
        if (this.boxes('openwaters').length && this.budgetUntil <= Date.now() &&
          !source.terminal) {
          this.metadataTimer = setTimeout(() => {
            this.metadataTimer = undefined
            void this.refreshMetadata()
          }, Math.min(2_147_483_647, delay))
        }
      }
    }
  }

  private ensurePublication() {
    if (this.publishTimer || !this.clients.size) return
    this.publishTimer = setTimeout(() => {
      this.publishTimer = undefined
      this.publish()
      this.ensurePublication()
    }, config.publishIntervalMs)
  }

  private releasePending(client: ClientState) {
    if (!client.pending) return
    cancelTimer(client.pending.timer)
    this.queuedClientBytes -= client.pending.bytes
    client.pending = undefined
  }

  private vessel(source: SourceState, entry: LocationEntry): Vessel {
    const own = source.metadata.get(entry.location.mmsi)
    const credits = new Set([entry.attribution])
    if (own) credits.add(own.attribution)
    const vessel = normalizeAisVessel(
      entry.location,
      own?.value ?? { mmsi: entry.location.mmsi, name: entry.nameHint },
      Math.max(entry.receivedAt, own?.receivedAt ?? 0), sourceNames[source.id],
      [...credits].join(' | '),
    )
    const otherSource = this.sources[
      source.id === 'aisstream' ? 'openwaters' : 'aisstream'
    ]
    const other = otherSource.metadata.get(entry.location.mmsi)
    return other
      ? enrichMarineVesselMetadata(vessel, {
          ...normalizeAisVesselMetadata(other.value),
          id: vessel.id, mmsi: vessel.mmsi,
          provider: sourceNames[otherSource.id],
          attribution: other.attribution,
          receivedAt: other.receivedAt,
        })
      : vessel
  }

  private publish() {
    const now = Date.now()
    for (const source of Object.values(this.sources)) {
      for (const [mmsi, entry] of source.locations) {
        if (now - entry.location.observedAt > config.expireAfterMs ||
          !this.inView(source.id, entry.location)) {
          source.cacheBytes -= cacheBytes(entry)
          source.locations.delete(mmsi)
        }
      }
      for (const [mmsi, entry] of source.metadata) {
        if (now - entry.receivedAt > config.metadataRetentionMs) {
          source.cacheBytes -= cacheBytes(entry)
          source.metadata.delete(mmsi)
        }
      }
    }
    const clients = [...this.clients.values()].sort((first, second) =>
      first.lastSentAt - second.lastSentAt)
    for (const client of clients) {
      if (!client.view || client.pending) continue
      const vessels = new Map<string, Vessel>()
      const sizes = new Map<string, number>()
      let vesselBytes = 0
      let excessive = false
      for (const source of [this.sources.aisstream, this.sources.openwaters]) {
        if (excessive) break
        if (source.id === 'openwaters' && !client.openWatersAllowed) continue
        for (const entry of source.locations.values()) {
          if (distanceKm(client.view.center, entry.location) > client.view.radiusKm) continue
          const candidate = this.vessel(source, entry)
          const previous = vessels.get(candidate.id)
          const vessel = previous ? mergeMarineVessels(previous, candidate) : candidate
          if (vessel !== previous) {
            const bytes = utf8.encode(JSON.stringify(vessel)).byteLength + 1
            vesselBytes += bytes - (sizes.get(vessel.id) ?? 0)
            sizes.set(vessel.id, bytes)
            vessels.set(vessel.id, vessel)
            if (vessels.size > config.maximumRecords ||
              vesselBytes > config.maximumSnapshotBytes - 4_096) {
              excessive = true
              break
            }
          }
        }
      }
      const sources = Object.values(this.sources).map((source) =>
        source.id === 'openwaters' && !client.openWatersAllowed
          ? {
              ...source.status, phase: 'error' as const,
              error: 'Open Waters subscription area is at capacity for this view',
            }
          : {
              ...source.status,
              error: source.status.error ??
                (source.id === 'openwaters' ? this.metadataError : undefined),
            })
      let snapshot: MarineStreamSnapshot = {
        version: 1, type: 'snapshot', revision: client.view.revision,
        sequence: client.sequence + 1,
        vessels: excessive ? [] : [...vessels.values()], sources,
      }
      if (excessive) {
        snapshot = {
          ...snapshot, vessels: [],
          sources: sources.map((source) => ({
            ...source, phase: 'error', error: 'Marine snapshot exceeded its safe capacity',
          })),
        }
      }
      const payload = JSON.stringify(snapshot)
      const payloadBytes = utf8.encode(payload).byteLength
      if (this.queuedClientBytes + payloadBytes > config.maximumQueuedClientBytes) continue
      client.sequence = snapshot.sequence
      client.lastSentAt = now
      client.pending = {
        sequence: snapshot.sequence,
        bytes: payloadBytes,
        timer: setTimeout(() => {
          this.closeClient(client, 'Marine client is not consuming updates')
        }, config.clientAcknowledgementMs),
      }
      this.queuedClientBytes += payloadBytes
      try {
        client.socket.send(payload)
      } catch {
        console.warn('Marine client delivery failed')
        this.removeClient(client.socket)
      }
    }
  }
}
