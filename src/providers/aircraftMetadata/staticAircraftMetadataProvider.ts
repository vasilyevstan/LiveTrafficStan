import type {
  AircraftMetadataIdentity,
  AircraftMetadataLookupResult,
  AircraftMetadataRecord,
} from '../../domain/aircraftMetadata'
import { isRecord } from '../guards'

const HEX_ADDRESS = /^[0-9A-F]{6}$/
const HEX_PREFIX = /^[0-9A-F]{2}$/
const HEX_SUFFIX = /^[0-9A-F]{4}$/
const TYPE_CODE = /^[A-Z0-9]{1,8}$/
const CONFIGURATION = /^[A-Z0-9-]{1,8}$/
const WAKE_CATEGORY = /^[LMHJ]$/
const SHA_256 = /^[0-9a-f]{64}$/
const hasControlCharacter = (value: string) =>
  [...value].some((character) => {
    const code = character.codePointAt(0)
    return code !== undefined && (code <= 0x1f || code === 0x7f)
  })

interface AircraftMetadataType {
  modelDescription: string
  configuration?: string
  wakeCategory?: string
}

interface AircraftMetadataShardRecord {
  registration: string
  typeCode: string
  ambiguous: boolean
}

interface AircraftMetadataShardDescriptor {
  path: string
  records: number
  ambiguousRecords: number
  bytes: number
  gzipBytes: number
  sha256: string
}

interface AircraftMetadataIndex {
  source: {
    name: string
    repositoryUrl: string
    publishedAt: string
    licenseName: string
    licenseUrl: string
  }
  policy: {
    staleAfterDays: number
    futureToleranceHours: number
  }
  types: Record<string, AircraftMetadataType>
  shards: Record<string, AircraftMetadataShardDescriptor>
}

export interface StaticAircraftMetadataProviderConfig {
  baseUrl: string
  timeoutMs: number
  indexMaximumBytes: number
  shardMaximumBytes: number
  shardCacheEntries: number
  schemaVersion: number
  outputVersion: string
  sourceName: string
  sourceRepositoryUrl: string
  sourceCommit: string
  sourcePublishedAt: string
  sourceDatabaseVersion: number
  sourceLicenseName: string
  sourceLicenseUrl: string
  sourceArchiveSha256: string
  staleAfterDays: number
  futureToleranceHours: number
  expectedCounts: Record<string, number>
}

export interface AircraftMetadataProvider {
  lookup(
    identity: AircraftMetadataIdentity,
    signal: AbortSignal,
  ): Promise<AircraftMetadataLookupResult>
}

export class AircraftMetadataProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AircraftMetadataProviderError'
  }
}

const finiteNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value >= 0

const validText = (value: unknown, maximumLength: number): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= maximumLength &&
  value === value.trim() &&
  !hasControlCharacter(value)

const validRegistration = (value: string) => {
  if (
    !validText(value, 32) ||
    value.codePointAt(0) === 0x20 ||
    value.codePointAt(value.length - 1) === 0x20
  ) {
    return false
  }
  return [...value].every((character) => {
    const code = character.codePointAt(0)
    return code !== undefined && code >= 0x20 && code <= 0x7e
  })
}

const normalizedOptional = (value: string | undefined) => {
  const normalized = value?.trim().toUpperCase()
  return normalized || undefined
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const abortError = () =>
  new DOMException('The operation was aborted', 'AbortError')

const readBoundedResponse = async (
  response: Response,
  maximumBytes: number,
  label: string,
) => {
  if (!response.ok) {
    await response.body?.cancel()
    throw new AircraftMetadataProviderError(
      `${label} returned HTTP ${response.status}`,
    )
  }
  const contentLength = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    await response.body?.cancel()
    throw new AircraftMetadataProviderError(
      `${label} exceeded the ${maximumBytes}-byte limit`,
    )
  }
  if (!response.body) {
    throw new AircraftMetadataProviderError(`${label} returned no body`)
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
      throw new AircraftMetadataProviderError(
        `${label} exceeded the ${maximumBytes}-byte limit`,
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

const decodeUtf8 = (bytes: Uint8Array, label: string) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new AircraftMetadataProviderError(
      `${label} was not valid UTF-8`,
    )
  }
}

const sha256 = async (bytes: Uint8Array) => {
  if (!globalThis.crypto?.subtle) {
    throw new AircraftMetadataProviderError(
      'Aircraft metadata integrity checking is unavailable',
    )
  }
  const digestBytes = new Uint8Array(bytes.byteLength)
  digestBytes.set(bytes)
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    digestBytes.buffer,
  )
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

const validateTypes = (value: unknown) => {
  if (!isRecord(value)) {
    throw new AircraftMetadataProviderError(
      'Aircraft metadata type dictionary is invalid',
    )
  }
  const types: Record<string, AircraftMetadataType> = {}
  for (const [typeCode, source] of Object.entries(value)) {
    if (
      !TYPE_CODE.test(typeCode) ||
      !Array.isArray(source) ||
      source.length !== 3 ||
      !validText(source[0], 160)
    ) {
      throw new AircraftMetadataProviderError(
        'Aircraft metadata type dictionary is invalid',
      )
    }
    const configuration = source[1]
    const wakeCategory = source[2]
    if (
      (configuration !== '' &&
        (typeof configuration !== 'string' ||
          !CONFIGURATION.test(configuration))) ||
      (wakeCategory !== '' &&
        (typeof wakeCategory !== 'string' ||
          !WAKE_CATEGORY.test(wakeCategory)))
    ) {
      throw new AircraftMetadataProviderError(
        'Aircraft metadata type dictionary is invalid',
      )
    }
    types[typeCode] = {
      modelDescription: source[0],
      configuration: configuration || undefined,
      wakeCategory: wakeCategory || undefined,
    }
  }
  return types
}

const validateShards = (value: unknown) => {
  if (!isRecord(value)) {
    throw new AircraftMetadataProviderError(
      'Aircraft metadata shard index is invalid',
    )
  }
  const shards: Record<string, AircraftMetadataShardDescriptor> = {}
  for (const [prefix, source] of Object.entries(value)) {
    if (
      !HEX_PREFIX.test(prefix) ||
      !isRecord(source) ||
      source.path !== `shards/${prefix}.tsv` ||
      !finiteNonNegativeInteger(source.records) ||
      !finiteNonNegativeInteger(source.ambiguousRecords) ||
      source.ambiguousRecords > source.records ||
      !finiteNonNegativeInteger(source.bytes) ||
      !finiteNonNegativeInteger(source.gzipBytes) ||
      typeof source.sha256 !== 'string' ||
      !SHA_256.test(source.sha256)
    ) {
      throw new AircraftMetadataProviderError(
        'Aircraft metadata shard index is invalid',
      )
    }
    shards[prefix] = {
      path: source.path,
      records: source.records,
      ambiguousRecords: source.ambiguousRecords,
      bytes: source.bytes,
      gzipBytes: source.gzipBytes,
      sha256: source.sha256,
    }
  }
  return shards
}

const validateIndex = (
  value: unknown,
  config: StaticAircraftMetadataProviderConfig,
): AircraftMetadataIndex => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== config.schemaVersion ||
    value.outputVersion !== config.outputVersion ||
    !isRecord(value.source) ||
    value.source.name !== config.sourceName ||
    value.source.repositoryUrl !== config.sourceRepositoryUrl ||
    value.source.commit !== config.sourceCommit ||
    value.source.publishedAt !== config.sourcePublishedAt ||
    value.source.databaseVersion !== config.sourceDatabaseVersion ||
    value.source.licenseName !== config.sourceLicenseName ||
    value.source.licenseUrl !== config.sourceLicenseUrl ||
    value.source.archiveSha256 !== config.sourceArchiveSha256 ||
    !isRecord(value.policy) ||
    value.policy.staleAfterDays !== config.staleAfterDays ||
    value.policy.futureToleranceHours !== config.futureToleranceHours ||
    !isRecord(value.counts)
  ) {
    throw new AircraftMetadataProviderError(
      'Aircraft metadata index provenance is invalid',
    )
  }

  for (const [name, expected] of Object.entries(config.expectedCounts)) {
    if (value.counts[name] !== expected) {
      throw new AircraftMetadataProviderError(
        'Aircraft metadata index counts are invalid',
      )
    }
  }

  const types = validateTypes(value.types)
  const shards = validateShards(value.shards)
  if (
    Object.keys(types).length !== config.expectedCounts.projectedTypeRecords ||
    Object.keys(shards).length !== config.expectedCounts.shardCount
  ) {
    throw new AircraftMetadataProviderError(
      'Aircraft metadata index inventory is invalid',
    )
  }

  return {
    source: {
      name: value.source.name,
      repositoryUrl: value.source.repositoryUrl,
      publishedAt: value.source.publishedAt,
      licenseName: value.source.licenseName,
      licenseUrl: value.source.licenseUrl,
    },
    policy: {
      staleAfterDays: value.policy.staleAfterDays,
      futureToleranceHours: value.policy.futureToleranceHours,
    },
    types,
    shards,
  }
}

const parseShard = (
  contents: string,
  types: Record<string, AircraftMetadataType>,
  descriptor: AircraftMetadataShardDescriptor,
) => {
  if (!contents.endsWith('\n')) {
    throw new AircraftMetadataProviderError(
      'Aircraft metadata shard is incomplete',
    )
  }
  const records = new Map<string, AircraftMetadataShardRecord>()
  let previousSuffix = ''
  let ambiguousRecords = 0
  for (const line of contents.slice(0, -1).split('\n')) {
    const fields = line.split('\t')
    if (fields.length !== 3 && fields.length !== 4) {
      throw new AircraftMetadataProviderError(
        'Aircraft metadata shard has invalid columns',
      )
    }
    const [suffix, registration, typeCode, status] = fields
    if (
      !HEX_SUFFIX.test(suffix) ||
      !validRegistration(registration) ||
      !TYPE_CODE.test(typeCode) ||
      !types[typeCode] ||
      (fields.length === 4 && status !== 'A') ||
      (previousSuffix && suffix <= previousSuffix)
    ) {
      throw new AircraftMetadataProviderError(
        'Aircraft metadata shard failed validation',
      )
    }
    previousSuffix = suffix
    const ambiguous = status === 'A'
    if (ambiguous) ambiguousRecords += 1
    records.set(suffix, {
      registration,
      typeCode,
      ambiguous,
    })
  }
  if (
    records.size !== descriptor.records ||
    ambiguousRecords !== descriptor.ambiguousRecords
  ) {
    throw new AircraftMetadataProviderError(
      'Aircraft metadata shard counts are invalid',
    )
  }
  return records
}

export class StaticAircraftMetadataProvider
  implements AircraftMetadataProvider
{
  private readonly config: StaticAircraftMetadataProviderConfig
  private index?: AircraftMetadataIndex
  private readonly shardCache = new Map<
    string,
    Map<string, AircraftMetadataShardRecord>
  >()

  constructor(config: StaticAircraftMetadataProviderConfig) {
    this.config = config
  }

  async lookup(
    identity: AircraftMetadataIdentity,
    signal: AbortSignal,
  ): Promise<AircraftMetadataLookupResult> {
    const hex = identity.hex.trim().toUpperCase()
    if (!HEX_ADDRESS.test(hex)) {
      return { kind: 'unavailable', reason: 'invalid-identity' }
    }

    let timedOut = false
    const requestController = new AbortController()
    const abortFromCaller = () =>
      requestController.abort(signal.reason ?? abortError())
    if (signal.aborted) abortFromCaller()
    else signal.addEventListener('abort', abortFromCaller, { once: true })
    const timeout = globalThis.setTimeout(() => {
      timedOut = true
      requestController.abort(abortError())
    }, this.config.timeoutMs)

    try {
      const index = await this.loadIndex(requestController.signal)
      if (requestController.signal.aborted) throw abortError()
      const prefix = hex.slice(0, 2)
      const descriptor = index.shards[prefix]
      if (!descriptor) {
        return { kind: 'unavailable', reason: 'not-found' }
      }
      const records = await this.loadShard(
        prefix,
        descriptor,
        index,
        requestController.signal,
      )
      if (requestController.signal.aborted) throw abortError()
      const record = records.get(hex.slice(2))
      if (!record) return { kind: 'unavailable', reason: 'not-found' }
      if (record.ambiguous) {
        return { kind: 'unavailable', reason: 'ambiguous' }
      }

      const registration = normalizedOptional(identity.registration)
      if (registration && registration !== record.registration) {
        return {
          kind: 'unavailable',
          reason: 'registration-conflict',
        }
      }
      const aircraftType = normalizedOptional(identity.aircraftType)
      if (aircraftType && aircraftType !== record.typeCode) {
        return { kind: 'unavailable', reason: 'type-conflict' }
      }
      const type = index.types[record.typeCode]
      const metadata: AircraftMetadataRecord = {
        databaseRegistration: record.registration,
        typeCode: record.typeCode,
        modelDescription: type.modelDescription,
        configuration: type.configuration,
        wakeCategory: type.wakeCategory,
        confidence: registration
          ? 'registration-verified'
          : 'icao24-only',
        source: {
          ...index.source,
          outputVersion: this.config.outputVersion,
        },
        staleAfterDays: index.policy.staleAfterDays,
        futureToleranceHours: index.policy.futureToleranceHours,
      }
      return { kind: 'available', metadata }
    } catch (error) {
      if (timedOut) {
        throw new AircraftMetadataProviderError(
          'Aircraft metadata lookup timed out',
        )
      }
      if (signal.aborted) throw abortError()
      if (error instanceof AircraftMetadataProviderError) throw error
      throw new AircraftMetadataProviderError(
        `Aircraft metadata lookup failed: ${errorMessage(error)}`,
      )
    } finally {
      globalThis.clearTimeout(timeout)
      signal.removeEventListener('abort', abortFromCaller)
    }
  }

  private async loadIndex(signal: AbortSignal) {
    if (this.index) return this.index
    const bytes = await readBoundedResponse(
      await globalThis.fetch(`${this.config.baseUrl}/index.json`, {
        signal,
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      }),
      this.config.indexMaximumBytes,
      'Aircraft metadata index',
    )
    let source: unknown
    try {
      source = JSON.parse(decodeUtf8(bytes, 'Aircraft metadata index'))
    } catch (error) {
      if (error instanceof AircraftMetadataProviderError) throw error
      throw new AircraftMetadataProviderError(
        'Aircraft metadata index was not valid JSON',
      )
    }
    const index = validateIndex(source, this.config)
    this.index = index
    return index
  }

  private async loadShard(
    prefix: string,
    descriptor: AircraftMetadataShardDescriptor,
    index: AircraftMetadataIndex,
    signal: AbortSignal,
  ) {
    const cached = this.shardCache.get(prefix)
    if (cached) {
      this.shardCache.delete(prefix)
      this.shardCache.set(prefix, cached)
      return cached
    }

    const bytes = await readBoundedResponse(
      await globalThis.fetch(`${this.config.baseUrl}/${descriptor.path}`, {
        signal,
        credentials: 'omit',
        headers: { Accept: 'text/tab-separated-values,text/plain' },
      }),
      this.config.shardMaximumBytes,
      `Aircraft metadata shard ${prefix}`,
    )
    if (bytes.byteLength !== descriptor.bytes) {
      throw new AircraftMetadataProviderError(
        `Aircraft metadata shard ${prefix} has an invalid byte count`,
      )
    }
    if ((await sha256(bytes)) !== descriptor.sha256) {
      throw new AircraftMetadataProviderError(
        `Aircraft metadata shard ${prefix} failed its integrity check`,
      )
    }
    const records = parseShard(
      decodeUtf8(bytes, `Aircraft metadata shard ${prefix}`),
      index.types,
      descriptor,
    )
    this.shardCache.set(prefix, records)
    while (this.shardCache.size > this.config.shardCacheEntries) {
      const oldest = this.shardCache.keys().next().value
      if (oldest === undefined) break
      this.shardCache.delete(oldest)
    }
    return records
  }
}
