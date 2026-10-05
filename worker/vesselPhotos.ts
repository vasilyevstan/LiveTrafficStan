import { VESSEL_PHOTO_CONFIG as config } from '../src/config/vesselPhotoConfig.js'
import { isValidVesselPhotoNumber } from '../src/domain/vesselPhotoIdentity.js'
import { isRecord } from '../src/providers/guards.js'
import { PhotoProviderError, readBoundedPhotoJson } from '../src/providers/photo.js'

type PhotoFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const response = (body: unknown, status: number, headers?: HeadersInit) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...Object.fromEntries(new Headers(headers)),
    },
  })

export const handleVesselPhotos = async (
  request: Request,
  options: { fetchImpl?: PhotoFetch; timeoutMs?: number } = {},
) => {
  const url = new URL(request.url)
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405, { Allow: 'GET' })
  const number = url.pathname.slice(config.path.length + 1)
  if (!url.pathname.startsWith(`${config.path}/`) || url.search ||
    !isValidVesselPhotoNumber(number)) {
    return response({ error: 'Expected a valid IMO or ordinary MMSI' }, 400)
  }
  const origin = request.headers.get('Origin')
  if ((origin !== null && origin !== url.origin) ||
    request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return response({ error: 'Cross-origin photo request rejected' }, 403)
  }
  if (request.signal.aborted) return response({ error: 'Photo request canceled' }, 499)
  const controller = new AbortController()
  const abort = () => controller.abort(request.signal.reason)
  request.signal.addEventListener('abort', abort, { once: true })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs ?? config.upstreamTimeoutMs)
  try {
    const upstream = await (options.fetchImpl ?? fetch)(
      `${config.upstreamBaseUrl}/${number}`,
      {
        method: 'GET', signal: controller.signal, redirect: 'manual',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LiveTrafficStan (+https://github.com/vasilyevstan/LiveTrafficStan)',
        },
      },
    )
    if (upstream.status !== 200) {
      void upstream.body?.cancel().catch(() => undefined)
      const retryAfter = upstream.headers.get('Retry-After')
      return response(
        { error: 'Open Waters photo lookup unavailable' },
        upstream.status === 429 ? 429 : upstream.status === 403 ? 403 : 502,
        retryAfter ? { 'Retry-After': retryAfter } : undefined,
      )
    }
    const body = await readBoundedPhotoJson(upstream, config.maximumBytes)
    if (timedOut) return response({ error: 'Photo lookup timed out' }, 504)
    if (request.signal.aborted) return response({ error: 'Photo request canceled' }, 499)
    if (!isRecord(body) || !Array.isArray(body.photos) || body.photos.length > config.maximumPhotos) {
      return response({ error: 'Invalid photo response' }, 502)
    }
    // The provider caches failed/incomplete lookups for 900 seconds, not its
    // normal one-day empty result. Do not turn that failure into "no photo".
    if (body.photos.length === 0 && /(?:^|,)\s*max-age=900(?:,|$)/.test(upstream.headers.get('Cache-Control') ?? '')) {
      return response({ error: 'Open Waters image source temporarily unavailable' }, 503, { 'Retry-After': '900' })
    }
    return response(body, 200)
  } catch (error) {
    if (request.signal.aborted) return response({ error: 'Photo request canceled' }, 499)
    if (timedOut) return response({ error: 'Photo lookup timed out' }, 504)
    return response({
      error: error instanceof PhotoProviderError ? 'Invalid photo response' : 'Open Waters photo lookup unavailable',
    }, 502)
  } finally {
    clearTimeout(timeout)
    request.signal.removeEventListener('abort', abort)
  }
}
