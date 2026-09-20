import type {
  FlightRouteAirport,
  FlightRouteErrorReason,
  FlightRouteIdentity,
  FlightRouteLookupResult,
} from '../../domain/flightRoute'
import { isRecord } from '../guards'

export interface AviationstackFlightRouteProviderConfig {
  endpointUrl: string
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

const FLIGHT_ICAO = /^[A-Z]{3}[A-Z0-9]{1,5}$/
const FLIGHT_IATA = /^[A-Z0-9]{2,8}$/
const AIRPORT_CODE = /^[A-Z0-9]{2,8}$/

const validText = (
  value: unknown,
  maximumLength: number,
): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= maximumLength &&
  value === value.trim()

const parseAirport = (value: unknown): FlightRouteAirport | undefined => {
  if (
    !isRecord(value) ||
    !validText(value.name, 160) ||
    (value.code !== undefined &&
      (!validText(value.code, 8) || !AIRPORT_CODE.test(value.code)))
  ) {
    return undefined
  }
  return {
    name: value.name,
    code: value.code,
  }
}

const parseLookupResult = (
  value: unknown,
  config: AviationstackFlightRouteProviderConfig,
  identity: FlightRouteIdentity,
): FlightRouteLookupResult => {
  if (!isRecord(value) || typeof value.status !== 'string') {
    throw new FlightRouteProviderError('provider-error')
  }
  if (value.status === 'unavailable') {
    if (
      value.reason !== 'not-found' &&
      value.reason !== 'ambiguous' &&
      value.reason !== 'incomplete'
    ) {
      throw new FlightRouteProviderError('provider-error')
    }
    return {
      kind: 'unavailable',
      reason: value.reason,
    }
  }
  if (value.status !== 'route' || !isRecord(value.route)) {
    throw new FlightRouteProviderError('provider-error')
  }

  const departure = parseAirport(value.route.departure)
  const arrival = parseAirport(value.route.arrival)
  const providerUpdatedAt = value.route.providerUpdatedAt
  if (
    !validText(value.route.flightIcao, 8) ||
    !FLIGHT_ICAO.test(value.route.flightIcao) ||
    value.route.flightIcao !== identity.callsign ||
    (value.route.flightIata !== undefined &&
      (!validText(value.route.flightIata, 8) ||
        !FLIGHT_IATA.test(value.route.flightIata))) ||
    value.route.flightStatus !== 'active' ||
    !departure ||
    !arrival ||
    (providerUpdatedAt !== undefined &&
      (typeof providerUpdatedAt !== 'number' ||
        !Number.isSafeInteger(providerUpdatedAt) ||
        providerUpdatedAt <= 0))
  ) {
    throw new FlightRouteProviderError('provider-error')
  }

  return {
    kind: 'available',
    route: {
      flightIcao: value.route.flightIcao,
      flightIata: value.route.flightIata,
      flightStatus: 'active',
      departure,
      arrival,
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

export class AviationstackFlightRouteProvider
  implements FlightRouteProvider
{
  private readonly config: AviationstackFlightRouteProviderConfig

  constructor(config: AviationstackFlightRouteProviderConfig) {
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
      const response = await fetch(this.config.endpointUrl, {
        method: 'POST',
        signal: controller.signal,
        redirect: 'manual',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(identity),
      })
      if (response.status === 429) {
        await response.body?.cancel()
        throw new FlightRouteProviderError('quota-exhausted')
      }
      if (response.status === 404 || response.status === 503) {
        await response.body?.cancel()
        throw new FlightRouteProviderError('configuration')
      }
      if (!response.ok) {
        await response.body?.cancel()
        throw new FlightRouteProviderError('provider-error')
      }

      return parseLookupResult(
        await readBoundedJson(response, this.config.maximumBytes),
        this.config,
        identity,
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
