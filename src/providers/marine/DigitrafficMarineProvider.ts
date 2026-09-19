import type { MqttClient } from 'mqtt'
import type { AppConfig } from '../../config/appConfig'
import { distanceKm } from '../../domain/geo'
import type { ProviderStatus, Vessel } from '../../domain/traffic'
import { errorMessage, responseError } from '../errors'
import type { TrafficQuery } from '../types'
import {
  type MarineLocationRecord,
  type MarineMetadataRecord,
  normalizeDigitrafficVessel,
  parseDigitrafficMqttLocation,
  parseDigitrafficMqttMetadata,
  parseDigitrafficRestLocations,
  parseDigitrafficRestMetadata,
} from './digitrafficNormalization'
import {
  createMarineDiagnosticsCollector,
  type MarineDiagnosticMessageKind,
  type MarineDiagnosticsCollector,
  type MarineDiagnosticsOptions,
} from './marineDiagnostics'

interface DigitrafficCallbacks {
  onSnapshot: (vessels: Vessel[]) => void
  onStatus: (status: ProviderStatus) => void
}

interface DigitrafficOptions {
  config: AppConfig['marine']
  query: TrafficQuery
  callbacks: DigitrafficCallbacks
  diagnostics?: MarineDiagnosticsOptions
}

const DIGITRAFFIC_USER = 'LiveTrafficStan/1.0'
const UTF8_DECODER = new TextDecoder()

export class DigitrafficMarineProvider {
  private readonly locations = new Map<number, MarineLocationRecord>()
  private readonly metadata = new Map<number, MarineMetadataRecord>()
  private readonly warnedPayloadKinds = new Set<string>()
  private readonly config: AppConfig['marine']
  private query: TrafficQuery
  private readonly callbacks: DigitrafficCallbacks
  private status: ProviderStatus = {
    phase: 'idle',
    paused: false,
  }
  private mqttClient?: MqttClient
  private mqttConnectTimer?: number
  private mqttConnected = false
  private locationRefreshTimer?: number
  private metadataRefreshTimer?: number
  private flushTimer?: number
  private locationController?: AbortController
  private metadataController?: AbortController
  private running = false
  private paused = false
  private networkGeneration = 0
  private lastStatusEmission = 0
  private lastLocationRefreshStartedAt?: number
  private lastMetadataRefreshStartedAt?: number
  private lastMqttConnectAttemptAt?: number
  private locationRefreshPending = false
  private readonly diagnostics?: MarineDiagnosticsCollector

  constructor(options: DigitrafficOptions) {
    this.config = options.config
    this.query = options.query
    this.callbacks = options.callbacks
    if (import.meta.env.DEV && options.diagnostics) {
      this.diagnostics = createMarineDiagnosticsCollector(
        options.diagnostics,
      )
    }
  }

  start(paused = false) {
    if (this.running) return
    this.running = true
    this.paused = paused

    if (paused) {
      this.updateStatus({ paused: true, updating: false }, true)
      return
    }

    this.activateNetwork()
  }

  stop() {
    if (!this.running) return
    this.running = false
    this.paused = false
    this.deactivateNetwork()
    if (import.meta.env.DEV) this.diagnostics?.emit(Date.now(), true)
  }

  setPaused(paused: boolean) {
    if (!this.running || this.paused === paused) return
    this.paused = paused

    if (paused) {
      this.deactivateNetwork()
      this.updateStatus({ paused: true, updating: false }, true)
      return
    }

    this.activateNetwork()
  }

  private activateNetwork() {
    if (!this.isActive()) return

    this.updateStatus(
      {
        phase: this.mqttConnected ? 'live' : 'loading',
        paused: false,
        updating: true,
        error: this.status.phase === 'idle' ? undefined : this.status.error,
      },
      true,
    )
    this.flush('immediate')
    this.requestLocationRefresh()
    void this.refreshMetadata()
    void this.connectMqtt()
  }

  private deactivateNetwork() {
    this.networkGeneration += 1
    this.locationController?.abort()
    this.metadataController?.abort()
    this.locationController = undefined
    this.metadataController = undefined

    if (this.locationRefreshTimer !== undefined) {
      window.clearTimeout(this.locationRefreshTimer)
      this.locationRefreshTimer = undefined
    }
    if (this.metadataRefreshTimer !== undefined) {
      window.clearTimeout(this.metadataRefreshTimer)
      this.metadataRefreshTimer = undefined
    }
    if (this.flushTimer !== undefined) {
      window.clearTimeout(this.flushTimer)
      this.flushTimer = undefined
    }
    if (this.mqttConnectTimer !== undefined) {
      window.clearTimeout(this.mqttConnectTimer)
      this.mqttConnectTimer = undefined
    }

    this.mqttConnected = false
    this.mqttClient?.removeAllListeners()
    this.mqttClient?.end(true)
    this.mqttClient = undefined
  }

  updateQuery(query: TrafficQuery) {
    if (
      this.query.center.latitude === query.center.latitude &&
      this.query.center.longitude === query.center.longitude &&
      this.query.radiusKm === query.radiusKm
    ) {
      return
    }

    this.query = query
    if (!this.isActive()) return

    this.flush('immediate')
    this.requestLocationRefresh()
  }

  private isActive() {
    return this.running && !this.paused
  }

  private isActiveGeneration(generation: number) {
    return this.isActive() && generation === this.networkGeneration
  }

  private requestHeaders() {
    return {
      Accept: 'application/json',
      'Digitraffic-User': DIGITRAFFIC_USER,
    }
  }

  private requestLocationRefresh() {
    if (!this.isActive()) return
    this.locationRefreshPending = true
    void this.refreshLocations()
  }

  private scheduleLocationRefresh(delayMs: number) {
    if (!this.isActive() || this.locationRefreshTimer !== undefined) return
    this.locationRefreshTimer = window.setTimeout(() => {
      this.locationRefreshTimer = undefined
      void this.refreshLocations()
    }, delayMs)
  }

  private async refreshLocations() {
    if (
      !this.isActive() ||
      !this.locationRefreshPending ||
      this.locationController
    ) {
      return
    }

    const startedAt = Date.now()
    if (
      this.lastLocationRefreshStartedAt !== undefined &&
      startedAt - this.lastLocationRefreshStartedAt <
        this.config.queryRestRefreshIntervalMs
    ) {
      this.scheduleLocationRefresh(
        this.lastLocationRefreshStartedAt +
          this.config.queryRestRefreshIntervalMs -
          startedAt,
      )
      return
    }

    this.locationRefreshPending = false
    const controller = new AbortController()
    const generation = this.networkGeneration
    this.locationController = controller
    this.lastLocationRefreshStartedAt = startedAt
    const query = this.query
    const from = startedAt - this.config.restLookbackMs
    const search = new URLSearchParams({
      latitude: query.center.latitude.toString(),
      longitude: query.center.longitude.toString(),
      radius: query.radiusKm.toString(),
      from: from.toString(),
    })

    try {
      const response = await fetch(
        `${this.config.restBaseUrl}/api/ais/v1/locations?${search}`,
        {
          signal: controller.signal,
          headers: this.requestHeaders(),
        },
      )
      if (!response.ok) throw await responseError('Digitraffic', response)
      const locations = parseDigitrafficRestLocations(await response.json())
      if (
        controller.signal.aborted ||
        !this.isActiveGeneration(generation)
      ) {
        return
      }
      for (const location of locations) this.mergeLocation(location)
      this.noteRestSuccess(
        locations.reduce(
          (latest, location) => Math.max(latest, location.observedAt),
          0,
        ),
      )
      this.scheduleFlush()
    } catch (error) {
      if (
        !controller.signal.aborted &&
        this.isActiveGeneration(generation)
      ) {
        this.noteError(error)
      }
    } finally {
      if (this.locationController === controller) {
        this.locationController = undefined
      }
      if (this.locationRefreshPending && this.isActive()) {
        void this.refreshLocations()
      }
    }
  }

  private scheduleMetadataRefresh(delayMs: number) {
    if (!this.isActive() || this.metadataRefreshTimer !== undefined) return
    this.metadataRefreshTimer = window.setTimeout(() => {
      this.metadataRefreshTimer = undefined
      void this.refreshMetadata()
    }, delayMs)
  }

  private async refreshMetadata() {
    if (!this.isActive() || this.metadataController) return

    const startedAt = Date.now()
    if (
      this.lastMetadataRefreshStartedAt !== undefined &&
      startedAt - this.lastMetadataRefreshStartedAt <
        this.config.metadataRefreshIntervalMs
    ) {
      this.scheduleMetadataRefresh(
        this.lastMetadataRefreshStartedAt +
          this.config.metadataRefreshIntervalMs -
          startedAt,
      )
      return
    }

    const controller = new AbortController()
    const generation = this.networkGeneration
    this.metadataController = controller
    this.lastMetadataRefreshStartedAt = startedAt
    try {
      const response = await fetch(
        `${this.config.restBaseUrl}/api/ais/v1/vessels`,
        {
          signal: controller.signal,
          headers: this.requestHeaders(),
        },
      )
      if (!response.ok) throw await responseError('Digitraffic', response)
      const metadata = parseDigitrafficRestMetadata(await response.json())
      if (
        controller.signal.aborted ||
        !this.isActiveGeneration(generation)
      ) {
        return
      }
      for (const record of metadata) this.mergeMetadata(record)
      this.noteRestSuccess()
      this.scheduleFlush()
    } catch (error) {
      if (
        !controller.signal.aborted &&
        this.isActiveGeneration(generation)
      ) {
        this.noteError(error)
      }
    } finally {
      if (this.metadataController === controller) {
        this.metadataController = undefined
      }
      if (this.isActive()) {
        this.scheduleMetadataRefresh(this.config.metadataRefreshIntervalMs)
      }
    }
  }

  private async connectMqtt() {
    if (
      !this.isActive() ||
      this.mqttClient ||
      this.mqttConnectTimer !== undefined
    ) {
      return
    }

    const now = Date.now()
    if (
      this.lastMqttConnectAttemptAt !== undefined &&
      now - this.lastMqttConnectAttemptAt <
        this.config.mqttReconnectPeriodMs
    ) {
      this.scheduleMqttConnect()
      return
    }

    this.lastMqttConnectAttemptAt = now
    await this.openMqttClient(this.networkGeneration)
  }

  private async openMqttClient(generation: number) {
    let connect: typeof import('mqtt').connect
    try {
      const mqttModule = await import('mqtt')
      connect =
        typeof mqttModule.connect === 'function'
          ? mqttModule.connect
          : mqttModule.default.connect
    } catch (error) {
      if (this.isActiveGeneration(generation)) {
        this.noteError(error)
        this.scheduleMqttConnect()
      }
      return
    }
    if (!this.isActiveGeneration(generation) || this.mqttClient) return

    let client: MqttClient
    try {
      client = connect(this.config.mqttUrl, {
        clean: true,
        clientId: `lts-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`,
        connectTimeout: this.config.mqttConnectTimeoutMs,
        keepalive: 60,
        protocolVersion: 4,
        reconnectPeriod: this.config.mqttReconnectPeriodMs,
      })
    } catch (error) {
      if (this.isActiveGeneration(generation)) {
        this.noteError(error)
        this.scheduleMqttConnect()
      }
      return
    }

    if (!this.isActiveGeneration(generation)) {
      client.end(true)
      return
    }
    this.mqttClient = client
    const isCurrentClient = () =>
      this.isActiveGeneration(generation) && this.mqttClient === client

    client.on('connect', () => {
      if (!isCurrentClient()) return
      client.subscribe(
        [
          'vessels-v2/+/location',
          'vessels-v2/+/metadata',
          'vessels-v2/status',
        ],
        (error) => {
          if (!isCurrentClient()) return
          if (error) {
            this.mqttConnected = false
            this.noteError(error)
          } else {
            this.noteLiveSuccess()
          }
        },
      )
    })

    client.on('message', (topic, payload) => {
      if (!isCurrentClient()) return
      this.handleMqttMessage(topic, payload)
    })

    client.on('offline', () => {
      if (isCurrentClient()) {
        this.mqttConnected = false
        this.updateStatus(
          {
            phase: 'error',
            error: 'Marine live stream disconnected; reconnecting',
          },
          true,
        )
      }
    })

    client.on('reconnect', () => {
      if (isCurrentClient()) {
        this.lastMqttConnectAttemptAt = Date.now()
        this.mqttConnected = false
        this.updateStatus(
          {
            phase: 'error',
            error: 'Reconnecting to marine live stream',
          },
          true,
        )
      }
    })

    client.on('error', (error) => {
      if (isCurrentClient()) {
        this.mqttConnected = false
        this.noteError(error)
      }
    })
  }

  private scheduleMqttConnect() {
    if (
      !this.isActive() ||
      this.mqttClient ||
      this.mqttConnectTimer !== undefined
    ) {
      return
    }

    const now = Date.now()
    const delayMs =
      this.lastMqttConnectAttemptAt === undefined
        ? 0
        : Math.max(
            0,
            this.lastMqttConnectAttemptAt +
              this.config.mqttReconnectPeriodMs -
              now,
          )
    this.mqttConnectTimer = window.setTimeout(() => {
      this.mqttConnectTimer = undefined
      void this.connectMqtt()
    }, delayMs)
  }

  private mergeLocation(location: MarineLocationRecord) {
    const current = this.locations.get(location.mmsi)
    if (!current || location.observedAt >= current.observedAt) {
      this.locations.set(location.mmsi, location)
      if (import.meta.env.DEV) {
        this.diagnostics?.recordCache(
          this.locations.size,
          this.metadata.size,
        )
      }
    }
  }

  private mergeMetadata(record: MarineMetadataRecord) {
    const current = this.metadata.get(record.mmsi)
    if (!current || record.timestamp >= current.timestamp) {
      this.metadata.set(record.mmsi, record)
      if (import.meta.env.DEV) {
        this.diagnostics?.recordCache(
          this.locations.size,
          this.metadata.size,
        )
      }
    }
  }

  private scheduleFlush() {
    if (!this.isActive() || this.flushTimer !== undefined) return
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = undefined
      this.flush('scheduled')
    }, this.config.snapshotFlushIntervalMs)
  }

  private flush(reason: 'immediate' | 'scheduled') {
    if (!this.isActive()) return

    const startedAt =
      import.meta.env.DEV && this.diagnostics
        ? performance.now()
        : undefined
    const now = Date.now()
    const vessels: Vessel[] = []
    let expiredLocations = 0
    for (const [mmsi, location] of this.locations) {
      if (now - location.observedAt > this.config.expireAfterMs) {
        this.locations.delete(mmsi)
        expiredLocations += 1
        continue
      }
      if (distanceKm(this.query.center, location) > this.query.radiusKm) continue

      vessels.push(
        normalizeDigitrafficVessel(
          location,
          this.metadata.get(mmsi),
          now,
        ),
      )
    }

    vessels.sort((first, second) =>
      (first.name ?? first.id).localeCompare(second.name ?? second.id),
    )
    this.callbacks.onSnapshot(vessels)
    this.emitStatus()
    if (
      import.meta.env.DEV &&
      this.diagnostics &&
      startedAt !== undefined
    ) {
      this.diagnostics.recordFlush({
        reason,
        processingMs: performance.now() - startedAt,
        emittedVessels: vessels.length,
        expiredLocations,
        locationCacheSize: this.locations.size,
        metadataCacheSize: this.metadata.size,
      })
      this.diagnostics.emit(Date.now())
    }
  }

  private noteRestSuccess(dataTimestamp?: number) {
    const now = Date.now()
    this.status = {
      ...this.status,
      phase: this.mqttConnected ? 'live' : 'loading',
      updating: false,
      error: this.mqttConnected ? undefined : this.status.error,
      lastSuccessAt: now,
      lastDataAt:
        dataTimestamp && dataTimestamp > 0
          ? Math.max(this.status.lastDataAt ?? 0, dataTimestamp)
          : this.status.lastDataAt,
    }
    this.emitStatus(true)
  }

  private noteLiveSuccess(dataTimestamp?: number) {
    const now = Date.now()
    this.mqttConnected = true
    const recovered = this.status.phase !== 'live' || Boolean(this.status.error)
    this.status = {
      ...this.status,
      phase: 'live',
      paused: false,
      updating: false,
      error: undefined,
      lastSuccessAt: now,
      lastDataAt:
        dataTimestamp && dataTimestamp > 0
          ? Math.max(this.status.lastDataAt ?? 0, dataTimestamp)
          : this.status.lastDataAt,
    }
    this.emitStatus(recovered)
  }

  private noteError(error: unknown) {
    this.updateStatus(
      {
        phase: 'error',
        updating: false,
        error: errorMessage(error),
      },
      true,
    )
  }

  private updateStatus(
    patch: Partial<ProviderStatus>,
    forceEmission = false,
  ) {
    this.status = {
      ...this.status,
      ...patch,
    }
    this.emitStatus(forceEmission)
  }

  private emitStatus(force = false) {
    const now = Date.now()
    if (!force && now - this.lastStatusEmission < 1_000) return
    this.lastStatusEmission = now
    this.callbacks.onStatus({ ...this.status })
  }

  private handleMqttMessage(topic: string, payload: Uint8Array) {
    if (!this.isActive()) return

    const startedAt =
      import.meta.env.DEV && this.diagnostics
        ? performance.now()
        : undefined
    let kind: MarineDiagnosticMessageKind = 'other'
    let accepted = false
    let batchable = false

    try {
      if (topic === 'vessels-v2/status') {
        kind = 'status'
        accepted = true
        this.noteLiveSuccess()
        return
      }

      const segments = topic.split('/')
      const mmsi = Number(segments[1])
      const topicKind = segments[2]
      if (topicKind === 'location' || topicKind === 'metadata') {
        kind = topicKind
      }
      if (!Number.isInteger(mmsi) || mmsi <= 0) return

      let parsed: unknown
      try {
        parsed = JSON.parse(UTF8_DECODER.decode(payload))
      } catch {
        this.warnPayload(topicKind, 'invalid JSON')
        return
      }

      if (topicKind === 'location') {
        const location = parseDigitrafficMqttLocation(parsed, mmsi)
        if (!location) {
          this.warnPayload(topicKind, 'invalid fields')
          return
        }
        this.mergeLocation(location)
        this.noteLiveSuccess(location.observedAt)
        this.scheduleFlush()
        accepted = true
        batchable = true
        return
      }

      if (topicKind === 'metadata') {
        const record = parseDigitrafficMqttMetadata(parsed, mmsi)
        if (!record) {
          this.warnPayload(topicKind, 'invalid fields')
          return
        }
        this.mergeMetadata(record)
        this.noteLiveSuccess()
        this.scheduleFlush()
        accepted = true
        batchable = true
      }
    } finally {
      if (
        import.meta.env.DEV &&
        this.diagnostics &&
        startedAt !== undefined
      ) {
        this.diagnostics.recordMessage({
          kind,
          payloadBytes: payload.byteLength,
          accepted,
          batchable,
          processingMs: performance.now() - startedAt,
          locationCacheSize: this.locations.size,
          metadataCacheSize: this.metadata.size,
        })
        this.diagnostics.emit(Date.now())
      }
    }
  }

  private warnPayload(kind: string | undefined, reason: string) {
    const key = `${kind ?? 'unknown'}:${reason}`
    if (this.warnedPayloadKinds.has(key)) return
    this.warnedPayloadKinds.add(key)
    console.warn(`Ignored malformed Digitraffic ${kind ?? 'message'}: ${reason}`)
  }
}
