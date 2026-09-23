import type {
  AircraftPhoto,
  AircraftPhotoIdentity,
  AircraftPhotoLookupResult,
  AircraftPhotoSource,
  AircraftPhotoErrorReason,
} from '../../domain/aircraftPhoto'
import { isRecord } from '../guards'
import { parseRetryAfterMs } from '../errors'

export interface PlanespottersPhotoProviderConfig {
  endpointBaseUrl: string
  timeoutMs: number
  maximumBytes: number
  thumbnailOrigins: readonly string[]
  photoPageOrigin: string
  sourceName: string
  sourceWebsiteUrl: string
  sourceTermsUrl: string
}

export interface AircraftPhotoProvider {
  lookup(
    identity: AircraftPhotoIdentity,
    signal: AbortSignal,
  ): Promise<AircraftPhotoLookupResult>
}

type PhotoFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export class AircraftPhotoProviderError extends Error {
  readonly reason: AircraftPhotoErrorReason
  readonly retryAfterMs?: number

  constructor(
    reason: AircraftPhotoErrorReason,
    retryAfterMs?: number,
  ) {
    super(reason)
    this.name = 'AircraftPhotoProviderError'
    this.reason = reason
    this.retryAfterMs = retryAfterMs
  }
}

const ICAO24 = /^[0-9A-F]{6}$/
const MAX_URL_CHARACTERS = 2_048
const MAX_PHOTOGRAPHER_CHARACTERS = 160

const abortError = () =>
  new DOMException('The operation was aborted', 'AbortError')

const validText = (value: unknown, maximumLength: number) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= maximumLength &&
  value === value.trim()
    ? value
    : undefined

const exactHttpsUrl = (
  value: unknown,
  expectedOrigins: readonly string[],
  pathPrefix?: string,
) => {
  const text = validText(value, MAX_URL_CHARACTERS)
  if (!text) return undefined

  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    return undefined
  }
  if (
    parsed.protocol !== 'https:' ||
    !expectedOrigins.includes(parsed.origin) ||
    parsed.username ||
    parsed.password ||
    (pathPrefix !== undefined && !parsed.pathname.startsWith(pathPrefix))
  ) {
    return undefined
  }
  return text
}

const parsePhoto = (
  value: unknown,
  identity: AircraftPhotoIdentity,
  config: PlanespottersPhotoProviderConfig,
): AircraftPhoto | undefined => {
  if (
    !isRecord(value) ||
    !isRecord(value.thumbnail) ||
    !isRecord(value.thumbnail.size)
  ) {
    return undefined
  }

  const thumbnailUrl = exactHttpsUrl(
    value.thumbnail.src,
    config.thumbnailOrigins,
  )
  const photoPageUrl = exactHttpsUrl(
    value.link,
    [config.photoPageOrigin],
    '/photo/',
  )
  const photographer = validText(
    value.photographer,
    MAX_PHOTOGRAPHER_CHARACTERS,
  )
  const width = value.thumbnail.size.width
  const height = value.thumbnail.size.height
  if (
    !thumbnailUrl ||
    !photoPageUrl ||
    !photographer ||
    typeof width !== 'number' ||
    !Number.isSafeInteger(width) ||
    width <= 0 ||
    width > 1_000 ||
    typeof height !== 'number' ||
    !Number.isSafeInteger(height) ||
    height <= 0 ||
    height > 1_000
  ) {
    return undefined
  }

  const source: AircraftPhotoSource = {
    name: config.sourceName,
    websiteUrl: config.sourceWebsiteUrl,
    termsUrl: config.sourceTermsUrl,
  }
  return {
    icao24: identity.icao24,
    thumbnailUrl,
    thumbnailWidth: width,
    thumbnailHeight: height,
    photoPageUrl,
    photographer,
    source,
  }
}

const readBoundedJson = async (
  response: Response,
  maximumBytes: number,
) => {
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    void response.body?.cancel().catch(() => undefined)
    throw new AircraftPhotoProviderError('invalid-response')
  }

  const contentLength = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    void response.body?.cancel().catch(() => undefined)
    throw new AircraftPhotoProviderError('invalid-response')
  }
  if (!response.body) {
    throw new AircraftPhotoProviderError('invalid-response')
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > maximumBytes) {
      void reader.cancel().catch(() => undefined)
      throw new AircraftPhotoProviderError('invalid-response')
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
    throw new AircraftPhotoProviderError('invalid-response')
  }
}

const parseResponse = (
  value: unknown,
  identity: AircraftPhotoIdentity,
  config: PlanespottersPhotoProviderConfig,
): AircraftPhotoLookupResult => {
  if (!isRecord(value)) {
    throw new AircraftPhotoProviderError('invalid-response')
  }
  if (value.error !== undefined) {
    throw new AircraftPhotoProviderError('provider-error')
  }
  if (!Array.isArray(value.photos)) {
    throw new AircraftPhotoProviderError('invalid-response')
  }
  if (value.photos.length === 0) {
    return { kind: 'unavailable', reason: 'not-found' }
  }
  if (value.photos.length !== 1) {
    throw new AircraftPhotoProviderError('invalid-response')
  }

  const photo = parsePhoto(value.photos[0], identity, config)
  if (!photo) {
    throw new AircraftPhotoProviderError('invalid-response')
  }
  return { kind: 'available', photo }
}

export class PlanespottersPhotoProvider
  implements AircraftPhotoProvider
{
  private readonly config: PlanespottersPhotoProviderConfig
  private readonly fetchImpl: PhotoFetch

  constructor(
    config: PlanespottersPhotoProviderConfig,
    fetchImpl: PhotoFetch = (input, init) => globalThis.fetch(input, init),
  ) {
    this.config = config
    this.fetchImpl = fetchImpl
  }

  async lookup(
    identity: AircraftPhotoIdentity,
    signal: AbortSignal,
  ): Promise<AircraftPhotoLookupResult> {
    if (!ICAO24.test(identity.icao24)) {
      return { kind: 'unavailable', reason: 'invalid-identity' }
    }
    if (signal.aborted) throw abortError()

    const controller = new AbortController()
    let timedOut = false
    const handleAbort = () => controller.abort(signal.reason)
    signal.addEventListener('abort', handleAbort, { once: true })
    const timeout = globalThis.setTimeout(() => {
      timedOut = true
      controller.abort(new Error('Aircraft photo request timed out'))
    }, this.config.timeoutMs)

    try {
      const url = new URL(
        `${this.config.endpointBaseUrl}/${identity.icao24}`,
      )
      const response = await this.fetchImpl(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
        },
      })
      if (response.status === 429) {
        const retryAfterMs = parseRetryAfterMs(
          response.headers.get('Retry-After'),
        )
        void response.body?.cancel().catch(() => undefined)
        throw new AircraftPhotoProviderError(
          'throttled',
          retryAfterMs,
        )
      }
      if (response.status === 403) {
        void response.body?.cancel().catch(() => undefined)
        throw new AircraftPhotoProviderError('forbidden')
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined)
        throw new AircraftPhotoProviderError('provider-error')
      }

      return parseResponse(
        await readBoundedJson(response, this.config.maximumBytes),
        identity,
        this.config,
      )
    } catch (error) {
      if (signal.aborted) throw abortError()
      if (error instanceof AircraftPhotoProviderError) throw error
      if (timedOut) throw new AircraftPhotoProviderError('timeout')
      if (error instanceof TypeError) {
        throw new AircraftPhotoProviderError('network')
      }
      throw new AircraftPhotoProviderError('provider-error')
    } finally {
      globalThis.clearTimeout(timeout)
      signal.removeEventListener('abort', handleAbort)
    }
  }
}
