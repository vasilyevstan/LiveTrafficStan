export const AIRCRAFT_PROXY_PREFIX = '/api/aircraft'
export const ADSB_LOL_ORIGIN = 'https://api.adsb.lol'
export const ADSB_LOL_USER_AGENT =
  'LiveTrafficStan (+https://github.com/vasilyevstan/LiveTrafficStan)'
export const MAX_AIRCRAFT_RADIUS_NM = 54
export const AIRCRAFT_PROXY_TIMEOUT_MS = 10_000
export const MAX_AIRCRAFT_RESPONSE_BYTES = 4 * 1024 * 1024

export type AircraftProxyFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

interface AircraftProxyOptions {
  fetchImpl?: AircraftProxyFetch
  timeoutMs?: number
  maxResponseBytes?: number
}

interface ParsedPointRequest {
  latitude: string
  longitude: string
  radiusNm: string
}

const coordinatePattern = /^-?(?:0|[1-9]\d*)(?:\.\d{1,7})?$/
const radiusPattern = /^(?:[1-9]|[1-4]\d|5[0-4])$/

class ResponseTooLargeError extends Error {}

const textResponse = (
  message: string,
  status: number,
  headers?: Record<string, string>,
) =>
  new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  })

const requestSegments = (pathname: string) => {
  const segments = pathname.split('/')
  if (
    segments.length !== 8 ||
    segments[0] !== '' ||
    segments[1] !== 'api' ||
    segments[2] !== 'aircraft' ||
    segments[3] !== 'v2' ||
    segments[4] !== 'point'
  ) {
    return undefined
  }

  return segments.slice(5)
}

const decodeCanonicalSegment = (segment: string) => {
  let decoded: string
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    return undefined
  }

  return decoded === segment ? decoded : undefined
}

const canonicalCoordinate = (
  segment: string,
  minimum: number,
  maximum: number,
) => {
  const decoded = decodeCanonicalSegment(segment)
  if (!decoded || !coordinatePattern.test(decoded)) return undefined

  const value = Number(decoded)
  if (
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    String(value) !== decoded
  ) {
    return undefined
  }

  return decoded
}

const parsePointRequest = (
  segments: readonly string[],
): ParsedPointRequest | undefined => {
  const latitude = canonicalCoordinate(segments[0] ?? '', -90, 90)
  const longitude = canonicalCoordinate(segments[1] ?? '', -180, 180)
  const radiusNm = decodeCanonicalSegment(segments[2] ?? '')

  if (!latitude || !longitude || !radiusNm || !radiusPattern.test(radiusNm)) {
    return undefined
  }

  return { latitude, longitude, radiusNm }
}

const responseHeaders = (upstream: Response) => {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })

  for (const name of ['Content-Type', 'Retry-After']) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }

  return headers
}

const readBoundedBody = async (
  response: Response,
  maximumBytes: number,
  abort: () => void,
) => {
  const contentLength = response.headers.get('Content-Length')
  if (contentLength) {
    const declaredBytes = Number(contentLength)
    if (Number.isFinite(declaredBytes) && declaredBytes > maximumBytes) {
      abort()
      throw new ResponseTooLargeError()
    }
  }

  if (!response.body) return undefined

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      totalBytes += value.byteLength
      if (totalBytes > maximumBytes) {
        abort()
        void reader.cancel()
        throw new ResponseTooLargeError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  if (totalBytes === 0) return undefined

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export const handleAircraftProxy = async (
  request: Request,
  options: AircraftProxyOptions = {},
) => {
  const url = new URL(request.url)
  const segments = requestSegments(url.pathname)
  if (!segments) return textResponse('Not found', 404)

  if (request.method !== 'GET') {
    return textResponse('Method not allowed', 405, { Allow: 'GET' })
  }

  if (url.search || request.url.includes('?')) {
    return textResponse('Aircraft proxy queries are not supported', 400)
  }

  const point = parsePointRequest(segments)
  if (!point) {
    return textResponse('Invalid aircraft proxy parameters', 400)
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? AIRCRAFT_PROXY_TIMEOUT_MS
  const maxResponseBytes =
    options.maxResponseBytes ?? MAX_AIRCRAFT_RESPONSE_BYTES
  if (request.signal.aborted) {
    return textResponse('Aircraft request canceled', 499)
  }

  const upstreamController = new AbortController()
  let timedOut = false

  const handleClientAbort = () => {
    upstreamController.abort(request.signal.reason)
  }

  if (request.signal.aborted) {
    handleClientAbort()
  } else {
    request.signal.addEventListener('abort', handleClientAbort, { once: true })
  }

  const timeout = setTimeout(() => {
    timedOut = true
    upstreamController.abort(new Error('Aircraft upstream timed out'))
  }, timeoutMs)

  const upstreamUrl =
    `${ADSB_LOL_ORIGIN}/v2/point/` +
    `${point.latitude}/${point.longitude}/${point.radiusNm}`

  try {
    const upstream = await fetchImpl(upstreamUrl, {
      method: 'GET',
      signal: upstreamController.signal,
      redirect: 'manual',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': ADSB_LOL_USER_AGENT,
      },
    })

    if (
      upstream.type === 'opaqueredirect' ||
      (upstream.status >= 300 && upstream.status < 400)
    ) {
      return textResponse('Aircraft upstream redirect rejected', 502)
    }

    const body = await readBoundedBody(
      upstream,
      maxResponseBytes,
      () => upstreamController.abort(new ResponseTooLargeError()),
    )
    if (timedOut) return textResponse('Aircraft upstream timed out', 504)
    if (request.signal.aborted) {
      return textResponse('Aircraft request canceled', 499)
    }

    return new Response(body ?? null, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders(upstream),
    })
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      return textResponse('Aircraft upstream response was too large', 502)
    }
    if (timedOut) {
      return textResponse('Aircraft upstream timed out', 504)
    }
    if (request.signal.aborted) {
      return textResponse('Aircraft request canceled', 499)
    }
    return textResponse('Aircraft upstream unavailable', 502)
  } finally {
    clearTimeout(timeout)
    request.signal.removeEventListener('abort', handleClientAbort)
  }
}
