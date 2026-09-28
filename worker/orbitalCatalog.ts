export const ORBITAL_CATALOG_PATH = '/api/orbits/catalog'
export const ORBITAL_BOOTSTRAP_PATH =
  '/orbital-data/v1/visual-catalog.json'
export const ORBITAL_CATALOG_KEY = 'orbital:catalog:v1'
export const ORBITAL_CATALOG_SCHEMA_VERSION = 1
export const ORBITAL_SOURCE_CONTRACT_VERSION = 1
export const ORBITAL_GROUP = 'visual'
export const ORBITAL_GP_URL =
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json'
export const ORBITAL_SATCAT_URL =
  'https://celestrak.org/satcat/records.php?GROUP=visual&FORMAT=json'
export const ORBITAL_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1_000
export const ORBITAL_UPSTREAM_TIMEOUT_MS = 10_000
export const ORBITAL_MAX_UPSTREAM_BYTES = 256 * 1_024
export const ORBITAL_MAX_SNAPSHOT_BYTES = 256 * 1_024
export const ORBITAL_MAX_RECORDS = 256
export const ORBITAL_MAX_RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1_000

export type OrbitalObjectType = 'PAY' | 'R/B' | 'DEB' | 'UNK'

export interface OrbitalCatalogRecord {
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
}

export interface OrbitalCatalogSnapshot {
  schemaVersion: 1
  sourceContractVersion: 1
  group: 'visual'
  gpSourceUrl: string
  satcatSourceUrl: string
  retrievedAt: string
  recordCount: number
  records: OrbitalCatalogRecord[]
  sha256: string
}

export interface OrbitalKeyValueStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

export interface OrbitalAssetBinding {
  fetch(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response>
}

export type OrbitalCatalogFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface OrbitalCatalogEnvironment {
  ASSETS: OrbitalAssetBinding
  ORBITAL_CATALOG?: OrbitalKeyValueStore
  ORBITAL_CATALOG_ENABLED?: string
}

export type OrbitalRefreshReservation =
  | { kind: 'admitted'; attemptId: string }
  | { kind: 'not-due'; nextAllowedAtMs: number }
  | { kind: 'blocked'; status: number }

export type OrbitalRefreshCompletion =
  | { kind: 'next'; nextAllowedAtMs: number }
  | { kind: 'blocked'; status: number; blockedAtMs: number }

export interface OrbitalRefreshCoordinator {
  reserve(nowMs: number): Promise<OrbitalRefreshReservation>
  complete(
    attemptId: string,
    completion: OrbitalRefreshCompletion,
  ): Promise<void>
}

export type OrbitalRefreshOutcome =
  | { kind: 'disabled' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'not-due'; nextAllowedAtMs: number }
  | { kind: 'blocked'; status: number }
  | { kind: 'rate-limited'; nextAllowedAtMs: number }
  | {
      kind: 'deferred'
      status: number
      nextAllowedAtMs: number
    }
  | { kind: 'failed'; reason: string }
  | {
      kind: 'published'
      recordCount: number
      sha256: string
      retrievedAt: string
    }

interface SnapshotDigestInput {
  schemaVersion: 1
  sourceContractVersion: 1
  group: 'visual'
  gpSourceUrl: string
  satcatSourceUrl: string
  retrievedAt: string
  recordCount: number
  records: OrbitalCatalogRecord[]
}

interface RefreshOptions {
  fetchImpl?: OrbitalCatalogFetch
  nowMs?: number
  timeoutMs?: number
  maximumUpstreamBytes?: number
}

interface CatalogRouteOptions {
  nowMs?: number
}

type UnknownRecord = Record<string, unknown>

class OrbitalCatalogValidationError extends Error {}

class OrbitalCatalogUpstreamError extends Error {
  readonly kind: 'blocked' | 'retry-after' | 'transient'
  readonly status?: number
  readonly retryAtMs?: number

  constructor(
    message: string,
    options: {
      kind: 'blocked' | 'retry-after' | 'transient'
      status?: number
      retryAtMs?: number
    },
  ) {
    super(message)
    this.kind = options.kind
    this.status = options.status
    this.retryAtMs = options.retryAtMs
  }
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const boundedString = (
  value: unknown,
  name: string,
  minimumLength: number,
  maximumLength: number,
) => {
  if (
    typeof value !== 'string' ||
    value.length < minimumLength ||
    value.length > maximumLength ||
    value.trim() !== value
  ) {
    throw new OrbitalCatalogValidationError(`Invalid ${name}`)
  }
  return value
}

const finiteNumber = (
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
) => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new OrbitalCatalogValidationError(`Invalid ${name}`)
  }
  return value
}

const integerNumber = (
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
) => {
  const result = finiteNumber(value, name, minimum, maximum)
  if (!Number.isInteger(result)) {
    throw new OrbitalCatalogValidationError(`Invalid ${name}`)
  }
  return result
}

const canonicalNoradId = (value: unknown) => {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^(?:[1-9]\d{0,8})$/.test(value)
        ? Number(value)
        : Number.NaN

  if (
    !Number.isSafeInteger(numeric) ||
    numeric < 1 ||
    numeric > 999_999_999
  ) {
    throw new OrbitalCatalogValidationError('Invalid NORAD catalog ID')
  }
  return String(numeric)
}

const epochPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z?$/

const utcEpoch = (value: unknown, name = 'epoch') => {
  const epoch = boundedString(value, name, 19, 27)
  const match = epochPattern.exec(epoch)
  if (!match) {
    throw new OrbitalCatalogValidationError(`Invalid ${name}`)
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fraction = '',
  ] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const milliseconds = Number(fraction.padEnd(3, '0').slice(0, 3))
  const time = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    milliseconds,
  )
  const date = new Date(time)

  if (
    !Number.isFinite(time) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    throw new OrbitalCatalogValidationError(`Invalid ${name}`)
  }

  return `${epoch.endsWith('Z') ? epoch.slice(0, -1) : epoch}Z`
}

const objectType = (value: unknown): OrbitalObjectType => {
  if (value === 'PAY' || value === 'R/B' || value === 'DEB' || value === 'UNK') {
    return value
  }
  throw new OrbitalCatalogValidationError('Invalid orbital object type')
}

const classificationType = (value: unknown) => {
  const classification = boundedString(
    value,
    'classification type',
    1,
    1,
  )
  if (!/^[A-Z]$/.test(classification)) {
    throw new OrbitalCatalogValidationError(
      'Invalid classification type',
    )
  }
  return classification
}

const exactKeys = (
  value: UnknownRecord,
  expectedKeys: readonly string[],
  name: string,
) => {
  const actualKeys = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  if (
    actualKeys.length !== expected.length ||
    actualKeys.some((key, index) => key !== expected[index])
  ) {
    throw new OrbitalCatalogValidationError(`Invalid ${name} fields`)
  }
}

const publishedRecordKeys = [
  'argumentOfPericenter',
  'bstar',
  'classificationType',
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

const publishedRecord = (value: unknown): OrbitalCatalogRecord => {
  if (!isRecord(value)) {
    throw new OrbitalCatalogValidationError('Invalid orbital record')
  }
  exactKeys(value, publishedRecordKeys, 'orbital record')

  return {
    noradCatalogId: canonicalNoradId(value.noradCatalogId),
    name: boundedString(value.name, 'object name', 1, 120),
    internationalDesignator: boundedString(
      value.internationalDesignator,
      'international designator',
      1,
      24,
    ),
    objectType: objectType(value.objectType),
    epoch: utcEpoch(value.epoch),
    meanMotion: finiteNumber(value.meanMotion, 'mean motion', 0, 20),
    eccentricity: finiteNumber(value.eccentricity, 'eccentricity', 0, 0.99999999),
    inclination: finiteNumber(value.inclination, 'inclination', 0, 180),
    rightAscensionOfAscendingNode: finiteNumber(
      value.rightAscensionOfAscendingNode,
      'right ascension of ascending node',
      0,
      360,
    ),
    argumentOfPericenter: finiteNumber(
      value.argumentOfPericenter,
      'argument of pericenter',
      0,
      360,
    ),
    meanAnomaly: finiteNumber(value.meanAnomaly, 'mean anomaly', 0, 360),
    ephemerisType: integerNumber(
      value.ephemerisType,
      'ephemeris type',
      0,
      99,
    ),
    classificationType: classificationType(value.classificationType),
    elementSetNumber: integerNumber(
      value.elementSetNumber,
      'element set number',
      0,
      999_999,
    ),
    revolutionAtEpoch: integerNumber(
      value.revolutionAtEpoch,
      'revolution at epoch',
      0,
      99_999_999,
    ),
    bstar: finiteNumber(value.bstar, 'BSTAR', -10, 10),
    meanMotionDot: finiteNumber(
      value.meanMotionDot,
      'mean motion dot',
      -10,
      10,
    ),
    meanMotionDdot: finiteNumber(
      value.meanMotionDdot,
      'mean motion double dot',
      -10,
      10,
    ),
  }
}

const digestInput = (
  snapshot: Omit<OrbitalCatalogSnapshot, 'sha256'>,
): SnapshotDigestInput => ({
  schemaVersion: snapshot.schemaVersion,
  sourceContractVersion: snapshot.sourceContractVersion,
  group: snapshot.group,
  gpSourceUrl: snapshot.gpSourceUrl,
  satcatSourceUrl: snapshot.satcatSourceUrl,
  retrievedAt: snapshot.retrievedAt,
  recordCount: snapshot.recordCount,
  records: snapshot.records,
})

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export const serializeOrbitalCatalogSnapshot = (
  snapshot: OrbitalCatalogSnapshot,
) => `${JSON.stringify(snapshot)}\n`

export const createOrbitalCatalogSnapshot = async (
  gpValue: unknown,
  satcatValue: unknown,
  retrievedAtValue: string,
): Promise<OrbitalCatalogSnapshot> => {
  if (
    !Array.isArray(gpValue) ||
    gpValue.length === 0 ||
    gpValue.length > ORBITAL_MAX_RECORDS
  ) {
    throw new OrbitalCatalogValidationError('Invalid GP record count')
  }
  if (
    !Array.isArray(satcatValue) ||
    satcatValue.length === 0 ||
    satcatValue.length > ORBITAL_MAX_RECORDS
  ) {
    throw new OrbitalCatalogValidationError('Invalid SATCAT record count')
  }

  const satcatTypes = new Map<string, OrbitalObjectType>()
  for (const value of satcatValue) {
    if (!isRecord(value)) {
      throw new OrbitalCatalogValidationError('Invalid SATCAT record')
    }
    const id = canonicalNoradId(value.NORAD_CAT_ID)
    if (satcatTypes.has(id)) {
      throw new OrbitalCatalogValidationError('Duplicate SATCAT record')
    }
    satcatTypes.set(id, objectType(value.OBJECT_TYPE))
  }

  const recordIds = new Set<string>()
  const records = gpValue.map((value) => {
    if (!isRecord(value)) {
      throw new OrbitalCatalogValidationError('Invalid GP record')
    }
    const id = canonicalNoradId(value.NORAD_CAT_ID)
    if (recordIds.has(id)) {
      throw new OrbitalCatalogValidationError('Duplicate GP record')
    }
    recordIds.add(id)

    const type = satcatTypes.get(id)
    if (!type) {
      throw new OrbitalCatalogValidationError(
        'Missing SATCAT metadata',
      )
    }

    return publishedRecord({
      noradCatalogId: id,
      name: value.OBJECT_NAME,
      internationalDesignator: value.OBJECT_ID,
      objectType: type,
      epoch: value.EPOCH,
      meanMotion: value.MEAN_MOTION,
      eccentricity: value.ECCENTRICITY,
      inclination: value.INCLINATION,
      rightAscensionOfAscendingNode: value.RA_OF_ASC_NODE,
      argumentOfPericenter: value.ARG_OF_PERICENTER,
      meanAnomaly: value.MEAN_ANOMALY,
      ephemerisType: value.EPHEMERIS_TYPE,
      classificationType: value.CLASSIFICATION_TYPE,
      elementSetNumber: value.ELEMENT_SET_NO,
      revolutionAtEpoch: value.REV_AT_EPOCH,
      bstar: value.BSTAR,
      meanMotionDot: value.MEAN_MOTION_DOT,
      meanMotionDdot: value.MEAN_MOTION_DDOT,
    })
  })

  records.sort(
    (left, right) =>
      Number(left.noradCatalogId) - Number(right.noradCatalogId),
  )

  const snapshotWithoutDigest: Omit<OrbitalCatalogSnapshot, 'sha256'> = {
    schemaVersion: ORBITAL_CATALOG_SCHEMA_VERSION,
    sourceContractVersion: ORBITAL_SOURCE_CONTRACT_VERSION,
    group: ORBITAL_GROUP,
    gpSourceUrl: ORBITAL_GP_URL,
    satcatSourceUrl: ORBITAL_SATCAT_URL,
    retrievedAt: utcEpoch(retrievedAtValue, 'retrieval time'),
    recordCount: records.length,
    records,
  }
  const snapshot: OrbitalCatalogSnapshot = {
    ...snapshotWithoutDigest,
    sha256: await sha256(
      JSON.stringify(digestInput(snapshotWithoutDigest)),
    ),
  }
  if (
    new TextEncoder().encode(serializeOrbitalCatalogSnapshot(snapshot))
      .byteLength > ORBITAL_MAX_SNAPSHOT_BYTES
  ) {
    throw new OrbitalCatalogValidationError(
      'Published orbital snapshot is too large',
    )
  }
  return snapshot
}

export const validateOrbitalCatalogSnapshot = async (
  value: unknown,
): Promise<OrbitalCatalogSnapshot> => {
  if (!isRecord(value)) {
    throw new OrbitalCatalogValidationError('Invalid orbital snapshot')
  }
  exactKeys(
    value,
    [
      'gpSourceUrl',
      'group',
      'recordCount',
      'records',
      'retrievedAt',
      'satcatSourceUrl',
      'schemaVersion',
      'sha256',
      'sourceContractVersion',
    ],
    'orbital snapshot',
  )
  if (value.schemaVersion !== ORBITAL_CATALOG_SCHEMA_VERSION) {
    throw new OrbitalCatalogValidationError(
      'Unsupported orbital snapshot schema',
    )
  }
  if (value.sourceContractVersion !== ORBITAL_SOURCE_CONTRACT_VERSION) {
    throw new OrbitalCatalogValidationError(
      'Unsupported orbital source contract',
    )
  }
  if (
    value.group !== ORBITAL_GROUP ||
    value.gpSourceUrl !== ORBITAL_GP_URL ||
    value.satcatSourceUrl !== ORBITAL_SATCAT_URL
  ) {
    throw new OrbitalCatalogValidationError(
      'Invalid orbital snapshot source',
    )
  }
  if (
    !Array.isArray(value.records) ||
    value.records.length === 0 ||
    value.records.length > ORBITAL_MAX_RECORDS
  ) {
    throw new OrbitalCatalogValidationError(
      'Invalid orbital snapshot record count',
    )
  }

  const records = value.records.map(publishedRecord)
  const ids = new Set<string>()
  for (const record of records) {
    if (ids.has(record.noradCatalogId)) {
      throw new OrbitalCatalogValidationError(
        'Duplicate published orbital record',
      )
    }
    ids.add(record.noradCatalogId)
  }
  const sortedRecords = [...records].sort(
    (left, right) =>
      Number(left.noradCatalogId) - Number(right.noradCatalogId),
  )
  if (
    records.some(
      (record, index) =>
        record.noradCatalogId !== sortedRecords[index]?.noradCatalogId,
    )
  ) {
    throw new OrbitalCatalogValidationError(
      'Orbital records are not stably ordered',
    )
  }
  if (value.recordCount !== records.length) {
    throw new OrbitalCatalogValidationError(
      'Orbital snapshot count does not match',
    )
  }

  const snapshotWithoutDigest: Omit<OrbitalCatalogSnapshot, 'sha256'> = {
    schemaVersion: ORBITAL_CATALOG_SCHEMA_VERSION,
    sourceContractVersion: ORBITAL_SOURCE_CONTRACT_VERSION,
    group: ORBITAL_GROUP,
    gpSourceUrl: ORBITAL_GP_URL,
    satcatSourceUrl: ORBITAL_SATCAT_URL,
    retrievedAt: utcEpoch(value.retrievedAt, 'retrieval time'),
    recordCount: records.length,
    records,
  }
  const expectedDigest = await sha256(
    JSON.stringify(digestInput(snapshotWithoutDigest)),
  )
  if (
    typeof value.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.sha256) ||
    value.sha256 !== expectedDigest
  ) {
    throw new OrbitalCatalogValidationError(
      'Orbital snapshot digest does not match',
    )
  }

  const snapshot = {
    ...snapshotWithoutDigest,
    sha256: expectedDigest,
  } satisfies OrbitalCatalogSnapshot
  if (
    new TextEncoder().encode(serializeOrbitalCatalogSnapshot(snapshot))
      .byteLength > ORBITAL_MAX_SNAPSHOT_BYTES
  ) {
    throw new OrbitalCatalogValidationError(
      'Orbital snapshot is too large',
    )
  }
  return snapshot
}

type RetryAtResult =
  | { kind: 'supported'; retryAtMs: number }
  | { kind: 'too-long' }

const retryAt = (
  retryAfter: string | null,
  nowMs: number,
): RetryAtResult | undefined => {
  if (!retryAfter) return undefined
  let retryAtMs: number
  if (/^\d+$/.test(retryAfter)) {
    const seconds = Number(retryAfter)
    if (!Number.isSafeInteger(seconds)) return { kind: 'too-long' }
    const delayMs = seconds * 1_000
    if (
      !Number.isSafeInteger(delayMs) ||
      delayMs > ORBITAL_MAX_RETRY_AFTER_MS
    ) {
      return { kind: 'too-long' }
    }
    retryAtMs = nowMs + delayMs
  } else {
    retryAtMs = Date.parse(retryAfter)
    if (!Number.isSafeInteger(retryAtMs)) return undefined
  }
  if (
    !Number.isSafeInteger(retryAtMs) ||
    retryAtMs - nowMs > ORBITAL_MAX_RETRY_AFTER_MS
  ) {
    return { kind: 'too-long' }
  }
  return { kind: 'supported', retryAtMs }
}

const isJsonContentType = (value: string | null) => {
  if (!value) return false
  const parts = value.split(';').map((part) => part.trim())
  if (
    parts[0]?.toLowerCase() !== 'application/json' ||
    parts.length > 2
  ) {
    return false
  }
  return (
    parts.length === 1 ||
    /^charset=(?:utf-8|"utf-8")$/i.test(parts[1] ?? '')
  )
}

const readBoundedJson = async (
  response: Response,
  controller: AbortController,
  maximumBytes: number,
) => {
  const contentType = response.headers.get('Content-Type')
  if (!isJsonContentType(contentType)) {
    throw new OrbitalCatalogUpstreamError(
      'Orbital upstream returned an unsupported content type',
      { kind: 'transient', status: response.status },
    )
  }

  const contentLength = response.headers.get('Content-Length')
  if (contentLength) {
    const declaredBytes = Number(contentLength)
    if (
      Number.isFinite(declaredBytes) &&
      declaredBytes > maximumBytes
    ) {
      controller.abort()
      throw new OrbitalCatalogUpstreamError(
        'Orbital upstream response was too large',
        { kind: 'transient', status: response.status },
      )
    }
  }

  if (!response.body) {
    throw new OrbitalCatalogUpstreamError(
      'Orbital upstream response was empty',
      { kind: 'transient', status: response.status },
    )
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      totalBytes += value.byteLength
      if (totalBytes > maximumBytes) {
        controller.abort()
        void reader.cancel()
        throw new OrbitalCatalogUpstreamError(
          'Orbital upstream response was too large',
          { kind: 'transient', status: response.status },
        )
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return JSON.parse(
      new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: false,
      }).decode(bytes),
    )
  } catch {
    throw new OrbitalCatalogUpstreamError(
      'Orbital upstream response was malformed',
      { kind: 'transient', status: response.status },
    )
  }
}

const fetchBoundedJson = async (
  url: string,
  options: {
    fetchImpl: OrbitalCatalogFetch
    nowMs: number
    timeoutMs: number
    maximumBytes: number
  },
) => {
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('Orbital upstream timed out'))
  }, options.timeoutMs)

  try {
    const response = await options.fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    })
    if (response.status >= 300 && response.status < 400) {
      throw new OrbitalCatalogUpstreamError(
        'Orbital upstream redirect rejected',
        { kind: 'blocked', status: response.status },
      )
    }
    if (response.status === 403 || response.status === 404) {
      throw new OrbitalCatalogUpstreamError(
        'Orbital upstream access is blocked',
        { kind: 'blocked', status: response.status },
      )
    }
    if (response.status === 429) {
      const retry = retryAt(
        response.headers.get('Retry-After'),
        options.nowMs,
      )
      if (retry?.kind === 'too-long') {
        throw new OrbitalCatalogUpstreamError(
          'Orbital upstream retry guidance requires review',
          { kind: 'blocked', status: response.status },
        )
      }
      throw new OrbitalCatalogUpstreamError(
        'Orbital upstream is rate limited',
        {
          kind: 'retry-after',
          status: response.status,
          retryAtMs:
            retry?.kind === 'supported'
              ? retry.retryAtMs
              : undefined,
        },
      )
    }
    if (response.status >= 500 && response.status < 600) {
      const retry = retryAt(
        response.headers.get('Retry-After'),
        options.nowMs,
      )
      if (retry?.kind === 'too-long') {
        throw new OrbitalCatalogUpstreamError(
          'Orbital upstream retry guidance requires review',
          { kind: 'blocked', status: response.status },
        )
      }
      if (retry?.kind === 'supported') {
        throw new OrbitalCatalogUpstreamError(
          'Orbital upstream requested a later retry',
          {
            kind: 'retry-after',
            status: response.status,
            retryAtMs: retry.retryAtMs,
          },
        )
      }
    }
    if (response.status !== 200) {
      throw new OrbitalCatalogUpstreamError(
        'Orbital upstream request failed',
        { kind: 'transient', status: response.status },
      )
    }
    return await readBoundedJson(
      response,
      controller,
      options.maximumBytes,
    )
  } catch (error) {
    if (error instanceof OrbitalCatalogUpstreamError) throw error
    throw new OrbitalCatalogUpstreamError(
      timedOut
        ? 'Orbital upstream timed out'
        : 'Orbital upstream request failed',
      { kind: 'transient' },
    )
  } finally {
    clearTimeout(timeout)
  }
}

export const refreshOrbitalCatalog = async (
  environment: OrbitalCatalogEnvironment,
  coordinator: OrbitalRefreshCoordinator,
  options: RefreshOptions = {},
): Promise<OrbitalRefreshOutcome> => {
  if (environment.ORBITAL_CATALOG_ENABLED !== 'true') {
    return { kind: 'disabled' }
  }
  const store = environment.ORBITAL_CATALOG
  if (!store) {
    return { kind: 'unavailable', reason: 'KV binding is unavailable' }
  }

  const nowMs = options.nowMs ?? Date.now()
  let reservation: OrbitalRefreshReservation
  try {
    reservation = await coordinator.reserve(nowMs)
  } catch {
    return {
      kind: 'unavailable',
      reason: 'Could not persist the provider start gate',
    }
  }
  if (reservation.kind === 'blocked') {
    return reservation
  }
  if (reservation.kind === 'not-due') {
    return reservation
  }

  const ordinaryNextAllowedAtMs = nowMs + ORBITAL_REFRESH_INTERVAL_MS
  const complete = async (completion: OrbitalRefreshCompletion) => {
    try {
      await coordinator.complete(reservation.attemptId, completion)
      return true
    } catch {
      return false
    }
  }

  let snapshot: OrbitalCatalogSnapshot
  try {
    const fetchOptions = {
      fetchImpl: options.fetchImpl ?? fetch,
      nowMs,
      timeoutMs: options.timeoutMs ?? ORBITAL_UPSTREAM_TIMEOUT_MS,
      maximumBytes:
        options.maximumUpstreamBytes ?? ORBITAL_MAX_UPSTREAM_BYTES,
    }
    const gp = await fetchBoundedJson(ORBITAL_GP_URL, fetchOptions)
    const satcat = await fetchBoundedJson(
      ORBITAL_SATCAT_URL,
      fetchOptions,
    )
    snapshot = await createOrbitalCatalogSnapshot(
      gp,
      satcat,
      new Date(nowMs).toISOString(),
    )
  } catch (error) {
    if (error instanceof OrbitalCatalogUpstreamError) {
      if (error.kind === 'blocked' && error.status !== undefined) {
        if (
          !(await complete({
            kind: 'blocked',
            status: error.status,
            blockedAtMs: nowMs,
          }))
        ) {
          return {
            kind: 'unavailable',
            reason: 'Could not persist the provider outcome',
          }
        }
        return { kind: 'blocked', status: error.status }
      }
      if (error.kind === 'retry-after') {
        const nextAllowedAtMs = Math.max(
          ordinaryNextAllowedAtMs,
          error.retryAtMs ?? ordinaryNextAllowedAtMs,
        )
        if (
          !(await complete({
            kind: 'next',
            nextAllowedAtMs,
          }))
        ) {
          return {
            kind: 'unavailable',
            reason: 'Could not persist the provider outcome',
          }
        }
        return error.status === 429
          ? { kind: 'rate-limited', nextAllowedAtMs }
          : {
              kind: 'deferred',
              status: error.status ?? 500,
              nextAllowedAtMs,
            }
      }
      if (
        !(await complete({
          kind: 'next',
          nextAllowedAtMs: ordinaryNextAllowedAtMs,
        }))
      ) {
        return {
          kind: 'unavailable',
          reason: 'Could not persist the provider outcome',
        }
      }
      return { kind: 'failed', reason: error.message }
    }
    if (
      !(await complete({
        kind: 'next',
        nextAllowedAtMs: ordinaryNextAllowedAtMs,
      }))
    ) {
      return {
        kind: 'unavailable',
        reason: 'Could not persist the provider outcome',
      }
    }
    if (error instanceof OrbitalCatalogValidationError) {
      return { kind: 'failed', reason: error.message }
    }
    return { kind: 'failed', reason: 'Orbital snapshot publication failed' }
  }

  if (
    !(await complete({
      kind: 'next',
      nextAllowedAtMs: ordinaryNextAllowedAtMs,
    }))
  ) {
    return {
      kind: 'unavailable',
      reason: 'Could not persist the provider outcome',
    }
  }
  try {
    await store.put(
      ORBITAL_CATALOG_KEY,
      serializeOrbitalCatalogSnapshot(snapshot),
    )
  } catch {
    return { kind: 'failed', reason: 'Orbital snapshot publication failed' }
  }
  return {
    kind: 'published',
    recordCount: snapshot.recordCount,
    sha256: snapshot.sha256,
    retrievedAt: snapshot.retrievedAt,
  }
}

const textResponse = (
  message: string,
  status: number,
  headers?: Record<string, string>,
) =>
  new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  })

const readSnapshotText = async (text: string) => {
  if (new TextEncoder().encode(text).byteLength > ORBITAL_MAX_SNAPSHOT_BYTES) {
    throw new OrbitalCatalogValidationError(
      'Orbital snapshot is too large',
    )
  }
  return validateOrbitalCatalogSnapshot(JSON.parse(text))
}

const loadBootstrap = async (
  request: Request,
  assets: OrbitalAssetBinding,
) => {
  const url = new URL(ORBITAL_BOOTSTRAP_PATH, request.url)
  const response = await assets.fetch(new Request(url))
  if (!response.ok) return undefined
  return readSnapshotText(await response.text())
}

export const handleOrbitalCatalog = async (
  request: Request,
  environment: OrbitalCatalogEnvironment,
  options: CatalogRouteOptions = {},
) => {
  if (environment.ORBITAL_CATALOG_ENABLED !== 'true') {
    return textResponse('Not found', 404)
  }
  const url = new URL(request.url)
  if (request.method !== 'GET') {
    return textResponse('Method not allowed', 405, { Allow: 'GET' })
  }
  if (url.search || request.url.includes('?')) {
    return textResponse('Orbital catalog queries are not supported', 400)
  }

  let snapshot: OrbitalCatalogSnapshot | undefined
  let source: 'kv' | 'bootstrap' = 'bootstrap'
  const stored = await environment.ORBITAL_CATALOG
    ?.get(ORBITAL_CATALOG_KEY)
    .catch(() => null)
  if (stored) {
    try {
      snapshot = await readSnapshotText(stored)
      source = 'kv'
    } catch {
      snapshot = undefined
    }
  }
  if (!snapshot) {
    try {
      snapshot = await loadBootstrap(request, environment.ASSETS)
    } catch {
      snapshot = undefined
    }
  }
  if (!snapshot) {
    return textResponse('Orbital catalog unavailable', 503, {
      'Retry-After': '300',
    })
  }

  const etag = `"${snapshot.sha256}"`
  const headers = new Headers({
    'Cache-Control': 'public, max-age=300, must-revalidate',
    'Content-Type': 'application/json; charset=utf-8',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'X-LiveTrafficStan-Orbital-Source': source,
    'X-LiveTrafficStan-Orbital-Retrieved-At': snapshot.retrievedAt,
    'X-LiveTrafficStan-Orbital-Schema': String(snapshot.schemaVersion),
    'X-LiveTrafficStan-Orbital-Sha256': snapshot.sha256,
    'X-LiveTrafficStan-Served-At': new Date(
      options.nowMs ?? Date.now(),
    ).toISOString(),
  })
  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(serializeOrbitalCatalogSnapshot(snapshot), {
    status: 200,
    headers,
  })
}
