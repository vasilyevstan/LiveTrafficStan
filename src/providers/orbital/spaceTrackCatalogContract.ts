import {
  STARLINK_ORBITAL_SHELLS,
  type OrbitalCatalogSnapshot,
  type OrbitalChannel,
  type OrbitalObject,
  type OrbitalSourceGroup,
  type StarlinkCatalogSourceMetadata,
  type StarlinkOrbitalCatalogSnapshot,
} from '../../domain/orbital.ts'
import {
  orbitalObjectDigestInput,
  parseOrbitalObjectRecord,
} from '../../domain/orbitalRecord.ts'

export const SPACE_TRACK_CURATED_ID = 'space-track-curated-v1'
export const SPACE_TRACK_STARLINK_ID = 'space-track-starlink-shell-balanced-v1'
export const SPACE_TRACK_CURATED_MEDIA_TYPE =
  'application/vnd.livetrafficstan.orbital-catalog+json;version=3'
export const SPACE_TRACK_STARLINK_MEDIA_TYPE =
  'application/vnd.livetrafficstan.starlink-catalog+json;version=3'
export const SPACE_TRACK_CURATED_GROUPS = [
  'visual', 'stations', 'weather', 'gnss', 'science',
] as const
export const SPACE_TRACK_SAMPLE_ALGORITHM = 'inclination-shell-raan-phase-grid-v1'
export const SPACE_TRACK_GP_FIELDS = [
  'NORAD_CAT_ID', 'OBJECT_NAME', 'OBJECT_ID', 'OBJECT_TYPE', 'EPOCH',
  'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'EPHEMERIS_TYPE', 'CLASSIFICATION_TYPE',
  'ELEMENT_SET_NO', 'REV_AT_EPOCH', 'BSTAR', 'MEAN_MOTION_DOT',
  'MEAN_MOTION_DDOT', 'DECAY_DATE',
] as const
export const SPACE_TRACK_MAX_CURATED_BYTES = 512 * 1_024
export const SPACE_TRACK_MAX_STARLINK_BYTES = 12 * 1_024 * 1_024
export const SPACE_TRACK_MAX_STARLINK_RECORDS = 15_000
export const SPACE_TRACK_STARLINK_EPOCH_WINDOW_MS = 10 * 24 * 60 * 60_000
export const SPACE_TRACK_GP_TRANSFER_GRACE_MS = 30_000
export const SPACE_TRACK_MAX_SNAPSHOT_BYTES = 512 * 1_024
export const SPACE_TRACK_GP_INITIAL_NOT_BEFORE_MS = 1_792_242_132_070

export interface SpaceTrackCurationReference {
  schemaVersion: 1
  id: string
  sourceCatalogId: 'celestrak-curated-v1'
  retrievedAt: string
  sha256: string
  records: {
    noradCatalogId: string
    sourceGroups: Exclude<OrbitalSourceGroup, 'starlink'>[]
  }[]
}

interface SpaceTrackSnapshotBase {
  schemaVersion: 3
  sourceContractVersion: 3
  provider: 'space-track'
  source: StarlinkCatalogSourceMetadata
  retrievedAt: string
  publishedAt: string
  recordCount: number
  records: OrbitalObject[]
  sha256: string
}

export interface SpaceTrackCuratedSnapshot extends SpaceTrackSnapshotBase {
  channel: 'curated'
  catalogId: typeof SPACE_TRACK_CURATED_ID
  curationReference: SpaceTrackCurationReference
}

export interface SpaceTrackStarlinkSnapshot extends SpaceTrackSnapshotBase {
  channel: 'starlink'
  catalogId: typeof SPACE_TRACK_STARLINK_ID
  populationCount: number
  sampleLimit: 512
  sampleAlgorithm: typeof SPACE_TRACK_SAMPLE_ALGORITHM
  samplingReferenceTime: string
  shells: {
    id: string
    inclinationMinimumDegrees: number
    inclinationMaximumDegreesExclusive: number | null
    populationCount: number
    sampleCount: number
  }[]
}

export type SpaceTrackSnapshot = SpaceTrackCuratedSnapshot | SpaceTrackStarlinkSnapshot
export type SpaceTrackUnsignedSnapshot =
  | Omit<SpaceTrackCuratedSnapshot, 'sha256'>
  | Omit<SpaceTrackStarlinkSnapshot, 'sha256'>

export class SpaceTrackCatalogContractError extends Error {
  constructor() {
    super('Space-Track catalog contract is invalid')
    this.name = 'SpaceTrackCatalogContractError'
  }
}

function invalid(): never { throw new SpaceTrackCatalogContractError() }
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length &&
  Object.keys(value).every((key) => keys.includes(key))
const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9]\d{0,8}$/.test(value)
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const integer = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) &&
  value >= minimum && value <= maximum
const instant = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value

export const spaceTrackGpUrl = (
  channel: OrbitalChannel,
  ids: readonly string[] = [],
) => {
  if (channel === 'curated' && (
    ids.length === 0 || ids.length > 512 || ids.some((value) => !id(value)) ||
    new Set(ids).size !== ids.length
  )) invalid()
  const selector = channel === 'curated'
    ? `NORAD_CAT_ID/${[...ids].sort((a, b) => Number(a) - Number(b)).join(',')}/DECAY_DATE/null-val`
    : 'OBJECT_NAME/~~STARLINK/OBJECT_TYPE/PAYLOAD/DECAY_DATE/null-val/EPOCH/%3Enow-10'
  return `https://www.space-track.org/basicspacedata/query/class/gp/${selector}/CLASSIFICATION_TYPE/U/predicates/${SPACE_TRACK_GP_FIELDS.join(',')}/limit/${channel === 'curated' ? 513 : 15_001}/format/json`
}

export const parseSpaceTrackCurationReference = (
  value: unknown,
): SpaceTrackCurationReference => {
  if (
    !isRecord(value) || !exactKeys(value, [
      'schemaVersion', 'id', 'sourceCatalogId', 'retrievedAt', 'sha256', 'records',
    ]) ||
    value.schemaVersion !== 1 || value.sourceCatalogId !== 'celestrak-curated-v1' ||
    typeof value.id !== 'string' ||
    !/^curated-reference-\d{4}-\d{2}-\d{2}-v[1-9]\d{0,3}$/.test(value.id) ||
    !instant(value.retrievedAt) || !hash(value.sha256) ||
    !value.id.startsWith(`curated-reference-${value.retrievedAt.slice(0, 10)}-v`) ||
    !Array.isArray(value.records) || value.records.length === 0 ||
    value.records.length > 512
  ) invalid()
  const records: SpaceTrackCurationReference['records'] = []
  let previous = 0
  for (const candidate of value.records) {
    if (
      !isRecord(candidate) ||
      !exactKeys(candidate, ['noradCatalogId', 'sourceGroups']) ||
      !id(candidate.noradCatalogId) || Number(candidate.noradCatalogId) <= previous ||
      !Array.isArray(candidate.sourceGroups) || candidate.sourceGroups.length === 0 ||
      candidate.sourceGroups.length > SPACE_TRACK_CURATED_GROUPS.length
    ) invalid()
    const sourceGroups: SpaceTrackCurationReference['records'][number]['sourceGroups'] = []
    let previousGroup = -1
    for (const group of candidate.sourceGroups) {
      const index = SPACE_TRACK_CURATED_GROUPS.findIndex((expected) => expected === group)
      if (index <= previousGroup) invalid()
      previousGroup = index
      sourceGroups.push(SPACE_TRACK_CURATED_GROUPS[index])
    }
    records.push({ noradCatalogId: candidate.noradCatalogId, sourceGroups })
    previous = Number(candidate.noradCatalogId)
  }
  if (SPACE_TRACK_CURATED_GROUPS.some(
    (group) => !records.some((record) => record.sourceGroups.includes(group)),
  )) invalid()
  return {
    schemaVersion: 1, id: value.id, sourceCatalogId: 'celestrak-curated-v1',
    retrievedAt: value.retrievedAt, sha256: value.sha256, records,
  }
}

const sourceDigestInput = (source: StarlinkCatalogSourceMetadata) => ({
  url: source.url, retrievedAt: source.retrievedAt, recordCount: source.recordCount,
  decodedBytes: source.decodedBytes, sha256: source.sha256,
})

export const spaceTrackSnapshotDigestInput = (
  snapshot: SpaceTrackSnapshot | SpaceTrackUnsignedSnapshot,
) => ({
  schemaVersion: snapshot.schemaVersion,
  sourceContractVersion: snapshot.sourceContractVersion,
  provider: snapshot.provider,
  channel: snapshot.channel,
  catalogId: snapshot.catalogId,
  source: sourceDigestInput(snapshot.source),
  ...(snapshot.channel === 'curated'
    ? { curationReference: snapshot.curationReference }
    : {
        populationCount: snapshot.populationCount,
        sampleLimit: snapshot.sampleLimit,
        sampleAlgorithm: snapshot.sampleAlgorithm,
        samplingReferenceTime: snapshot.samplingReferenceTime,
        shells: snapshot.shells,
      }),
  retrievedAt: snapshot.retrievedAt,
  publishedAt: snapshot.publishedAt,
  recordCount: snapshot.recordCount,
  records: snapshot.records.map(orbitalObjectDigestInput),
})

export const spaceTrackDigest = async (value: string | Uint8Array<ArrayBuffer>) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const result = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function parseSpaceTrackSnapshot(
  value: unknown, channel: 'curated',
): Promise<SpaceTrackCuratedSnapshot>
export function parseSpaceTrackSnapshot(
  value: unknown, channel: 'starlink',
): Promise<SpaceTrackStarlinkSnapshot>
export async function parseSpaceTrackSnapshot(
  value: unknown, channel: OrbitalChannel,
): Promise<SpaceTrackSnapshot> {
  const commonKeys = [
    'schemaVersion', 'sourceContractVersion', 'provider', 'channel', 'catalogId',
    'source', 'retrievedAt', 'publishedAt', 'recordCount', 'records', 'sha256',
  ]
  if (
    !isRecord(value) ||
    !exactKeys(value, [...commonKeys, ...(channel === 'curated'
      ? ['curationReference']
      : ['populationCount', 'sampleLimit', 'sampleAlgorithm', 'samplingReferenceTime', 'shells'])]) ||
    value.schemaVersion !== 3 || value.sourceContractVersion !== 3 ||
    value.provider !== 'space-track' || value.channel !== channel ||
    value.catalogId !== (channel === 'curated' ? SPACE_TRACK_CURATED_ID : SPACE_TRACK_STARLINK_ID) ||
    !instant(value.retrievedAt) || !instant(value.publishedAt) ||
    Date.parse(value.publishedAt) < Date.parse(value.retrievedAt) ||
    !hash(value.sha256) || !Array.isArray(value.records) ||
    !integer(value.recordCount, 1, 512) || value.recordCount !== value.records.length
  ) invalid()
  const reference = channel === 'curated'
    ? parseSpaceTrackCurationReference(value.curationReference) : undefined
  const expectedUrl = spaceTrackGpUrl(
    channel, reference?.records.map((record) => record.noradCatalogId),
  )
  const source = value.source
  if (
    !isRecord(source) || !exactKeys(source, [
      'url', 'retrievedAt', 'recordCount', 'decodedBytes', 'sha256',
    ]) ||
    source.url !== expectedUrl || source.retrievedAt !== value.retrievedAt ||
    !integer(source.recordCount, 1, channel === 'curated' ? 512 : SPACE_TRACK_MAX_STARLINK_RECORDS) ||
    !integer(source.decodedBytes, 1, channel === 'curated'
      ? SPACE_TRACK_MAX_CURATED_BYTES : SPACE_TRACK_MAX_STARLINK_BYTES) ||
    !hash(source.sha256)
  ) invalid()
  const completeSource: StarlinkCatalogSourceMetadata = {
    url: expectedUrl, retrievedAt: value.retrievedAt,
    recordCount: source.recordCount, decodedBytes: source.decodedBytes, sha256: source.sha256,
  }
  const groups = channel === 'curated' ? SPACE_TRACK_CURATED_GROUPS : ['starlink'] as const
  const records: OrbitalObject[] = []
  let previousId = 0
  for (const candidate of value.records) {
    const record = parseOrbitalObjectRecord(candidate, groups)
    if (
      !record || record.classificationType !== 'U' ||
      Number(record.noradCatalogId) <= previousId
    ) invalid()
    records.push(record)
    previousId = Number(record.noradCatalogId)
  }
  const base = {
    schemaVersion: 3, sourceContractVersion: 3, provider: 'space-track',
    source: completeSource, retrievedAt: value.retrievedAt, publishedAt: value.publishedAt,
    recordCount: records.length, records, sha256: value.sha256,
  } as const
  let snapshot: SpaceTrackSnapshot
  if (channel === 'curated') {
    if (
      !reference || source.recordCount !== reference.records.length ||
      records.length !== reference.records.length ||
      Date.parse(value.retrievedAt) < Date.parse(reference.retrievedAt) ||
      records.some((record, index) => (
        record.noradCatalogId !== reference.records[index].noradCatalogId ||
        JSON.stringify(record.sourceGroups) !== JSON.stringify(reference.records[index].sourceGroups)
      ))
    ) invalid()
    snapshot = {
      ...base, channel: 'curated', catalogId: SPACE_TRACK_CURATED_ID,
      curationReference: reference,
    }
  } else {
    if (
      !integer(value.populationCount, 512, SPACE_TRACK_MAX_STARLINK_RECORDS) ||
      source.recordCount !== value.populationCount || value.recordCount !== 512 ||
      value.sampleLimit !== 512 || value.sampleAlgorithm !== SPACE_TRACK_SAMPLE_ALGORITHM ||
      value.samplingReferenceTime !== value.retrievedAt ||
      !Array.isArray(value.shells) || value.shells.length !== STARLINK_ORBITAL_SHELLS.length
    ) invalid()
    const shells: SpaceTrackStarlinkSnapshot['shells'] = []
    let population = 0
    for (const [index, candidate] of value.shells.entries()) {
      const expected = STARLINK_ORBITAL_SHELLS[index]
      if (
        !isRecord(candidate) || !exactKeys(candidate, [
          'id', 'inclinationMinimumDegrees', 'inclinationMaximumDegreesExclusive',
          'populationCount', 'sampleCount',
        ]) ||
        candidate.id !== expected.id ||
        candidate.inclinationMinimumDegrees !== expected.inclinationMinimumDegrees ||
        candidate.inclinationMaximumDegreesExclusive !== expected.inclinationMaximumDegreesExclusive ||
        !integer(candidate.populationCount, 128, value.populationCount) ||
        candidate.sampleCount !== 128 ||
        records.filter((record) => (
          record.inclination >= expected.inclinationMinimumDegrees &&
          (expected.inclinationMaximumDegreesExclusive === null ||
            record.inclination < expected.inclinationMaximumDegreesExclusive)
        )).length !== 128
      ) invalid()
      shells.push({ ...expected, populationCount: candidate.populationCount, sampleCount: 128 })
      population += candidate.populationCount
    }
    if (
      population !== value.populationCount ||
      records.some((record) => (
        record.objectType !== 'PAY' || !record.name.startsWith('STARLINK-') ||
        Date.parse(record.epoch) < Date.parse(base.retrievedAt) -
          SPACE_TRACK_STARLINK_EPOCH_WINDOW_MS - SPACE_TRACK_GP_TRANSFER_GRACE_MS
      ))
    ) invalid()
    snapshot = {
      ...base, channel: 'starlink', catalogId: SPACE_TRACK_STARLINK_ID,
      populationCount: value.populationCount, sampleLimit: 512,
      sampleAlgorithm: SPACE_TRACK_SAMPLE_ALGORITHM,
      samplingReferenceTime: value.retrievedAt, shells,
    }
  }
  if (await spaceTrackDigest(JSON.stringify(spaceTrackSnapshotDigestInput(snapshot))) !== snapshot.sha256) invalid()
  return snapshot
}

export function spaceTrackApplicationSnapshot(
  snapshot: SpaceTrackCuratedSnapshot,
): OrbitalCatalogSnapshot
export function spaceTrackApplicationSnapshot(
  snapshot: SpaceTrackStarlinkSnapshot,
): StarlinkOrbitalCatalogSnapshot
export function spaceTrackApplicationSnapshot(
  snapshot: SpaceTrackSnapshot,
): OrbitalCatalogSnapshot | StarlinkOrbitalCatalogSnapshot {
  const groups = snapshot.channel === 'curated' ? SPACE_TRACK_CURATED_GROUPS : ['starlink'] as const
  const base: OrbitalCatalogSnapshot = {
    schemaVersion: 3, sourceContractVersion: 3, catalogId: snapshot.catalogId,
    sourceProvider: 'space-track',
    sources: groups.map((group) => ({
      group, gpSourceUrl: snapshot.source.url,
      gpRecordCount: snapshot.channel === 'curated'
        ? snapshot.records.filter((record) => record.sourceGroups.includes(group)).length
        : snapshot.populationCount,
    })),
    retrievedAt: snapshot.retrievedAt, publishedAt: snapshot.publishedAt,
    recordCount: snapshot.recordCount, records: snapshot.records, sha256: snapshot.sha256,
  }
  return snapshot.channel === 'curated' ? {
    ...base,
    curationReference: {
      id: snapshot.curationReference.id, retrievedAt: snapshot.curationReference.retrievedAt,
      sha256: snapshot.curationReference.sha256,
    },
  } : {
    ...base, owner: 'starlink',
    starlink: {
      sources: { gp: snapshot.source }, populationCount: snapshot.populationCount,
      sampleLimit: snapshot.sampleLimit, sampleAlgorithm: snapshot.sampleAlgorithm,
      samplingReferenceTime: snapshot.samplingReferenceTime, shells: snapshot.shells,
    },
  }
}
