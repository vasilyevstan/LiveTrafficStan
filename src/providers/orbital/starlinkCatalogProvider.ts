import {
  parseOrbitalTimestamp,
  type OrbitalObject,
  type OrbitalObjectType,
  type StarlinkCatalogSourceMetadata,
  type StarlinkOrbitalCatalogSnapshot,
} from '../../domain/orbital'
import { ProviderError, parseRetryAfterMs } from '../errors'
import type {
  OrbitalCatalogLoadResult,
  OrbitalCatalogRuntime,
} from './orbitalCatalogProvider'

export interface StarlinkCatalogProviderConfig {
  endpointPath: string
  acceptMediaType: string
  schemaVersion: number
  sourceContractVersion: number
  catalogId: string
  gpSourceUrl: string
  satcatSourceUrl: string
  sampleLimit: number
  sampleAlgorithm: string
  compatibleContracts: readonly StarlinkCatalogContractConfig[]
  maximumBytes: number
  maximumRecords: number
  maximumPopulationRecords: number
  maximumSourceBytes: number
  maximumAggregateSourceBytes: number
  timeoutMs: number
}

export interface StarlinkCatalogContractConfig {
  mediaType: string
  schemaVersion: number
  sourceContractVersion: number
  catalogId: string
  sampleLimit: number
  sampleAlgorithm: string
  maximumRecords: number
  shellBalanced: boolean
}

export interface StarlinkCatalogRecordPayload {
  noradCatalogId: string
  name: string
  internationalDesignator: string
  objectType: OrbitalObjectType
  epoch: string
  meanMotion: number
  eccentricity: number
  inclination: number
  rightAscensionOfAscendingNode: number
  argumentOfPericenter: number
  meanAnomaly: number
  ephemerisType: number
  classificationType: string
  elementSetNumber: number
  revolutionAtEpoch: number
  bstar: number
  meanMotionDot: number
  meanMotionDdot: number
  displayOrder: number
}

export interface StarlinkCatalogSnapshotPayload {
  schemaVersion: number
  sourceContractVersion: number
  catalogId: string
  sources: {
    gp: StarlinkCatalogSourceMetadata
    satcat: StarlinkCatalogSourceMetadata
  }
  populationCount: number
  extraSatcatCount: number
  sampleLimit: number
  sampleAlgorithm: string
  samplingReferenceTime?: string
  shells?: StarlinkSamplingShellPayload[]
  recordCount: number
  records: StarlinkCatalogRecordPayload[]
  publishedAt: string
  digest: string
}

export interface StarlinkSamplingShellPayload {
  id: string
  inclinationMinimumDegrees: number
  inclinationMaximumDegreesExclusive: number | null
  populationCount: number
  sampleCount: number
}

const browserRuntime: OrbitalCatalogRuntime = {
  wallNow: () => Date.now(),
  performanceNow: () => performance.now(),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
  fetch: (...arguments_) => fetch(...arguments_),
}

const topLevelKeysV1 = [
  'catalogId',
  'digest',
  'extraSatcatCount',
  'populationCount',
  'publishedAt',
  'recordCount',
  'records',
  'sampleAlgorithm',
  'sampleLimit',
  'schemaVersion',
  'sourceContractVersion',
  'sources',
] as const

const topLevelKeysV2 = [
  ...topLevelKeysV1,
  'samplingReferenceTime',
  'shells',
] as const

const sourceKeys = [
  'decodedBytes',
  'recordCount',
  'retrievedAt',
  'sha256',
  'url',
] as const

const shellKeys = [
  'id',
  'inclinationMaximumDegreesExclusive',
  'inclinationMinimumDegrees',
  'populationCount',
  'sampleCount',
] as const

const shellDefinitions = [
  {
    id: 'inclination-lt-48',
    inclinationMinimumDegrees: 0,
    inclinationMaximumDegreesExclusive: 48,
  },
  {
    id: 'inclination-48-lt-60',
    inclinationMinimumDegrees: 48,
    inclinationMaximumDegreesExclusive: 60,
  },
  {
    id: 'inclination-60-lt-85',
    inclinationMinimumDegrees: 60,
    inclinationMaximumDegreesExclusive: 85,
  },
  {
    id: 'inclination-gte-85',
    inclinationMinimumDegrees: 85,
    inclinationMaximumDegreesExclusive: null,
  },
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

const catalogContracts = (
  config: StarlinkCatalogProviderConfig,
): readonly StarlinkCatalogContractConfig[] => [
  {
    mediaType: config.acceptMediaType.split(',')[0]?.trim() ?? '',
    schemaVersion: config.schemaVersion,
    sourceContractVersion: config.sourceContractVersion,
    catalogId: config.catalogId,
    sampleLimit: config.sampleLimit,
    sampleAlgorithm: config.sampleAlgorithm,
    maximumRecords: config.maximumRecords,
    shellBalanced: true,
  },
  ...config.compatibleContracts,
]

const boundedString = (
  value: unknown,
  minimumLength: number,
  maximumLength: number,
) =>
  typeof value === 'string' &&
  value.length >= minimumLength &&
  value.length <= maximumLength &&
  value.trim() === value
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
  const parsed = finiteNumber(value, minimum, maximum)
  return parsed !== undefined && Number.isInteger(parsed)
    ? parsed
    : undefined
}

const timestamp = (
  value: unknown,
  fractionDigits: 3 | 6,
) => {
  if (typeof value !== 'string') return undefined
  const pattern =
    fractionDigits === 3
      ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
  return pattern.test(value) &&
    parseOrbitalTimestamp(value) !== undefined
    ? value
    : undefined
}

const objectType = (value: unknown): OrbitalObjectType | undefined =>
  value === 'PAY' || value === 'R/B' || value === 'DEB' || value === 'UNK'
    ? value
    : undefined

const parseSource = (
  value: unknown,
  expectedUrl: string,
  config: StarlinkCatalogProviderConfig,
): StarlinkCatalogSourceMetadata | undefined => {
  if (!isRecord(value) || !exactKeys(value, sourceKeys)) return undefined
  const retrievedAt = timestamp(value.retrievedAt, 3)
  const recordCount = integerNumber(
    value.recordCount,
    1,
    config.maximumPopulationRecords,
  )
  const decodedBytes = integerNumber(
    value.decodedBytes,
    1,
    config.maximumSourceBytes,
  )
  const sha256 =
    typeof value.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(value.sha256)
      ? value.sha256
      : undefined
  if (
    value.url !== expectedUrl ||
    retrievedAt === undefined ||
    recordCount === undefined ||
    decodedBytes === undefined ||
    sha256 === undefined
  ) {
    return undefined
  }
  return {
    url: expectedUrl,
    retrievedAt,
    recordCount,
    decodedBytes,
    sha256,
  }
}

const parseShells = (
  value: unknown,
  populationCount: number,
  sampleLimit: number,
) => {
  if (
    !Array.isArray(value) ||
    value.length !== shellDefinitions.length ||
    sampleLimit % shellDefinitions.length !== 0
  ) {
    return undefined
  }
  const sampleCount = sampleLimit / shellDefinitions.length
  const shells = value.map((candidate, index) => {
    const expected = shellDefinitions[index]
    if (
      !expected ||
      !isRecord(candidate) ||
      !exactKeys(candidate, shellKeys) ||
      candidate.id !== expected.id ||
      candidate.inclinationMinimumDegrees !==
        expected.inclinationMinimumDegrees ||
      candidate.inclinationMaximumDegreesExclusive !==
        expected.inclinationMaximumDegreesExclusive ||
      candidate.sampleCount !== sampleCount
    ) {
      return undefined
    }
    const shellPopulationCount = integerNumber(
      candidate.populationCount,
      sampleCount,
      populationCount,
    )
    return shellPopulationCount === undefined
      ? undefined
      : {
          ...expected,
          populationCount: shellPopulationCount,
          sampleCount,
        }
  })
  if (
    shells.some((shell) => shell === undefined) ||
    shells.reduce(
      (total, shell) => total + (shell?.populationCount ?? 0),
      0,
    ) !== populationCount
  ) {
    return undefined
  }
  return shells as StarlinkSamplingShellPayload[]
}

const parseObject = (
  value: unknown,
): StarlinkCatalogRecordPayload | undefined => {
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
  const parsedObjectType = objectType(value.objectType)
  const epoch = timestamp(value.epoch, 6)
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
  const displayOrder =
    noradCatalogId === undefined
      ? undefined
      : integerNumber(value.displayOrder, 1, 999_999_999)

  if (
    noradCatalogId === undefined ||
    name === undefined ||
    internationalDesignator === undefined ||
    parsedObjectType === undefined ||
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
    displayOrder !== Number(noradCatalogId)
  ) {
    return undefined
  }

  return {
    noradCatalogId,
    name,
    internationalDesignator,
    objectType: parsedObjectType,
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
    displayOrder,
  }
}

export const starlinkCatalogDigestInput = (
  snapshot: Omit<StarlinkCatalogSnapshotPayload, 'digest'>,
) => ({
  schemaVersion: snapshot.schemaVersion,
  sourceContractVersion: snapshot.sourceContractVersion,
  catalogId: snapshot.catalogId,
  sources: snapshot.sources,
  populationCount: snapshot.populationCount,
  extraSatcatCount: snapshot.extraSatcatCount,
  sampleLimit: snapshot.sampleLimit,
  sampleAlgorithm: snapshot.sampleAlgorithm,
  ...(snapshot.samplingReferenceTime !== undefined
    ? {
        samplingReferenceTime: snapshot.samplingReferenceTime,
        shells: snapshot.shells,
      }
    : {}),
  recordCount: snapshot.recordCount,
  records: snapshot.records,
  publishedAt: snapshot.publishedAt,
})

const digest = async (value: string) => {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const applicationSnapshot = (
  payload: StarlinkCatalogSnapshotPayload,
  config: StarlinkCatalogProviderConfig,
): StarlinkOrbitalCatalogSnapshot => {
  const gpRetrievedAt = Date.parse(payload.sources.gp.retrievedAt)
  const satcatRetrievedAt = Date.parse(
    payload.sources.satcat.retrievedAt,
  )
  const retrievedAt =
    gpRetrievedAt >= satcatRetrievedAt
      ? payload.sources.gp.retrievedAt
      : payload.sources.satcat.retrievedAt
  const records: OrbitalObject[] = payload.records.map((record) => ({
    ...record,
    sourceGroups: ['starlink'],
  }))
  return {
    owner: 'starlink',
    schemaVersion: payload.schemaVersion,
    sourceContractVersion: payload.sourceContractVersion,
    catalogId: payload.catalogId,
    sources: [
      {
        group: 'starlink',
        gpSourceUrl: config.gpSourceUrl,
        satcatSourceUrl: config.satcatSourceUrl,
        gpRecordCount: payload.sources.gp.recordCount,
        satcatRecordCount: payload.sources.satcat.recordCount,
      },
    ],
    retrievedAt,
    publishedAt: payload.publishedAt,
    recordCount: payload.recordCount,
    records,
    sha256: payload.digest,
    starlink: {
      sources: payload.sources,
      populationCount: payload.populationCount,
      extraSatcatCount: payload.extraSatcatCount,
      sampleLimit: payload.sampleLimit,
      sampleAlgorithm: payload.sampleAlgorithm,
      ...(payload.samplingReferenceTime
        ? {
            samplingReferenceTime: payload.samplingReferenceTime,
            shells: payload.shells,
          }
        : {}),
    },
  }
}

const parseSnapshot = async (
  value: unknown,
  config: StarlinkCatalogProviderConfig,
  contract: StarlinkCatalogContractConfig,
) => {
  if (
    !isRecord(value) ||
    !exactKeys(
      value,
      contract.shellBalanced ? topLevelKeysV2 : topLevelKeysV1,
    )
  ) {
    throw new ProviderError('Starlink catalog schema is invalid')
  }
  if (
    value.schemaVersion !== contract.schemaVersion ||
    value.sourceContractVersion !== contract.sourceContractVersion ||
    value.catalogId !== contract.catalogId ||
    value.sampleLimit !== contract.sampleLimit ||
    value.sampleAlgorithm !== contract.sampleAlgorithm ||
    !isRecord(value.sources) ||
    !exactKeys(value.sources, ['gp', 'satcat'])
  ) {
    throw new ProviderError('Starlink catalog schema is invalid')
  }

  const sources = {
    gp: parseSource(value.sources.gp, config.gpSourceUrl, config),
    satcat: parseSource(
      value.sources.satcat,
      config.satcatSourceUrl,
      config,
    ),
  }
  if (!sources.gp || !sources.satcat) {
    throw new ProviderError(
      'Starlink catalog contains invalid source metadata',
    )
  }
  if (
    sources.gp.decodedBytes + sources.satcat.decodedBytes >
    config.maximumAggregateSourceBytes
  ) {
    throw new ProviderError(
      'Starlink catalog source metadata exceeds the aggregate limit',
    )
  }

  const populationCount = integerNumber(
    value.populationCount,
    1,
    config.maximumPopulationRecords,
  )
  const extraSatcatCount = integerNumber(
    value.extraSatcatCount,
    0,
    config.maximumPopulationRecords,
  )
  if (
    populationCount === undefined ||
    extraSatcatCount === undefined ||
    sources.gp.recordCount !== populationCount ||
    sources.satcat.recordCount !==
      populationCount + extraSatcatCount
  ) {
    throw new ProviderError(
      'Starlink catalog source counts are invalid',
    )
  }
  const samplingReferenceTime = contract.shellBalanced
    ? timestamp(value.samplingReferenceTime, 3)
    : undefined
  const shells = contract.shellBalanced
    ? parseShells(
        value.shells,
        populationCount,
        contract.sampleLimit,
      )
    : undefined
  if (
    contract.shellBalanced &&
    (samplingReferenceTime !== sources.gp.retrievedAt ||
      shells === undefined)
  ) {
    throw new ProviderError(
      'Starlink catalog sampling metadata is invalid',
    )
  }

  if (!Array.isArray(value.records)) {
    throw new ProviderError('Starlink catalog records are invalid')
  }
  const recordCount = integerNumber(
    value.recordCount,
    1,
    contract.maximumRecords,
  )
  if (
    recordCount === undefined ||
    recordCount !==
      (contract.shellBalanced
        ? contract.sampleLimit
        : Math.min(populationCount, contract.sampleLimit)) ||
    value.records.length !== recordCount
  ) {
    throw new ProviderError(
      'Starlink catalog sample count is invalid',
    )
  }
  const records = value.records.map(parseObject)
  if (records.some((record) => record === undefined)) {
    throw new ProviderError('Starlink catalog contains an invalid record')
  }
  const completeRecords = records as StarlinkCatalogRecordPayload[]
  let previousId = 0
  const sampledShellCounts = new Map<string, number>()
  for (const record of completeRecords) {
    const numericId = Number(record.noradCatalogId)
    if (numericId <= previousId) {
      throw new ProviderError('Starlink catalog ordering is invalid')
    }
    previousId = numericId
    if (contract.shellBalanced) {
      const shell = shellDefinitions.find(
        (definition) =>
          record.inclination >=
            definition.inclinationMinimumDegrees &&
          (definition.inclinationMaximumDegreesExclusive === null ||
            record.inclination <
              definition.inclinationMaximumDegreesExclusive),
      )
      if (!shell) {
        throw new ProviderError(
          'Starlink catalog sampling metadata is invalid',
        )
      }
      sampledShellCounts.set(
        shell.id,
        (sampledShellCounts.get(shell.id) ?? 0) + 1,
      )
    }
  }
  if (
    shells?.some(
      (shell) =>
        sampledShellCounts.get(shell.id) !== shell.sampleCount,
    )
  ) {
    throw new ProviderError(
      'Starlink catalog sampling metadata is invalid',
    )
  }

  const publishedAt = timestamp(value.publishedAt, 3)
  const payloadDigest =
    typeof value.digest === 'string' &&
    /^[a-f0-9]{64}$/.test(value.digest)
      ? value.digest
      : undefined
  if (
    publishedAt === undefined ||
    Date.parse(sources.gp.retrievedAt) >
      Date.parse(sources.satcat.retrievedAt) ||
    Date.parse(publishedAt) <
      Date.parse(sources.satcat.retrievedAt) ||
    payloadDigest === undefined
  ) {
    throw new ProviderError('Starlink catalog schema is invalid')
  }

  const withoutDigest: Omit<
    StarlinkCatalogSnapshotPayload,
    'digest'
  > = {
    schemaVersion: contract.schemaVersion,
    sourceContractVersion: contract.sourceContractVersion,
    catalogId: contract.catalogId,
    sources: {
      gp: sources.gp,
      satcat: sources.satcat,
    },
    populationCount,
    extraSatcatCount,
    sampleLimit: contract.sampleLimit,
    sampleAlgorithm: contract.sampleAlgorithm,
    ...(samplingReferenceTime
      ? { samplingReferenceTime, shells }
      : {}),
    recordCount,
    records: completeRecords,
    publishedAt,
  }
  const computedDigest = await digest(
    JSON.stringify(starlinkCatalogDigestInput(withoutDigest)),
  )
  if (computedDigest !== payloadDigest) {
    throw new ProviderError('Starlink catalog digest is invalid')
  }
  return applicationSnapshot(
    { ...withoutDigest, digest: payloadDigest },
    config,
  )
}

const readBoundedJson = async (
  response: Response,
  config: StarlinkCatalogProviderConfig,
) => {
  const contentType = response.headers.get('Content-Type')?.trim()
  const contract = catalogContracts(config).find(
    (candidate) =>
      candidate.mediaType.toLowerCase() === contentType?.toLowerCase(),
  )
  if (!contract) {
    await response.body?.cancel()
    throw new ProviderError(
      'Starlink catalog returned an invalid content type',
    )
  }
  const contentLength = Number(response.headers.get('Content-Length'))
  if (
    Number.isFinite(contentLength) &&
    contentLength > config.maximumBytes
  ) {
    await response.body?.cancel()
    throw new ProviderError(
      'Starlink catalog exceeded the response limit',
    )
  }
  if (!response.body) {
    throw new ProviderError('Starlink catalog returned an empty response')
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > config.maximumBytes) {
      await reader.cancel()
      throw new ProviderError(
        'Starlink catalog exceeded the response limit',
      )
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
    return {
      value: JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      ) as unknown,
      contract,
    }
  } catch {
    throw new ProviderError('Starlink catalog returned invalid JSON')
  }
}

const abortError = () =>
  new DOMException('Starlink catalog request aborted', 'AbortError')

const responseClock = (
  response: Response,
  requestStartedAt: number,
  responseWallTimeMs: number,
  responsePerformanceTimeMs: number,
) => {
  const servedAt = response.headers.get('X-LiveTrafficStan-Served-At')
  const serverTimeMs =
    servedAt && parseOrbitalTimestamp(servedAt) !== undefined
      ? Date.parse(servedAt)
      : Number.NaN
  if (!Number.isFinite(serverTimeMs)) {
    throw new ProviderError('Starlink catalog response time is invalid')
  }
  return {
    serverTimeMs,
    requestMidpointWallTimeMs:
      requestStartedAt + (responseWallTimeMs - requestStartedAt) / 2,
    responseWallTimeMs,
    responsePerformanceTimeMs,
  }
}

export class StarlinkCatalogProvider {
  private readonly config: StarlinkCatalogProviderConfig
  private readonly runtime: OrbitalCatalogRuntime
  private fulfilled?: {
    snapshot: StarlinkOrbitalCatalogSnapshot
    etag: string
  }

  constructor(
    config: StarlinkCatalogProviderConfig,
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
      controller.abort(new Error('Starlink catalog request timed out'))
    }, this.config.timeoutMs)
    const requestStartedAt = this.runtime.wallNow()
    const ensureActive = () => {
      if (signal.aborted) throw abortError()
      if (timedOut || controller.signal.aborted) {
        throw new ProviderError('Starlink catalog request timed out')
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
            ? 'Starlink catalog is not enabled on this deployment'
            : `Starlink catalog returned HTTP ${response.status}`,
          response.status,
          retryAfterMs,
        )
      }

      let clock: OrbitalCatalogLoadResult['clock']
      try {
        clock = responseClock(
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
        'X-LiveTrafficStan-Starlink-Source',
      )
      const source =
        sourceHeader === 'kv' || sourceHeader === 'bootstrap'
          ? sourceHeader
          : undefined
      const responseDigest = response.headers.get(
        'X-LiveTrafficStan-Starlink-Digest',
      )
      const responsePublishedAt = response.headers.get(
        'X-LiveTrafficStan-Starlink-Published-At',
      )
      const responseSchema = Number(
        response.headers.get('X-LiveTrafficStan-Starlink-Schema'),
      )

      if (response.status === 304) {
        await response.body?.cancel()
        ensureActive()
        if (
          !this.fulfilled ||
          response.headers.get('ETag') !== this.fulfilled.etag ||
          source === undefined ||
          responseDigest !== this.fulfilled.snapshot.sha256 ||
          responsePublishedAt !== this.fulfilled.snapshot.publishedAt ||
          responseSchema !== this.fulfilled.snapshot.schemaVersion
        ) {
          throw new ProviderError(
            'Starlink catalog revalidation response is invalid',
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
        throw new ProviderError('Starlink catalog response is invalid')
      }

      const bounded = await readBoundedJson(response, this.config)
      const snapshot = await parseSnapshot(
        bounded.value,
        this.config,
        bounded.contract,
      )
      ensureActive()
      const etag = response.headers.get('ETag')
      if (
        etag !== `W/"${snapshot.sha256}"` ||
        responseDigest !== snapshot.sha256 ||
        responsePublishedAt !== snapshot.publishedAt ||
        responseSchema !== snapshot.schemaVersion
      ) {
        throw new ProviderError('Starlink catalog headers are invalid')
      }
      ensureActive()
      this.fulfilled = { snapshot, etag }
      return { snapshot, clock, source }
    } catch (error) {
      if (signal.aborted) throw abortError()
      if (error instanceof ProviderError) throw error
      if (timedOut) {
        throw new ProviderError('Starlink catalog request timed out')
      }
      throw new ProviderError('Starlink catalog request failed')
    } finally {
      this.runtime.clearTimeout(timeout)
      signal.removeEventListener('abort', handleAbort)
    }
  }
}
