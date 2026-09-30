import {
  orbitalSnapshotDigestInput,
  parseOrbitalTimestamp,
  type OrbitalCatalogSource,
  type OrbitalCatalogSnapshot,
  type OrbitalObject,
  type OrbitalObjectType,
  type OrbitalSourceGroup,
} from '../../domain/orbital'
import { ProviderError, parseRetryAfterMs } from '../errors'

export interface OrbitalCatalogSourceConfig {
  group: OrbitalSourceGroup
  gpSourceUrl: string
  satcatSourceUrl: string
}

export interface OrbitalCatalogProviderConfig {
  endpointPath: string
  acceptMediaType: string
  schemaVersion: number
  sourceContractVersion: number
  catalogId: string
  sources: readonly OrbitalCatalogSourceConfig[]
  maximumBytes: number
  maximumRecords: number
  timeoutMs: number
}

interface OrbitalCatalogClock {
  serverTimeMs: number
  requestMidpointWallTimeMs: number
  responseWallTimeMs: number
  responsePerformanceTimeMs: number
}

export interface OrbitalCatalogLoadResult {
  snapshot: OrbitalCatalogSnapshot
  clock: OrbitalCatalogClock
  source: 'kv' | 'bootstrap'
}

export interface OrbitalCatalogRuntime {
  wallNow: () => number
  performanceNow: () => number
  setTimeout: (callback: () => void, delayMs: number) => unknown
  clearTimeout: (handle: unknown) => void
  fetch: typeof fetch
}

const browserRuntime: OrbitalCatalogRuntime = {
  wallNow: () => Date.now(),
  performanceNow: () => performance.now(),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
  fetch: (...arguments_) => fetch(...arguments_),
}

const topLevelKeys = [
  'catalogId',
  'publishedAt',
  'recordCount',
  'records',
  'retrievedAt',
  'schemaVersion',
  'sha256',
  'sourceContractVersion',
  'sources',
] as const

const sourceKeys = [
  'gpRecordCount',
  'gpSourceUrl',
  'group',
  'satcatRecordCount',
  'satcatSourceUrl',
] as const

const recordKeys = [
  'argumentOfPericenter',
  'bstar',
  'classificationType',
  'displayOrder',
  'eccentricity',
  'elementSetNumber',
  'ephemerisType',
  'epoch',
  'inclination',
  'internationalDesignator',
  'meanAnomaly',
  'meanMotion',
  'meanMotionDdot',
  'meanMotionDot',
  'name',
  'noradCatalogId',
  'objectType',
  'revolutionAtEpoch',
  'rightAscensionOfAscendingNode',
  'sourceGroups',
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const exactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
) => {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  )
}

const boundedString = (
  value: unknown,
  minimumLength: number,
  maximumLength: number,
) =>
  typeof value === 'string' &&
  value.length >= minimumLength &&
  value.length <= maximumLength
    ? value
    : undefined

const finiteNumber = (
  value: unknown,
  minimum: number,
  maximum: number,
) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= minimum &&
  value <= maximum
    ? value
    : undefined

const integerNumber = (
  value: unknown,
  minimum: number,
  maximum: number,
) => {
  const number = finiteNumber(value, minimum, maximum)
  return number !== undefined && Number.isInteger(number)
    ? number
    : undefined
}

const objectType = (value: unknown): OrbitalObjectType | undefined =>
  value === 'PAY' || value === 'R/B' || value === 'DEB' || value === 'UNK'
    ? value
    : undefined

const parseSource = (
  value: unknown,
  expected: OrbitalCatalogSourceConfig,
  maximumRecords: number,
): OrbitalCatalogSource | undefined => {
  if (!isRecord(value) || !exactKeys(value, sourceKeys)) return undefined
  const gpRecordCount = integerNumber(
    value.gpRecordCount,
    1,
    maximumRecords,
  )
  const satcatRecordCount = integerNumber(
    value.satcatRecordCount,
    gpRecordCount ?? 1,
    maximumRecords,
  )
  if (
    value.group !== expected.group ||
    value.gpSourceUrl !== expected.gpSourceUrl ||
    value.satcatSourceUrl !== expected.satcatSourceUrl ||
    gpRecordCount === undefined ||
    satcatRecordCount === undefined
  ) {
    return undefined
  }
  return {
    ...expected,
    gpRecordCount,
    satcatRecordCount,
  }
}

const parseSourceGroups = (
  value: unknown,
  config: OrbitalCatalogProviderConfig,
) => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > config.sources.length
  ) {
    return undefined
  }
  const groups: OrbitalSourceGroup[] = []
  let previousIndex = -1
  for (const candidate of value) {
    const index = config.sources.findIndex(
      ({ group }) => group === candidate,
    )
    if (index <= previousIndex) return undefined
    previousIndex = index
    groups.push(config.sources[index].group)
  }
  return groups
}

const parseObject = (
  value: unknown,
  config: OrbitalCatalogProviderConfig,
): OrbitalObject | undefined => {
  if (!isRecord(value) || !exactKeys(value, recordKeys)) return undefined
  const noradCatalogId =
    typeof value.noradCatalogId === 'string' &&
    /^[1-9]\d{0,8}$/.test(value.noradCatalogId)
      ? value.noradCatalogId
      : undefined
  const name = boundedString(value.name, 1, 120)
  const internationalDesignator = boundedString(
    value.internationalDesignator,
    0,
    24,
  )
  const parsedType = objectType(value.objectType)
  const epoch =
    typeof value.epoch === 'string' &&
    parseOrbitalTimestamp(value.epoch) !== undefined
      ? value.epoch
      : undefined
  const meanMotion = finiteNumber(value.meanMotion, 0, 20)
  const eccentricity = finiteNumber(value.eccentricity, 0, 0.99999999)
  const inclination = finiteNumber(value.inclination, 0, 180)
  const rightAscensionOfAscendingNode = finiteNumber(
    value.rightAscensionOfAscendingNode,
    0,
    360,
  )
  const argumentOfPericenter = finiteNumber(
    value.argumentOfPericenter,
    0,
    360,
  )
  const meanAnomaly = finiteNumber(value.meanAnomaly, 0, 360)
  const ephemerisType = integerNumber(value.ephemerisType, 0, 99)
  const classificationType =
    typeof value.classificationType === 'string' &&
    /^[A-Z]$/.test(value.classificationType)
      ? value.classificationType
      : undefined
  const elementSetNumber = integerNumber(
    value.elementSetNumber,
    0,
    999_999,
  )
  const revolutionAtEpoch = integerNumber(
    value.revolutionAtEpoch,
    0,
    99_999_999,
  )
  const bstar = finiteNumber(value.bstar, -10, 10)
  const meanMotionDot = finiteNumber(value.meanMotionDot, -10, 10)
  const meanMotionDdot = finiteNumber(value.meanMotionDdot, -10, 10)
  const sourceGroups = parseSourceGroups(value.sourceGroups, config)
  const expectedDisplayOrder =
    noradCatalogId && sourceGroups
      ? config.sources.findIndex(
          ({ group }) => group === sourceGroups[0],
        ) *
          1_000_000_000 +
        Number(noradCatalogId)
      : undefined

  if (
    noradCatalogId === undefined ||
    name === undefined ||
    internationalDesignator === undefined ||
    parsedType === undefined ||
    epoch === undefined ||
    meanMotion === undefined ||
    eccentricity === undefined ||
    inclination === undefined ||
    rightAscensionOfAscendingNode === undefined ||
    argumentOfPericenter === undefined ||
    meanAnomaly === undefined ||
    ephemerisType === undefined ||
    classificationType === undefined ||
    elementSetNumber === undefined ||
    revolutionAtEpoch === undefined ||
    bstar === undefined ||
    meanMotionDot === undefined ||
    meanMotionDdot === undefined ||
    sourceGroups === undefined ||
    expectedDisplayOrder === undefined ||
    value.displayOrder !== expectedDisplayOrder
  ) {
    return undefined
  }

  return {
    noradCatalogId,
    name,
    internationalDesignator,
    objectType: parsedType,
    epoch,
    meanMotion,
    eccentricity,
    inclination,
    rightAscensionOfAscendingNode,
    argumentOfPericenter,
    meanAnomaly,
    ephemerisType,
    classificationType,
    elementSetNumber,
    revolutionAtEpoch,
    bstar,
    meanMotionDot,
    meanMotionDdot,
    sourceGroups,
    displayOrder: expectedDisplayOrder,
  }
}

const digest = async (value: string) => {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const readBoundedJson = async (
  response: Response,
  maximumBytes: number,
) => {
  const contentType = response.headers.get('Content-Type') ?? ''
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      contentType.trim(),
    )
  ) {
    await response.body?.cancel()
    throw new ProviderError('Orbital catalog returned an invalid content type')
  }
  const contentLength = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    await response.body?.cancel()
    throw new ProviderError('Orbital catalog exceeded the response limit')
  }
  if (!response.body) {
    throw new ProviderError('Orbital catalog returned an empty response')
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
      throw new ProviderError('Orbital catalog exceeded the response limit')
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
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as unknown
  } catch {
    throw new ProviderError('Orbital catalog returned invalid JSON')
  }
}

const parseSnapshot = async (
  value: unknown,
  config: OrbitalCatalogProviderConfig,
) => {
  if (!isRecord(value) || !exactKeys(value, topLevelKeys)) {
    throw new ProviderError('Orbital catalog schema is invalid')
  }
  const retrievedAt =
    typeof value.retrievedAt === 'string' &&
    parseOrbitalTimestamp(value.retrievedAt) !== undefined
      ? value.retrievedAt
      : undefined
  const publishedAt =
    typeof value.publishedAt === 'string' &&
    parseOrbitalTimestamp(value.publishedAt) !== undefined
      ? value.publishedAt
      : undefined
  const sha256 =
    typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256)
      ? value.sha256
      : undefined
  if (
    value.schemaVersion !== config.schemaVersion ||
    value.sourceContractVersion !== config.sourceContractVersion ||
    value.catalogId !== config.catalogId ||
    retrievedAt === undefined ||
    publishedAt === undefined ||
    Date.parse(publishedAt) < Date.parse(retrievedAt) ||
    !Array.isArray(value.sources) ||
    value.sources.length !== config.sources.length ||
    !Array.isArray(value.records) ||
    value.records.length === 0 ||
    value.records.length > config.maximumRecords ||
    value.recordCount !== value.records.length ||
    sha256 === undefined
  ) {
    throw new ProviderError('Orbital catalog schema is invalid')
  }

  const sources = value.sources.map((source, index) =>
    config.sources[index]
      ? parseSource(
          source,
          config.sources[index],
          config.maximumRecords,
        )
      : undefined,
  )
  if (sources.some((source) => source === undefined)) {
    throw new ProviderError('Orbital catalog contains an invalid source')
  }
  const completeSources = sources as OrbitalCatalogSource[]
  const records = value.records.map((record) =>
    parseObject(record, config),
  )
  if (records.some((record) => record === undefined)) {
    throw new ProviderError('Orbital catalog contains an invalid record')
  }
  const completeRecords = records as OrbitalObject[]
  const ids = new Set<string>()
  let previousId = 0
  for (const record of completeRecords) {
    const numericId = Number(record.noradCatalogId)
    if (
      ids.has(record.noradCatalogId) ||
      numericId <= previousId
    ) {
      throw new ProviderError('Orbital catalog ordering is invalid')
    }
    ids.add(record.noradCatalogId)
    previousId = numericId
  }
  for (const source of completeSources) {
    if (
      completeRecords.filter((record) =>
        record.sourceGroups.includes(source.group),
      ).length !== source.gpRecordCount
    ) {
      throw new ProviderError(
        'Orbital catalog source membership is invalid',
      )
    }
  }

  const withoutDigest: Omit<OrbitalCatalogSnapshot, 'sha256'> = {
    schemaVersion: config.schemaVersion,
    sourceContractVersion: config.sourceContractVersion,
    catalogId: config.catalogId,
    sources: completeSources,
    retrievedAt,
    publishedAt,
    recordCount: completeRecords.length,
    records: completeRecords,
  }
  const computedDigest = await digest(
    JSON.stringify(orbitalSnapshotDigestInput(withoutDigest)),
  )
  if (computedDigest !== sha256) {
    throw new ProviderError('Orbital catalog digest is invalid')
  }
  return { ...withoutDigest, sha256 }
}

const abortError = () =>
  new DOMException('Orbital catalog request aborted', 'AbortError')

const headerClock = (
  response: Response,
  requestStartedAt: number,
  responseWallTimeMs: number,
  responsePerformanceTimeMs: number,
): OrbitalCatalogClock => {
  const servedAt = response.headers.get('X-LiveTrafficStan-Served-At')
  const serverTimeMs =
    servedAt && parseOrbitalTimestamp(servedAt) !== undefined
      ? Date.parse(servedAt)
      : Number.NaN
  if (!Number.isFinite(serverTimeMs)) {
    throw new ProviderError('Orbital catalog response time is invalid')
  }
  return {
    serverTimeMs,
    requestMidpointWallTimeMs:
      requestStartedAt + (responseWallTimeMs - requestStartedAt) / 2,
    responseWallTimeMs,
    responsePerformanceTimeMs,
  }
}

const variesOnAccept = (response: Response) =>
  (response.headers.get('Vary') ?? '')
    .split(',')
    .some((value) => value.trim().toLowerCase() === 'accept')

export class OrbitalCatalogProvider {
  private readonly config: OrbitalCatalogProviderConfig
  private readonly runtime: OrbitalCatalogRuntime
  private fulfilled?: {
    snapshot: OrbitalCatalogSnapshot
    etag: string
  }

  constructor(
    config: OrbitalCatalogProviderConfig,
    runtime: OrbitalCatalogRuntime = browserRuntime,
  ) {
    this.config = config
    this.runtime = runtime
  }

  async load(signal: AbortSignal): Promise<OrbitalCatalogLoadResult> {
    if (signal.aborted) throw abortError()
    const controller = new AbortController()
    let timedOut = false
    const handleAbort = () => controller.abort(signal.reason)
    signal.addEventListener('abort', handleAbort, { once: true })
    const timeout = this.runtime.setTimeout(() => {
      timedOut = true
      controller.abort(new Error('Orbital catalog request timed out'))
    }, this.config.timeoutMs)
    const requestStartedAt = this.runtime.wallNow()
    const ensureActive = () => {
      if (signal.aborted) throw abortError()
      if (timedOut || controller.signal.aborted) {
        throw new ProviderError('Orbital catalog request timed out')
      }
    }

    try {
      const response = await this.runtime.fetch(this.config.endpointPath, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'error',
        cache: 'no-cache',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: {
          Accept: this.config.acceptMediaType,
          ...(this.fulfilled
            ? { 'If-None-Match': this.fulfilled.etag }
            : {}),
        },
      })
      ensureActive()
      const responseWallTimeMs = this.runtime.wallNow()
      const responsePerformanceTimeMs = this.runtime.performanceNow()
      if (response.status !== 200 && response.status !== 304) {
        const retryAfterMs = parseRetryAfterMs(
          response.headers.get('Retry-After'),
        )
        await response.body?.cancel()
        throw new ProviderError(
          response.status === 404
            ? 'Orbital catalog is not enabled on this deployment'
            : `Orbital catalog returned HTTP ${response.status}`,
          response.status,
          retryAfterMs,
        )
      }
      if (!variesOnAccept(response)) {
        await response.body?.cancel()
        throw new ProviderError(
          'Orbital catalog content negotiation is invalid',
        )
      }
      let clock: OrbitalCatalogClock
      try {
        clock = headerClock(
          response,
          requestStartedAt,
          responseWallTimeMs,
          responsePerformanceTimeMs,
        )
      } catch (error) {
        await response.body?.cancel()
        throw error
      }
      const sourceHeader = response.headers.get(
        'X-LiveTrafficStan-Orbital-Source',
      )
      const source =
        sourceHeader === 'kv' || sourceHeader === 'bootstrap'
          ? sourceHeader
          : undefined
      const responseDigest = response.headers.get(
        'X-LiveTrafficStan-Orbital-Sha256',
      )
      const responseSchema = Number(
        response.headers.get('X-LiveTrafficStan-Orbital-Schema'),
      )
      const responseRetrievedAt = response.headers.get(
        'X-LiveTrafficStan-Orbital-Retrieved-At',
      )

      if (response.status === 304) {
        await response.body?.cancel()
        ensureActive()
        if (
          !this.fulfilled ||
          response.headers.get('ETag') !== this.fulfilled.etag ||
          source === undefined ||
          responseDigest !== this.fulfilled.snapshot.sha256 ||
          responseSchema !== this.config.schemaVersion ||
          responseRetrievedAt !== this.fulfilled.snapshot.retrievedAt
        ) {
          throw new ProviderError(
            'Orbital catalog revalidation response is invalid',
          )
        }
        return {
          snapshot: this.fulfilled.snapshot,
          clock,
          source,
        }
      }
      if (response.redirected || source === undefined) {
        await response.body?.cancel()
        throw new ProviderError('Orbital catalog response is invalid')
      }

      const snapshot = await parseSnapshot(
        await readBoundedJson(response, this.config.maximumBytes),
        this.config,
      )
      ensureActive()
      const etag = response.headers.get('ETag')
      if (
        etag !== `W/"${snapshot.sha256}"` ||
        responseDigest !== snapshot.sha256 ||
        responseSchema !== snapshot.schemaVersion ||
        responseRetrievedAt !== snapshot.retrievedAt
      ) {
        throw new ProviderError('Orbital catalog headers are invalid')
      }
      ensureActive()
      this.fulfilled = { snapshot, etag }
      return { snapshot, clock, source }
    } catch (error) {
      if (signal.aborted) throw abortError()
      if (error instanceof ProviderError) throw error
      if (timedOut) {
        throw new ProviderError('Orbital catalog request timed out')
      }
      throw new ProviderError('Orbital catalog request failed')
    } finally {
      this.runtime.clearTimeout(timeout)
      signal.removeEventListener('abort', handleAbort)
    }
  }
}
