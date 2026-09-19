import type { Airport, AirportDataset } from '../../domain/airports'
import { isRecord } from '../guards'

const SHA_256 = /^[0-9a-f]{64}$/
const ALLOWED_PROPERTIES = new Set([
  'name',
  'kind',
  'ident',
  'municipality',
  'isoCountry',
  'icaoCode',
  'iataCode',
])
const REQUIRED_PROPERTIES = ['name', 'kind', 'ident', 'isoCountry']
const hasControlCharacter = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })

const validText = (
  value: unknown,
  maximumLength: number,
): value is string =>
  typeof value === 'string' &&
  value === value.trim() &&
  value.length > 0 &&
  value.length <= maximumLength &&
  !hasControlCharacter(value)

export interface StaticAirportsProviderConfig {
  assetUrl: string
  timeoutMs: number
  maximumBytes: number
  schemaVersion: number
  outputVersion: string
  sourceName: string
  sourceRepositoryUrl: string
  sourceCommit: string
  sourcePublishedAt: string
  sourceTermsUrl: string
  sourceDocumentationUrl: string
  sourceLicenseName: string
  expectedBytes: number
  expectedRecords: number
  expectedSha256: string
  expectedKindCounts: Record<string, number>
}

export class StaticAirportsProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StaticAirportsProviderError'
  }
}

const abortError = () =>
  new DOMException('The operation was aborted', 'AbortError')

const readBoundedResponse = async (
  response: Response,
  maximumBytes: number,
) => {
  if (!response.ok) {
    await response.body?.cancel()
    throw new StaticAirportsProviderError(
      `Airport data returned HTTP ${response.status}`,
    )
  }
  const contentLength = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    await response.body?.cancel()
    throw new StaticAirportsProviderError(
      `Airport data exceeded the ${maximumBytes}-byte limit`,
    )
  }
  if (!response.body) {
    throw new StaticAirportsProviderError('Airport data returned no body')
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let receivedBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    receivedBytes += value.byteLength
    if (receivedBytes > maximumBytes) {
      await reader.cancel()
      throw new StaticAirportsProviderError(
        `Airport data exceeded the ${maximumBytes}-byte limit`,
      )
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

const sha256 = async (bytes: Uint8Array) => {
  if (!globalThis.crypto?.subtle) {
    throw new StaticAirportsProviderError(
      'Airport data integrity checking is unavailable',
    )
  }
  const digestInput = new Uint8Array(bytes.byteLength)
  digestInput.set(bytes)
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    digestInput.buffer,
  )
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

const decodeJson = (bytes: Uint8Array) => {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new StaticAirportsProviderError(
      'Airport data was not valid UTF-8',
    )
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new StaticAirportsProviderError('Airport data was not valid JSON')
  }
}

const validateAirports = (
  value: unknown,
  config: StaticAirportsProviderConfig,
): Airport[] => {
  if (
    !isRecord(value) ||
    value.type !== 'FeatureCollection' ||
    !Array.isArray(value.features) ||
    value.features.length !== config.expectedRecords
  ) {
    throw new StaticAirportsProviderError(
      'Airport data collection shape is invalid',
    )
  }

  const airports: Airport[] = []
  const kindCounts: Record<string, number> = {}
  let previousId = 0
  for (const feature of value.features) {
    if (
      !isRecord(feature) ||
      feature.type !== 'Feature' ||
      typeof feature.id !== 'string' ||
      !/^[1-9][0-9]*$/.test(feature.id)
    ) {
      throw new StaticAirportsProviderError(
        'Airport data feature is invalid',
      )
    }
    const properties = feature.properties
    const geometry = feature.geometry
    if (
      !isRecord(properties) ||
      !isRecord(geometry) ||
      geometry.type !== 'Point' ||
      !Array.isArray(geometry.coordinates) ||
      geometry.coordinates.length !== 2
    ) {
      throw new StaticAirportsProviderError(
        'Airport data feature is invalid',
      )
    }

    const propertyKeys = Object.keys(properties)
    if (
      propertyKeys.some((key) => !ALLOWED_PROPERTIES.has(key)) ||
      REQUIRED_PROPERTIES.some(
        (key) => !Object.hasOwn(properties, key),
      )
    ) {
      throw new StaticAirportsProviderError(
        'Airport data feature is invalid',
      )
    }

    const id = Number(feature.id)
    const name = properties.name
    const kind = properties.kind
    const ident = properties.ident
    const municipality = properties.municipality
    const isoCountry = properties.isoCountry
    const icaoCode = properties.icaoCode
    const iataCode = properties.iataCode
    const [longitude, latitude] = geometry.coordinates
    if (
      !Number.isSafeInteger(id) ||
      id <= previousId ||
      !validText(name, 160) ||
      (kind !== 'large' && kind !== 'medium') ||
      !validText(ident, 16) ||
      (municipality !== undefined && !validText(municipality, 120)) ||
      typeof isoCountry !== 'string' ||
      !/^[A-Z]{2}$/.test(isoCountry) ||
      (icaoCode !== undefined &&
        (typeof icaoCode !== 'string' ||
          !/^[A-Z0-9]{4}$/.test(icaoCode))) ||
      (iataCode !== undefined &&
        (typeof iataCode !== 'string' ||
          !/^[A-Z0-9]{3}$/.test(iataCode))) ||
      typeof longitude !== 'number' ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      typeof latitude !== 'number' ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new StaticAirportsProviderError(
        'Airport data feature is invalid',
      )
    }

    previousId = id
    kindCounts[kind] = (kindCounts[kind] ?? 0) + 1
    airports.push({
      id: feature.id,
      name,
      kind,
      ident,
      municipality,
      isoCountry,
      icaoCode,
      iataCode,
      longitude,
      latitude,
    })
  }

  if (
    kindCounts.large !== config.expectedKindCounts.large ||
    kindCounts.medium !== config.expectedKindCounts.medium
  ) {
    throw new StaticAirportsProviderError(
      'Airport data kind distribution is invalid',
    )
  }
  return airports
}

export class StaticAirportsProvider {
  private readonly config: StaticAirportsProviderConfig
  private fulfilled?: AirportDataset

  constructor(config: StaticAirportsProviderConfig) {
    if (
      config.schemaVersion !== 1 ||
      !Number.isSafeInteger(config.expectedBytes) ||
      config.expectedBytes <= 0 ||
      config.expectedBytes > config.maximumBytes ||
      !SHA_256.test(config.expectedSha256)
    ) {
      throw new StaticAirportsProviderError(
        'Airport data provider configuration is invalid',
      )
    }
    this.config = config
  }

  async load(signal: AbortSignal): Promise<AirportDataset> {
    if (this.fulfilled) return this.fulfilled
    if (signal.aborted) throw abortError()

    const controller = new AbortController()
    const handleAbort = () => controller.abort()
    signal.addEventListener('abort', handleAbort, { once: true })
    let timedOut = false
    const timeout = globalThis.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.config.timeoutMs)

    try {
      const response = await globalThis.fetch(this.config.assetUrl, {
        signal: controller.signal,
        credentials: 'same-origin',
        headers: { Accept: 'application/geo+json, application/json' },
      })
      const bytes = await readBoundedResponse(
        response,
        this.config.maximumBytes,
      )
      if (bytes.byteLength !== this.config.expectedBytes) {
        throw new StaticAirportsProviderError(
          'Airport data byte count does not match the pinned projection',
        )
      }
      if (controller.signal.aborted) throw abortError()
      const actualSha256 = await sha256(bytes)
      if (controller.signal.aborted) throw abortError()
      if (actualSha256 !== this.config.expectedSha256) {
        throw new StaticAirportsProviderError(
          'Airport data SHA-256 does not match the pinned projection',
        )
      }
      const airports = validateAirports(decodeJson(bytes), this.config)
      if (controller.signal.aborted) throw abortError()
      const dataset = {
        airports,
        source: {
          name: this.config.sourceName,
          repositoryUrl: this.config.sourceRepositoryUrl,
          commit: this.config.sourceCommit,
          publishedAt: this.config.sourcePublishedAt,
          termsUrl: this.config.sourceTermsUrl,
          documentationUrl: this.config.sourceDocumentationUrl,
          licenseName: this.config.sourceLicenseName,
          outputVersion: this.config.outputVersion,
        },
      }
      this.fulfilled = dataset
      return dataset
    } catch (error) {
      if (timedOut) {
        throw new StaticAirportsProviderError(
          `Airport data timed out after ${this.config.timeoutMs} ms`,
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
