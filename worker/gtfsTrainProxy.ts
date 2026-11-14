import {
  readBoundedBody,
  ResponseTooLargeError,
} from './metarProxy.js'
import {
  decodeGtfsVehicleFeed,
  GtfsDecodeError,
  type GtfsDecodeLimits,
} from './gtfsRealtime.js'

export type GtfsTrainProxyFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface GtfsTrainFeedCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

export interface GtfsTrainProxyOptions {
  fetchImpl?: GtfsTrainProxyFetch
  timeoutMs?: number
  maxResponseBytes?: number
  now?: () => number
  /** `null` disables caching; omitted uses the Workers edge cache when present. */
  cache?: GtfsTrainFeedCache | null
}

export interface GtfsTrainProxyConfig {
  path: string
  upstreamUrl: string
  name: string
  cacheSeconds: number
  /** Required unless `decoder` replaces GTFS-RT decoding. */
  decodeLimits?: GtfsDecodeLimits
  allowMissingContentType?: boolean
  userAgent?: string
  /** Replaces GTFS-RT decoding for a non-protobuf upstream with the same bounds. */
  decoder?: TrainFeedDecoder
}

export interface TrainFeedDecoder {
  accept: string
  contentTypes: readonly string[]
  /** Throws GtfsDecodeError for an invalid feed. */
  decode(body: Uint8Array): object[]
}

export interface GtfsTrainProxyVehicle {
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

export interface GtfsTrainProxyBody {
  retrievedAt: string
  vehicles: object[]
}

const protobufTypes = [
  'application/octet-stream',
  'application/x-protobuf',
  'application/protobuf',
]

const DEFAULT_DECODE_LIMITS: GtfsDecodeLimits = {
  maximumEntities: 1_000,
  maximumVehicles: 1_000,
  maximumStringBytes: 256,
}

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

const edgeCache = (): GtfsTrainFeedCache | undefined =>
  (globalThis as { caches?: { default?: GtfsTrainFeedCache } }).caches?.default

const jsonResponse = (body: string) =>
  new Response(body, {
    status: 200,
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })

const cachedBody = async (cache: GtfsTrainFeedCache | undefined, key: Request) => {
  if (!cache) return undefined
  try {
    const cached = await cache.match(key)
    return cached?.ok ? await cached.text() : undefined
  } catch {
    console.warn('Train feed cache lookup failed')
    return undefined
  }
}

const storeBody = async (
  cache: GtfsTrainFeedCache | undefined,
  key: Request,
  body: string,
  cacheSeconds: number,
) => {
  if (!cache) return
  try {
    await cache.put(key, new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${cacheSeconds}`,
      },
    }))
  } catch {
    console.warn('Train feed cache write failed')
  }
}

export const handleGtfsTrainProxy = async (
  request: Request,
  config: GtfsTrainProxyConfig,
  options: GtfsTrainProxyOptions = {},
) => {
  const url = new URL(request.url)
  if (url.pathname !== config.path) {
    return textResponse('Not found', 404)
  }
  if (request.method !== 'GET') {
    return textResponse('Method not allowed', 405, { Allow: 'GET' })
  }
  if (url.search !== '') {
    return textResponse(`Invalid ${config.name} proxy parameters`, 400)
  }
  if (request.signal.aborted) {
    return textResponse(`${config.name} request canceled`, 499)
  }

  const cache = options.cache === null ? undefined : options.cache ?? edgeCache()
  const cacheKey = new Request(new URL(config.path, url.origin), { method: 'GET' })
  const cached = await cachedBody(cache, cacheKey)
  if (cached !== undefined) return jsonResponse(cached)

  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 8_000
  const maximumBytes = options.maxResponseBytes ?? 512 * 1_024
  const now = options.now ?? Date.now
  const upstreamController = new AbortController()
  let timedOut = false
  const handleClientAbort = () => {
    upstreamController.abort(request.signal.reason)
  }
  request.signal.addEventListener('abort', handleClientAbort, { once: true })
  const timeout = setTimeout(() => {
    timedOut = true
    upstreamController.abort(new Error(`${config.name} upstream timed out`))
  }, timeoutMs)

  try {
    const upstream = await fetchImpl(config.upstreamUrl, {
      method: 'GET',
      signal: upstreamController.signal,
      redirect: 'manual',
      cache: 'no-store',
      headers: {
        Accept: config.decoder?.accept ?? 'application/x-protobuf, application/octet-stream',
        ...(config.userAgent ? { 'User-Agent': config.userAgent } : {}),
      },
    })
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel()
      return textResponse(`${config.name} upstream redirect rejected`, 502)
    }
    if (upstream.status !== 200) {
      await upstream.body?.cancel()
      const retryAfter = upstream.headers.get('Retry-After')
      const status = upstream.status === 429 || upstream.status === 503
        ? upstream.status : 502
      return textResponse(
        `${config.name} upstream unavailable`,
        status,
        retryAfter ? { 'Retry-After': retryAfter } : undefined,
      )
    }
    const contentType = (upstream.headers.get('Content-Type') ?? '')
      .split(';')[0]!.trim().toLowerCase()
    const allowedTypes = config.decoder?.contentTypes ?? protobufTypes
    if (!allowedTypes.includes(contentType) && !(config.allowMissingContentType && !contentType)) {
      await upstream.body?.cancel()
      return textResponse(`${config.name} upstream returned an unsafe content type`, 502)
    }

    const body = await readBoundedBody(
      upstream,
      maximumBytes,
      () => upstreamController.abort(new ResponseTooLargeError()),
    )
    if (timedOut) return textResponse(`${config.name} upstream timed out`, 504)
    if (request.signal.aborted) {
      return textResponse(`${config.name} request canceled`, 499)
    }

    const payload: GtfsTrainProxyBody = {
      retrievedAt: new Date(now()).toISOString(),
      vehicles: config.decoder
        ? config.decoder.decode(body ?? new Uint8Array())
        : decodeGtfsVehicleFeed(
          body ?? new Uint8Array(),
          config.decodeLimits ?? DEFAULT_DECODE_LIMITS,
        ).vehicles.map((vehicle): GtfsTrainProxyVehicle => ({
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
    await storeBody(cache, cacheKey, json, config.cacheSeconds)
    return jsonResponse(json)
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      return textResponse(`${config.name} upstream response was too large`, 502)
    }
    if (error instanceof GtfsDecodeError) {
      return textResponse(`${config.name} upstream returned an invalid feed`, 502)
    }
    if (timedOut) return textResponse(`${config.name} upstream timed out`, 504)
    if (request.signal.aborted) {
      return textResponse(`${config.name} request canceled`, 499)
    }
    return textResponse(`${config.name} upstream unavailable`, 502)
  } finally {
    clearTimeout(timeout)
    request.signal.removeEventListener('abort', handleClientAbort)
  }
}
