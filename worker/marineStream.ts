import { DurableObject } from 'cloudflare:workers'
import { MARINE_STREAM_CONFIG as config } from '../src/config/marineStreamConfig.js'
import { ProviderError, parseRetryAfterMs } from '../src/providers/errors.js'
import type { MarineStreamSource } from '../src/providers/marine/marineSourceNormalization.js'
import {
  MarineStreamHub,
  type MarineRetryState,
  type MarineRuntimeState,
} from './marineStreamHub.js'

export const MARINE_STREAM_PATH = config.path
export const MARINE_RELAY_OBJECT_NAME = 'marine-live-viewers-v1'

export interface MarineRelayNamespace {
  idFromName(name: string): unknown
  get(id: unknown): { fetch(request: Request): Promise<Response> }
}

export interface MarineRelayEnvironment {
  MARINE_SUPPLEMENT_ENABLED?: string
  MARINE_TRAFFIC_RELAY?: MarineRelayNamespace
  AISSTREAM_API_KEY?: string
  OPENWATERS_AIS_TOKEN?: string
  RELEASE_SHA?: string
}

export interface MarineSqlStorage {
  sql: {
    exec(query: string, ...bindings: (string | number)[]): {
      toArray(): Record<string, unknown>[]
    }
  }
  transactionSync<T>(callback: () => T): T
}
const dayMs = 24 * 60 * 60_000
const validCounter = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export class SqlMarineRuntimeState implements MarineRuntimeState {
  private readonly storage: MarineSqlStorage
  private day = -1
  private available = 0

  constructor(storage: MarineSqlStorage) {
    this.storage = storage
    storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS marine_budget (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        day INTEGER NOT NULL,
        used INTEGER NOT NULL
      )
    `)
    storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS marine_retry (
        source TEXT PRIMARY KEY,
        not_before INTEGER NOT NULL,
        failures INTEGER NOT NULL,
        metadata_not_before INTEGER NOT NULL
      )
    `)
  }

  consume(messages: number, now: number) {
    if (!validCounter(messages) || !validCounter(now) || now === 0) {
      throw new Error('Invalid marine budget request')
    }
    const day = Math.floor(now / dayMs)
    if (day === this.day && this.available >= messages) {
      this.available -= messages
      return true
    }
    const carried = day === this.day ? this.available : 0
    const needed = messages - carried
    const maximum = config.dailyRequestBudget * 20
    const granted = this.storage.transactionSync(() => {
      const rows = this.storage.sql.exec(
        'SELECT day, used FROM marine_budget WHERE singleton = 1',
      ).toArray()
      const row = rows[0]
      if (rows.length > 1) {
        throw new Error('Invalid marine budget state')
      }
      let used = 0
      if (row) {
        if (!validCounter(row.day) || !validCounter(row.used) || row.used > maximum) {
          throw new Error('Invalid marine budget state')
        }
        if (row.day > day) return 0
        if (row.day === day) used = row.used
      }
      const reservation = Math.min(
        maximum - used, Math.max(config.budgetReservationMessages, needed),
      )
      if (reservation < needed) return 0
      this.storage.sql.exec(
        `INSERT INTO marine_budget (singleton, day, used) VALUES (1, ?, ?)
         ON CONFLICT(singleton) DO UPDATE SET day = excluded.day, used = excluded.used`,
        day, used + reservation,
      )
      return reservation
    })
    if (granted < needed || granted === 0) return false
    this.day = day
    this.available = carried + granted - messages
    return true
  }

  readRetry(source: MarineStreamSource): MarineRetryState {
    const rows = this.storage.sql.exec(
      `SELECT not_before AS notBefore, failures,
        metadata_not_before AS metadataNotBefore
       FROM marine_retry WHERE source = ?`,
      source,
    ).toArray()
    if (rows.length > 1) {
      throw new Error('Invalid marine retry state')
    }
    const row = rows[0]
    if (!row) return { notBefore: 0, failures: 0, metadataNotBefore: 0 }
    if (!validCounter(row.notBefore) || !validCounter(row.failures) ||
      row.failures > 8 || !validCounter(row.metadataNotBefore)) {
      throw new Error('Invalid marine retry state')
    }
    return {
      notBefore: row.notBefore,
      failures: row.failures,
      metadataNotBefore: row.metadataNotBefore,
    }
  }

  writeRetry(source: MarineStreamSource, value: MarineRetryState) {
    if (!validCounter(value.notBefore) || !validCounter(value.failures) ||
      value.failures > 8 || !validCounter(value.metadataNotBefore ?? 0)) {
      throw new Error('Invalid marine retry deadline')
    }
    this.storage.sql.exec(
      `INSERT INTO marine_retry (source, not_before, failures, metadata_not_before)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(source) DO UPDATE SET not_before = excluded.not_before,
         failures = excluded.failures, metadata_not_before = excluded.metadata_not_before`,
      source, value.notBefore, value.failures, value.metadataNotBefore ?? 0,
    )
  }
}

const unavailable = (message: string, status: number, retryAfter?: number) =>
  new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(retryAfter === undefined ? {} : { 'Retry-After': String(retryAfter) }),
    },
  })

const validateUpgrade = (request: Request, env: MarineRelayEnvironment) => {
  if (env.MARINE_SUPPLEMENT_ENABLED !== 'true') {
    return unavailable('Marine supplement is disabled', 404)
  }
  const url = new URL(request.url)
  if (url.pathname !== MARINE_STREAM_PATH || url.search) {
    return unavailable('Invalid marine stream route', 400)
  }
  if (request.method !== 'GET') return unavailable('GET required', 405)
  if (request.headers.get('Origin') !== url.origin) {
    return unavailable('Same-origin marine access required', 403)
  }
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return unavailable('WebSocket upgrade required', 426)
  }
  return undefined
}

export const handleMarineStream = async (
  request: Request,
  env: MarineRelayEnvironment,
) => {
  const invalid = validateUpgrade(request, env)
  if (invalid) return invalid
  const namespace = env.MARINE_TRAFFIC_RELAY
  if (!namespace) return unavailable('Marine relay unavailable', 503, 60)
  return namespace.get(namespace.idFromName(MARINE_RELAY_OBJECT_NAME)).fetch(request)
}

export class MarineTrafficRelay extends DurableObject<MarineRelayEnvironment> {
  private readonly hub: MarineStreamHub

  constructor(ctx: DurableObjectState, env: MarineRelayEnvironment) {
    super(ctx, env)
    this.hub = new MarineStreamHub({
      state: new SqlMarineRuntimeState(ctx.storage),
      aisstreamKey: env.AISSTREAM_API_KEY,
      openWatersToken: env.OPENWATERS_AIS_TOKEN,
      connect: async (source, signal) => {
        const headers = new Headers({
          Upgrade: 'websocket',
          'Sec-WebSocket-Extensions': 'permessage-deflate',
        })
        if (source === 'openwaters' && env.OPENWATERS_AIS_TOKEN) {
          headers.set('Authorization', `Bearer ${env.OPENWATERS_AIS_TOKEN}`)
        }
        const response = await fetch(
          source === 'aisstream'
            ? 'https://stream.aisstream.io/v0/stream'
            : 'https://ais.openwaters.io/v1/stream',
          { headers, signal, redirect: 'manual' },
        )
        if (response.status !== 101 || !response.webSocket) {
          throw new ProviderError(
            'Marine stream connection was rejected',
            response.status,
            parseRetryAfterMs(response.headers.get('Retry-After')),
          )
        }
        return response.webSocket
      },
      metadata: async (boxes, signal) => {
        const url = new URL('https://ais.openwaters.io/v1/vessels')
        for (const box of boxes) url.searchParams.append('bbox', box.join(','))
        url.searchParams.set('kind', 'vessel')
        url.searchParams.set('max_age', '600')
        url.searchParams.set('max_age_moving', '600')
        const headers = new Headers({ Accept: 'application/json' })
        if (env.OPENWATERS_AIS_TOKEN) {
          headers.set('Authorization', `Bearer ${env.OPENWATERS_AIS_TOKEN}`)
        }
        const response = await fetch(url, { headers, signal, redirect: 'manual' })
        if (!response.ok || !response.body) {
          throw new ProviderError(
            'Open Waters metadata was unavailable',
            response.status,
            parseRetryAfterMs(response.headers.get('Retry-After')),
          )
        }
        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })
        let size = 0
        let text = ''
        try {
          while (true) {
            const result = await reader.read()
            if (result.done) break
            size += result.value.byteLength
            if (size > config.maximumMetadataBytes) {
              throw new Error('Open Waters metadata exceeded its byte bound')
            }
            text += decoder.decode(result.value, { stream: true })
          }
          text += decoder.decode()
          return JSON.parse(text)
        } finally {
          await reader.cancel()
          reader.releaseLock()
        }
      },
    })
  }

  async fetch(request: Request) {
    const invalid = validateUpgrade(request, this.env)
    if (invalid) return invalid
    if (this.hub.clientCount >= config.maximumClients) {
      return this.retryResponse(
        'Marine relay is at client capacity',
        Date.now() + config.reconnectMaximumMs,
      )
    }
    if (!this.hub.admitRequest()) {
      return this.retryResponse('Marine relay budget is unavailable', this.hub.retryAt)
    }
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    if (!this.hub.addClient(server)) {
      return unavailable('Marine relay is at client capacity', 503, 60)
    }
    server.accept()
    const headers = new Headers({ 'Cache-Control': 'no-store' })
    if (/^[0-9a-f]{40}$/.test(this.env.RELEASE_SHA ?? '')) {
      headers.set('X-LiveTrafficStan-Release', this.env.RELEASE_SHA!)
    }
    return new Response(null, { status: 101, webSocket: client, headers })
  }

  private retryResponse(error: string, retryAt: number) {
    const [client, server] = Object.values(new WebSocketPair())
    server.accept()
    server.send(JSON.stringify({ version: 1, type: 'retry', retryAt, error }))
    server.close(1013, 'Retry later')
    return new Response(null, {
      status: 101, webSocket: client,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
