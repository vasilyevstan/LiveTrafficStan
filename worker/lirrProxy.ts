import {
  readBoundedBody,
  ResponseTooLargeError,
} from './metarProxy.js'
import {
  decodeGtfsVehicleFeed,
  GtfsDecodeError,
  type GtfsDecodeLimits,
} from './gtfsRealtime.js'

export const LIRR_PROXY_PATH = '/api/trains/lirr'
export const MTA_LIRR_FEED_URL =
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr'
export const LIRR_PROXY_TIMEOUT_MS = 8_000
export const MAX_LIRR_RESPONSE_BYTES = 512 * 1_024
export const LIRR_DECODE_LIMITS: GtfsDecodeLimits = {
  maximumEntities: 5_000,
  maximumVehicles: 1_000,
  maximumStringBytes: 128,
}

export type LirrProxyFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface LirrFeedCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

/** Per-edge reuse so browsers never trigger one MTA fetch each (MTA terms). */
export const LIRR_EDGE_CACHE_SECONDS = 15

interface LirrProxyOptions {
  fetchImpl?: LirrProxyFetch
  timeoutMs?: number
  maxResponseBytes?: number
  now?: () => number
  /** `null` disables caching; omitted uses the Workers edge cache when present. */
  cache?: LirrFeedCache | null
}

export interface LirrProxyVehicle {
  id: string
  label?: string
  tripId?: string
  routeId?: string
  latitude: number
  longitude: number
  bearing?: number
  speedMetersPerSecond?: number
  observedAt: string
}

export interface LirrProxyBody {
  retrievedAt: string
  vehicles: LirrProxyVehicle[]
}

const protobufTypes = [
  'application/octet-stream',
  'application/x-protobuf',
  'application/protobuf',
]

const baseHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

const textResponse = (
  message: string,
  status: number,
  headers?: Record<string, string>,
) =>
  new Response(message, {
    status,
    headers: {
      ...baseHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      ...headers,
    },
  })

const round = (value: number, digits: number) =>
  Number(value.toFixed(digits))

const edgeCache = (): LirrFeedCache | undefined =>
  (globalThis as { caches?: { default?: LirrFeedCache } }).caches?.default

const jsonResponse = (body: string) =>
  new Response(body, {
    status: 200,
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })

const cachedBody = async (cache: LirrFeedCache | undefined, key: Request) => {
  if (!cache) return undefined
  try {
    const cached = await cache.match(key)
    return cached?.ok ? await cached.text() : undefined
  } catch {
    return undefined
  }
}

const storeBody = async (cache: LirrFeedCache | undefined, key: Request, body: string) => {
  if (!cache) return
  try {
    await cache.put(key, new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${LIRR_EDGE_CACHE_SECONDS}`,
      },
    }))
  } catch {
    // A cache outage only costs reuse; the fresh response is still valid.
  }
}

export const handleLirrProxy = async (
  request: Request,
  options: LirrProxyOptions = {},
) => {
  const url = new URL(request.url)
  if (url.pathname !== LIRR_PROXY_PATH) {
    return textResponse('Not found', 404)
  }
  if (request.method !== 'GET') {
    return textResponse('Method not allowed', 405, { Allow: 'GET' })
  }
  if (url.search !== '') {
    return textResponse('Invalid LIRR proxy parameters', 400)
  }
  if (request.signal.aborted) {
    return textResponse('LIRR request canceled', 499)
  }

  const cache = options.cache === null ? undefined : options.cache ?? edgeCache()
  const cacheKey = new Request(new URL(LIRR_PROXY_PATH, url.origin), { method: 'GET' })
  const cached = await cachedBody(cache, cacheKey)
  if (cached !== undefined) return jsonResponse(cached)

  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? LIRR_PROXY_TIMEOUT_MS
  const maximumBytes = options.maxResponseBytes ?? MAX_LIRR_RESPONSE_BYTES
  const now = options.now ?? Date.now
  const upstreamController = new AbortController()
  let timedOut = false
  const handleClientAbort = () => {
    upstreamController.abort(request.signal.reason)
  }
  request.signal.addEventListener('abort', handleClientAbort, { once: true })
  const timeout = setTimeout(() => {
    timedOut = true
    upstreamController.abort(new Error('LIRR upstream timed out'))
  }, timeoutMs)

  try {
    const upstream = await fetchImpl(MTA_LIRR_FEED_URL, {
      method: 'GET',
      signal: upstreamController.signal,
      redirect: 'manual',
      cache: 'no-store',
      headers: { Accept: 'application/x-protobuf, application/octet-stream' },
    })
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel()
      return textResponse('LIRR upstream redirect rejected', 502)
    }
    if (upstream.status !== 200) {
      await upstream.body?.cancel()
      const retryAfter = upstream.headers.get('Retry-After')
      const status = upstream.status === 429 || upstream.status === 503
        ? upstream.status : 502
      return textResponse(
        'LIRR upstream unavailable',
        status,
        retryAfter ? { 'Retry-After': retryAfter } : undefined,
      )
    }
    const contentType = (upstream.headers.get('Content-Type') ?? '')
      .split(';')[0]!.trim().toLowerCase()
    if (!protobufTypes.includes(contentType)) {
      await upstream.body?.cancel()
      return textResponse('LIRR upstream returned an unsafe content type', 502)
    }

    const body = await readBoundedBody(
      upstream,
      maximumBytes,
      () => upstreamController.abort(new ResponseTooLargeError()),
    )
    if (timedOut) return textResponse('LIRR upstream timed out', 504)
    if (request.signal.aborted) {
      return textResponse('LIRR request canceled', 499)
    }

    const feed = decodeGtfsVehicleFeed(
      body ?? new Uint8Array(),
      LIRR_DECODE_LIMITS,
    )
    const payload: LirrProxyBody = {
      retrievedAt: new Date(now()).toISOString(),
      vehicles: feed.vehicles.map((vehicle) => ({
        id: vehicle.vehicleId ?? vehicle.entityId,
        ...(vehicle.label ? { label: vehicle.label } : {}),
        ...(vehicle.tripId ? { tripId: vehicle.tripId } : {}),
        ...(vehicle.routeId ? { routeId: vehicle.routeId } : {}),
        latitude: round(vehicle.latitude, 5),
        longitude: round(vehicle.longitude, 5),
        ...(vehicle.bearing !== undefined
          ? { bearing: round(vehicle.bearing, 1) } : {}),
        ...(vehicle.speedMetersPerSecond !== undefined
          ? { speedMetersPerSecond: round(vehicle.speedMetersPerSecond, 1) }
          : {}),
        observedAt: new Date(vehicle.timestamp * 1_000).toISOString(),
      })),
    }
    const json = JSON.stringify(payload)
    await storeBody(cache, cacheKey, json)
    return jsonResponse(json)
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      return textResponse('LIRR upstream response was too large', 502)
    }
    if (error instanceof GtfsDecodeError) {
      return textResponse('LIRR upstream returned an invalid feed', 502)
    }
    if (timedOut) return textResponse('LIRR upstream timed out', 504)
    if (request.signal.aborted) {
      return textResponse('LIRR request canceled', 499)
    }
    return textResponse('LIRR upstream unavailable', 502)
  } finally {
    clearTimeout(timeout)
    request.signal.removeEventListener('abort', handleClientAbort)
  }
}
