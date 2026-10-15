import { DISCOVERY_CONFIG as config } from '../src/config/discoveryConfig.js'
import type { DiscoveryResponse, LookupRequest } from '../src/domain/objectDiscovery.js'
import { readBoundedBytes } from '../src/providers/boundedResponse.js'
import { isRecord } from '../src/providers/guards.js'
import {
  normalizeAircraftLookup, normalizeLookupRequest, normalizeShipLookup,
} from '../src/providers/discovery/lookupContract.js'
import { forwardAircraftRequest, type AircraftProxyFetch } from './aircraftProxy.js'

const response = (body: unknown, status: number, headers?: HeadersInit) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      ...Object.fromEntries(new Headers(headers)),
    },
  })

const json = async (upstream: Response, contentTypes: readonly string[], signal: AbortSignal) => {
  const bytes = await readBoundedBytes(upstream, config.maximumBytes, contentTypes, signal)
  return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)) as unknown
}

export const handleObjectLookup = async (
  request: Request,
  options: { fetchImpl?: AircraftProxyFetch; aircraftFetchImpl?: AircraftProxyFetch; timeoutMs?: number } = {},
) => {
  const url = new URL(request.url)
  const objectClass = url.pathname === config.aircraftPath ? 'aircraft' :
    url.pathname === config.shipsPath ? 'ships' : undefined
  if (!objectClass) return response({ error: 'Not found' }, 404)
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405, { Allow: 'POST' })
  const origin = request.headers.get('Origin')
  if (origin !== null && origin !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return response({ error: 'Cross-origin lookup rejected' }, 403)
  }
  if (url.search || request.url.includes('?')) return response({ error: 'Lookup URL queries are not supported' }, 400)
  if (request.signal.aborted) return response({ error: 'Lookup canceled' }, 499)
  const controller = new AbortController()
  const abort = () => controller.abort(request.signal.reason)
  request.signal.addEventListener('abort', abort, { once: true })
  let timedOut = false
  const timeoutMs = options.timeoutMs ?? config.timeoutMs
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('Lookup timed out'))
  }, timeoutMs)
  try {
    let lookup: LookupRequest
    try {
      const bytes = await readBoundedBytes(
        new Response(request.body, { headers: request.headers }),
        config.maximumRequestBytes, ['application/json'],
        controller.signal,
      )
      const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes))
      if (!isRecord(body) || Object.keys(body).length !== 2 || !('by' in body) || !('q' in body)) {
        return response({ error: 'Expected one lookup method and one query' }, 400)
      }
      lookup = normalizeLookupRequest(objectClass, body.by, body.q)
    } catch {
      if (timedOut) return response({ error: 'Lookup timed out' }, 504)
      if (request.signal.aborted) return response({ error: 'Lookup canceled' }, 499)
      return response({ error: 'Invalid lookup method, identifier or request body' }, 400)
    }
    if (timedOut) return response({ error: 'Lookup timed out' }, 504)
    if (request.signal.aborted) return response({ error: 'Lookup canceled' }, 499)
    const upstream = lookup.objectClass === 'aircraft'
      ? await forwardAircraftRequest(
          new Request(url.origin, { signal: controller.signal }),
          `/v2/${lookup.by}/${lookup.query}`,
          { fetchImpl: options.aircraftFetchImpl ?? options.fetchImpl, timeoutMs, maxResponseBytes: config.maximumBytes },
        )
      : await (options.fetchImpl ?? fetch)(
          lookup.by === 'mmsi' ? `${config.openWatersOrigin}/v1/vessels/${lookup.query}` :
            `${config.openWatersOrigin}/v1/vessels?${new URLSearchParams({ q: lookup.query, kind: 'vessel' })}`,
          {
            method: 'GET', signal: controller.signal, redirect: 'manual', cache: 'no-store',
            headers: {
              Accept: 'application/geo+json',
              'User-Agent': 'LiveTrafficStan (+https://github.com/vasilyevstan/LiveTrafficStan)',
            },
          },
        )
    if (timedOut || request.signal.aborted) {
      void upstream.body?.cancel().catch(() => undefined)
      return response({ error: timedOut ? 'Lookup timed out' : 'Lookup canceled' }, timedOut ? 504 : 499)
    }
    let result: DiscoveryResponse
    if (lookup.objectClass === 'ships' && lookup.by === 'mmsi' && upstream.status === 404) {
      const body = await json(upstream, ['application/json'], controller.signal)
      if (!isRecord(body) || body.error !== 'unknown vessel') throw new Error('Invalid lookup response')
      result = {
        objectClass: 'ships', retrievedAt: Date.now(), matches: [], truncated: false, rejectedRecords: 0,
      }
    } else {
      if (upstream.status !== 200) {
        void upstream.body?.cancel().catch(() => undefined)
        const retryAfter = upstream.headers.get('Retry-After')
        return response({ error: 'Lookup source unavailable' },
          upstream.status === 429 ? 429 : upstream.status === 503 ? 503 : upstream.status === 403 ? 403 : 502,
          retryAfter ? { 'Retry-After': retryAfter } : undefined,
        )
      }
      const body = await json(upstream, lookup.objectClass === 'ships' ? ['application/geo+json'] : ['application/json'], controller.signal)
      result = lookup.objectClass === 'ships' ? normalizeShipLookup(body, lookup, Date.now()) :
        normalizeAircraftLookup(body, lookup, Date.now())
    }
    if (timedOut) return response({ error: 'Lookup timed out' }, 504)
    if (request.signal.aborted || controller.signal.aborted) return response({ error: 'Lookup canceled' }, 499)
    return response(result, 200)
  } catch {
    if (timedOut) return response({ error: 'Lookup timed out' }, 504)
    if (request.signal.aborted) return response({ error: 'Lookup canceled' }, 499)
    return response({ error: 'Lookup source unavailable or invalid' }, 502)
  } finally {
    clearTimeout(timeout)
    request.signal.removeEventListener('abort', abort)
  }
}
