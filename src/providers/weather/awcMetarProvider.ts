import {
  ICAO_WEATHER_STATION_PATTERN,
  weatherObservationId,
  type FlightCategory,
  type WeatherObservation,
  type WeatherObservationDataset,
  type WeatherObservationSource,
  type WindDirection,
} from '../../domain/weatherObservations'
import {
  ProviderError,
  parseRetryAfterMs,
} from '../errors'
import { finiteNumber, isRecord, nonEmptyString } from '../guards'

export interface AwcMetarProviderConfig {
  endpointBaseUrl: string
  timeoutMs: number
  maximumBytes: number
  maximumStations: number
  futureToleranceMs: number
  sourceName: string
  sourceApiUrl: string
  sourceDocumentationUrl: string
  sourceTermsUrl: string
  sourceLicenseName: string
}

type MetarFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

interface AwcMetarProviderOptions {
  fetchImpl?: MetarFetch
  origin?: string
  now?: () => number
}

const MAX_RECORDS_PER_STATION = 2
const MAX_SITE_NAME_CHARACTERS = 160
const MAX_RAW_OBSERVATION_CHARACTERS = 512
const MAX_VISIBILITY_CHARACTERS = 24

const abortError = () =>
  new DOMException('The operation was aborted', 'AbortError')

const hasControlCharacter = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })

const boundedText = (
  value: unknown,
  maximumCharacters: number,
) => {
  const text = nonEmptyString(value)
  if (
    !text ||
    text.length > maximumCharacters ||
    hasControlCharacter(text)
  ) {
    return undefined
  }
  return text
}

const optionalNumber = (
  value: unknown,
  minimum: number,
  maximum: number,
) => {
  if (value === null || value === undefined) return undefined
  const number = finiteNumber(value)
  return number !== undefined && number >= minimum && number <= maximum
    ? number
    : undefined
}

const flightCategory = (value: unknown): FlightCategory => {
  const normalized =
    typeof value === 'string' ? value.trim().toUpperCase() : ''
  return ['VFR', 'MVFR', 'IFR', 'LIFR'].includes(normalized)
    ? (normalized as FlightCategory)
    : 'UNKNOWN'
}

const windDirection = (value: unknown): WindDirection | undefined => {
  if (value === 'VRB') return 'VRB'
  const direction = finiteNumber(value)
  return direction !== undefined &&
    Number.isInteger(direction) &&
    direction >= 0 &&
    direction <= 360
    ? direction
    : undefined
}

const visibility = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value
  }
  return boundedText(value, MAX_VISIBILITY_CHARACTERS)
}

const readBoundedBytes = async (
  response: Response,
  maximumBytes: number,
) => {
  const contentLength = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    await response.body?.cancel()
    throw new ProviderError('AWC METAR returned an oversized response')
  }
  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let receivedBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    receivedBytes += value.byteLength
    if (receivedBytes > maximumBytes) {
      await reader.cancel()
      throw new ProviderError('AWC METAR returned an oversized response')
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(receivedBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

const decodeUtf8 = (bytes: Uint8Array) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new ProviderError('AWC METAR returned invalid UTF-8')
  }
}

const parseObservation = (
  value: unknown,
  requestedIds: ReadonlySet<string>,
  retrievedAt: number,
  futureToleranceMs: number,
): WeatherObservation | null => {
  if (!isRecord(value)) return null

  const stationId = boundedText(value.icaoId, 4)
  if (!stationId || !ICAO_WEATHER_STATION_PATTERN.test(stationId)) {
    return null
  }
  if (!requestedIds.has(stationId)) {
    throw new ProviderError(
      `AWC METAR returned unrequested station ${stationId}`,
    )
  }

  const reportType = value.metarType
  if (reportType !== 'METAR' && reportType !== 'SPECI') return null

  const observationSeconds = finiteNumber(value.obsTime)
  const latitude = finiteNumber(value.lat)
  const longitude = finiteNumber(value.lon)
  const siteName = boundedText(value.name, MAX_SITE_NAME_CHARACTERS)
  const rawObservation = boundedText(
    value.rawOb,
    MAX_RAW_OBSERVATION_CHARACTERS,
  )
  if (
    observationSeconds === undefined ||
    !Number.isInteger(observationSeconds) ||
    observationSeconds <= 946_684_800 ||
    latitude === undefined ||
    latitude < -90 ||
    latitude > 90 ||
    longitude === undefined ||
    longitude < -180 ||
    longitude > 180 ||
    !siteName ||
    !rawObservation
  ) {
    return null
  }

  const observedAt = observationSeconds * 1_000
  if (
    !Number.isSafeInteger(observedAt) ||
    observedAt > retrievedAt + futureToleranceMs
  ) {
    return null
  }

  return {
    id: weatherObservationId(stationId),
    stationId,
    siteName,
    longitude,
    latitude,
    observedAt,
    reportType,
    flightCategory: flightCategory(value.fltCat),
    temperatureCelsius: optionalNumber(value.temp, -100, 70),
    dewpointCelsius: optionalNumber(value.dewp, -120, 70),
    windDirection: windDirection(value.wdir),
    windSpeedKnots: optionalNumber(value.wspd, 0, 300),
    windGustKnots: optionalNumber(value.wgst, 0, 400),
    visibility: visibility(value.visib),
    altimeterHpa: optionalNumber(value.altim, 800, 1_100),
    rawObservation,
  }
}

const canonicalStationIds = (
  stationIds: readonly string[],
  maximumStations: number,
) => {
  const normalized = [...stationIds]
  if (
    normalized.length > maximumStations ||
    normalized.some(
      (id) => !ICAO_WEATHER_STATION_PATTERN.test(id),
    ) ||
    normalized.some((id, index) => index > 0 && id <= normalized[index - 1]!)
  ) {
    throw new ProviderError('AWC METAR station IDs are invalid')
  }
  return normalized
}

export class AwcMetarProvider {
  private readonly config: AwcMetarProviderConfig
  private readonly fetchImpl: MetarFetch
  private readonly origin?: string
  private readonly now: () => number

  constructor(
    config: AwcMetarProviderConfig,
    options: AwcMetarProviderOptions = {},
  ) {
    this.config = config
    this.fetchImpl =
      options.fetchImpl ??
      ((input, init) => globalThis.fetch(input, init))
    this.origin = options.origin
    this.now = options.now ?? Date.now
  }

  private source(): WeatherObservationSource {
    return {
      name: this.config.sourceName,
      apiUrl: this.config.sourceApiUrl,
      documentationUrl: this.config.sourceDocumentationUrl,
      termsUrl: this.config.sourceTermsUrl,
      licenseName: this.config.sourceLicenseName,
    }
  }

  async load(
    stationIds: readonly string[],
    signal: AbortSignal,
  ): Promise<WeatherObservationDataset> {
    const canonicalIds = canonicalStationIds(
      stationIds,
      this.config.maximumStations,
    )
    if (signal.aborted) throw abortError()
    if (canonicalIds.length === 0) {
      return {
        observations: [],
        retrievedAt: this.now(),
        source: this.source(),
      }
    }

    const browserOrigin =
      this.origin ??
      (typeof location === 'undefined' ? undefined : location.origin)
    if (!browserOrigin) {
      throw new ProviderError(
        'AWC METAR requires a same-origin application endpoint',
      )
    }
    const applicationOrigin = new URL(browserOrigin).origin
    const url = new URL(this.config.endpointBaseUrl, applicationOrigin)
    if (
      url.origin !== applicationOrigin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new ProviderError(
        'AWC METAR endpoint must remain same-origin',
      )
    }
    url.search = new URLSearchParams({
      ids: canonicalIds.join(','),
    }).toString()

    const controller = new AbortController()
    const handleAbort = () => controller.abort(signal.reason)
    signal.addEventListener('abort', handleAbort, { once: true })
    let timedOut = false
    const timeout = globalThis.setTimeout(() => {
      timedOut = true
      controller.abort(new Error('AWC METAR timed out'))
    }, this.config.timeoutMs)

    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      const bytes = await readBoundedBytes(
        response,
        this.config.maximumBytes,
      )
      if (controller.signal.aborted) throw abortError()

      if (response.status !== 200 && response.status !== 204) {
        const body = decodeUtf8(bytes).trim().slice(0, 180)
        throw new ProviderError(
          `AWC METAR returned HTTP ${response.status}${
            body ? `: ${body}` : ''
          }`,
          response.status,
          parseRetryAfterMs(response.headers.get('retry-after')),
        )
      }

      const retrievedAt = this.now()
      if (response.status === 204) {
        return {
          observations: [],
          retrievedAt,
          source: this.source(),
        }
      }
      if (bytes.length === 0) {
        throw new ProviderError('AWC METAR returned an empty HTTP 200 body')
      }

      let payload: unknown
      try {
        payload = JSON.parse(decodeUtf8(bytes))
      } catch (error) {
        if (error instanceof ProviderError) throw error
        throw new ProviderError('AWC METAR returned invalid JSON')
      }
      if (
        !Array.isArray(payload) ||
        payload.length >
          canonicalIds.length * MAX_RECORDS_PER_STATION
      ) {
        throw new ProviderError('AWC METAR response shape is invalid')
      }

      const requestedIds = new Set(canonicalIds)
      const byStation = new Map<string, WeatherObservation>()
      for (const value of payload) {
        const observation = parseObservation(
          value,
          requestedIds,
          retrievedAt,
          this.config.futureToleranceMs,
        )
        if (!observation) continue
        const existing = byStation.get(observation.stationId)
        if (
          !existing ||
          observation.observedAt > existing.observedAt ||
          (observation.observedAt === existing.observedAt &&
            observation.rawObservation > existing.rawObservation)
        ) {
          byStation.set(observation.stationId, observation)
        }
      }
      if (payload.length > 0 && byStation.size === 0) {
        throw new ProviderError(
          'AWC METAR returned no valid observations',
        )
      }

      return {
        observations: [...byStation.values()].sort((first, second) =>
          first.stationId.localeCompare(second.stationId),
        ),
        retrievedAt,
        source: this.source(),
      }
    } catch (error) {
      if (timedOut) {
        throw new ProviderError(
          `AWC METAR timed out after ${this.config.timeoutMs} ms`,
        )
      }
      if (controller.signal.aborted) throw abortError()
      throw error
    } finally {
      globalThis.clearTimeout(timeout)
      signal.removeEventListener('abort', handleAbort)
    }
  }
}
