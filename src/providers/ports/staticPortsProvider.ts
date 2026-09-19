import type { Port, PortDataset } from '../../domain/ports'
import { isRecord } from '../guards'

const SHA_256 = /^[0-9a-f]{64}$/
const hasControlCharacter = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })

export interface StaticPortsProviderConfig {
  assetUrl: string
  timeoutMs: number
  maximumBytes: number
  schemaVersion: number
  outputVersion: string
  sourceName: string
  sourceRepositoryUrl: string
  sourceTag: string
  sourceCommit: string
  sourcePublishedAt: string
  sourceTermsUrl: string
  sourceDocumentationUrl: string
  sourceLicenseName: string
  expectedRecords: number
  expectedSha256: string
  expectedRankCounts: Record<string, number>
}

export class StaticPortsProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StaticPortsProviderError'
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
    throw new StaticPortsProviderError(
      `Port data returned HTTP ${response.status}`,
    )
  }
  const contentLength = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    await response.body?.cancel()
    throw new StaticPortsProviderError(
      `Port data exceeded the ${maximumBytes}-byte limit`,
    )
  }
  if (!response.body) {
    throw new StaticPortsProviderError('Port data returned no body')
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
      throw new StaticPortsProviderError(
        `Port data exceeded the ${maximumBytes}-byte limit`,
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
    throw new StaticPortsProviderError(
      'Port data integrity checking is unavailable',
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
    throw new StaticPortsProviderError('Port data was not valid UTF-8')
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new StaticPortsProviderError('Port data was not valid JSON')
  }
}

const validatePorts = (
  value: unknown,
  config: StaticPortsProviderConfig,
): Port[] => {
  if (
    !isRecord(value) ||
    value.type !== 'FeatureCollection' ||
    !Array.isArray(value.features) ||
    value.features.length !== config.expectedRecords
  ) {
    throw new StaticPortsProviderError(
      'Port data collection shape is invalid',
    )
  }

  const ports: Port[] = []
  const rankCounts: Record<string, number> = {}
  let previousId = 0
  for (const feature of value.features) {
    if (
      !isRecord(feature) ||
      feature.type !== 'Feature' ||
      typeof feature.id !== 'string' ||
      !/^[1-9][0-9]*$/.test(feature.id) ||
      !isRecord(feature.properties) ||
      Object.keys(feature.properties).sort().join(',') !== 'name,rank' ||
      !isRecord(feature.geometry) ||
      feature.geometry.type !== 'Point' ||
      !Array.isArray(feature.geometry.coordinates) ||
      feature.geometry.coordinates.length !== 2
    ) {
      throw new StaticPortsProviderError('Port data feature is invalid')
    }

    const id = Number(feature.id)
    const name = feature.properties.name
    const rank = feature.properties.rank
    const [longitude, latitude] = feature.geometry.coordinates
    if (
      !Number.isSafeInteger(id) ||
      id <= previousId ||
      typeof name !== 'string' ||
      name.length === 0 ||
      name.length > 160 ||
      name !== name.trim() ||
      hasControlCharacter(name) ||
      typeof rank !== 'number' ||
      !Number.isInteger(rank) ||
      rank < 3 ||
      rank > 8 ||
      typeof longitude !== 'number' ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      typeof latitude !== 'number' ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new StaticPortsProviderError('Port data feature is invalid')
    }

    previousId = id
    rankCounts[rank] = (rankCounts[rank] ?? 0) + 1
    ports.push({
      id: feature.id,
      name,
      rank,
      longitude,
      latitude,
    })
  }

  if (
    JSON.stringify(rankCounts) !==
    JSON.stringify(config.expectedRankCounts)
  ) {
    throw new StaticPortsProviderError(
      'Port data rank distribution is invalid',
    )
  }
  return ports
}

export class StaticPortsProvider {
  private readonly config: StaticPortsProviderConfig
  private fulfilled?: PortDataset

  constructor(config: StaticPortsProviderConfig) {
    if (
      config.schemaVersion !== 1 ||
      !SHA_256.test(config.expectedSha256)
    ) {
      throw new StaticPortsProviderError(
        'Port data provider configuration is invalid',
      )
    }
    this.config = config
  }

  async load(signal: AbortSignal): Promise<PortDataset> {
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
      if (controller.signal.aborted) throw abortError()
      const actualSha256 = await sha256(bytes)
      if (controller.signal.aborted) throw abortError()
      if (actualSha256 !== this.config.expectedSha256) {
        throw new StaticPortsProviderError(
          'Port data SHA-256 does not match the pinned projection',
        )
      }
      const ports = validatePorts(decodeJson(bytes), this.config)
      if (controller.signal.aborted) throw abortError()
      const dataset = {
        ports,
        source: {
          name: this.config.sourceName,
          repositoryUrl: this.config.sourceRepositoryUrl,
          tag: this.config.sourceTag,
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
        throw new StaticPortsProviderError(
          `Port data timed out after ${this.config.timeoutMs} ms`,
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
