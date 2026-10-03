import type {
  OrbitalAssetBinding,
  OrbitalCatalogFetch,
  OrbitalKeyValueStore,
} from './orbitalCatalog.js'

export const STARLINK_CATALOG_PATH = '/api/orbits/starlink'
export const STARLINK_CATALOG_MEDIA_TYPE =
  'application/vnd.livetrafficstan.starlink-catalog+json;version=1'
export const STARLINK_CATALOG_SCHEMA_VERSION = 1
export const STARLINK_SOURCE_CONTRACT_VERSION = 1
export const STARLINK_CATALOG_ID =
  'celestrak-starlink-sample-v1'
export const STARLINK_CATALOG_KEY =
  'orbital:catalog:v1:starlink-sample-v1'
export const STARLINK_CATALOG_V2_MEDIA_TYPE =
  'application/vnd.livetrafficstan.starlink-catalog+json;version=2'
export const STARLINK_CATALOG_V2_SCHEMA_VERSION = 2
export const STARLINK_V2_SOURCE_CONTRACT_VERSION = 2
export const STARLINK_CATALOG_V2_ID =
  'celestrak-starlink-shell-balanced-v1'
export const STARLINK_CATALOG_PUBLICATION_KEY =
  'orbital:catalog:v2:starlink-shell-balanced-v1'
export const STARLINK_CATALOG_PUBLICATION_VERSION = 1
export const STARLINK_BOOTSTRAP_VERSION =
  'starlink-2026-10-02-v1'
export const STARLINK_BOOTSTRAP_PATH =
  `/orbital-data/${STARLINK_BOOTSTRAP_VERSION}/catalog.json`
export const STARLINK_NOTICE_PATH =
  `/orbital-data/${STARLINK_BOOTSTRAP_VERSION}/NOTICE.txt`
export const STARLINK_V2_BOOTSTRAP_VERSION =
  'starlink-shell-balanced-2026-10-02-v1'
export const STARLINK_V2_BOOTSTRAP_PATH =
  `/orbital-data/${STARLINK_V2_BOOTSTRAP_VERSION}/catalog.json`
export const STARLINK_V2_NOTICE_PATH =
  `/orbital-data/${STARLINK_V2_BOOTSTRAP_VERSION}/NOTICE.txt`
export const STARLINK_GP_SOURCE_URL =
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=JSON'
export const STARLINK_SATCAT_SOURCE_URL =
  'https://celestrak.org/satcat/records.php?GROUP=starlink&FORMAT=JSON'
export const STARLINK_SAMPLE_LIMIT = 150
export const STARLINK_SAMPLE_ALGORITHM =
  'inclination-raan-systematic-v1'
export const STARLINK_V2_SAMPLE_LIMIT = 512
export const STARLINK_V2_SAMPLE_ALGORITHM =
  'inclination-shell-raan-phase-grid-v1'
export const STARLINK_SHELL_SAMPLE_COUNT = 128
export const STARLINK_RAAN_TARGET_COUNT = 16
export const STARLINK_PHASE_TARGET_COUNT = 8
export const STARLINK_REFRESH_INTERVAL_MS =
  12 * 60 * 60 * 1_000
export const STARLINK_BOOTSTRAP_GP_RETRIEVED_AT_MS = Date.parse(
  '2026-10-02T08:40:03.000Z',
)
export const STARLINK_INITIAL_REFRESH_NOT_BEFORE_MS =
  STARLINK_BOOTSTRAP_GP_RETRIEVED_AT_MS +
  STARLINK_REFRESH_INTERVAL_MS
export const STARLINK_MAX_UPSTREAM_BYTES = 6 * 1_024 * 1_024
export const STARLINK_MAX_AGGREGATE_BYTES =
  12 * 1_024 * 1_024
export const STARLINK_MAX_UPSTREAM_RECORDS = 15_000
export const STARLINK_MAX_SNAPSHOT_BYTES = 256 * 1_024
export const STARLINK_V2_MAX_SNAPSHOT_BYTES = 512 * 1_024
export const STARLINK_MAX_PUBLICATION_BYTES =
  STARLINK_MAX_SNAPSHOT_BYTES +
  STARLINK_V2_MAX_SNAPSHOT_BYTES +
  8 * 1_024
export const STARLINK_BOOTSTRAP_TIMEOUT_MS = 1_500
export const STARLINK_CLOCK_TOLERANCE_MS = 5 * 60 * 1_000
export const STARLINK_BROWSER_EXPIRE_AFTER_MS =
  24 * 60 * 60 * 1_000
export const STARLINK_TOTAL_REFRESH_TIMEOUT_MS = 60_000
export const STARLINK_UPSTREAM_TIMEOUT_MS = 30_000
export const STARLINK_MAX_RETRY_AFTER_MS =
  7 * 24 * 60 * 60 * 1_000
export const STARLINK_UPSTREAM_USER_AGENT =
  'LiveTrafficStan (+https://github.com/vasilyevstan/LiveTrafficStan)'

const STARLINK_BOOTSTRAP_MEDIA_TYPE = 'application/json'

export type StarlinkObjectType = 'PAY' | 'R/B' | 'DEB' | 'UNK'

export interface StarlinkCatalogRecord {
  noradCatalogId: string
  name: string
  internationalDesignator: string
  objectType: StarlinkObjectType
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

export interface StarlinkSourceMetadata {
  url: string
  retrievedAt: string
  recordCount: number
  decodedBytes: number
  sha256: string
}

export interface StarlinkCatalogSnapshot {
  schemaVersion: 1
  sourceContractVersion: 1
  catalogId: typeof STARLINK_CATALOG_ID
  sources: {
    gp: StarlinkSourceMetadata
    satcat: StarlinkSourceMetadata
  }
  populationCount: number
  extraSatcatCount: number
  sampleLimit: typeof STARLINK_SAMPLE_LIMIT
  sampleAlgorithm: typeof STARLINK_SAMPLE_ALGORITHM
  recordCount: number
  records: StarlinkCatalogRecord[]
  publishedAt: string
  digest: string
}

export type StarlinkShellId =
  | 'inclination-lt-48'
  | 'inclination-48-lt-60'
  | 'inclination-60-lt-85'
  | 'inclination-gte-85'

export interface StarlinkSamplingShell {
  id: StarlinkShellId
  inclinationMinimumDegrees: number
  inclinationMaximumDegreesExclusive: number | null
  populationCount: number
  sampleCount: typeof STARLINK_SHELL_SAMPLE_COUNT
}

export interface StarlinkCatalogSnapshotV2 {
  schemaVersion: typeof STARLINK_CATALOG_V2_SCHEMA_VERSION
  sourceContractVersion: typeof STARLINK_V2_SOURCE_CONTRACT_VERSION
  catalogId: typeof STARLINK_CATALOG_V2_ID
  sources: {
    gp: StarlinkSourceMetadata
    satcat: StarlinkSourceMetadata
  }
  populationCount: number
  extraSatcatCount: number
  sampleLimit: typeof STARLINK_V2_SAMPLE_LIMIT
  sampleAlgorithm: typeof STARLINK_V2_SAMPLE_ALGORITHM
  samplingReferenceTime: string
  shells: StarlinkSamplingShell[]
  recordCount: number
  records: StarlinkCatalogRecord[]
  publishedAt: string
  digest: string
}

export interface StarlinkCatalogPublication {
  publicationVersion: typeof STARLINK_CATALOG_PUBLICATION_VERSION
  schema1: StarlinkCatalogSnapshot
  schema2: StarlinkCatalogSnapshotV2
}

export interface StarlinkCatalogSourceInput {
  gpValue: unknown
  satcatValue: unknown
  gpRetrievedAt: string
  satcatRetrievedAt: string
  gpDecodedBytes: number
  satcatDecodedBytes: number
  gpSha256: string
  satcatSha256: string
}

export interface StarlinkCatalogEnvironment {
  ASSETS: OrbitalAssetBinding
  ORBITAL_CATALOG?: OrbitalKeyValueStore
  ORBITAL_CATALOG_ENABLED?: string
  STARLINK_CATALOG_ENABLED?: string
}

export interface StarlinkRefreshOptions {
  fetchImpl?: OrbitalCatalogFetch
  nowMs?: number
  monotonicNow?: () => number
  timeoutMs?: number
  totalTimeoutMs?: number
  maximumUpstreamBytes?: number
  maximumAggregateBytes?: number
  maximumRecords?: number
}

export type StarlinkRefreshPreparation =
  | { kind: 'disabled' }
  | { kind: 'not-due'; nextAllowedAtMs: number }
  | { kind: 'skipped'; reason: string }
  | {
      kind: 'ready'
      publication: StarlinkCatalogPublication
    }
  | {
      kind: 'blocked'
      status: number
      blockedAtMs: number
    }
  | {
      kind: 'retry-after'
      status: number
      retryAtMs?: number
    }
  | { kind: 'failed'; reason: string }

type UnknownRecord = Record<string, unknown>

type NormalizedStarlinkRecord = Omit<
  StarlinkCatalogRecord,
  'displayOrder'
>

type SatcatIdentity = Pick<
  NormalizedStarlinkRecord,
  'name' | 'internationalDesignator' | 'objectType'
>

class StarlinkCatalogValidationError extends Error {}

class StarlinkCatalogUpstreamError extends Error {
  readonly kind: 'blocked' | 'retry-after' | 'transient'
  readonly status?: number
  readonly retryAtMs?: number
  readonly receivedAtMs?: number

  constructor(
    message: string,
    options: {
      kind: 'blocked' | 'retry-after' | 'transient'
      status?: number
      retryAtMs?: number
      receivedAtMs?: number
    },
  ) {
    super(message)
    this.kind = options.kind
    this.status = options.status
    this.retryAtMs = options.retryAtMs
    this.receivedAtMs = options.receivedAtMs
  }
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const exactKeys = (
  value: UnknownRecord,
  expectedKeys: readonly string[],
  name: string,
) => {
  const actual = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new StarlinkCatalogValidationError(
      `Invalid ${name} fields`,
    )
  }
}

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
    throw new StarlinkCatalogValidationError(`Invalid ${name}`)
  }
  return value
}

const normalizedSourceString = (
  value: unknown,
  name: string,
  minimumLength: number,
  maximumLength: number,
) => {
  if (typeof value !== 'string') {
    throw new StarlinkCatalogValidationError(`Invalid ${name}`)
  }
  const normalized = value.trim()
  if (
    normalized.length < minimumLength ||
    normalized.length > maximumLength
  ) {
    throw new StarlinkCatalogValidationError(`Invalid ${name}`)
  }
  return normalized
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
    throw new StarlinkCatalogValidationError(`Invalid ${name}`)
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
    throw new StarlinkCatalogValidationError(`Invalid ${name}`)
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
    throw new StarlinkCatalogValidationError(
      'Invalid NORAD catalog ID',
    )
  }
  return String(numeric)
}

const epochPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z?$/

const utcTime = (
  value: unknown,
  name: string,
  fractionDigits: 3 | 6,
) => {
  const input = boundedString(value, name, 19, 27)
  const match = epochPattern.exec(input)
  if (!match) {
    throw new StarlinkCatalogValidationError(`Invalid ${name}`)
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
    throw new StarlinkCatalogValidationError(`Invalid ${name}`)
  }
  const canonicalFraction = fraction
    .padEnd(fractionDigits, '0')
    .slice(0, fractionDigits)
  return (
    `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:` +
    `${secondText}.${canonicalFraction}Z`
  )
}

const utcEpoch = (value: unknown, name = 'epoch') =>
  utcTime(value, name, 6)

const utcTimestamp = (value: unknown, name: string) =>
  utcTime(value, name, 3)

const objectType = (value: unknown): StarlinkObjectType => {
  if (
    value === 'PAY' ||
    value === 'R/B' ||
    value === 'DEB' ||
    value === 'UNK'
  ) {
    return value
  }
  throw new StarlinkCatalogValidationError(
    'Invalid orbital object type',
  )
}

const classificationType = (value: unknown) => {
  const result = boundedString(
    value,
    'classification type',
    1,
    1,
  )
  if (!/^[A-Z]$/.test(result)) {
    throw new StarlinkCatalogValidationError(
      'Invalid classification type',
    )
  }
  return result
}

const digestHex = async (value: Uint8Array | string) => {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : value
  const digestInput = new Uint8Array(bytes.byteLength)
  digestInput.set(bytes)
  const digest = await crypto.subtle.digest(
    'SHA-256',
    digestInput.buffer,
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const propagationFields = [
  'argumentOfPericenter',
  'bstar',
  'classificationType',
  'eccentricity',
  'elementSetNumber',
  'ephemerisType',
  'inclination',
  'meanAnomaly',
  'meanMotion',
  'meanMotionDdot',
  'meanMotionDot',
  'revolutionAtEpoch',
  'rightAscensionOfAscendingNode',
] as const

const publishedRecordKeys = [
  ...propagationFields,
  'displayOrder',
  'epoch',
  'internationalDesignator',
  'name',
  'noradCatalogId',
  'objectType',
] as const

const normalizedOmmRecord = (value: {
  noradCatalogId: unknown
  name: unknown
  internationalDesignator: unknown
  objectType: unknown
  epoch: unknown
  meanMotion: unknown
  eccentricity: unknown
  inclination: unknown
  rightAscensionOfAscendingNode: unknown
  argumentOfPericenter: unknown
  meanAnomaly: unknown
  ephemerisType: unknown
  classificationType: unknown
  elementSetNumber: unknown
  revolutionAtEpoch: unknown
  bstar: unknown
  meanMotionDot: unknown
  meanMotionDdot: unknown
}): NormalizedStarlinkRecord => ({
  noradCatalogId: canonicalNoradId(value.noradCatalogId),
  name: boundedString(value.name, 'object name', 1, 120),
  internationalDesignator: boundedString(
    value.internationalDesignator,
    'international designator',
    0,
    24,
  ),
  objectType: objectType(value.objectType),
  epoch: utcEpoch(value.epoch),
  meanMotion: finiteNumber(value.meanMotion, 'mean motion', 0, 20),
  eccentricity: finiteNumber(
    value.eccentricity,
    'eccentricity',
    0,
    0.99999999,
  ),
  inclination: finiteNumber(
    value.inclination,
    'inclination',
    0,
    180,
  ),
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
  meanAnomaly: finiteNumber(
    value.meanAnomaly,
    'mean anomaly',
    0,
    360,
  ),
  ephemerisType: integerNumber(
    value.ephemerisType,
    'ephemeris type',
    0,
    99,
  ),
  classificationType: classificationType(
    value.classificationType,
  ),
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
})

const sourceSatcatRecord = (
  value: unknown,
): { id: string; identity: SatcatIdentity } => {
  if (!isRecord(value)) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink SATCAT record',
    )
  }
  return {
    id: canonicalNoradId(value.NORAD_CAT_ID),
    identity: {
      name: normalizedSourceString(
        value.OBJECT_NAME,
        'SATCAT object name',
        1,
        120,
      ),
      internationalDesignator: normalizedSourceString(
        value.OBJECT_ID,
        'SATCAT international designator',
        0,
        24,
      ),
      objectType: objectType(value.OBJECT_TYPE),
    },
  }
}

const sourceGpRecord = (
  value: unknown,
  satcatType: StarlinkObjectType,
): NormalizedStarlinkRecord => {
  if (!isRecord(value)) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink GP record',
    )
  }
  return normalizedOmmRecord({
    noradCatalogId: value.NORAD_CAT_ID,
    name: normalizedSourceString(
      value.OBJECT_NAME,
      'GP object name',
      1,
      120,
    ),
    internationalDesignator: normalizedSourceString(
      value.OBJECT_ID,
      'GP international designator',
      0,
      24,
    ),
    objectType: Object.hasOwn(value, 'OBJECT_TYPE')
      ? value.OBJECT_TYPE
      : satcatType,
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
}

const publishedRecord = (value: unknown): StarlinkCatalogRecord => {
  if (!isRecord(value)) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink catalog record',
    )
  }
  exactKeys(value, publishedRecordKeys, 'Starlink catalog record')
  const record = normalizedOmmRecord({
    noradCatalogId: value.noradCatalogId,
    name: value.name,
    internationalDesignator: value.internationalDesignator,
    objectType: value.objectType,
    epoch: value.epoch,
    meanMotion: value.meanMotion,
    eccentricity: value.eccentricity,
    inclination: value.inclination,
    rightAscensionOfAscendingNode:
      value.rightAscensionOfAscendingNode,
    argumentOfPericenter: value.argumentOfPericenter,
    meanAnomaly: value.meanAnomaly,
    ephemerisType: value.ephemerisType,
    classificationType: value.classificationType,
    elementSetNumber: value.elementSetNumber,
    revolutionAtEpoch: value.revolutionAtEpoch,
    bstar: value.bstar,
    meanMotionDot: value.meanMotionDot,
    meanMotionDdot: value.meanMotionDdot,
  })
  const expectedDisplayOrder = Number(record.noradCatalogId)
  if (value.displayOrder !== expectedDisplayOrder) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink display order',
    )
  }
  return { ...record, displayOrder: expectedDisplayOrder }
}

const sourceMetadata = (
  value: unknown,
  expectedUrl: string,
  name: string,
): StarlinkSourceMetadata => {
  if (!isRecord(value)) {
    throw new StarlinkCatalogValidationError(
      `Invalid ${name} source metadata`,
    )
  }
  exactKeys(
    value,
    ['url', 'retrievedAt', 'recordCount', 'decodedBytes', 'sha256'],
    `${name} source metadata`,
  )
  if (value.url !== expectedUrl) {
    throw new StarlinkCatalogValidationError(
      `Invalid ${name} source URL`,
    )
  }
  const recordCount = integerNumber(
    value.recordCount,
    `${name} source record count`,
    1,
    STARLINK_MAX_UPSTREAM_RECORDS,
  )
  const decodedBytes = integerNumber(
    value.decodedBytes,
    `${name} source decoded bytes`,
    1,
    STARLINK_MAX_UPSTREAM_BYTES,
  )
  const sourceDigest = boundedString(
    value.sha256,
    `${name} source digest`,
    64,
    64,
  )
  if (!/^[0-9a-f]{64}$/.test(sourceDigest)) {
    throw new StarlinkCatalogValidationError(
      `Invalid ${name} source digest`,
    )
  }
  return {
    url: expectedUrl,
    retrievedAt: utcTimestamp(
      value.retrievedAt,
      `${name} retrieval time`,
    ),
    recordCount,
    decodedBytes,
    sha256: sourceDigest,
  }
}

const snapshotDigestInput = (
  snapshot: Omit<StarlinkCatalogSnapshot, 'digest'>,
) => ({
  schemaVersion: snapshot.schemaVersion,
  sourceContractVersion: snapshot.sourceContractVersion,
  catalogId: snapshot.catalogId,
  sources: snapshot.sources,
  populationCount: snapshot.populationCount,
  extraSatcatCount: snapshot.extraSatcatCount,
  sampleLimit: snapshot.sampleLimit,
  sampleAlgorithm: snapshot.sampleAlgorithm,
  recordCount: snapshot.recordCount,
  records: snapshot.records,
  publishedAt: snapshot.publishedAt,
})

const snapshotV2DigestInput = (
  snapshot: Omit<StarlinkCatalogSnapshotV2, 'digest'>,
) => ({
  schemaVersion: snapshot.schemaVersion,
  sourceContractVersion: snapshot.sourceContractVersion,
  catalogId: snapshot.catalogId,
  sources: snapshot.sources,
  populationCount: snapshot.populationCount,
  extraSatcatCount: snapshot.extraSatcatCount,
  sampleLimit: snapshot.sampleLimit,
  sampleAlgorithm: snapshot.sampleAlgorithm,
  samplingReferenceTime: snapshot.samplingReferenceTime,
  shells: snapshot.shells,
  recordCount: snapshot.recordCount,
  records: snapshot.records,
  publishedAt: snapshot.publishedAt,
})

export const serializeStarlinkCatalogSnapshot = (
  snapshot: StarlinkCatalogSnapshot,
) => `${JSON.stringify(snapshot)}\n`

export const serializeStarlinkCatalogSnapshotV2 = (
  snapshot: StarlinkCatalogSnapshotV2,
) => `${JSON.stringify(snapshot)}\n`

export const serializeStarlinkCatalogPublication = (
  publication: StarlinkCatalogPublication,
) => `${JSON.stringify(publication)}\n`

const ensureSnapshotSize = (snapshot: StarlinkCatalogSnapshot) => {
  if (
    new TextEncoder().encode(
      serializeStarlinkCatalogSnapshot(snapshot),
    ).byteLength > STARLINK_MAX_SNAPSHOT_BYTES
  ) {
    throw new StarlinkCatalogValidationError(
      'Published Starlink snapshot is too large',
    )
  }
}

const ensureSnapshotV2Size = (
  snapshot: StarlinkCatalogSnapshotV2,
) => {
  if (
    new TextEncoder().encode(
      serializeStarlinkCatalogSnapshotV2(snapshot),
    ).byteLength > STARLINK_V2_MAX_SNAPSHOT_BYTES
  ) {
    throw new StarlinkCatalogValidationError(
      'Published Starlink schema-2 snapshot is too large',
    )
  }
}

const ensurePublicationSize = (
  publication: StarlinkCatalogPublication,
) => {
  if (
    new TextEncoder().encode(
      serializeStarlinkCatalogPublication(publication),
    ).byteLength > STARLINK_MAX_PUBLICATION_BYTES
  ) {
    throw new StarlinkCatalogValidationError(
      'Published Starlink publication is too large',
    )
  }
}

export const starlinkSystematicSampleIndices = (
  populationCount: number,
  sampleCount = Math.min(
    populationCount,
    STARLINK_SAMPLE_LIMIT,
  ),
) => {
  if (
    !Number.isSafeInteger(populationCount) ||
    populationCount < 1 ||
    populationCount > STARLINK_MAX_UPSTREAM_RECORDS ||
    !Number.isSafeInteger(sampleCount) ||
    sampleCount < 1 ||
    sampleCount > Math.min(populationCount, STARLINK_SAMPLE_LIMIT)
  ) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink sample dimensions',
    )
  }
  return Array.from({ length: sampleCount }, (_, index) =>
    Math.floor(
      ((index + 0.5) * populationCount) / sampleCount,
    ),
  )
}

const normalizedRaan = (value: number) =>
  ((value % 360) + 360) % 360

const STARLINK_SHELL_DEFINITIONS = [
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
] as const satisfies readonly Omit<
  StarlinkSamplingShell,
  'populationCount' | 'sampleCount'
>[]

const angularDistance = (left: number, right: number) => {
  const distance = Math.abs(normalizedRaan(left) - normalizedRaan(right))
  return Math.min(distance, 360 - distance)
}

export const starlinkPhaseAt = (
  record: Pick<
    NormalizedStarlinkRecord,
    | 'epoch'
    | 'meanMotion'
    | 'argumentOfPericenter'
    | 'meanAnomaly'
  >,
  referenceTimeValue: string,
) => {
  const referenceTime = Date.parse(
    utcTimestamp(referenceTimeValue, 'Starlink sampling reference time'),
  )
  const epoch = Date.parse(record.epoch)
  if (!Number.isFinite(referenceTime) || !Number.isFinite(epoch)) {
    throw new StarlinkCatalogValidationError(
      'Starlink sampling time is invalid',
    )
  }
  const elapsedDays = (referenceTime - epoch) / 86_400_000
  return normalizedRaan(
    record.meanAnomaly +
      record.argumentOfPericenter +
      record.meanMotion * 360 * elapsedDays,
  )
}

const shellForInclination = (inclination: number) =>
  STARLINK_SHELL_DEFINITIONS.find(
    (shell) =>
      inclination >= shell.inclinationMinimumDegrees &&
      (shell.inclinationMaximumDegreesExclusive === null ||
        inclination < shell.inclinationMaximumDegreesExclusive),
  )

export const starlinkShellBalancedSample = (
  population: readonly NormalizedStarlinkRecord[],
  samplingReferenceTime: string,
) => {
  const selected: NormalizedStarlinkRecord[] = []
  const shells: StarlinkSamplingShell[] = []

  for (const definition of STARLINK_SHELL_DEFINITIONS) {
    const members = population
      .filter(
        (record) =>
          shellForInclination(record.inclination)?.id ===
          definition.id,
      )
      .map((record) => ({
        record,
        phase: starlinkPhaseAt(record, samplingReferenceTime),
      }))
    if (members.length < STARLINK_SHELL_SAMPLE_COUNT) {
      throw new StarlinkCatalogValidationError(
        `Starlink shell ${definition.id} cannot satisfy its fixed sample`,
      )
    }

    const available = new Set(
      members.map(({ record }) => record.noradCatalogId),
    )
    for (
      let raanIndex = 0;
      raanIndex < STARLINK_RAAN_TARGET_COUNT;
      raanIndex += 1
    ) {
      const targetRaan =
        ((raanIndex + 0.5) * 360) / STARLINK_RAAN_TARGET_COUNT
      for (
        let phaseIndex = 0;
        phaseIndex < STARLINK_PHASE_TARGET_COUNT;
        phaseIndex += 1
      ) {
        const targetPhase =
          ((phaseIndex + 0.5) * 360) /
          STARLINK_PHASE_TARGET_COUNT
        let candidate:
          | {
              record: NormalizedStarlinkRecord
              distance: number
            }
          | undefined
        for (const { record, phase } of members) {
          if (!available.has(record.noradCatalogId)) continue
          const distance =
            angularDistance(
              record.rightAscensionOfAscendingNode,
              targetRaan,
            ) ** 2 +
            angularDistance(phase, targetPhase) ** 2
          if (
            !candidate ||
            distance < candidate.distance ||
            (distance === candidate.distance &&
              Number(record.noradCatalogId) <
                Number(candidate.record.noradCatalogId))
          ) {
            candidate = { record, distance }
          }
        }
        if (!candidate) {
          throw new StarlinkCatalogValidationError(
            `Starlink shell ${definition.id} sampling failed`,
          )
        }
        available.delete(candidate.record.noradCatalogId)
        selected.push(candidate.record)
      }
    }
    shells.push({
      ...definition,
      populationCount: members.length,
      sampleCount: STARLINK_SHELL_SAMPLE_COUNT,
    })
  }

  return {
    records: selected
      .sort(
        (left, right) =>
          Number(left.noradCatalogId) -
          Number(right.noradCatalogId),
      )
      .map(
        (record): StarlinkCatalogRecord => ({
          ...record,
          displayOrder: Number(record.noradCatalogId),
        }),
      ),
    shells,
  }
}

interface NormalizedStarlinkPopulation {
  joined: NormalizedStarlinkRecord[]
  sources: {
    gp: StarlinkSourceMetadata
    satcat: StarlinkSourceMetadata
  }
  populationCount: number
  extraSatcatCount: number
  publishedAt: string
}

const normalizeStarlinkPopulation = (
  input: StarlinkCatalogSourceInput,
  publishedAtValue: string,
) => {
  if (
    !Array.isArray(input.gpValue) ||
    input.gpValue.length === 0 ||
    input.gpValue.length > STARLINK_MAX_UPSTREAM_RECORDS
  ) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink GP record count',
    )
  }
  if (
    !Array.isArray(input.satcatValue) ||
    input.satcatValue.length === 0 ||
    input.satcatValue.length > STARLINK_MAX_UPSTREAM_RECORDS
  ) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink SATCAT record count',
    )
  }
  if (
    !Number.isSafeInteger(input.gpDecodedBytes) ||
    input.gpDecodedBytes < 1 ||
    input.gpDecodedBytes > STARLINK_MAX_UPSTREAM_BYTES ||
    !Number.isSafeInteger(input.satcatDecodedBytes) ||
    input.satcatDecodedBytes < 1 ||
    input.satcatDecodedBytes > STARLINK_MAX_UPSTREAM_BYTES ||
    input.gpDecodedBytes + input.satcatDecodedBytes >
      STARLINK_MAX_AGGREGATE_BYTES
  ) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink source byte counts',
    )
  }
  if (
    !/^[0-9a-f]{64}$/.test(input.gpSha256) ||
    !/^[0-9a-f]{64}$/.test(input.satcatSha256)
  ) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink source digest',
    )
  }

  const satcatById = new Map<string, SatcatIdentity>()
  for (const value of input.satcatValue) {
    const { id, identity } = sourceSatcatRecord(value)
    if (satcatById.has(id)) {
      throw new StarlinkCatalogValidationError(
        'Duplicate Starlink SATCAT record',
      )
    }
    satcatById.set(id, identity)
  }

  const joined: NormalizedStarlinkRecord[] = []
  const gpIds = new Set<string>()
  for (const value of input.gpValue) {
    if (!isRecord(value)) {
      throw new StarlinkCatalogValidationError(
        'Invalid Starlink GP record',
      )
    }
    const id = canonicalNoradId(value.NORAD_CAT_ID)
    if (gpIds.has(id)) {
      throw new StarlinkCatalogValidationError(
        'Duplicate Starlink GP record',
      )
    }
    gpIds.add(id)
    const satcat = satcatById.get(id)
    if (!satcat) {
      throw new StarlinkCatalogValidationError(
        'Starlink GP record is missing SATCAT metadata',
      )
    }
    const candidate = sourceGpRecord(value, satcat.objectType)
    if (
      candidate.name !== satcat.name ||
      candidate.internationalDesignator !==
        satcat.internationalDesignator
    ) {
      throw new StarlinkCatalogValidationError(
        'Starlink GP and SATCAT identity conflict',
      )
    }
    if (candidate.objectType !== satcat.objectType) {
      throw new StarlinkCatalogValidationError(
        'Starlink GP and SATCAT type conflict',
      )
    }
    joined.push(candidate)
  }

  const gpRetrievedAt = utcTimestamp(
    input.gpRetrievedAt,
    'Starlink GP retrieval time',
  )
  const satcatRetrievedAt = utcTimestamp(
    input.satcatRetrievedAt,
    'Starlink SATCAT retrieval time',
  )
  const publishedAt = utcTimestamp(
    publishedAtValue,
    'Starlink publication time',
  )
  if (Date.parse(gpRetrievedAt) > Date.parse(satcatRetrievedAt)) {
    throw new StarlinkCatalogValidationError(
      'Starlink SATCAT retrieval precedes GP retrieval',
    )
  }
  if (Date.parse(publishedAt) < Date.parse(satcatRetrievedAt)) {
    throw new StarlinkCatalogValidationError(
      'Starlink publication precedes source retrieval',
    )
  }

  const extraSatcatCount =
    input.satcatValue.length - input.gpValue.length
  if (extraSatcatCount < 0) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink SATCAT population',
    )
  }
  return {
    joined,
    sources: {
      gp: {
        url: STARLINK_GP_SOURCE_URL,
        retrievedAt: gpRetrievedAt,
        recordCount: input.gpValue.length,
        decodedBytes: input.gpDecodedBytes,
        sha256: input.gpSha256,
      },
      satcat: {
        url: STARLINK_SATCAT_SOURCE_URL,
        retrievedAt: satcatRetrievedAt,
        recordCount: input.satcatValue.length,
        decodedBytes: input.satcatDecodedBytes,
        sha256: input.satcatSha256,
      },
    },
    populationCount: joined.length,
    extraSatcatCount,
    publishedAt,
  } satisfies NormalizedStarlinkPopulation
}

const createLegacySnapshotFromPopulation = async (
  population: NormalizedStarlinkPopulation,
) => {
  const canonical = [...population.joined].sort(
    (left, right) =>
      left.inclination - right.inclination ||
      normalizedRaan(left.rightAscensionOfAscendingNode) -
        normalizedRaan(
          right.rightAscensionOfAscendingNode,
        ) ||
      Number(left.noradCatalogId) -
        Number(right.noradCatalogId),
  )
  const sampleCount = Math.min(
    canonical.length,
    STARLINK_SAMPLE_LIMIT,
  )
  const records = starlinkSystematicSampleIndices(
    canonical.length,
    sampleCount,
  )
    .map((index) => canonical[index] as NormalizedStarlinkRecord)
    .sort(
      (left, right) =>
        Number(left.noradCatalogId) -
        Number(right.noradCatalogId),
    )
    .map(
      (record): StarlinkCatalogRecord => ({
        ...record,
        displayOrder: Number(record.noradCatalogId),
      }),
    )

  const snapshotWithoutDigest: Omit<
    StarlinkCatalogSnapshot,
    'digest'
  > = {
    schemaVersion: STARLINK_CATALOG_SCHEMA_VERSION,
    sourceContractVersion: STARLINK_SOURCE_CONTRACT_VERSION,
    catalogId: STARLINK_CATALOG_ID,
    sources: population.sources,
    populationCount: population.populationCount,
    extraSatcatCount: population.extraSatcatCount,
    sampleLimit: STARLINK_SAMPLE_LIMIT,
    sampleAlgorithm: STARLINK_SAMPLE_ALGORITHM,
    recordCount: records.length,
    records,
    publishedAt: population.publishedAt,
  }
  const snapshot: StarlinkCatalogSnapshot = {
    ...snapshotWithoutDigest,
    digest: await digestHex(
      JSON.stringify(snapshotDigestInput(snapshotWithoutDigest)),
    ),
  }
  ensureSnapshotSize(snapshot)
  return snapshot
}

const createSnapshotV2FromPopulation = async (
  population: NormalizedStarlinkPopulation,
) => {
  const samplingReferenceTime = population.sources.gp.retrievedAt
  const sample = starlinkShellBalancedSample(
    population.joined,
    samplingReferenceTime,
  )
  if (sample.records.length !== STARLINK_V2_SAMPLE_LIMIT) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink schema-2 sample count',
    )
  }
  const snapshotWithoutDigest: Omit<
    StarlinkCatalogSnapshotV2,
    'digest'
  > = {
    schemaVersion: STARLINK_CATALOG_V2_SCHEMA_VERSION,
    sourceContractVersion: STARLINK_V2_SOURCE_CONTRACT_VERSION,
    catalogId: STARLINK_CATALOG_V2_ID,
    sources: population.sources,
    populationCount: population.populationCount,
    extraSatcatCount: population.extraSatcatCount,
    sampleLimit: STARLINK_V2_SAMPLE_LIMIT,
    sampleAlgorithm: STARLINK_V2_SAMPLE_ALGORITHM,
    samplingReferenceTime,
    shells: sample.shells,
    recordCount: sample.records.length,
    records: sample.records,
    publishedAt: population.publishedAt,
  }
  const snapshot: StarlinkCatalogSnapshotV2 = {
    ...snapshotWithoutDigest,
    digest: await digestHex(
      JSON.stringify(snapshotV2DigestInput(snapshotWithoutDigest)),
    ),
  }
  ensureSnapshotV2Size(snapshot)
  return snapshot
}

export const createStarlinkCatalogSnapshot = async (
  input: StarlinkCatalogSourceInput,
  publishedAtValue: string,
) =>
  createLegacySnapshotFromPopulation(
    normalizeStarlinkPopulation(input, publishedAtValue),
  )

export const createStarlinkCatalogSnapshotV2 = async (
  input: StarlinkCatalogSourceInput,
  publishedAtValue: string,
) =>
  createSnapshotV2FromPopulation(
    normalizeStarlinkPopulation(input, publishedAtValue),
  )

export const createStarlinkCatalogPublication = async (
  input: StarlinkCatalogSourceInput,
  publishedAtValue: string,
) => {
  const population = normalizeStarlinkPopulation(
    input,
    publishedAtValue,
  )
  const [schema1, schema2] = await Promise.all([
    createLegacySnapshotFromPopulation(population),
    createSnapshotV2FromPopulation(population),
  ])
  const publication: StarlinkCatalogPublication = {
    publicationVersion: STARLINK_CATALOG_PUBLICATION_VERSION,
    schema1,
    schema2,
  }
  ensurePublicationSize(publication)
  return publication
}

export const validateStarlinkCatalogSnapshot = async (
  value: unknown,
): Promise<StarlinkCatalogSnapshot> => {
  if (!isRecord(value)) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink snapshot',
    )
  }
  exactKeys(
    value,
    [
      'schemaVersion',
      'sourceContractVersion',
      'catalogId',
      'sources',
      'populationCount',
      'extraSatcatCount',
      'sampleLimit',
      'sampleAlgorithm',
      'recordCount',
      'records',
      'publishedAt',
      'digest',
    ],
    'Starlink snapshot',
  )
  if (
    value.schemaVersion !== STARLINK_CATALOG_SCHEMA_VERSION ||
    value.sourceContractVersion !==
      STARLINK_SOURCE_CONTRACT_VERSION ||
    value.catalogId !== STARLINK_CATALOG_ID ||
    value.sampleLimit !== STARLINK_SAMPLE_LIMIT ||
    value.sampleAlgorithm !== STARLINK_SAMPLE_ALGORITHM ||
    !isRecord(value.sources)
  ) {
    throw new StarlinkCatalogValidationError(
      'Unsupported Starlink snapshot contract',
    )
  }
  exactKeys(value.sources, ['gp', 'satcat'], 'Starlink sources')
  const sources = {
    gp: sourceMetadata(
      value.sources.gp,
      STARLINK_GP_SOURCE_URL,
      'Starlink GP',
    ),
    satcat: sourceMetadata(
      value.sources.satcat,
      STARLINK_SATCAT_SOURCE_URL,
      'Starlink SATCAT',
    ),
  }
  if (
    sources.gp.decodedBytes + sources.satcat.decodedBytes >
    STARLINK_MAX_AGGREGATE_BYTES
  ) {
    throw new StarlinkCatalogValidationError(
      'Starlink aggregate source bytes are invalid',
    )
  }
  const populationCount = integerNumber(
    value.populationCount,
    'Starlink population count',
    1,
    STARLINK_MAX_UPSTREAM_RECORDS,
  )
  const extraSatcatCount = integerNumber(
    value.extraSatcatCount,
    'Starlink extra SATCAT count',
    0,
    STARLINK_MAX_UPSTREAM_RECORDS,
  )
  if (
    sources.gp.recordCount !== populationCount ||
    sources.satcat.recordCount !==
      populationCount + extraSatcatCount
  ) {
    throw new StarlinkCatalogValidationError(
      'Starlink source counts do not match the population',
    )
  }
  if (!Array.isArray(value.records)) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink records',
    )
  }
  const recordCount = integerNumber(
    value.recordCount,
    'Starlink record count',
    1,
    STARLINK_SAMPLE_LIMIT,
  )
  if (
    recordCount !==
      Math.min(populationCount, STARLINK_SAMPLE_LIMIT) ||
    value.records.length !== recordCount
  ) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink sample count',
    )
  }
  const records = value.records.map(publishedRecord)
  for (let index = 1; index < records.length; index += 1) {
    if (
      Number(records[index - 1]?.noradCatalogId) >=
      Number(records[index]?.noradCatalogId)
    ) {
      throw new StarlinkCatalogValidationError(
        'Starlink records are not canonically ordered',
      )
    }
  }
  const publishedAt = utcTimestamp(
    value.publishedAt,
    'Starlink publication time',
  )
  if (
    Date.parse(sources.gp.retrievedAt) >
    Date.parse(sources.satcat.retrievedAt)
  ) {
    throw new StarlinkCatalogValidationError(
      'Starlink SATCAT retrieval precedes GP retrieval',
    )
  }
  if (
    Date.parse(publishedAt) <
    Date.parse(sources.satcat.retrievedAt)
  ) {
    throw new StarlinkCatalogValidationError(
      'Starlink publication precedes source retrieval',
    )
  }
  const digest = boundedString(
    value.digest,
    'Starlink digest',
    64,
    64,
  )
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink digest',
    )
  }
  const snapshotWithoutDigest: Omit<
    StarlinkCatalogSnapshot,
    'digest'
  > = {
    schemaVersion: STARLINK_CATALOG_SCHEMA_VERSION,
    sourceContractVersion: STARLINK_SOURCE_CONTRACT_VERSION,
    catalogId: STARLINK_CATALOG_ID,
    sources,
    populationCount,
    extraSatcatCount,
    sampleLimit: STARLINK_SAMPLE_LIMIT,
    sampleAlgorithm: STARLINK_SAMPLE_ALGORITHM,
    recordCount,
    records,
    publishedAt,
  }
  if (
    (await digestHex(
      JSON.stringify(snapshotDigestInput(snapshotWithoutDigest)),
    )) !== digest
  ) {
    throw new StarlinkCatalogValidationError(
      'Starlink snapshot digest does not match',
    )
  }
  const snapshot = { ...snapshotWithoutDigest, digest }
  ensureSnapshotSize(snapshot)
  return snapshot
}

export const validateStarlinkCatalogSnapshotV2 = async (
  value: unknown,
): Promise<StarlinkCatalogSnapshotV2> => {
  if (!isRecord(value)) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink schema-2 snapshot',
    )
  }
  exactKeys(
    value,
    [
      'schemaVersion',
      'sourceContractVersion',
      'catalogId',
      'sources',
      'populationCount',
      'extraSatcatCount',
      'sampleLimit',
      'sampleAlgorithm',
      'samplingReferenceTime',
      'shells',
      'recordCount',
      'records',
      'publishedAt',
      'digest',
    ],
    'Starlink schema-2 snapshot',
  )
  if (
    value.schemaVersion !== STARLINK_CATALOG_V2_SCHEMA_VERSION ||
    value.sourceContractVersion !==
      STARLINK_V2_SOURCE_CONTRACT_VERSION ||
    value.catalogId !== STARLINK_CATALOG_V2_ID ||
    value.sampleLimit !== STARLINK_V2_SAMPLE_LIMIT ||
    value.sampleAlgorithm !== STARLINK_V2_SAMPLE_ALGORITHM ||
    !isRecord(value.sources)
  ) {
    throw new StarlinkCatalogValidationError(
      'Unsupported Starlink schema-2 snapshot contract',
    )
  }
  exactKeys(value.sources, ['gp', 'satcat'], 'Starlink sources')
  const sources = {
    gp: sourceMetadata(
      value.sources.gp,
      STARLINK_GP_SOURCE_URL,
      'Starlink GP',
    ),
    satcat: sourceMetadata(
      value.sources.satcat,
      STARLINK_SATCAT_SOURCE_URL,
      'Starlink SATCAT',
    ),
  }
  if (
    sources.gp.decodedBytes + sources.satcat.decodedBytes >
    STARLINK_MAX_AGGREGATE_BYTES
  ) {
    throw new StarlinkCatalogValidationError(
      'Starlink aggregate source bytes are invalid',
    )
  }
  const populationCount = integerNumber(
    value.populationCount,
    'Starlink population count',
    1,
    STARLINK_MAX_UPSTREAM_RECORDS,
  )
  const extraSatcatCount = integerNumber(
    value.extraSatcatCount,
    'Starlink extra SATCAT count',
    0,
    STARLINK_MAX_UPSTREAM_RECORDS,
  )
  if (
    sources.gp.recordCount !== populationCount ||
    sources.satcat.recordCount !==
      populationCount + extraSatcatCount
  ) {
    throw new StarlinkCatalogValidationError(
      'Starlink source counts do not match the population',
    )
  }
  const samplingReferenceTime = utcTimestamp(
    value.samplingReferenceTime,
    'Starlink sampling reference time',
  )
  if (samplingReferenceTime !== sources.gp.retrievedAt) {
    throw new StarlinkCatalogValidationError(
      'Starlink sampling reference time does not match GP retrieval',
    )
  }
  if (
    !Array.isArray(value.shells) ||
    value.shells.length !== STARLINK_SHELL_DEFINITIONS.length
  ) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink sampling shells',
    )
  }
  const shells = value.shells.map(
    (shellValue, index): StarlinkSamplingShell => {
      if (!isRecord(shellValue)) {
        throw new StarlinkCatalogValidationError(
          'Invalid Starlink sampling shell',
        )
      }
      exactKeys(
        shellValue,
        [
          'id',
          'inclinationMinimumDegrees',
          'inclinationMaximumDegreesExclusive',
          'populationCount',
          'sampleCount',
        ],
        'Starlink sampling shell',
      )
      const expected = STARLINK_SHELL_DEFINITIONS[index]
      if (
        !expected ||
        shellValue.id !== expected.id ||
        shellValue.inclinationMinimumDegrees !==
          expected.inclinationMinimumDegrees ||
        shellValue.inclinationMaximumDegreesExclusive !==
          expected.inclinationMaximumDegreesExclusive ||
        shellValue.sampleCount !== STARLINK_SHELL_SAMPLE_COUNT
      ) {
        throw new StarlinkCatalogValidationError(
          'Invalid Starlink sampling shell contract',
        )
      }
      return {
        ...expected,
        populationCount: integerNumber(
          shellValue.populationCount,
          'Starlink shell population count',
          STARLINK_SHELL_SAMPLE_COUNT,
          populationCount,
        ),
        sampleCount: STARLINK_SHELL_SAMPLE_COUNT,
      }
    },
  )
  if (
    shells.reduce(
      (total, shell) => total + shell.populationCount,
      0,
    ) !== populationCount
  ) {
    throw new StarlinkCatalogValidationError(
      'Starlink shell populations do not match the source population',
    )
  }
  if (!Array.isArray(value.records)) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink records',
    )
  }
  const recordCount = integerNumber(
    value.recordCount,
    'Starlink record count',
    STARLINK_V2_SAMPLE_LIMIT,
    STARLINK_V2_SAMPLE_LIMIT,
  )
  if (value.records.length !== recordCount) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink schema-2 sample count',
    )
  }
  const records = value.records.map(publishedRecord)
  const sampledShellCounts = new Map<StarlinkShellId, number>()
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] as StarlinkCatalogRecord
    if (
      index > 0 &&
      Number(records[index - 1]?.noradCatalogId) >=
        Number(record.noradCatalogId)
    ) {
      throw new StarlinkCatalogValidationError(
        'Starlink records are not canonically ordered',
      )
    }
    const shell = shellForInclination(record.inclination)
    if (!shell) {
      throw new StarlinkCatalogValidationError(
        'Starlink record does not match a sampling shell',
      )
    }
    sampledShellCounts.set(
      shell.id,
      (sampledShellCounts.get(shell.id) ?? 0) + 1,
    )
  }
  if (
    shells.some(
      (shell) =>
        sampledShellCounts.get(shell.id) !== shell.sampleCount,
    )
  ) {
    throw new StarlinkCatalogValidationError(
      'Starlink sampled shell counts are invalid',
    )
  }
  const publishedAt = utcTimestamp(
    value.publishedAt,
    'Starlink publication time',
  )
  if (
    Date.parse(sources.gp.retrievedAt) >
      Date.parse(sources.satcat.retrievedAt) ||
    Date.parse(publishedAt) <
      Date.parse(sources.satcat.retrievedAt)
  ) {
    throw new StarlinkCatalogValidationError(
      'Starlink source or publication timing is invalid',
    )
  }
  const digest = boundedString(
    value.digest,
    'Starlink digest',
    64,
    64,
  )
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink digest',
    )
  }
  const snapshotWithoutDigest: Omit<
    StarlinkCatalogSnapshotV2,
    'digest'
  > = {
    schemaVersion: STARLINK_CATALOG_V2_SCHEMA_VERSION,
    sourceContractVersion: STARLINK_V2_SOURCE_CONTRACT_VERSION,
    catalogId: STARLINK_CATALOG_V2_ID,
    sources,
    populationCount,
    extraSatcatCount,
    sampleLimit: STARLINK_V2_SAMPLE_LIMIT,
    sampleAlgorithm: STARLINK_V2_SAMPLE_ALGORITHM,
    samplingReferenceTime,
    shells,
    recordCount,
    records,
    publishedAt,
  }
  if (
    (await digestHex(
      JSON.stringify(snapshotV2DigestInput(snapshotWithoutDigest)),
    )) !== digest
  ) {
    throw new StarlinkCatalogValidationError(
      'Starlink schema-2 snapshot digest does not match',
    )
  }
  const snapshot = { ...snapshotWithoutDigest, digest }
  ensureSnapshotV2Size(snapshot)
  return snapshot
}

export const validateStarlinkCatalogPublication = async (
  value: unknown,
): Promise<StarlinkCatalogPublication> => {
  if (!isRecord(value)) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink publication',
    )
  }
  exactKeys(
    value,
    ['publicationVersion', 'schema1', 'schema2'],
    'Starlink publication',
  )
  if (
    value.publicationVersion !==
    STARLINK_CATALOG_PUBLICATION_VERSION
  ) {
    throw new StarlinkCatalogValidationError(
      'Unsupported Starlink publication contract',
    )
  }
  const [schema1, schema2] = await Promise.all([
    validateStarlinkCatalogSnapshot(value.schema1),
    validateStarlinkCatalogSnapshotV2(value.schema2),
  ])
  if (
    JSON.stringify(schema1.sources) !==
      JSON.stringify(schema2.sources) ||
    schema1.populationCount !== schema2.populationCount ||
    schema1.extraSatcatCount !== schema2.extraSatcatCount ||
    schema1.publishedAt !== schema2.publishedAt
  ) {
    throw new StarlinkCatalogValidationError(
      'Starlink publication members are not aligned',
    )
  }
  const publication: StarlinkCatalogPublication = {
    publicationVersion: STARLINK_CATALOG_PUBLICATION_VERSION,
    schema1,
    schema2,
  }
  ensurePublicationSize(publication)
  return publication
}

type RetryAtResult =
  | { kind: 'supported'; retryAtMs: number }
  | { kind: 'too-long' }

const retryAt = (
  retryAfter: string | null,
  receivedAtMs: number,
): RetryAtResult | undefined => {
  if (!retryAfter) return undefined
  let retryAtMs: number
  if (/^\d+$/.test(retryAfter)) {
    const seconds = Number(retryAfter)
    if (!Number.isSafeInteger(seconds)) return { kind: 'too-long' }
    const delayMs = seconds * 1_000
    if (
      !Number.isSafeInteger(delayMs) ||
      delayMs > STARLINK_MAX_RETRY_AFTER_MS
    ) {
      return { kind: 'too-long' }
    }
    retryAtMs = receivedAtMs + delayMs
  } else {
    retryAtMs = Date.parse(retryAfter)
    if (!Number.isSafeInteger(retryAtMs)) return undefined
  }
  if (
    !Number.isSafeInteger(retryAtMs) ||
    retryAtMs - receivedAtMs > STARLINK_MAX_RETRY_AFTER_MS
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
  maximumRecords: number,
) => {
  if (!isJsonContentType(response.headers.get('Content-Type'))) {
    throw new StarlinkCatalogUpstreamError(
      'Starlink upstream returned an unsupported content type',
      { kind: 'transient', status: response.status },
    )
  }
  const contentLength = response.headers.get('Content-Length')
  if (contentLength) {
    if (!/^\d+$/.test(contentLength)) {
      throw new StarlinkCatalogUpstreamError(
        'Starlink upstream returned a malformed content length',
        { kind: 'transient', status: response.status },
      )
    }
    const declaredBytes = Number(contentLength)
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes > maximumBytes
    ) {
      controller.abort()
      throw new StarlinkCatalogUpstreamError(
        'Starlink upstream response was too large',
        { kind: 'transient', status: response.status },
      )
    }
  }
  if (!response.body) {
    throw new StarlinkCatalogUpstreamError(
      'Starlink upstream response was empty',
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
        throw new StarlinkCatalogUpstreamError(
          'Starlink upstream response was too large',
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
  let value: unknown
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: false,
      }).decode(bytes),
    )
  } catch {
    throw new StarlinkCatalogUpstreamError(
      'Starlink upstream response was malformed',
      { kind: 'transient', status: response.status },
    )
  }
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > maximumRecords
  ) {
    throw new StarlinkCatalogUpstreamError(
      'Starlink upstream record count was invalid',
      { kind: 'transient', status: response.status },
    )
  }
  return {
    value,
    decodedBytes: totalBytes,
    sha256: await digestHex(bytes),
  }
}

const fetchBoundedJson = async (
  url: string,
  options: {
    fetchImpl: OrbitalCatalogFetch
    wallNowMs: () => number
    timeoutMs: number
    maximumBytes: number
    maximumRecords: number
  },
) => {
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('Starlink upstream timed out'))
  }, options.timeoutMs)
  try {
    const response = await options.fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': STARLINK_UPSTREAM_USER_AGENT,
      },
    })
    let receivedAtMs: number
    try {
      receivedAtMs = options.wallNowMs()
    } catch (error) {
      void response.body?.cancel()
      throw error
    }
    if (response.status >= 300 && response.status < 400) {
      void response.body?.cancel()
      throw new StarlinkCatalogUpstreamError(
        'Starlink upstream redirect rejected',
        {
          kind: 'blocked',
          status: response.status,
          receivedAtMs,
        },
      )
    }
    if (response.status === 403 || response.status === 404) {
      void response.body?.cancel()
      throw new StarlinkCatalogUpstreamError(
        'Starlink upstream access is blocked',
        {
          kind: 'blocked',
          status: response.status,
          receivedAtMs,
        },
      )
    }
    if (response.status === 429) {
      void response.body?.cancel()
      const retry = retryAt(
        response.headers.get('Retry-After'),
        receivedAtMs,
      )
      if (retry?.kind === 'too-long') {
        throw new StarlinkCatalogUpstreamError(
          'Starlink upstream retry guidance requires review',
          {
            kind: 'blocked',
            status: response.status,
            receivedAtMs,
          },
        )
      }
      throw new StarlinkCatalogUpstreamError(
        'Starlink upstream is rate limited',
        {
          kind: 'retry-after',
          status: response.status,
          retryAtMs:
            retry?.kind === 'supported'
              ? retry.retryAtMs
              : undefined,
          receivedAtMs,
        },
      )
    }
    if (response.status >= 500 && response.status < 600) {
      const retry = retryAt(
        response.headers.get('Retry-After'),
        receivedAtMs,
      )
      if (retry?.kind === 'too-long') {
        void response.body?.cancel()
        throw new StarlinkCatalogUpstreamError(
          'Starlink upstream retry guidance requires review',
          {
            kind: 'blocked',
            status: response.status,
            receivedAtMs,
          },
        )
      }
      if (retry?.kind === 'supported') {
        void response.body?.cancel()
        throw new StarlinkCatalogUpstreamError(
          'Starlink upstream requested a later retry',
          {
            kind: 'retry-after',
            status: response.status,
            retryAtMs: retry.retryAtMs,
            receivedAtMs,
          },
        )
      }
    }
    if (response.status !== 200) {
      void response.body?.cancel()
      throw new StarlinkCatalogUpstreamError(
        'Starlink upstream request failed',
        {
          kind: 'transient',
          status: response.status,
          receivedAtMs,
        },
      )
    }
    const result = await readBoundedJson(
      response,
      controller,
      options.maximumBytes,
      options.maximumRecords,
    )
    return {
      ...result,
      retrievedAtMs: options.wallNowMs(),
    }
  } catch (error) {
    if (error instanceof StarlinkCatalogUpstreamError) throw error
    throw new StarlinkCatalogUpstreamError(
      timedOut
        ? 'Starlink upstream timed out'
        : 'Starlink upstream request failed',
      { kind: 'transient' },
    )
  } finally {
    clearTimeout(timeout)
  }
}

const totalTimeoutError = () =>
  new StarlinkCatalogUpstreamError(
    'Starlink refresh exceeded its total deadline',
    { kind: 'transient' },
  )

export const prepareStarlinkCatalogRefresh = async (
  environment: StarlinkCatalogEnvironment,
  options: StarlinkRefreshOptions = {},
): Promise<StarlinkRefreshPreparation> => {
  if (
    environment.ORBITAL_CATALOG_ENABLED !== 'true' ||
    environment.STARLINK_CATALOG_ENABLED !== 'true'
  ) {
    return { kind: 'disabled' }
  }
  const store = environment.ORBITAL_CATALOG
  if (!store) {
    return {
      kind: 'skipped',
      reason: 'Starlink KV binding is unavailable',
    }
  }
  const nowMs = options.nowMs ?? Date.now()
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) {
    return {
      kind: 'skipped',
      reason: 'Starlink refresh time is invalid',
    }
  }

  try {
    const fetchImpl =
      options.fetchImpl ??
      ((input: string | URL | Request, init?: RequestInit) =>
        globalThis.fetch(input, init))
    const monotonicNow =
      options.monotonicNow ?? (() => performance.now())
    const startedAtMs = monotonicNow()
    const totalTimeoutMs =
      options.totalTimeoutMs ??
      STARLINK_TOTAL_REFRESH_TIMEOUT_MS
    const perResponseTimeoutMs =
      options.timeoutMs ?? STARLINK_UPSTREAM_TIMEOUT_MS
    const maximumUpstreamBytes =
      options.maximumUpstreamBytes ??
      STARLINK_MAX_UPSTREAM_BYTES
    const maximumAggregateBytes =
      options.maximumAggregateBytes ??
      STARLINK_MAX_AGGREGATE_BYTES
    const maximumRecords =
      options.maximumRecords ?? STARLINK_MAX_UPSTREAM_RECORDS
    if (
      !Number.isFinite(startedAtMs) ||
      !Number.isFinite(totalTimeoutMs) ||
      totalTimeoutMs <= 0 ||
      !Number.isFinite(perResponseTimeoutMs) ||
      perResponseTimeoutMs <= 0
    ) {
      throw totalTimeoutError()
    }
    const wallNowMs = () => {
      const elapsedMs = monotonicNow() - startedAtMs
      if (
        !Number.isFinite(elapsedMs) ||
        elapsedMs > totalTimeoutMs
      ) {
        throw totalTimeoutError()
      }
      const currentMs =
        nowMs + Math.max(0, Math.floor(elapsedMs))
      if (!Number.isSafeInteger(currentMs)) {
        throw totalTimeoutError()
      }
      return currentMs
    }
    const fetchSource = async (url: string) => {
      const remainingMs =
        totalTimeoutMs - (monotonicNow() - startedAtMs)
      if (remainingMs <= 0) throw totalTimeoutError()
      return fetchBoundedJson(url, {
        fetchImpl,
        wallNowMs,
        timeoutMs: Math.min(perResponseTimeoutMs, remainingMs),
        maximumBytes: maximumUpstreamBytes,
        maximumRecords,
      })
    }

    const gp = await fetchSource(STARLINK_GP_SOURCE_URL)
    const satcat = await fetchSource(STARLINK_SATCAT_SOURCE_URL)
    if (
      gp.decodedBytes + satcat.decodedBytes >
      maximumAggregateBytes
    ) {
      throw new StarlinkCatalogUpstreamError(
        'Starlink refresh exceeded its aggregate byte limit',
        { kind: 'transient' },
      )
    }
    const publishedAt = new Date(wallNowMs()).toISOString()
    const publication = await createStarlinkCatalogPublication(
      {
        gpValue: gp.value,
        satcatValue: satcat.value,
        gpRetrievedAt: new Date(
          gp.retrievedAtMs,
        ).toISOString(),
        satcatRetrievedAt: new Date(
          satcat.retrievedAtMs,
        ).toISOString(),
        gpDecodedBytes: gp.decodedBytes,
        satcatDecodedBytes: satcat.decodedBytes,
        gpSha256: gp.sha256,
        satcatSha256: satcat.sha256,
      },
      publishedAt,
    )
    wallNowMs()
    return { kind: 'ready', publication }
  } catch (error) {
    if (error instanceof StarlinkCatalogUpstreamError) {
      if (
        error.kind === 'blocked' &&
        error.status !== undefined
      ) {
        return {
          kind: 'blocked',
          status: error.status,
          blockedAtMs: error.receivedAtMs ?? nowMs,
        }
      }
      if (
        error.kind === 'retry-after' &&
        error.status !== undefined
      ) {
        return {
          kind: 'retry-after',
          status: error.status,
          retryAtMs: error.retryAtMs,
        }
      }
      return { kind: 'failed', reason: error.message }
    }
    if (error instanceof StarlinkCatalogValidationError) {
      return { kind: 'failed', reason: error.message }
    }
    return {
      kind: 'failed',
      reason: 'Starlink snapshot preparation failed',
    }
  }
}

const readSnapshotText = async (text: string) => {
  if (
    new TextEncoder().encode(text).byteLength >
    STARLINK_MAX_SNAPSHOT_BYTES
  ) {
    throw new StarlinkCatalogValidationError(
      'Starlink snapshot is too large',
    )
  }
  return validateStarlinkCatalogSnapshot(JSON.parse(text))
}

const readSnapshotV2Text = async (text: string) => {
  if (
    new TextEncoder().encode(text).byteLength >
    STARLINK_V2_MAX_SNAPSHOT_BYTES
  ) {
    throw new StarlinkCatalogValidationError(
      'Starlink schema-2 snapshot is too large',
    )
  }
  return validateStarlinkCatalogSnapshotV2(JSON.parse(text))
}

const readPublicationText = async (text: string) => {
  if (
    new TextEncoder().encode(text).byteLength >
    STARLINK_MAX_PUBLICATION_BYTES
  ) {
    throw new StarlinkCatalogValidationError(
      'Starlink publication is too large',
    )
  }
  return validateStarlinkCatalogPublication(JSON.parse(text))
}

const loadStoredLegacySnapshot = async (
  store: OrbitalKeyValueStore | undefined,
) => {
  if (!store) return undefined
  try {
    const text = await store.get(STARLINK_CATALOG_KEY)
    return text ? await readSnapshotText(text) : undefined
  } catch {
    return undefined
  }
}

const loadStoredPublication = async (
  store: OrbitalKeyValueStore | undefined,
) => {
  if (!store) return undefined
  try {
    const text = await store.get(STARLINK_CATALOG_PUBLICATION_KEY)
    return text ? await readPublicationText(text) : undefined
  } catch {
    return undefined
  }
}

const cancelResponseBody = (response: Response) => {
  if (response.body) {
    void response.body.cancel().catch(() => undefined)
  }
}

const loadBootstrap = async <Snapshot>(
  request: Request,
  assets: OrbitalAssetBinding,
  options: {
    path: string
    maximumBytes: number
    readSnapshot: (text: string) => Promise<Snapshot>
  },
  timeoutMs = STARLINK_BOOTSTRAP_TIMEOUT_MS,
) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new StarlinkCatalogValidationError(
      'Invalid Starlink bootstrap deadline',
    )
  }

  const url = new URL(options.path, request.url)
  const controller = new AbortController()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let timedOut = false
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadlineAt = Date.now() + timeoutMs
  const timeoutError = () =>
    new StarlinkCatalogValidationError(
      'Starlink bootstrap request timed out',
    )
  const ensureWithinDeadline = () => {
    if (timedOut || Date.now() >= deadlineAt) {
      timedOut = true
      controller.abort(
        new Error('Starlink bootstrap request timed out'),
      )
      void reader?.cancel().catch(() => undefined)
      throw timeoutError()
    }
  }
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true
      controller.abort(
        new Error('Starlink bootstrap request timed out'),
      )
      void reader?.cancel().catch(() => undefined)
      reject(timeoutError())
    }, timeoutMs)
  })
  const responsePromise = assets.fetch(
    new Request(url, {
      method: 'GET',
      signal: controller.signal,
    }),
  )
  void responsePromise
    .then((response) => {
      if (timedOut) return cancelResponseBody(response)
      return undefined
    })
    .catch(() => undefined)

  try {
    const response = await Promise.race([
      responsePromise,
      deadline,
    ])
    if (response.status !== 200) {
      cancelResponseBody(response)
      return undefined
    }
    const mediaType = response.headers
      .get('Content-Type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase()
    if (mediaType !== STARLINK_BOOTSTRAP_MEDIA_TYPE) {
      cancelResponseBody(response)
      return undefined
    }
    const contentLength = response.headers.get('Content-Length')
    if (
      contentLength !== null &&
      (!/^(?:0|[1-9]\d*)$/.test(contentLength) ||
        Number(contentLength) > options.maximumBytes)
    ) {
      cancelResponseBody(response)
      return undefined
    }
    if (!response.body) return undefined

    ensureWithinDeadline()
    reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    try {
      while (true) {
        const result = await Promise.race([
          reader.read(),
          deadline,
        ])
        if (result.done) break
        if (!(result.value instanceof Uint8Array)) {
          throw new StarlinkCatalogValidationError(
            'Invalid Starlink bootstrap body',
          )
        }
        totalBytes += result.value.byteLength
        if (totalBytes > options.maximumBytes) {
          void reader.cancel().catch(() => undefined)
          throw new StarlinkCatalogValidationError(
            'Starlink bootstrap is too large',
          )
        }
        chunks.push(result.value)
      }
    } finally {
      if (timedOut) {
        void reader.cancel().catch(() => undefined)
      }
      try {
        reader.releaseLock()
      } catch {
        // The pending read is already being cancelled by the deadline.
      }
      reader = undefined
    }

    ensureWithinDeadline()
    const bytes = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const text = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: false,
    }).decode(bytes)
    ensureWithinDeadline()
    return await Promise.race([
      options.readSnapshot(text),
      deadline,
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

export type StarlinkCatalogCandidate = {
  snapshot: StarlinkCatalogSnapshot
  source: 'kv' | 'bootstrap'
}

export type StarlinkCatalogCandidateV2 = {
  snapshot: StarlinkCatalogSnapshotV2
  source: 'kv' | 'bootstrap'
}

type AnyStarlinkCatalogSnapshot =
  | StarlinkCatalogSnapshot
  | StarlinkCatalogSnapshotV2

type AnyStarlinkCatalogCandidate = {
  snapshot: AnyStarlinkCatalogSnapshot
  source: 'kv' | 'bootstrap'
}

const sourceGenerationMs = (
  snapshot: AnyStarlinkCatalogSnapshot,
) =>
  Math.max(
    Date.parse(snapshot.sources.gp.retrievedAt),
    Date.parse(snapshot.sources.satcat.retrievedAt),
  )

const selectCandidate = <
  Snapshot extends AnyStarlinkCatalogSnapshot,
>(
  candidates: readonly {
    snapshot: Snapshot | undefined
    source: 'kv' | 'bootstrap'
  }[],
) => {
  const available = candidates.filter(
    (
      candidate,
    ): candidate is {
      snapshot: Snapshot
      source: 'kv' | 'bootstrap'
    } => candidate.snapshot !== undefined,
  )
  if (available.length === 0) return undefined
  available.sort((left, right) => {
    const generationDifference =
      sourceGenerationMs(right.snapshot) -
      sourceGenerationMs(left.snapshot)
    if (generationDifference !== 0) return generationDifference
    if (left.snapshot.digest !== right.snapshot.digest) {
      throw new StarlinkCatalogValidationError(
        'Equal-generation Starlink snapshots conflict',
      )
    }
    return left.source === right.source
      ? 0
      : left.source === 'kv'
        ? -1
        : 1
  })
  return available[0]
}

export const selectStarlinkCatalogCandidate = (
  kv: StarlinkCatalogSnapshot | undefined,
  bootstrap: StarlinkCatalogSnapshot | undefined,
): StarlinkCatalogCandidate | undefined => {
  return selectCandidate([
    { snapshot: kv, source: 'kv' },
    { snapshot: bootstrap, source: 'bootstrap' },
  ])
}

const isCurrentAtServeTime = (
  snapshot: AnyStarlinkCatalogSnapshot,
  servedAtMs: number,
) => {
  const latestAllowedMs =
    servedAtMs + STARLINK_CLOCK_TOLERANCE_MS
  return (
    Number.isSafeInteger(latestAllowedMs) &&
    Date.parse(snapshot.sources.gp.retrievedAt) <=
      latestAllowedMs &&
    Date.parse(snapshot.sources.satcat.retrievedAt) <=
      latestAllowedMs &&
    Date.parse(snapshot.publishedAt) <= latestAllowedMs
  )
}

const isFreshForBrowser = (
  snapshot: AnyStarlinkCatalogSnapshot,
  servedAtMs: number,
) =>
  servedAtMs - sourceGenerationMs(snapshot) <=
  STARLINK_BROWSER_EXPIRE_AFTER_MS

const acceptedMediaTypes = (request: Request) =>
  (request.headers.get('Accept') ?? '')
    .split(',')
    .map((value) => {
      const trimmed = value.trim()
      const qualityMatch = trimmed.match(
        /;\s*q=(0(?:\.\d+)?|1(?:\.0+)?)$/i,
      )
      return {
        mediaType: trimmed.replace(
          /;\s*q=(?:0(?:\.\d+)?|1(?:\.0+)?)$/i,
          '',
        ),
        quality: qualityMatch ? Number(qualityMatch[1]) : 1,
      }
    })
    .filter(({ mediaType }) => mediaType)

const acceptedMediaQuality = (
  accepted: Readonly<ReturnType<typeof acceptedMediaTypes>>,
  mediaType: string,
) => {
  const exact = accepted.filter(
    (value) =>
      value.mediaType.toLowerCase() === mediaType.toLowerCase(),
  )
  if (exact.length > 0) {
    return Math.max(...exact.map(({ quality }) => quality))
  }
  const wildcard = accepted.filter(
    (value) => value.mediaType === '*/*',
  )
  return wildcard.length > 0
    ? Math.max(...wildcard.map(({ quality }) => quality))
    : 0
}

const acceptsMediaType = (
  accepted: Readonly<ReturnType<typeof acceptedMediaTypes>>,
  mediaType: string,
) => acceptedMediaQuality(accepted, mediaType) > 0

const explicitlyAcceptsMediaType = (
  accepted: Readonly<ReturnType<typeof acceptedMediaTypes>>,
  mediaType: string,
) =>
  accepted.some(
    (value) =>
      value.quality > 0 &&
      value.mediaType.toLowerCase() === mediaType.toLowerCase(),
  )

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

const catalogResponse = (
  request: Request,
  candidate: AnyStarlinkCatalogCandidate,
  source: 'kv' | 'bootstrap',
  nowMs: number,
) => {
  const snapshot = candidate.snapshot
  const etag = `W/"${snapshot.digest}"`
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type':
      snapshot.schemaVersion === STARLINK_CATALOG_SCHEMA_VERSION
        ? STARLINK_CATALOG_MEDIA_TYPE
        : STARLINK_CATALOG_V2_MEDIA_TYPE,
    ETag: etag,
    Vary: 'Accept',
    'X-Content-Type-Options': 'nosniff',
    'X-LiveTrafficStan-Starlink-Digest': snapshot.digest,
    'X-LiveTrafficStan-Starlink-Published-At':
      snapshot.publishedAt,
    'X-LiveTrafficStan-Starlink-Schema': String(
      snapshot.schemaVersion,
    ),
    'X-LiveTrafficStan-Starlink-Source': source,
    'X-LiveTrafficStan-Served-At': new Date(nowMs).toISOString(),
  })
  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(
    snapshot.schemaVersion === STARLINK_CATALOG_SCHEMA_VERSION
      ? serializeStarlinkCatalogSnapshot(snapshot)
      : serializeStarlinkCatalogSnapshotV2(snapshot),
    { status: 200, headers },
  )
}

export const handleStarlinkCatalog = async (
  request: Request,
  environment: StarlinkCatalogEnvironment,
  options: {
    nowMs?: number
    bootstrapTimeoutMs?: number
  } = {},
) => {
  if (
    environment.ORBITAL_CATALOG_ENABLED !== 'true' ||
    environment.STARLINK_CATALOG_ENABLED !== 'true'
  ) {
    return textResponse('Not found', 404)
  }
  const url = new URL(request.url)
  if (request.method !== 'GET') {
    return textResponse('Method not allowed', 405, {
      Allow: 'GET',
    })
  }
  if (url.search || request.url.includes('?')) {
    return textResponse(
      'Starlink catalog queries are not supported',
      400,
    )
  }
  const [
    storedPublication,
    storedLegacySnapshot,
    bootstrapLegacySnapshot,
    bootstrapSnapshotV2,
  ] = await Promise.all([
    loadStoredPublication(environment.ORBITAL_CATALOG),
    loadStoredLegacySnapshot(environment.ORBITAL_CATALOG),
    loadBootstrap(
      request,
      environment.ASSETS,
      {
        path: STARLINK_BOOTSTRAP_PATH,
        maximumBytes: STARLINK_MAX_SNAPSHOT_BYTES,
        readSnapshot: readSnapshotText,
      },
      options.bootstrapTimeoutMs,
    ).catch(() => undefined),
    loadBootstrap(
      request,
      environment.ASSETS,
      {
        path: STARLINK_V2_BOOTSTRAP_PATH,
        maximumBytes: STARLINK_V2_MAX_SNAPSHOT_BYTES,
        readSnapshot: readSnapshotV2Text,
      },
      options.bootstrapTimeoutMs,
    ).catch(() => undefined),
  ])
  const servedAtMs = options.nowMs ?? Date.now()
  if (!Number.isSafeInteger(servedAtMs) || servedAtMs <= 0) {
    return textResponse('Starlink catalog unavailable', 503, {
      'Retry-After': '300',
    })
  }
  let schema1Candidate: StarlinkCatalogCandidate | undefined
  let schema2Candidate: StarlinkCatalogCandidateV2 | undefined
  try {
    schema1Candidate = selectCandidate([
      {
        snapshot:
          storedPublication &&
          isCurrentAtServeTime(
            storedPublication.schema1,
            servedAtMs,
          )
            ? storedPublication.schema1
            : undefined,
        source: 'kv',
      },
      {
        snapshot:
          storedLegacySnapshot &&
          isCurrentAtServeTime(
            storedLegacySnapshot,
            servedAtMs,
          )
            ? storedLegacySnapshot
            : undefined,
        source: 'kv',
      },
      {
        snapshot:
          bootstrapLegacySnapshot &&
          isCurrentAtServeTime(
            bootstrapLegacySnapshot,
            servedAtMs,
          )
            ? bootstrapLegacySnapshot
            : undefined,
        source: 'bootstrap',
      },
    ])
    schema2Candidate = selectCandidate([
      {
        snapshot:
          storedPublication &&
          isCurrentAtServeTime(
            storedPublication.schema2,
            servedAtMs,
          )
            ? storedPublication.schema2
            : undefined,
        source: 'kv',
      },
      {
        snapshot:
          bootstrapSnapshotV2 &&
          isCurrentAtServeTime(
            bootstrapSnapshotV2,
            servedAtMs,
          )
            ? bootstrapSnapshotV2
            : undefined,
        source: 'bootstrap',
      },
    ])
  } catch {
    return textResponse('Starlink catalog unavailable', 503, {
      'Retry-After': '300',
    })
  }
  const accepted = acceptedMediaTypes(request)
  const prefersSchema2 = explicitlyAcceptsMediaType(
    accepted,
    STARLINK_CATALOG_V2_MEDIA_TYPE,
  )
  const acceptsSchema1 =
    accepted.length === 0 ||
    acceptsMediaType(accepted, STARLINK_CATALOG_MEDIA_TYPE)
  const candidate = prefersSchema2
    ? schema2Candidate &&
      (!acceptsSchema1 ||
        isFreshForBrowser(schema2Candidate.snapshot, servedAtMs))
      ? schema2Candidate
      : acceptsSchema1
        ? schema1Candidate
        : undefined
    : schema1Candidate
  if (!candidate) {
    return textResponse('Starlink catalog unavailable', 503, {
      'Retry-After': '300',
      Vary: 'Accept',
    })
  }
  return catalogResponse(
    request,
    candidate,
    candidate.source,
    servedAtMs,
  )
}
