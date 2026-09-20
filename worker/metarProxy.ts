export const METAR_PROXY_PATH = '/api/weather/metar'
export const AWC_METAR_URL =
  'https://aviationweather.gov/api/data/metar'
export const AWC_USER_AGENT =
  'LiveTrafficStan (+https://github.com/vasilyevstan/LiveTrafficStan)'
export const METAR_PROXY_TIMEOUT_MS = 8_000
export const MAX_METAR_RESPONSE_BYTES = 256 * 1_024
export const MAX_METAR_STATIONS = 50

export type MetarProxyFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

interface MetarProxyOptions {
  fetchImpl?: MetarProxyFetch
  timeoutMs?: number
  maxResponseBytes?: number
}

const stationPattern = /^[A-Z]{4}$/

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

const parseStationIds = (url: URL) => {
  if (
    [...url.searchParams.keys()].some((key) => key !== 'ids') ||
    url.searchParams.getAll('ids').length !== 1
  ) {
    return undefined
  }

  const value = url.searchParams.get('ids')
  if (!value) return undefined
  const stationIds = value.split(',')
  if (
    stationIds.length < 1 ||
    stationIds.length > MAX_METAR_STATIONS ||
    stationIds.some((id) => !stationPattern.test(id)) ||
    stationIds.some(
      (id, index) => index > 0 && id <= stationIds[index - 1]!,
    )
  ) {
    return undefined
  }

  const canonicalSearch = new URLSearchParams({
    ids: stationIds.join(','),
  }).toString()
  return url.search.slice(1) === canonicalSearch
    ? stationIds
    : undefined
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

const responseHeaders = (
  upstream: Response,
  successful: boolean,
) => {
  const headers = new Headers({
    'Cache-Control': successful ? 'public, max-age=60' : 'no-store',
    'Content-Type': successful
      ? 'application/json; charset=utf-8'
      : 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  })
  const retryAfter = upstream.headers.get('Retry-After')
  if (retryAfter) headers.set('Retry-After', retryAfter)
  return headers
}

export const handleMetarProxy = async (
  request: Request,
  options: MetarProxyOptions = {},
) => {
  const url = new URL(request.url)
  if (url.pathname !== METAR_PROXY_PATH) {
    return textResponse('Not found', 404)
  }
  if (request.method !== 'GET') {
    return textResponse('Method not allowed', 405, { Allow: 'GET' })
  }

  const stationIds = parseStationIds(url)
  if (!stationIds) {
    return textResponse('Invalid METAR proxy parameters', 400)
  }
  if (request.signal.aborted) {
    return textResponse('METAR request canceled', 499)
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? METAR_PROXY_TIMEOUT_MS
  const maximumBytes =
    options.maxResponseBytes ?? MAX_METAR_RESPONSE_BYTES
  const upstreamController = new AbortController()
  let timedOut = false
  const handleClientAbort = () => {
    upstreamController.abort(request.signal.reason)
  }
  request.signal.addEventListener('abort', handleClientAbort, { once: true })
  const timeout = setTimeout(() => {
    timedOut = true
    upstreamController.abort(new Error('METAR upstream timed out'))
  }, timeoutMs)

  const upstreamUrl = new URL(AWC_METAR_URL)
  upstreamUrl.search = new URLSearchParams({
    ids: stationIds.join(','),
    format: 'json',
  }).toString()

  try {
    const upstream = await fetchImpl(upstreamUrl, {
      method: 'GET',
      signal: upstreamController.signal,
      redirect: 'manual',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': AWC_USER_AGENT,
      },
    })
    if (upstream.status >= 300 && upstream.status < 400) {
      return textResponse('METAR upstream redirect rejected', 502)
    }

    const successful = upstream.status === 200 || upstream.status === 204
    const contentType = upstream.headers.get('Content-Type') ?? ''
    if (
      upstream.status === 200 &&
      !contentType.toLowerCase().startsWith('application/json')
    ) {
      await upstream.body?.cancel()
      return textResponse('METAR upstream returned an unsafe content type', 502)
    }

    const body = await readBoundedBody(
      upstream,
      maximumBytes,
      () => upstreamController.abort(new ResponseTooLargeError()),
    )
    if (timedOut) return textResponse('METAR upstream timed out', 504)
    if (request.signal.aborted) {
      return textResponse('METAR request canceled', 499)
    }

    return new Response(body ?? null, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders(upstream, successful),
    })
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      return textResponse('METAR upstream response was too large', 502)
    }
    if (timedOut) return textResponse('METAR upstream timed out', 504)
    if (request.signal.aborted) {
      return textResponse('METAR request canceled', 499)
    }
    return textResponse('METAR upstream unavailable', 502)
  } finally {
    clearTimeout(timeout)
    request.signal.removeEventListener('abort', handleClientAbort)
  }
}
