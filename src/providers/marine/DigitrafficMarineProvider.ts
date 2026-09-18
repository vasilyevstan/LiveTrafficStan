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

interface DigitrafficCallbacks {
  onSnapshot: (vessels: Vessel[]) => void
  onStatus: (status: ProviderStatus) => void
}

interface DigitrafficOptions {
  config: AppConfig['marine']
  query: TrafficQuery
  callbacks: DigitrafficCallbacks
}

const DIGITRAFFIC_USER = 'LiveTrafficStan/1.0'

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
  private metadataInterval?: number
  private flushTimer?: number
  private locationController?: AbortController
  private metadataController?: AbortController
  private running = false
  private lastStatusEmission = 0
  private lastLocationRefreshStartedAt?: number

  constructor(options: DigitrafficOptions) {
    this.config = options.config
    this.query = options.query
    this.callbacks = options.callbacks
  }

  start() {
    if (this.running) return
    this.running = true
    this.updateStatus({ phase: 'loading', paused: false, error: undefined }, true)
    void this.refreshLocations(true)
    void this.refreshMetadata()
    void this.connectMqtt()
    this.metadataInterval = window.setInterval(
      () => void this.refreshMetadata(),
      this.config.metadataRefreshIntervalMs,
    )
  }

  stop() {
    this.running = false
    this.locationController?.abort()
    this.metadataController?.abort()
    this.locationController = undefined
    this.metadataController = undefined

    if (this.metadataInterval !== undefined) {
      window.clearInterval(this.metadataInterval)
      this.metadataInterval = undefined
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
    this.query = query
    if (!this.running) return

    this.flush()
    void this.refreshLocations()
  }

  private requestHeaders() {
    return {
      Accept: 'application/json',
      'Digitraffic-User': DIGITRAFFIC_USER,
    }
  }

  private async refreshLocations(force = false) {
    if (!this.running || this.locationController) return

    const startedAt = Date.now()
    if (
      !force &&
      this.lastLocationRefreshStartedAt !== undefined &&
      startedAt - this.lastLocationRefreshStartedAt <
        this.config.queryRestRefreshIntervalMs
    ) {
      return
    }

    const controller = new AbortController()
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
      for (const location of locations) this.mergeLocation(location)
      this.noteRestSuccess(
        locations.reduce(
          (latest, location) => Math.max(latest, location.observedAt),
          0,
        ),
      )
      this.scheduleFlush()
    } catch (error) {
      if (!controller.signal.aborted) this.noteError(error)
    } finally {
      if (this.locationController === controller) {
        this.locationController = undefined
      }
    }
  }

  private async refreshMetadata() {
    if (!this.running || this.metadataController) return

    const controller = new AbortController()
    this.metadataController = controller
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
      for (const record of metadata) this.mergeMetadata(record)
      this.noteRestSuccess()
      this.scheduleFlush()
    } catch (error) {
      if (!controller.signal.aborted) this.noteError(error)
    } finally {
      if (this.metadataController === controller) {
        this.metadataController = undefined
      }
    }
  }

  private async connectMqtt() {
    if (!this.running || this.mqttClient) return

    let connect: typeof import('mqtt').connect
    try {
      const mqttModule = await import('mqtt')
      connect =
        typeof mqttModule.connect === 'function'
          ? mqttModule.connect
          : mqttModule.default.connect
    } catch (error) {
      this.noteError(error)
      this.scheduleMqttConnect()
      return
    }
    if (!this.running || this.mqttClient) return

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
      this.noteError(error)
      this.scheduleMqttConnect()
      return
    }

    this.mqttClient = client

    client.on('connect', () => {
      client.subscribe(
        [
          'vessels-v2/+/location',
          'vessels-v2/+/metadata',
          'vessels-v2/status',
        ],
        (error) => {
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
      if (!this.running) return
      if (topic === 'vessels-v2/status') {
        this.noteLiveSuccess()
        return
      }

      const segments = topic.split('/')
      const mmsi = Number(segments[1])
      const kind = segments[2]
      if (!Number.isInteger(mmsi) || mmsi <= 0) return

      let parsed: unknown
      try {
        parsed = JSON.parse(payload.toString('utf8'))
      } catch {
        this.warnPayload(kind, 'invalid JSON')
        return
      }

      if (kind === 'location') {
        const location = parseDigitrafficMqttLocation(parsed, mmsi)
        if (!location) {
          this.warnPayload(kind, 'invalid fields')
          return
        }
        this.mergeLocation(location)
        this.noteLiveSuccess(location.observedAt)
        this.scheduleFlush()
        return
      }

      if (kind === 'metadata') {
        const record = parseDigitrafficMqttMetadata(parsed, mmsi)
        if (!record) {
          this.warnPayload(kind, 'invalid fields')
          return
        }
        this.mergeMetadata(record)
        this.noteLiveSuccess()
        this.scheduleFlush()
      }
    })

    client.on('offline', () => {
      if (this.running) {
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
      if (this.running) {
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
      if (this.running) {
        this.mqttConnected = false
        this.noteError(error)
      }
    })
  }

  private scheduleMqttConnect() {
    if (
      !this.running ||
      this.mqttClient ||
      this.mqttConnectTimer !== undefined
    ) {
      return
    }

    this.mqttConnectTimer = window.setTimeout(() => {
      this.mqttConnectTimer = undefined
      void this.connectMqtt()
    }, this.config.mqttReconnectPeriodMs)
  }

  private mergeLocation(location: MarineLocationRecord) {
    const current = this.locations.get(location.mmsi)
    if (!current || location.observedAt >= current.observedAt) {
      this.locations.set(location.mmsi, location)
    }
  }

  private mergeMetadata(record: MarineMetadataRecord) {
    const current = this.metadata.get(record.mmsi)
    if (!current || record.timestamp >= current.timestamp) {
      this.metadata.set(record.mmsi, record)
    }
  }

  private scheduleFlush() {
    if (!this.running || this.flushTimer !== undefined) return
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = undefined
      this.flush()
    }, this.config.snapshotFlushIntervalMs)
  }

  private flush() {
    if (!this.running) return

    const now = Date.now()
    const vessels: Vessel[] = []
    for (const [mmsi, location] of this.locations) {
      if (now - location.observedAt > this.config.expireAfterMs) {
        this.locations.delete(mmsi)
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
  }

  private noteRestSuccess(dataTimestamp?: number) {
    const now = Date.now()
    this.status = {
      ...this.status,
      phase: this.mqttConnected ? 'live' : this.status.phase,
      error: this.mqttConnected ? undefined : this.status.error,
      lastSuccessAt: now,
      lastDataAt:
        dataTimestamp && dataTimestamp > 0
          ? Math.max(this.status.lastDataAt ?? 0, dataTimestamp)
          : this.status.lastDataAt,
    }
    this.emitStatus()
  }

  private noteLiveSuccess(dataTimestamp?: number) {
    const now = Date.now()
    this.mqttConnected = true
    const recovered = this.status.phase !== 'live' || Boolean(this.status.error)
    this.status = {
      ...this.status,
      phase: 'live',
      paused: false,
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

  private warnPayload(kind: string | undefined, reason: string) {
    const key = `${kind ?? 'unknown'}:${reason}`
    if (this.warnedPayloadKinds.has(key)) return
    this.warnedPayloadKinds.add(key)
    console.warn(`Ignored malformed Digitraffic ${kind ?? 'message'}: ${reason}`)
  }
}
