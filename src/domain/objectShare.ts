import { OBJECT_SHARE_CONFIG as config } from '../config/objectShareConfig.js'
import { hasControlCharacters, isRecord } from '../providers/guards.js'
import { isValidCoordinate } from './geo.js'
import { orbitalFeatureId, parseOrbitalFeatureId, type ModeledOrbitalPosition, type OrbitalCatalogSnapshot, type OrbitalObjectType } from './orbital.js'
import type { TrafficEntity } from './traffic.js'
import { isValidImo } from './vesselPhotoIdentity.js'
import { DIGITRAFFIC_PROVIDER_NAME } from '../providers/marine/digitrafficCapabilities.js'

const marineSources = [DIGITRAFFIC_PROVIDER_NAME, 'AISStream', 'Open Waters AIS'] as const
type MarineShareSource = typeof marineSources[number]
type ShareSource = 'ADSB.lol' | MarineShareSource | 'Space-Track.org / USSPACECOM' | 'CelesTrak'
interface ShareBase {
  version: 1
  theme?: 'light' | 'dark'
  identifier: string
  label: string
  source: ShareSource
  position?: { latitude: number; longitude: number; at: number }
}
export type ObjectShareContext = ShareBase & (
  | { kind: 'aircraft'; registration?: string }
  | { kind: 'vessel'; imo?: string; contributors?: MarineShareSource[] }
  | {
      kind: 'orbital'
      owner: 'curated' | 'starlink'
      objectType: OrbitalObjectType
      internationalDesignator: string
      snapshot: { sha256: string; retrievedAt: number; elementEpoch: number }
      view?: 'from-here'
    }
)
export interface ObjectShareReceipt {
  token: string
  context: ObjectShareContext
  createdAt: number
  expiresAt: number
  serverNow: number
}

export const isObjectShareToken = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{12}$/.test(value)

const text = (value: unknown, maximum: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum &&
  value === value.trim() && !hasControlCharacters(value) && !/[\u202a-\u202e\u2066-\u2069]/u.test(value)
const timestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8_640_000_000_000_000
const onlyKeys = (value: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(value).every(key => allowed.includes(key))
const marineSource = (value: unknown): value is MarineShareSource => marineSources.some(name => name === value)
const source = (value: unknown): value is ShareSource =>
  value === 'ADSB.lol' || marineSource(value) ||
  value === 'Space-Track.org / USSPACECOM' || value === 'CelesTrak'
const round = (value: number) => Number(value.toFixed(config.coordinatePrecision))

export const parseObjectShareContext = (value: unknown, now: number): ObjectShareContext => {
  if (!timestamp(now) || !isRecord(value) || value.version !== 1 || !text(value.identifier, 9) ||
    !text(value.label, config.maximumLabelLength) || !source(value.source)) {
    throw new Error('Invalid shared object')
  }
  const allowed = ['version', 'kind', 'identifier', 'label', 'source', 'position', 'theme']
  if (value.theme !== undefined && value.theme !== 'light' && value.theme !== 'dark') {
    throw new Error('Invalid shared theme')
  }
  let position: ShareBase['position']
  if (value.position !== undefined) {
    const point = value.position
    if (!isRecord(point) || !onlyKeys(point, ['latitude', 'longitude', 'at']) ||
      typeof point.latitude !== 'number' || typeof point.longitude !== 'number' ||
      !isValidCoordinate(point.latitude, point.longitude) ||
      !timestamp(point.at) || point.at > now + config.futureToleranceMs) {
      throw new Error('Invalid shared position')
    }
    position = { latitude: round(point.latitude), longitude: round(point.longitude), at: point.at }
  }
  const base: ShareBase = {
    version: 1, identifier: value.identifier, label: value.label, source: value.source,
    ...(value.theme ? { theme: value.theme } : {}),
    ...(position ? { position } : {}),
  }
  let context: ObjectShareContext
  if (value.kind === 'aircraft' && /^[0-9a-f]{6}$/.test(value.identifier) && value.source === 'ADSB.lol') {
    allowed.push('registration')
    if (value.registration !== undefined && (!text(value.registration, 20) ||
      !/^[A-Z0-9 .-]+$/.test(value.registration))) throw new Error('Invalid shared registration')
    context = { ...base, kind: 'aircraft', ...(value.registration ? { registration: value.registration } : {}) }
  } else if (value.kind === 'vessel' && /^[2-7][0-9]{8}$/.test(value.identifier) &&
    marineSource(value.source)) {
    allowed.push('imo', 'contributors')
    if (value.imo !== undefined && (typeof value.imo !== 'string' || !isValidImo(value.imo))) {
      throw new Error('Invalid shared IMO')
    }
    const contributors = value.contributors
    if (contributors !== undefined && (!Array.isArray(contributors) || contributors.length < 1 ||
      contributors.length > marineSources.length || !contributors.every(marineSource) ||
      new Set(contributors).size !== contributors.length || !contributors.includes(value.source))) {
      throw new Error('Invalid shared marine attribution')
    }
    context = {
      ...base, kind: 'vessel', ...(value.imo ? { imo: value.imo } : {}),
      ...(contributors ? { contributors: [...contributors] } : {}),
    }
  } else if (value.kind === 'orbital' && /^[1-9][0-9]{0,8}$/.test(value.identifier) &&
    (value.owner === 'curated' || value.owner === 'starlink') &&
    (value.source === 'Space-Track.org / USSPACECOM' || value.source === 'CelesTrak')) {
    allowed.push('owner', 'objectType', 'internationalDesignator', 'snapshot', 'view')
    const snapshot = value.snapshot
    if (value.view !== undefined && value.view !== 'from-here' ||
      (value.objectType !== 'PAY' && value.objectType !== 'R/B' && value.objectType !== 'DEB' && value.objectType !== 'UNK') ||
      typeof value.internationalDesignator !== 'string' ||
      !/^(?:[0-9]{4}-[0-9]{3}[A-Z]{1,3})?$/.test(value.internationalDesignator) ||
      !isRecord(snapshot) || !onlyKeys(snapshot, ['sha256', 'retrievedAt', 'elementEpoch']) ||
      typeof snapshot.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(snapshot.sha256) ||
      !timestamp(snapshot.retrievedAt) || !timestamp(snapshot.elementEpoch) ||
      snapshot.retrievedAt > now + config.futureToleranceMs) throw new Error('Invalid shared orbital provenance')
    context = {
      ...base, kind: 'orbital', owner: value.owner, objectType: value.objectType,
      internationalDesignator: value.internationalDesignator,
      snapshot: { sha256: snapshot.sha256, retrievedAt: snapshot.retrievedAt, elementEpoch: snapshot.elementEpoch },
      ...(value.view === 'from-here' ? { view: value.view } : {}),
    }
  } else {
    throw new Error('Invalid shared identity or source')
  }
  if (!onlyKeys(value, allowed) || new TextEncoder().encode(JSON.stringify(context)).byteLength > config.maximumRecordBytes) {
    throw new Error('Invalid or oversized shared object')
  }
  return context
}

export const objectShareIdentityKey = (context: ObjectShareContext) =>
  JSON.stringify([context.kind, context.identifier,
    context.kind === 'aircraft' ? context.registration :
      context.kind === 'vessel' ? context.imo : [context.owner, context.internationalDesignator, context.view]])

export const shareTrafficObject = (entity: TrafficEntity): ObjectShareContext => {
  const position = {
    latitude: round(entity.position.latitude), longitude: round(entity.position.longitude), at: entity.position.observedAt,
  }
  return parseObjectShareContext(entity.kind === 'aircraft' ? {
    version: 1, kind: 'aircraft', identifier: entity.hex.toLowerCase(),
    label: (entity.callsign ?? entity.registration ?? entity.hex).trim().slice(0, config.maximumLabelLength),
    source: 'ADSB.lol', position,
    ...(entity.registration ? { registration: entity.registration.trim().toUpperCase() } : {}),
  } : {
    version: 1, kind: 'vessel', identifier: String(entity.mmsi),
    label: (entity.name ?? `MMSI ${entity.mmsi}`).trim().slice(0, config.maximumLabelLength),
    source: entity.provider, position,
    contributors: marineSources.filter(name => name === entity.provider || entity.attribution?.includes(name)),
    ...(entity.imo && isValidImo(String(entity.imo)) ? { imo: String(entity.imo) } : {}),
  }, Date.now())
}

export const shareOrbitalObject = (
  position: Readonly<ModeledOrbitalPosition>, snapshot: Readonly<OrbitalCatalogSnapshot>,
  view?: 'from-here',
): ObjectShareContext => {
  const identity = parseOrbitalFeatureId(position.id)
  if (!identity || identity.noradCatalogId !== position.noradCatalogId ||
    position.owner !== undefined && position.owner !== identity.owner ||
    position.snapshotSha256 !== snapshot.sha256 || position.snapshotRetrievedAt !== Date.parse(snapshot.retrievedAt)) {
    throw new Error('Orbital position does not match its catalog')
  }
  return parseObjectShareContext({
    version: 1, kind: 'orbital', identifier: position.noradCatalogId, owner: identity.owner,
    objectType: position.objectType,
    label: position.name.slice(0, config.maximumLabelLength),
    internationalDesignator: position.internationalDesignator,
    source: snapshot.sourceProvider === 'space-track' ? 'Space-Track.org / USSPACECOM' : 'CelesTrak',
    snapshot: { sha256: snapshot.sha256, retrievedAt: position.snapshotRetrievedAt, elementEpoch: position.elementEpoch },
    position: { latitude: position.latitude, longitude: position.longitude, at: position.modeledFor },
    ...(view ? { view } : {}),
  }, Date.now())
}

export const sharedTrafficMatches = (context: ObjectShareContext, entity: TrafficEntity) => {
  if (context.kind === 'aircraft' && entity.kind === 'aircraft') {
    return context.identifier === entity.hex.toLowerCase() &&
      (!context.registration || !entity.registration || context.registration === entity.registration.trim().toUpperCase())
  }
  return context.kind === 'vessel' && entity.kind === 'vessel' && context.identifier === String(entity.mmsi) &&
    (!context.imo || !entity.imo || !isValidImo(String(entity.imo)) || context.imo === String(entity.imo))
}

export const sharedOrbitalId = (context: ObjectShareContext) =>
  context.kind === 'orbital' ? orbitalFeatureId(context.identifier, context.owner) : undefined

export const sharedOrbitalMatches = (
  context: ObjectShareContext, position: ModeledOrbitalPosition, snapshot: OrbitalCatalogSnapshot,
) => context.kind === 'orbital' && sharedOrbitalId(context) === position.id &&
  context.identifier === position.noradCatalogId &&
  (position.owner === undefined || position.owner === context.owner) &&
  position.snapshotSha256 === snapshot.sha256 && position.snapshotRetrievedAt === Date.parse(snapshot.retrievedAt) &&
  (!context.internationalDesignator || !position.internationalDesignator ||
    context.internationalDesignator === position.internationalDesignator)

export const readObjectShareIntent = (hash: string) => {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  if (!params.has('object')) return undefined
  const token = params.get('object')
  return { token: params.size === 1 && isObjectShareToken(token) ? token : undefined }
}
