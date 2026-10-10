import type {
  FlightRouteAirport,
  FlightRouteErrorReason,
  FlightRouteIdentity,
  FlightRouteLookupResult,
} from '../../domain/flightRoute'
import { flightRouteLegIndices, normalizeFlightRouteCallsign } from '../../domain/flightRoute'
import { isValidCoordinate } from '../../domain/geo'
import { parseRetryAfterMs } from '../errors'
import { isRecord } from '../guards'

export interface AdsbLolFlightRouteProviderConfig {
  endpointBaseUrl: string
  timeoutMs: number
  maximumBytes: number
  sourceName: string
  sourceWebsiteUrl: string
}

export interface FlightRouteProvider {
  lookup(
    identity: FlightRouteIdentity,
    signal: AbortSignal,
  ): Promise<FlightRouteLookupResult>
}

export class FlightRouteProviderError extends Error {
  readonly reason: FlightRouteErrorReason
  readonly retryAfterMs?: number

  constructor(
    reason: FlightRouteErrorReason,
    retryAfterMs?: number,
  ) {
    super(reason)
    this.name = 'FlightRouteProviderError'
    this.reason = reason
    this.retryAfterMs = retryAfterMs
  }
}

const abortError = () =>
  new DOMException('The operation was aborted', 'AbortError')

const AIRPORT_ICAO = /^[A-Z0-9]{4}$/
const AIRPORT_IATA = /^[A-Z0-9]{3}$/
const MAXIMUM_ROUTE_AIRPORTS = 16

const validText = (
  value: unknown,
  maximumLength: number,
): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= maximumLength &&
  value === value.trim()

const normalizedCode = (
  value: unknown,
  pattern: RegExp,
): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toUpperCase()
  return pattern.test(normalized) ? normalized : undefined
}

const parseAirport = (value: unknown): FlightRouteAirport | undefined => {
  if (
    !isRecord(value) ||
    !validText(value.name, 160) ||
    typeof value.lat !== 'number' ||
    typeof value.lon !== 'number' ||
    !isValidCoordinate(value.lat, value.lon)
  ) {
    return undefined
  }

  const icao = normalizedCode(value.icao, AIRPORT_ICAO)
  const iata = normalizedCode(value.iata, AIRPORT_IATA)
  if (!icao) return undefined

  return {
    name: value.name,
    code: iata ?? icao,
    icao,
    latitude: value.lat,
    longitude: value.lon,
  }
}

const parseLookupResult = (
  value: unknown,
  config: AdsbLolFlightRouteProviderConfig,
  identity: FlightRouteIdentity,
  providerUpdatedAt: number | undefined,
): FlightRouteLookupResult => {
  if (!isRecord(value)) {
    throw new FlightRouteProviderError('provider-error')
  }

  const callsign =
    typeof value.callsign === 'string'
      ? normalizeFlightRouteCallsign(value.callsign)
      : undefined
  if (
    !callsign ||
    callsign !== identity.callsign ||
    !Array.isArray(value._airports) ||
    value._airports.length > MAXIMUM_ROUTE_AIRPORTS
  ) {
    throw new FlightRouteProviderError('provider-error')
  }

  if (value._airports.length < 2) {
    return { kind: 'unavailable', reason: 'incomplete' }
  }
  const airports = value._airports.map(parseAirport)
  if (airports.some((airport) => airport === undefined)) {
    throw new FlightRouteProviderError('provider-error')
  }
  const parsedAirports = airports.filter(
    (airport): airport is FlightRouteAirport => airport !== undefined,
  )
  if (flightRouteLegIndices(parsedAirports, identity).length === 0) {
    return { kind: 'unavailable', reason: 'implausible' }
  }

  const departure = parsedAirports[0]
  const arrival = parsedAirports.at(-1)
  if (!departure || !arrival) {
    return { kind: 'unavailable', reason: 'incomplete' }
  }

  return {
    kind: 'available',
    route: {
      flightIcao: callsign,
      confidence: 'plausible',
      departure,
      arrival,
      airports: parsedAirports,
      providerUpdatedAt,
      source: {
        name: config.sourceName,
        websiteUrl: config.sourceWebsiteUrl,
      },
    },
  }
}

const readBoundedJson = async (
  response: Response,
  maximumBytes: number,
) => {
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    await response.body?.cancel()
    throw new FlightRouteProviderError('provider-error')
  }
  const contentLength = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    await response.body?.cancel()
    throw new FlightRouteProviderError('provider-error')
  }
  if (!response.body) {
    throw new FlightRouteProviderError('provider-error')
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > maximumBytes) {
      await reader.cancel()
      throw new FlightRouteProviderError('provider-error')
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new FlightRouteProviderError('provider-error')
  }
}

const parseLastModified = (value: string | null) => {
  if (!value) return undefined
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp > 0
    ? timestamp
    : undefined
}

const routeUrl = (
  endpointBaseUrl: string,
  callsign: string,
) =>
  new URL(
    `${callsign.slice(0, 2)}/${callsign}.json`,
    `${endpointBaseUrl.replace(/\/+$/, '')}/`,
  )

export class AdsbLolFlightRouteProvider
  implements FlightRouteProvider
{
  private readonly config: AdsbLolFlightRouteProviderConfig

  constructor(config: AdsbLolFlightRouteProviderConfig) {
    this.config = config
  }

  async lookup(
    identity: FlightRouteIdentity,
    signal: AbortSignal,
  ): Promise<FlightRouteLookupResult> {
    if (signal.aborted) throw abortError()

    const controller = new AbortController()
    let timedOut = false
    const handleAbort = () => controller.abort(signal.reason)
    signal.addEventListener('abort', handleAbort, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort(new Error('Flight route request timed out'))
    }, this.config.timeoutMs)

    try {
      const response = await fetch(
        routeUrl(this.config.endpointBaseUrl, identity.callsign),
        {
          method: 'GET',
          signal: controller.signal,
          redirect: 'error',
          cache: 'no-store',
          credentials: 'omit',
          headers: {
            Accept: 'application/json',
          },
        },
      )
      if (response.status === 429) {
        const retryAfterMs = parseRetryAfterMs(
          response.headers.get('Retry-After'),
        )
        await response.body?.cancel()
        throw new FlightRouteProviderError(
          'quota-exhausted',
          retryAfterMs,
        )
      }
      if (response.status === 404) {
        await response.body?.cancel()
        return { kind: 'unavailable', reason: 'not-found' }
      }
      if (!response.ok) {
        const retryAfterMs = parseRetryAfterMs(
          response.headers.get('Retry-After'),
        )
        await response.body?.cancel()
        throw new FlightRouteProviderError(
          'provider-error',
          retryAfterMs,
        )
      }

      return parseLookupResult(
        await readBoundedJson(response, this.config.maximumBytes),
        this.config,
        identity,
        parseLastModified(response.headers.get('Last-Modified')),
      )
    } catch (error) {
      if (signal.aborted) throw abortError()
      if (error instanceof FlightRouteProviderError) throw error
      if (timedOut) {
        throw new FlightRouteProviderError('provider-error')
      }
      throw new FlightRouteProviderError('provider-error')
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', handleAbort)
    }
  }
}
