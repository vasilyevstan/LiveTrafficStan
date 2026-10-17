import referenceInput from '../src/config/spaceTrackCurationReference.json' with { type: 'json' }
import type { OrbitalChannel, OrbitalObject, OrbitalObjectType } from '../src/domain/orbital.ts'
import {
  SPACE_TRACK_CURATED_GROUPS,
  SPACE_TRACK_CURATED_ID,
  SPACE_TRACK_CURATED_MEDIA_TYPE,
  SPACE_TRACK_GP_FIELDS,
  SPACE_TRACK_GP_TRANSFER_GRACE_MS,
  SPACE_TRACK_MAX_SNAPSHOT_BYTES,
  SPACE_TRACK_MAX_STARLINK_RECORDS,
  SPACE_TRACK_SAMPLE_ALGORITHM,
  SPACE_TRACK_STARLINK_ID,
  SPACE_TRACK_STARLINK_MEDIA_TYPE,
  SPACE_TRACK_STARLINK_EPOCH_WINDOW_MS,
  SpaceTrackCatalogContractError,
  parseSpaceTrackCurationReference,
  parseSpaceTrackSnapshot,
  spaceTrackDigest,
  spaceTrackSnapshotDigestInput,
  type SpaceTrackCuratedSnapshot,
  type SpaceTrackSnapshot,
  type SpaceTrackStarlinkSnapshot,
  type SpaceTrackUnsignedSnapshot,
} from '../src/providers/orbital/spaceTrackCatalogContract.ts'
import {
  sourceGpRecord,
  type OrbitalCatalogEnvironment,
} from './orbitalCatalog.ts'
import { starlinkShellBalancedSample } from './starlinkCatalog.ts'
import { spaceTrackNumber } from './spaceTrackProtocol.ts'
import type { fetchSpaceTrackGp } from './spaceTrackClient.ts'

export const SPACE_TRACK_CURATED_KEY = 'orbital:space-track:curated:v3'
export const SPACE_TRACK_STARLINK_KEY = 'orbital:space-track:starlink:v3'

type GpResult = Awaited<ReturnType<typeof fetchSpaceTrackGp>>

const numberFields = [
  'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'EPHEMERIS_TYPE', 'ELEMENT_SET_NO',
  'REV_AT_EPOCH', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT',
] as const

const nativeTypes = new Map<string, OrbitalObjectType>([
  ['PAYLOAD', 'PAY'], ['ROCKET BODY', 'R/B'], ['DEBRIS', 'DEB'], ['UNKNOWN', 'UNK'],
])

function invalid(): never { throw new SpaceTrackCatalogContractError() }
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const spaceTrackCurationReference = () =>
  parseSpaceTrackCurationReference(referenceInput)

const normalizeGp = (value: unknown) => {
  if (
    !isRecord(value) || Object.keys(value).length !== SPACE_TRACK_GP_FIELDS.length ||
    Object.keys(value).some((key) => !SPACE_TRACK_GP_FIELDS.some((field) => field === key)) ||
    value.CLASSIFICATION_TYPE !== 'U' || value.DECAY_DATE !== null ||
    typeof value.OBJECT_TYPE !== 'string' ||
    !/^[A-Z][A-Z /-]{0,31}$/.test(value.OBJECT_TYPE)
  ) invalid()
  const normalized = { ...value }
  for (const field of numberFields) {
    const number = spaceTrackNumber(value[field])
    if (number === undefined) invalid()
    normalized[field] = number
  }
  return {
    record: sourceGpRecord(normalized, nativeTypes.get(value.OBJECT_TYPE) ?? 'UNK'),
    reportedType: value.OBJECT_TYPE,
  }
}

const population = (input: GpResult, maximumRecords: number) => {
  if (
    !Array.isArray(input.value) || input.value.length === 0 ||
    input.value.length > maximumRecords || input.source.recordCount !== input.value.length
  ) invalid()
  const ids = new Set<string>()
  return input.value.map((value) => {
    const parsed = normalizeGp(value)
    if (ids.has(parsed.record.noradCatalogId)) invalid()
    ids.add(parsed.record.noradCatalogId)
    return parsed
  })
}

const sign = async (snapshot: SpaceTrackUnsignedSnapshot) => {
  const sha256 = await spaceTrackDigest(JSON.stringify(spaceTrackSnapshotDigestInput(snapshot)))
  const complete = { ...snapshot, sha256 }
  if (new TextEncoder().encode(JSON.stringify(complete)).byteLength > SPACE_TRACK_MAX_SNAPSHOT_BYTES) invalid()
  return complete
}

export const createSpaceTrackCuratedSnapshot = async (
  input: GpResult,
  publishedAt: string,
): Promise<SpaceTrackCuratedSnapshot> => {
  const curationReference = spaceTrackCurationReference()
  const joined = population(input, 512)
  if (joined.length !== curationReference.records.length) invalid()
  const byId = new Map(joined.map(({ record }) => [record.noradCatalogId, record]))
  const records: OrbitalObject[] = curationReference.records.map((membership) => {
    const record = byId.get(membership.noradCatalogId)
    if (!record) invalid()
    return {
      ...record, sourceGroups: membership.sourceGroups,
      displayOrder: SPACE_TRACK_CURATED_GROUPS.indexOf(membership.sourceGroups[0]) *
        1_000_000_000 + Number(record.noradCatalogId),
    }
  })
  const snapshot = await sign({
    schemaVersion: 3, sourceContractVersion: 3, provider: 'space-track',
    channel: 'curated', catalogId: SPACE_TRACK_CURATED_ID,
    source: input.source, curationReference,
    retrievedAt: input.source.retrievedAt, publishedAt, recordCount: records.length, records,
  })
  return parseSpaceTrackSnapshot(snapshot, 'curated')
}

export const createSpaceTrackStarlinkSnapshot = async (
  input: GpResult,
  publishedAt: string,
): Promise<SpaceTrackStarlinkSnapshot> => {
  const joined = population(input, SPACE_TRACK_MAX_STARLINK_RECORDS)
  if (joined.some(({ record, reportedType }) => (
    reportedType !== 'PAYLOAD' || !record.name.startsWith('STARLINK-') ||
    Date.parse(record.epoch) < Date.parse(input.source.retrievedAt) -
      SPACE_TRACK_STARLINK_EPOCH_WINDOW_MS - SPACE_TRACK_GP_TRANSFER_GRACE_MS
  ))) invalid()
  const sampled = starlinkShellBalancedSample(
    joined.map(({ record }) => record), input.source.retrievedAt,
  )
  const records: OrbitalObject[] = sampled.records.map((record) => ({
    ...record, sourceGroups: ['starlink'],
  }))
  const snapshot = await sign({
    schemaVersion: 3, sourceContractVersion: 3, provider: 'space-track',
    channel: 'starlink', catalogId: SPACE_TRACK_STARLINK_ID,
    source: input.source, retrievedAt: input.source.retrievedAt, publishedAt,
    populationCount: joined.length, sampleLimit: 512,
    sampleAlgorithm: SPACE_TRACK_SAMPLE_ALGORITHM,
    samplingReferenceTime: input.source.retrievedAt, shells: sampled.shells,
    recordCount: records.length, records,
  })
  return parseSpaceTrackSnapshot(snapshot, 'starlink')
}

export const serializeSpaceTrackSnapshot = (snapshot: SpaceTrackSnapshot) =>
  `${JSON.stringify(snapshot)}\n`

const prefersNativeMedia = (accept: string | null, mediaType: string) => {
  const known = [mediaType, mediaType.replace('version=3', 'version=2'), mediaType.replace('version=3', 'version=1')]
  let selected = ''
  let maximumQuality = 0
  for (const entry of accept?.split(',') ?? []) {
    const parts = entry.trim().toLowerCase().split(';').map((part) => part.trim())
    if (parts.slice(1).some((part) => !part.startsWith('version=') && !part.startsWith('q='))) continue
    const type = [parts[0], ...parts.slice(1).filter((part) => part.startsWith('version='))].join(';')
    const qualityText = parts.find((part) => part.startsWith('q='))?.slice(2) ?? '1'
    if (!/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(qualityText) || !known.includes(type)) continue
    const quality = Number(qualityText)
    if (quality > maximumQuality || (quality === maximumQuality && type === mediaType)) {
      selected = type
      maximumQuality = quality
    }
  }
  return maximumQuality > 0 && selected === mediaType
}

export const handleSpaceTrackCatalog = async (
  request: Request,
  environment: OrbitalCatalogEnvironment,
  channel: OrbitalChannel,
): Promise<Response | undefined> => {
  const mediaType = channel === 'curated' ? SPACE_TRACK_CURATED_MEDIA_TYPE : SPACE_TRACK_STARLINK_MEDIA_TYPE
  if (
    environment.ORBITAL_CATALOG_SOURCE !== 'space-track' ||
    environment.ORBITAL_CATALOG_ENABLED !== 'true' ||
    (channel === 'starlink' && environment.STARLINK_CATALOG_ENABLED !== 'true') ||
    !prefersNativeMedia(request.headers.get('Accept'), mediaType)
  ) return
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } })
  }
  if (new URL(request.url).search || request.url.includes('?')) {
    return new Response('Orbital catalog queries are not supported', {
      status: 400, headers: { 'Cache-Control': 'no-store' },
    })
  }
  const unavailable = () => new Response('Orbital catalog is unavailable', {
    status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
  if (!environment.ORBITAL_CATALOG) return unavailable()
  let snapshot: SpaceTrackSnapshot
  try {
    const text = await environment.ORBITAL_CATALOG.get(
      channel === 'curated' ? SPACE_TRACK_CURATED_KEY : SPACE_TRACK_STARLINK_KEY,
    )
    if (text === null) return
    if (new TextEncoder().encode(text).byteLength > SPACE_TRACK_MAX_SNAPSHOT_BYTES) invalid()
    const value: unknown = JSON.parse(text)
    snapshot = channel === 'curated'
      ? await parseSpaceTrackSnapshot(value, 'curated')
      : await parseSpaceTrackSnapshot(value, 'starlink')
  } catch {
    console.warn('Space-Track published snapshot validation unavailable')
    return unavailable()
  }
  const prefix = channel === 'curated' ? 'Orbital' : 'Starlink'
  const etag = `W/"${snapshot.sha256}"`
  const headers = new Headers({
    'Content-Type': mediaType,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    Vary: 'Accept', ETag: etag,
    'X-LiveTrafficStan-Served-At': new Date().toISOString(),
    [`X-LiveTrafficStan-${prefix}-Source`]: 'kv',
    [`X-LiveTrafficStan-${prefix}-Schema`]: '3',
    [`X-LiveTrafficStan-${prefix}-Published-At`]: snapshot.publishedAt,
    [`X-LiveTrafficStan-${prefix}-${channel === 'curated' ? 'Sha256' : 'Digest'}`]: snapshot.sha256,
    [`X-LiveTrafficStan-${prefix}-Retrieved-At`]: snapshot.retrievedAt,
  })
  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(serializeSpaceTrackSnapshot(snapshot), {
    status: 200, headers,
  })
}
