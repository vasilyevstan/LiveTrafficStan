import type {
  FlightRouteQuotaNamespace,
} from './flightRouteQuota.js'
import {
  FLIGHT_ROUTE_QUOTA_OBJECT_NAME,
  FLIGHT_ROUTE_QUOTA_WINDOW_MS,
} from './flightRouteQuota.js'

export const FLIGHT_ROUTE_PATH = '/api/flight-route'
export const AVIATIONSTACK_FLIGHTS_URL =
  'https://api.aviationstack.com/v1/flights'
export const FLIGHT_ROUTE_TIMEOUT_MS = 10_000
export const MAX_FLIGHT_ROUTE_REQUEST_BYTES = 1_024
export const MAX_FLIGHT_ROUTE_RESPONSE_BYTES = 512 * 1_024

export interface FlightRouteWorkerEnv {
  AVIATIONSTACK_ENABLED?: string
  AVIATIONSTACK_ACCESS_KEY?: string
  FLIGHT_ROUTE_QUOTA?: FlightRouteQuotaNamespace
}

export type FlightRouteFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

interface FlightRouteOptions {
  fetchImpl?: FlightRouteFetch
  timeoutMs?: number
  maxRequestBytes?: number
  maxResponseBytes?: number
}

interface FlightRouteIdentity {
  callsign: string
  icao24: string
  registration?: string
}

interface FlightRouteAirport {
  name: string
  code?: string
}

interface MatchedRoute {
  flightIcao: string
  flightIata?: string
  flightStatus: 'active'
  departure: FlightRouteAirport
  arrival: FlightRouteAirport
  providerUpdatedAt?: number
}

class RequestTooLargeError extends Error {}
class ResponseTooLargeError extends Error {}
class InvalidBodyError extends Error {}
class UnsupportedMediaTypeError extends Error {}

const ICAO24 = /^[0-9A-F]{6}$/
const ICAO_FLIGHT = /^[A-Z]{3}[A-Z0-9]{1,5}$/
const AIRPORT_CODE = /^[A-Z0-9]{2,8}$/
const FLIGHT_IATA = /^[A-Z0-9]{2,8}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const jsonResponse = (
  value: unknown,
  status: number,
  headers?: Record<string, string>,
) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  })

const errorResponse = (
  error: string,
  status: number,
  headers?: Record<string, string>,
) => jsonResponse({ error }, status, headers)

const readBoundedStream = async (
  stream: ReadableStream<Uint8Array> | null,
  declaredLength: string | null,
  maximumBytes: number,
  tooLarge: () => Error,
  abort?: () => void,
) => {
  if (declaredLength !== null) {
    const bytes = Number(declaredLength)
    if (
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      bytes > maximumBytes
    ) {
      abort?.()
      throw tooLarge()
    }
  }
  if (!stream) return new Uint8Array()

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      totalBytes += value.byteLength
      if (totalBytes > maximumBytes) {
        abort?.()
        void reader.cancel()
        throw tooLarge()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

const decodeJson = (bytes: Uint8Array) => {
  try {
    return JSON.parse(
      new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: false,
      }).decode(bytes),
    )
  } catch {
    throw new InvalidBodyError()
  }
}

const printableText = (
  value: unknown,
  maximumLength: number,
): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized || normalized.length > maximumLength) return undefined
  return [...normalized].every((character) => {
    const code = character.codePointAt(0)
    return code !== undefined && code >= 0x20 && code <= 0x7e
  })
    ? normalized
    : undefined
}

const parseIdentity = async (
  request: Request,
  maximumBytes: number,
): Promise<FlightRouteIdentity> => {
  if (request.headers.has('Content-Encoding')) {
    throw new UnsupportedMediaTypeError()
  }
  const contentType = request.headers.get('Content-Type') ?? ''
  if (
    contentType.split(';', 1)[0]?.trim().toLowerCase() !==
    'application/json'
  ) {
    throw new UnsupportedMediaTypeError()
  }

  const value = decodeJson(
    await readBoundedStream(
      request.body,
      request.headers.get('Content-Length'),
      maximumBytes,
      () => new RequestTooLargeError(),
    ),
  )
  if (!isRecord(value)) throw new InvalidBodyError()

  const keys = Object.keys(value).sort()
  if (
    keys.length < 2 ||
    keys.length > 3 ||
    keys[0] !== 'callsign' ||
    keys[1] !== 'icao24' ||
    (keys.length === 3 && keys[2] !== 'registration')
  ) {
    throw new InvalidBodyError()
  }

  const callsign = printableText(value.callsign, 8)?.toUpperCase()
  const icao24 = printableText(value.icao24, 6)?.toUpperCase()
  const registration =
    value.registration === undefined
      ? undefined
      : printableText(value.registration, 32)?.toUpperCase()
  if (
    !callsign ||
    !ICAO_FLIGHT.test(callsign) ||
    !/\d/.test(callsign.slice(3)) ||
    !icao24 ||
    !ICAO24.test(icao24) ||
    (value.registration !== undefined && !registration)
  ) {
    throw new InvalidBodyError()
  }

  return { callsign, icao24, registration }
}

const reserveQuota = async (
  namespace: FlightRouteQuotaNamespace,
) => {
  const objectId = namespace.idFromName(
    FLIGHT_ROUTE_QUOTA_OBJECT_NAME,
  )
  const response = await namespace.get(objectId).fetch(
    new Request('https://flight-route-quota.internal/reserve', {
      method: 'POST',
    }),
  )
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After') ?? ''
    await response.body?.cancel()
    return {
      allowed: false as const,
      retryAfter: /^\d+$/.test(retryAfter)
        ? retryAfter
        : String(Math.ceil(FLIGHT_ROUTE_QUOTA_WINDOW_MS / 1_000)),
    }
  }
  if (response.status !== 200) {
    await response.body?.cancel()
    throw new Error('Quota unavailable')
  }

  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    await response.body?.cancel()
    throw new Error('Quota unavailable')
  }
  const value = decodeJson(
    await readBoundedStream(
      response.body,
      response.headers.get('Content-Length'),
      1_024,
      () => new ResponseTooLargeError(),
    ),
  )
  if (!isRecord(value) || value.allowed !== true) {
    throw new Error('Quota unavailable')
  }
  return { allowed: true as const }
}

const integer = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0

const normalizedCode = (
  value: unknown,
  pattern: RegExp,
): string | undefined => {
  const normalized = printableText(value, 8)?.toUpperCase()
  return normalized && pattern.test(normalized)
    ? normalized
    : undefined
}

const parseAirport = (value: unknown): FlightRouteAirport | undefined => {
  if (!isRecord(value)) return undefined
  const name = printableText(value.airport, 160)
  const iata = normalizedCode(value.iata, AIRPORT_CODE)
  const icao = normalizedCode(value.icao, AIRPORT_CODE)
  const code = iata ?? icao
  if (!name && !code) return undefined
  return {
    name: name ?? code!,
    code,
  }
}

const optionalProviderUpdatedAt = (value: unknown) => {
  if (!isRecord(value)) return undefined
  const updated = printableText(value.updated, 64)
  if (!updated) return undefined
  const timestamp = Date.parse(updated)
  return Number.isSafeInteger(timestamp) && timestamp > 0
    ? timestamp
    : undefined
}

const matchRoute = (
  value: unknown,
  identity: FlightRouteIdentity,
): MatchedRoute | undefined => {
  if (!isRecord(value) || value.flight_status !== 'active') {
    return undefined
  }
  if (!isRecord(value.flight) || value.flight.codeshared !== null) {
    return undefined
  }
  const flightIcao = normalizedCode(value.flight.icao, ICAO_FLIGHT)
  if (flightIcao !== identity.callsign) return undefined

  if (!isRecord(value.aircraft)) return undefined
  const icao24 = normalizedCode(value.aircraft.icao24, ICAO24)
  if (icao24 !== identity.icao24) return undefined
  const registration = printableText(
    value.aircraft.registration,
    32,
  )?.toUpperCase()
  if (
    identity.registration &&
    registration &&
    registration !== identity.registration
  ) {
    return undefined
  }

  const departure = parseAirport(value.departure)
  const arrival = parseAirport(value.arrival)
  if (!departure || !arrival) return undefined

  return {
    flightIcao,
    flightIata: normalizedCode(value.flight.iata, FLIGHT_IATA),
    flightStatus: 'active',
    departure,
    arrival,
    providerUpdatedAt: optionalProviderUpdatedAt(value.live),
  }
}

const parseProviderResponse = (
  value: unknown,
  identity: FlightRouteIdentity,
) => {
  if (
    !isRecord(value) ||
    (value.error !== undefined && value.error !== null) ||
    !isRecord(value.pagination) ||
    !Array.isArray(value.data)
  ) {
    throw new InvalidBodyError()
  }

  const { limit, offset, count, total } = value.pagination
  if (
    !integer(limit) ||
    limit !== 100 ||
    !integer(offset) ||
    offset !== 0 ||
    !integer(count) ||
    count !== value.data.length ||
    !integer(total) ||
    total < count
  ) {
    throw new InvalidBodyError()
  }
  if (total > value.data.length || total > limit) {
    return {
      status: 'unavailable' as const,
      reason: 'incomplete' as const,
    }
  }

  const matches = value.data
    .map((row) => matchRoute(row, identity))
    .filter((route): route is MatchedRoute => route !== undefined)
  if (matches.length === 0) {
    return {
      status: 'unavailable' as const,
      reason: 'not-found' as const,
    }
  }
  if (matches.length > 1) {
    return {
      status: 'unavailable' as const,
      reason: 'ambiguous' as const,
    }
  }
  return {
    status: 'route' as const,
    route: matches[0]!,
  }
}

export const handleFlightRoute = async (
  request: Request,
  env: FlightRouteWorkerEnv,
  options: FlightRouteOptions = {},
) => {
  const url = new URL(request.url)
  if (url.pathname !== FLIGHT_ROUTE_PATH) {
    return errorResponse('not-found', 404)
  }
  if (env.AVIATIONSTACK_ENABLED !== 'true') {
    return errorResponse('not-found', 404)
  }
  if (url.search) {
    return errorResponse('invalid-request', 400)
  }
  if (request.method !== 'POST') {
    return errorResponse('method-not-allowed', 405, { Allow: 'POST' })
  }
  const accessKey = env.AVIATIONSTACK_ACCESS_KEY?.trim()
  if (!accessKey || !env.FLIGHT_ROUTE_QUOTA) {
    return errorResponse('route-unavailable', 503)
  }
  if (request.signal.aborted) {
    return errorResponse('request-canceled', 499)
  }

  let identity: FlightRouteIdentity
  try {
    identity = await parseIdentity(
      request,
      options.maxRequestBytes ?? MAX_FLIGHT_ROUTE_REQUEST_BYTES,
    )
  } catch (error) {
    if (request.signal.aborted) {
      return errorResponse('request-canceled', 499)
    }
    return errorResponse(
      error instanceof RequestTooLargeError
        ? 'request-too-large'
        : error instanceof UnsupportedMediaTypeError
          ? 'unsupported-media-type'
          : 'invalid-request',
      error instanceof RequestTooLargeError
        ? 413
        : error instanceof UnsupportedMediaTypeError
          ? 415
          : 400,
    )
  }
  if (request.signal.aborted) {
    return errorResponse('request-canceled', 499)
  }

  try {
    const quota = await reserveQuota(env.FLIGHT_ROUTE_QUOTA)
    if (!quota.allowed) {
      return errorResponse('quota-exhausted', 429, {
        'Retry-After': quota.retryAfter,
      })
    }
  } catch {
    return errorResponse('route-unavailable', 503)
  }

  if (request.signal.aborted) {
    return errorResponse('request-canceled', 499)
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const controller = new AbortController()
  let timedOut = false
  const handleClientAbort = () => controller.abort(request.signal.reason)
  request.signal.addEventListener('abort', handleClientAbort, {
    once: true,
  })
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('Aviationstack request timed out'))
  }, options.timeoutMs ?? FLIGHT_ROUTE_TIMEOUT_MS)

  const upstreamUrl = new URL(AVIATIONSTACK_FLIGHTS_URL)
  upstreamUrl.search = new URLSearchParams({
    access_key: accessKey,
    flight_icao: identity.callsign,
    flight_status: 'active',
    limit: '100',
  }).toString()

  try {
    const upstream = await fetchImpl(upstreamUrl, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'manual',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    })
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel()
      return errorResponse('provider-error', 502)
    }
    if (upstream.status < 200 || upstream.status >= 300) {
      await upstream.body?.cancel()
      return errorResponse('provider-error', 502)
    }

    const contentType = upstream.headers.get('Content-Type') ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      await upstream.body?.cancel()
      return errorResponse('provider-error', 502)
    }
    const body = await readBoundedStream(
      upstream.body,
      upstream.headers.get('Content-Length'),
      options.maxResponseBytes ?? MAX_FLIGHT_ROUTE_RESPONSE_BYTES,
      () => new ResponseTooLargeError(),
      () => controller.abort(new ResponseTooLargeError()),
    )
    if (timedOut) return errorResponse('provider-timeout', 504)
    if (request.signal.aborted) {
      return errorResponse('request-canceled', 499)
    }

    return jsonResponse(
      parseProviderResponse(decodeJson(body), identity),
      200,
    )
  } catch (error) {
    if (timedOut) return errorResponse('provider-timeout', 504)
    if (request.signal.aborted) {
      return errorResponse('request-canceled', 499)
    }
    return errorResponse(
      error instanceof ResponseTooLargeError
        ? 'provider-response-too-large'
        : 'provider-error',
      502,
    )
  } finally {
    clearTimeout(timeout)
    request.signal.removeEventListener('abort', handleClientAbort)
  }
}
