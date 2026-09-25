import type {
  FlightRouteAirport,
  FlightRouteErrorReason,
  FlightRouteIdentity,
  FlightRouteLookupResult,
} from '../../domain/flightRoute'
import { normalizeFlightRouteCallsign } from '../../domain/flightRoute'
import { distanceKm, isValidCoordinate } from '../../domain/geo'
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

  constructor(reason: FlightRouteErrorReason) {
    super(reason)
    this.name = 'FlightRouteProviderError'
    this.reason = reason
  }
}

const abortError = () =>
  new DOMException('The operation was aborted', 'AbortError')

const AIRPORT_ICAO = /^[A-Z0-9]{4}$/
const AIRPORT_IATA = /^[A-Z0-9]{3}$/
const EARTH_RADIUS_KM = 6_371
const MINIMUM_ROUTE_TOLERANCE_KM = 50 * 1.852
const ROUTE_DISTANCE_TOLERANCE_RATIO = 0.2
const MAXIMUM_ROUTE_AIRPORTS = 16

const validText = (
  value: unknown,
  maximumLength: number,
): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= maximumLength &&
  value === value.trim()

interface RouteAirport {
  display: FlightRouteAirport
  latitude: number
  longitude: number
}

const normalizedCode = (
  value: unknown,
  pattern: RegExp,
): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toUpperCase()
  return pattern.test(normalized) ? normalized : undefined
}

const parseAirport = (value: unknown): RouteAirport | undefined => {
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
    display: {
      name: value.name,
      code: iata ?? icao,
    },
    latitude: value.lat,
    longitude: value.lon,
  }
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

const initialBearing = (
  from: Pick<RouteAirport, 'latitude' | 'longitude'>,
  to: Pick<RouteAirport, 'latitude' | 'longitude'>,
) => {
  const fromLatitude = toRadians(from.latitude)
  const toLatitude = toRadians(to.latitude)
  const longitudeDelta = toRadians(to.longitude - from.longitude)
  return Math.atan2(
    Math.sin(longitudeDelta) * Math.cos(toLatitude),
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
      Math.sin(fromLatitude) *
        Math.cos(toLatitude) *
        Math.cos(longitudeDelta),
  )
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

const isPositionNearSegment = (
  position: Pick<RouteAirport, 'latitude' | 'longitude'>,
  start: RouteAirport,
  end: RouteAirport,
) => {
  const segmentDistanceKm = distanceKm(start, end)
  const toleranceKm = Math.max(
    MINIMUM_ROUTE_TOLERANCE_KM,
    segmentDistanceKm * ROUTE_DISTANCE_TOLERANCE_RATIO,
  )
  if (
    distanceKm(position, start) <= toleranceKm ||
    distanceKm(position, end) <= toleranceKm
  ) {
    return true
  }

  if (segmentDistanceKm === 0) return false

  const startToPosition =
    distanceKm(start, position) / EARTH_RADIUS_KM
  const bearingToPosition = initialBearing(start, position)
  const bearingToEnd = initialBearing(start, end)
  const bearingDelta = bearingToPosition - bearingToEnd
  const crossTrackAngle = Math.asin(
    clamp(
      Math.sin(startToPosition) * Math.sin(bearingDelta),
      -1,
      1,
    ),
  )
  const alongTrackKm =
    Math.atan2(
      Math.sin(startToPosition) * Math.cos(bearingDelta),
      Math.cos(startToPosition),
    ) * EARTH_RADIUS_KM

  return (
    alongTrackKm >= 0 &&
    alongTrackKm <= segmentDistanceKm &&
    Math.abs(crossTrackAngle) * EARTH_RADIUS_KM <= toleranceKm
  )
}

const isPlausibleRoute = (
  identity: FlightRouteIdentity,
  airports: readonly RouteAirport[],
) => {
  const position = {
    latitude: identity.latitude,
    longitude: identity.longitude,
  }
  for (let index = 0; index < airports.length - 1; index += 1) {
    const start = airports[index]
    const end = airports[index + 1]
    if (start && end && isPositionNearSegment(position, start, end)) {
      return true
    }
  }
  return false
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
  const parsedAirports = airports as RouteAirport[]
  if (!isPlausibleRoute(identity, parsedAirports)) {
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
      departure: departure.display,
      arrival: arrival.display,
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
        await response.body?.cancel()
        throw new FlightRouteProviderError('quota-exhausted')
      }
      if (response.status === 404) {
        await response.body?.cancel()
        return { kind: 'unavailable', reason: 'not-found' }
      }
      if (!response.ok) {
        await response.body?.cancel()
        throw new FlightRouteProviderError('provider-error')
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
