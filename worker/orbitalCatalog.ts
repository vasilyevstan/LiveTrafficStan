export const ORBITAL_CATALOG_PATH = '/api/orbits/catalog'
export const ORBITAL_CATALOG_ID = 'celestrak-curated-v1'
export const ORBITAL_BOOTSTRAP_VERSION = 'curated-2026-09-30-v1'
export const ORBITAL_BOOTSTRAP_PATH =
  `/orbital-data/${ORBITAL_BOOTSTRAP_VERSION}/catalog.json`
export const ORBITAL_CATALOG_KEY =
  'orbital:catalog:v2:curated-v1'
export const ORBITAL_CATALOG_V1_KEY = 'orbital:catalog:v1'
export const ORBITAL_CATALOG_SCHEMA_VERSION = 2
export const ORBITAL_SOURCE_CONTRACT_VERSION = 2
export const ORBITAL_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1_000
export const ORBITAL_UPSTREAM_TIMEOUT_MS = 10_000
export const ORBITAL_TOTAL_REFRESH_TIMEOUT_MS = 90_000
export const ORBITAL_MAX_UPSTREAM_BYTES = 512 * 1_024
export const ORBITAL_MAX_UPSTREAM_RECORDS = 512
export const ORBITAL_MAX_AGGREGATE_BYTES = 4 * 1_024 * 1_024
export const ORBITAL_MAX_SNAPSHOT_BYTES = 512 * 1_024
export const ORBITAL_MAX_RECORDS = 512
export const ORBITAL_MAX_GROUPS = 6
export const ORBITAL_MAX_RETRY_AFTER_MS =
  7 * 24 * 60 * 60 * 1_000
export const ORBITAL_UPSTREAM_USER_AGENT =
  'LiveTrafficStan (+https://github.com/vasilyevstan/LiveTrafficStan)'

export type OrbitalObjectType = 'PAY' | 'R/B' | 'DEB' | 'UNK'
export type OrbitalSourceGroup =
  | 'visual'
  | 'stations'
  | 'weather'
  | 'gnss'
  | 'science'

export interface OrbitalCatalogSourceDefinition {
  group: OrbitalSourceGroup
  gpSourceUrl: string
  satcatSourceUrl: string
}

export const ORBITAL_SOURCES = [
  {
    group: 'visual',
    gpSourceUrl:
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json',
    satcatSourceUrl:
      'https://celestrak.org/satcat/records.php?GROUP=visual&FORMAT=json',
  },
  {
    group: 'stations',
    gpSourceUrl:
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json',
    satcatSourceUrl:
      'https://celestrak.org/satcat/records.php?GROUP=stations&FORMAT=json',
  },
  {
    group: 'weather',
    gpSourceUrl:
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=json',
    satcatSourceUrl:
      'https://celestrak.org/satcat/records.php?GROUP=weather&FORMAT=json',
  },
  {
    group: 'gnss',
    gpSourceUrl:
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=gnss&FORMAT=json',
    satcatSourceUrl:
      'https://celestrak.org/satcat/records.php?GROUP=gnss&FORMAT=json',
  },
  {
    group: 'science',
    gpSourceUrl:
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=science&FORMAT=json',
    satcatSourceUrl:
      'https://celestrak.org/satcat/records.php?GROUP=science&FORMAT=json',
  },
] as const satisfies readonly OrbitalCatalogSourceDefinition[]

if (ORBITAL_SOURCES.length > ORBITAL_MAX_GROUPS) {
  throw new Error('Orbital source group limit exceeded')
}

const ORBITAL_DISPLAY_ORDER_STRIDE = 1_000_000_000

export interface OrbitalCatalogSourceMetadata
  extends OrbitalCatalogSourceDefinition {
  gpRecordCount: number
  satcatRecordCount: number
}

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
  sourceGroups: OrbitalSourceGroup[]
  displayOrder: number
}

export interface OrbitalCatalogSnapshot {
  schemaVersion: 2
  sourceContractVersion: 2
  catalogId: typeof ORBITAL_CATALOG_ID
  sources: OrbitalCatalogSourceMetadata[]
  retrievedAt: string
  publishedAt: string
  recordCount: number
  records: OrbitalCatalogRecord[]
  sha256: string
}

export interface OrbitalCatalogSourceInput {
  group: OrbitalSourceGroup
  gpValue: unknown
  satcatValue: unknown
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
  schemaVersion: 2
  sourceContractVersion: 2
  catalogId: typeof ORBITAL_CATALOG_ID
  sources: OrbitalCatalogSourceMetadata[]
  retrievedAt: string
  publishedAt: string
  recordCount: number
  records: OrbitalCatalogRecord[]
}

interface RefreshOptions {
  fetchImpl?: OrbitalCatalogFetch
  nowMs?: number
  monotonicNow?: () => number
  timeoutMs?: number
  totalTimeoutMs?: number
  maximumUpstreamBytes?: number
  maximumAggregateBytes?: number
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

const normalizedSourceString = (
  value: unknown,
  name: string,
  minimumLength: number,
  maximumLength: number,
) => {
  if (typeof value !== 'string') {
    throw new OrbitalCatalogValidationError(`Invalid ${name}`)
  }
  const normalized = value.trim()
  if (
    normalized.length < minimumLength ||
    normalized.length > maximumLength
  ) {
    throw new OrbitalCatalogValidationError(`Invalid ${name}`)
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

const utcTime = (
  value: unknown,
  name: string,
  fractionDigits: 3 | 6,
) => {
  const input = boundedString(value, name, 19, 27)
  const match = epochPattern.exec(input)
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

const objectType = (value: unknown): OrbitalObjectType => {
  if (
    value === 'PAY' ||
    value === 'R/B' ||
    value === 'DEB' ||
    value === 'UNK'
  ) {
    return value
  }
  throw new OrbitalCatalogValidationError(
    'Invalid orbital object type',
  )
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
    throw new OrbitalCatalogValidationError(
      `Invalid ${name} fields`,
    )
  }
}

const sourceGroupIndex = (group: OrbitalSourceGroup) =>
  ORBITAL_SOURCES.findIndex((source) => source.group === group)

const sourceGroup = (value: unknown): OrbitalSourceGroup => {
  const source = ORBITAL_SOURCES.find(
    (candidate) => candidate.group === value,
  )
  if (!source) {
    throw new OrbitalCatalogValidationError(
      'Invalid orbital source group',
    )
  }
  return source.group
}

const sourceGroups = (value: unknown) => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > ORBITAL_SOURCES.length
  ) {
    throw new OrbitalCatalogValidationError(
      'Invalid orbital source groups',
    )
  }

  const groups = value.map(sourceGroup)
  let previousIndex = -1
  for (const group of groups) {
    const index = sourceGroupIndex(group)
    if (index <= previousIndex) {
      throw new OrbitalCatalogValidationError(
        'Orbital source groups are not stably ordered',
      )
    }
    previousIndex = index
  }
  return groups
}

const displayOrder = (
  noradCatalogId: string,
  groups: readonly OrbitalSourceGroup[],
) =>
  sourceGroupIndex(groups[0] as OrbitalSourceGroup) *
    ORBITAL_DISPLAY_ORDER_STRIDE +
  Number(noradCatalogId)

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

type PropagationField = (typeof propagationFields)[number]

const publishedRecordKeys = [
  ...propagationFields,
  'displayOrder',
  'epoch',
  'internationalDesignator',
  'name',
  'noradCatalogId',
  'objectType',
  'sourceGroups',
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
}) => ({
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

const publishedRecord = (value: unknown): OrbitalCatalogRecord => {
  if (!isRecord(value)) {
    throw new OrbitalCatalogValidationError(
      'Invalid orbital record',
    )
  }
  exactKeys(value, publishedRecordKeys, 'orbital record')

  const groups = sourceGroups(value.sourceGroups)
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
  const expectedDisplayOrder = displayOrder(
    record.noradCatalogId,
    groups,
  )
  if (value.displayOrder !== expectedDisplayOrder) {
    throw new OrbitalCatalogValidationError(
      'Invalid orbital display order',
    )
  }

  return {
    ...record,
    sourceGroups: groups,
    displayOrder: expectedDisplayOrder,
  }
}

const sourceMetadataKeys = [
  'gpRecordCount',
  'gpSourceUrl',
  'group',
  'satcatRecordCount',
  'satcatSourceUrl',
] as const

const sourceMetadata = (
  value: unknown,
  index: number,
): OrbitalCatalogSourceMetadata => {
  if (!isRecord(value)) {
    throw new OrbitalCatalogValidationError(
      'Invalid orbital source metadata',
    )
  }
  exactKeys(value, sourceMetadataKeys, 'orbital source metadata')

  const expected = ORBITAL_SOURCES[index]
  if (
    !expected ||
    value.group !== expected.group ||
    value.gpSourceUrl !== expected.gpSourceUrl ||
    value.satcatSourceUrl !== expected.satcatSourceUrl
  ) {
    throw new OrbitalCatalogValidationError(
      'Invalid orbital snapshot source',
    )
  }
  const gpRecordCount = integerNumber(
    value.gpRecordCount,
    'GP source record count',
    1,
    ORBITAL_MAX_UPSTREAM_RECORDS,
  )
  const satcatRecordCount = integerNumber(
    value.satcatRecordCount,
    'SATCAT source record count',
    gpRecordCount,
    ORBITAL_MAX_UPSTREAM_RECORDS,
  )
  return {
    ...expected,
    gpRecordCount,
    satcatRecordCount,
  }
}

const digestInput = (
  snapshot: Omit<OrbitalCatalogSnapshot, 'sha256'>,
): SnapshotDigestInput => ({
  schemaVersion: snapshot.schemaVersion,
  sourceContractVersion: snapshot.sourceContractVersion,
  catalogId: snapshot.catalogId,
  sources: snapshot.sources,
  retrievedAt: snapshot.retrievedAt,
  publishedAt: snapshot.publishedAt,
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

type MergedOrbitalRecord = Omit<
  OrbitalCatalogRecord,
  'displayOrder'
>

type SatcatIdentity = {
  name: string
  internationalDesignator: string
  objectType: OrbitalObjectType
}

const sourceSatcatRecord = (
  value: unknown,
): { id: string; identity: SatcatIdentity } => {
  if (!isRecord(value)) {
    throw new OrbitalCatalogValidationError(
      'Invalid SATCAT record',
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
  type: OrbitalObjectType,
) => {
  if (!isRecord(value)) {
    throw new OrbitalCatalogValidationError('Invalid GP record')
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
}

const propagationAgrees = (
  left: Pick<OrbitalCatalogRecord, PropagationField>,
  right: Pick<OrbitalCatalogRecord, PropagationField>,
) =>
  propagationFields.every(
    (field: PropagationField) => left[field] === right[field],
  )

const validatePublicationTimes = (
  retrievedAtValue: unknown,
  publishedAtValue: unknown,
) => {
  const retrievedAt = utcTimestamp(
    retrievedAtValue,
    'retrieval time',
  )
  const publishedAt = utcTimestamp(
    publishedAtValue,
    'publication time',
  )
  if (Date.parse(publishedAt) < Date.parse(retrievedAt)) {
    throw new OrbitalCatalogValidationError(
      'Publication time precedes retrieval time',
    )
  }
  return { retrievedAt, publishedAt }
}

const ensureSnapshotSize = (snapshot: OrbitalCatalogSnapshot) => {
  if (
    new TextEncoder().encode(
      serializeOrbitalCatalogSnapshot(snapshot),
    ).byteLength > ORBITAL_MAX_SNAPSHOT_BYTES
  ) {
    throw new OrbitalCatalogValidationError(
      'Published orbital snapshot is too large',
    )
  }
}

export const createOrbitalCatalogSnapshot = async (
  sourceValues: readonly OrbitalCatalogSourceInput[],
  retrievedAtValue: string,
  publishedAtValue = retrievedAtValue,
): Promise<OrbitalCatalogSnapshot> => {
  if (
    sourceValues.length !== ORBITAL_SOURCES.length ||
    sourceValues.length > ORBITAL_MAX_GROUPS
  ) {
    throw new OrbitalCatalogValidationError(
      'Invalid orbital source group count',
    )
  }

  const merged = new Map<string, MergedOrbitalRecord>()
  const propagationByIdAndEpoch = new Map<
    string,
    Map<
      string,
      Pick<OrbitalCatalogRecord, PropagationField>
    >
  >()
  const sources: OrbitalCatalogSourceMetadata[] = []

  for (const [sourceIndex, input] of sourceValues.entries()) {
    const definition = ORBITAL_SOURCES[sourceIndex]
    if (!definition || input.group !== definition.group) {
      throw new OrbitalCatalogValidationError(
        'Orbital source groups are not stably ordered',
      )
    }
    if (
      !Array.isArray(input.gpValue) ||
      input.gpValue.length === 0 ||
      input.gpValue.length > ORBITAL_MAX_UPSTREAM_RECORDS
    ) {
      throw new OrbitalCatalogValidationError(
        'Invalid GP record count',
      )
    }
    if (
      !Array.isArray(input.satcatValue) ||
      input.satcatValue.length === 0 ||
      input.satcatValue.length > ORBITAL_MAX_UPSTREAM_RECORDS
    ) {
      throw new OrbitalCatalogValidationError(
        'Invalid SATCAT record count',
      )
    }

    const satcatById = new Map<string, SatcatIdentity>()
    for (const value of input.satcatValue) {
      const { id, identity } = sourceSatcatRecord(value)
      if (satcatById.has(id)) {
        throw new OrbitalCatalogValidationError(
          'Duplicate SATCAT record',
        )
      }
      satcatById.set(id, identity)
    }

    const gpIds = new Set<string>()
    for (const value of input.gpValue) {
      if (!isRecord(value)) {
        throw new OrbitalCatalogValidationError('Invalid GP record')
      }
      const id = canonicalNoradId(value.NORAD_CAT_ID)
      if (gpIds.has(id)) {
        throw new OrbitalCatalogValidationError(
          'Duplicate GP record',
        )
      }
      gpIds.add(id)

      const satcat = satcatById.get(id)
      if (!satcat) {
        throw new OrbitalCatalogValidationError(
          'Missing SATCAT metadata',
        )
      }
      const candidate = sourceGpRecord(value, satcat.objectType)
      if (
        candidate.name !== satcat.name ||
        candidate.internationalDesignator !==
          satcat.internationalDesignator
      ) {
        throw new OrbitalCatalogValidationError(
          'GP and SATCAT identity conflict',
        )
      }

      const existing = merged.get(id)
      if (!existing) {
        propagationByIdAndEpoch.set(
          id,
          new Map([[candidate.epoch, candidate]]),
        )
        merged.set(id, {
          ...candidate,
          sourceGroups: [definition.group],
        })
        continue
      }
      if (
        existing.name !== candidate.name ||
        existing.internationalDesignator !==
          candidate.internationalDesignator
      ) {
        throw new OrbitalCatalogValidationError(
          'Cross-group orbital identity conflict',
        )
      }
      if (existing.objectType !== candidate.objectType) {
        throw new OrbitalCatalogValidationError(
          'Cross-group orbital type conflict',
        )
      }

      const propagationByEpoch = propagationByIdAndEpoch.get(id)
      if (!propagationByEpoch) {
        throw new OrbitalCatalogValidationError(
          'Missing orbital propagation history',
        )
      }
      const sameEpoch = propagationByEpoch.get(candidate.epoch)
      if (
        sameEpoch &&
        !propagationAgrees(sameEpoch, candidate)
      ) {
        throw new OrbitalCatalogValidationError(
          'Equal-epoch orbital propagation conflict',
        )
      }
      if (!sameEpoch) {
        propagationByEpoch.set(candidate.epoch, candidate)
      }

      const groups = [...existing.sourceGroups, definition.group]
      if (candidate.epoch > existing.epoch) {
        merged.set(id, {
          ...candidate,
          sourceGroups: groups,
        })
      } else if (candidate.epoch === existing.epoch) {
        existing.sourceGroups = groups
      } else {
        existing.sourceGroups = groups
      }
    }

    sources.push({
      ...definition,
      gpRecordCount: input.gpValue.length,
      satcatRecordCount: input.satcatValue.length,
    })
  }

  if (merged.size === 0 || merged.size > ORBITAL_MAX_RECORDS) {
    throw new OrbitalCatalogValidationError(
      'Invalid published orbital record count',
    )
  }

  const records = [...merged.values()]
    .sort(
      (left, right) =>
        Number(left.noradCatalogId) -
        Number(right.noradCatalogId),
    )
    .map((record): OrbitalCatalogRecord => ({
      ...record,
      displayOrder: displayOrder(
        record.noradCatalogId,
        record.sourceGroups,
      ),
    }))
  const times = validatePublicationTimes(
    retrievedAtValue,
    publishedAtValue,
  )
  const snapshotWithoutDigest: Omit<
    OrbitalCatalogSnapshot,
    'sha256'
  > = {
    schemaVersion: ORBITAL_CATALOG_SCHEMA_VERSION,
    sourceContractVersion: ORBITAL_SOURCE_CONTRACT_VERSION,
    catalogId: ORBITAL_CATALOG_ID,
    sources,
    ...times,
    recordCount: records.length,
    records,
  }
  const snapshot: OrbitalCatalogSnapshot = {
    ...snapshotWithoutDigest,
    sha256: await sha256(
      JSON.stringify(digestInput(snapshotWithoutDigest)),
    ),
  }
  ensureSnapshotSize(snapshot)
  return snapshot
}

export const validateOrbitalCatalogSnapshot = async (
  value: unknown,
): Promise<OrbitalCatalogSnapshot> => {
  if (!isRecord(value)) {
    throw new OrbitalCatalogValidationError(
      'Invalid orbital snapshot',
    )
  }
  exactKeys(
    value,
    [
      'catalogId',
      'publishedAt',
      'recordCount',
      'records',
      'retrievedAt',
      'schemaVersion',
      'sha256',
      'sourceContractVersion',
      'sources',
    ],
    'orbital snapshot',
  )
  if (value.schemaVersion !== ORBITAL_CATALOG_SCHEMA_VERSION) {
    throw new OrbitalCatalogValidationError(
      'Unsupported orbital snapshot schema',
    )
  }
  if (
    value.sourceContractVersion !==
    ORBITAL_SOURCE_CONTRACT_VERSION
  ) {
    throw new OrbitalCatalogValidationError(
      'Unsupported orbital source contract',
    )
  }
  if (value.catalogId !== ORBITAL_CATALOG_ID) {
    throw new OrbitalCatalogValidationError(
      'Invalid orbital catalog ID',
    )
  }
  if (
    !Array.isArray(value.sources) ||
    value.sources.length !== ORBITAL_SOURCES.length ||
    value.sources.length > ORBITAL_MAX_GROUPS
  ) {
    throw new OrbitalCatalogValidationError(
      'Invalid orbital snapshot sources',
    )
  }
  const sources = value.sources.map(sourceMetadata)
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
      Number(left.noradCatalogId) -
      Number(right.noradCatalogId),
  )
  if (
    records.some(
      (record, index) =>
        record.noradCatalogId !==
        sortedRecords[index]?.noradCatalogId,
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
  for (const source of sources) {
    const membershipCount = records.filter((record) =>
      record.sourceGroups.includes(source.group),
    ).length
    if (membershipCount !== source.gpRecordCount) {
      throw new OrbitalCatalogValidationError(
        'Orbital source row count does not match membership',
      )
    }
  }

  const times = validatePublicationTimes(
    value.retrievedAt,
    value.publishedAt,
  )
  const snapshotWithoutDigest: Omit<
    OrbitalCatalogSnapshot,
    'sha256'
  > = {
    schemaVersion: ORBITAL_CATALOG_SCHEMA_VERSION,
    sourceContractVersion: ORBITAL_SOURCE_CONTRACT_VERSION,
    catalogId: ORBITAL_CATALOG_ID,
    sources,
    ...times,
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
  ensureSnapshotSize(snapshot)
  return snapshot
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
      delayMs > ORBITAL_MAX_RETRY_AFTER_MS
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
    retryAtMs - receivedAtMs > ORBITAL_MAX_RETRY_AFTER_MS
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
  const contentType = response.headers.get('Content-Type')
  if (!isJsonContentType(contentType)) {
    throw new OrbitalCatalogUpstreamError(
      'Orbital upstream returned an unsupported content type',
      { kind: 'transient', status: response.status },
    )
  }

  const contentLength = response.headers.get('Content-Length')
  if (contentLength) {
    if (!/^\d+$/.test(contentLength)) {
      throw new OrbitalCatalogUpstreamError(
        'Orbital upstream returned a malformed content length',
        { kind: 'transient', status: response.status },
      )
    }
    const declaredBytes = Number(contentLength)
    if (
      !Number.isSafeInteger(declaredBytes) ||
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

  let value: unknown
  try {
    value = JSON.parse(
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
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > maximumRecords
  ) {
    throw new OrbitalCatalogUpstreamError(
      'Orbital upstream record count was invalid',
      { kind: 'transient', status: response.status },
    )
  }
  return { value, decodedBytes: totalBytes }
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
        'User-Agent': ORBITAL_UPSTREAM_USER_AGENT,
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
      throw new OrbitalCatalogUpstreamError(
        'Orbital upstream redirect rejected',
        {
          kind: 'blocked',
          status: response.status,
          receivedAtMs,
        },
      )
    }
    if (response.status === 403 || response.status === 404) {
      void response.body?.cancel()
      throw new OrbitalCatalogUpstreamError(
        'Orbital upstream access is blocked',
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
        throw new OrbitalCatalogUpstreamError(
          'Orbital upstream retry guidance requires review',
          {
            kind: 'blocked',
            status: response.status,
            receivedAtMs,
          },
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
        throw new OrbitalCatalogUpstreamError(
          'Orbital upstream retry guidance requires review',
          {
            kind: 'blocked',
            status: response.status,
            receivedAtMs,
          },
        )
      }
      if (retry?.kind === 'supported') {
        void response.body?.cancel()
        throw new OrbitalCatalogUpstreamError(
          'Orbital upstream requested a later retry',
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
      throw new OrbitalCatalogUpstreamError(
        'Orbital upstream request failed',
        {
          kind: 'transient',
          status: response.status,
          receivedAtMs,
        },
      )
    }
    return await readBoundedJson(
      response,
      controller,
      options.maximumBytes,
      options.maximumRecords,
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

const totalTimeoutError = () =>
  new OrbitalCatalogUpstreamError(
    'Orbital refresh exceeded its total deadline',
    { kind: 'transient' },
  )

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
    return {
      kind: 'unavailable',
      reason: 'KV binding is unavailable',
    }
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

  const ordinaryNextAllowedAtMs =
    nowMs + ORBITAL_REFRESH_INTERVAL_MS
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
    const fetchImpl: OrbitalCatalogFetch =
      options.fetchImpl ??
      ((input, init) => globalThis.fetch(input, init))
    const monotonicNow =
      options.monotonicNow ??
      (() => performance.now())
    const startedAtMs = monotonicNow()
    const totalTimeoutMs =
      options.totalTimeoutMs ?? ORBITAL_TOTAL_REFRESH_TIMEOUT_MS
    const perResponseTimeoutMs =
      options.timeoutMs ?? ORBITAL_UPSTREAM_TIMEOUT_MS
    const maximumUpstreamBytes =
      options.maximumUpstreamBytes ?? ORBITAL_MAX_UPSTREAM_BYTES
    const maximumAggregateBytes =
      options.maximumAggregateBytes ??
      ORBITAL_MAX_AGGREGATE_BYTES
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

    let aggregateBytes = 0
    const sourceValues: OrbitalCatalogSourceInput[] = []
    for (const source of ORBITAL_SOURCES) {
      const values: unknown[] = []
      for (const url of [source.gpSourceUrl, source.satcatSourceUrl]) {
        const elapsedMs = monotonicNow() - startedAtMs
        const remainingMs = totalTimeoutMs - elapsedMs
        if (remainingMs <= 0) throw totalTimeoutError()
        const response = await fetchBoundedJson(url, {
          fetchImpl,
          wallNowMs,
          timeoutMs: Math.min(
            perResponseTimeoutMs,
            remainingMs,
          ),
          maximumBytes: maximumUpstreamBytes,
          maximumRecords: ORBITAL_MAX_UPSTREAM_RECORDS,
        })
        aggregateBytes += response.decodedBytes
        if (aggregateBytes > maximumAggregateBytes) {
          throw new OrbitalCatalogUpstreamError(
            'Orbital refresh exceeded its aggregate byte limit',
            { kind: 'transient' },
          )
        }
        if (monotonicNow() - startedAtMs > totalTimeoutMs) {
          throw totalTimeoutError()
        }
        values.push(response.value)
      }
      sourceValues.push({
        group: source.group,
        gpValue: values[0],
        satcatValue: values[1],
      })
    }
    const completedElapsedMs = monotonicNow() - startedAtMs
    if (completedElapsedMs > totalTimeoutMs) {
      throw totalTimeoutError()
    }
    const retrievalTime = new Date(nowMs).toISOString()
    const publicationTime = new Date(
      nowMs + Math.max(0, completedElapsedMs),
    ).toISOString()
    snapshot = await createOrbitalCatalogSnapshot(
      sourceValues,
      retrievalTime,
      publicationTime,
    )
    if (monotonicNow() - startedAtMs > totalTimeoutMs) {
      throw totalTimeoutError()
    }
  } catch (error) {
    if (error instanceof OrbitalCatalogUpstreamError) {
      if (
        error.kind === 'blocked' &&
        error.status !== undefined
      ) {
        if (
          !(await complete({
            kind: 'blocked',
            status: error.status,
            blockedAtMs: error.receivedAtMs ?? nowMs,
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
    return {
      kind: 'failed',
      reason: 'Orbital snapshot publication failed',
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
  try {
    await store.put(
      ORBITAL_CATALOG_KEY,
      serializeOrbitalCatalogSnapshot(snapshot),
    )
  } catch {
    return {
      kind: 'failed',
      reason: 'Orbital snapshot publication failed',
    }
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
  if (
    new TextEncoder().encode(text).byteLength >
    ORBITAL_MAX_SNAPSHOT_BYTES
  ) {
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

export type OrbitalCatalogCandidate = {
  snapshot: OrbitalCatalogSnapshot
  source: 'kv' | 'bootstrap'
}

export const selectOrbitalCatalogCandidate = (
  kv: OrbitalCatalogSnapshot | undefined,
  bootstrap: OrbitalCatalogSnapshot | undefined,
): OrbitalCatalogCandidate | undefined => {
  if (!kv && !bootstrap) return undefined
  if (!kv) {
    return { snapshot: bootstrap as OrbitalCatalogSnapshot, source: 'bootstrap' }
  }
  if (!bootstrap) return { snapshot: kv, source: 'kv' }

  const kvRetrievedAtMs = Date.parse(kv.retrievedAt)
  const bootstrapRetrievedAtMs = Date.parse(bootstrap.retrievedAt)
  if (kvRetrievedAtMs > bootstrapRetrievedAtMs) {
    return { snapshot: kv, source: 'kv' }
  }
  if (bootstrapRetrievedAtMs > kvRetrievedAtMs) {
    return { snapshot: bootstrap, source: 'bootstrap' }
  }
  if (kv.sha256 !== bootstrap.sha256) {
    throw new OrbitalCatalogValidationError(
      'Equal-time orbital snapshots conflict',
    )
  }
  return { snapshot: kv, source: 'kv' }
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
    return textResponse(
      'Orbital catalog queries are not supported',
      400,
    )
  }

  let storedSnapshot: OrbitalCatalogSnapshot | undefined
  const stored = await environment.ORBITAL_CATALOG
    ?.get(ORBITAL_CATALOG_KEY)
    .catch(() => null)
  if (stored) {
    try {
      storedSnapshot = await readSnapshotText(stored)
    } catch {
      storedSnapshot = undefined
    }
  }

  let bootstrapSnapshot: OrbitalCatalogSnapshot | undefined
  try {
    bootstrapSnapshot = await loadBootstrap(
      request,
      environment.ASSETS,
    )
  } catch {
    bootstrapSnapshot = undefined
  }

  let candidate: OrbitalCatalogCandidate | undefined
  try {
    candidate = selectOrbitalCatalogCandidate(
      storedSnapshot,
      bootstrapSnapshot,
    )
  } catch {
    return textResponse('Orbital catalog unavailable', 503, {
      'Retry-After': '300',
    })
  }
  if (!candidate) {
    return textResponse('Orbital catalog unavailable', 503, {
      'Retry-After': '300',
    })
  }

  const { snapshot, source } = candidate
  const etag = `W/"${snapshot.sha256}"`
  const headers = new Headers({
    'Cache-Control': 'public, max-age=300, must-revalidate',
    'Content-Type': 'application/json; charset=utf-8',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'X-LiveTrafficStan-Orbital-Source': source,
    'X-LiveTrafficStan-Orbital-Retrieved-At':
      snapshot.retrievedAt,
    'X-LiveTrafficStan-Orbital-Schema': String(
      snapshot.schemaVersion,
    ),
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
