import type { Airport, AirportSource } from './airports'
import {
  isOrbitalNoradCatalogId,
  orbitalFeatureOwner,
  type ModeledOrbitalPosition,
} from './orbital'
import type { Port, PortSource } from './ports'
import type { TrafficEntity } from './traffic'
import { isValidImo } from './vesselPhotoIdentity'
import { hasControlCharacters, isRecord } from '../providers/guards'

export const SAVED_OBJECTS_VERSION = 1
export const SAVED_OBJECTS_STORAGE_KEY = 'livetrafficstan.saved.v1'
export const SAVED_OBJECTS_INVALIDATION_KEY =
  'livetrafficstan.saved.invalidate.v1'
export const SAVED_OBJECTS_CHANNEL = 'livetrafficstan-saved'

export type SavedObjectKind =
  | 'aircraft'
  | 'vessel'
  | 'orbital'
  | 'airport'
  | 'port'

interface SavedObjectBase {
  kind: SavedObjectKind
  id: string
  savedLabel: string
  savedAt: number
}

export type SavedObject =
  | (SavedObjectBase & {
      kind: 'aircraft'
      registration?: string
    })
  | (SavedObjectBase & {
      kind: 'vessel'
      imo?: string
    })
  | (SavedObjectBase & {
      kind: 'orbital'
      internationalDesignator?: string
      preferredOwner?: 'curated' | 'starlink'
    })
  | (SavedObjectBase & {
      kind: 'airport'
      ident: string
      sourceVersion: string
    })
  | (SavedObjectBase & {
      kind: 'port'
      sourceVersion: string
    })

export interface SavedObjectsDocument {
  version: typeof SAVED_OBJECTS_VERSION
  revision: number
  clearEpoch: number
  entries: readonly SavedObject[]
}

export interface SavedObjectsLimits {
  maxEntries: number
  maxMovingEntriesPerKind: number
  maxLabelLength: number
  maxRecordBytes: number
  maxDocumentBytes: number
}

export interface SavedObjectsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type SavedObjectsLoadResult =
  | {
      phase: 'ready'
      document: SavedObjectsDocument
    }
  | {
      phase: 'repair-needed'
      document: SavedObjectsDocument
      message: string
    }
  | {
      phase: 'blocked'
      document: SavedObjectsDocument
      message: string
    }
  | {
      phase: 'unavailable'
      document: SavedObjectsDocument
      message: string
    }

export interface SavedObjectsMutationResult {
  ok: boolean
  document: SavedObjectsDocument
  message: string
}

const textEncoder = new TextEncoder()
const bidiPattern = /[\u202a-\u202e\u2066-\u2069]/u
const movingKinds = new Set<SavedObjectKind>([
  'aircraft',
  'vessel',
  'orbital',
])

const encodedBytes = (value: unknown) =>
  textEncoder.encode(JSON.stringify(value)).byteLength

const timestamp = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 8_640_000_000_000_000

const nonNegativeInteger = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0

const boundedText = (
  value: unknown,
  maximum: number,
  pattern?: RegExp,
): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= maximum &&
  value === value.trim() &&
  !hasControlCharacters(value) &&
  !bidiPattern.test(value) &&
  (pattern?.test(value) ?? true)

const onlyKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
) => Object.keys(value).every((key) => allowed.includes(key))

const cleanLabel = (
  value: string | undefined,
  fallback: string,
  maximum: number,
) => {
  const cleaned = (value ?? '')
    .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
  return [...(cleaned || fallback)].slice(0, maximum).join('')
}

const canonicalRegistration = (value: string | undefined) => {
  const registration = value?.trim().toUpperCase()
  return registration && /^[A-Z0-9 .-]{1,20}$/.test(registration)
    ? registration
    : undefined
}

const canonicalDesignator = (value: string | undefined) => {
  const designator = value?.trim().toUpperCase()
  return designator && /^(?:[0-9]{4}-[0-9]{3}[A-Z]{1,3})$/.test(designator)
    ? designator
    : undefined
}

export const savedObjectKey = (
  entry: Pick<SavedObject, 'kind' | 'id'>,
) => `${entry.kind}:${entry.id}`

export const emptySavedObjectsDocument = (
  clearEpoch = 0,
): SavedObjectsDocument => ({
  version: SAVED_OBJECTS_VERSION,
  revision: 0,
  clearEpoch,
  entries: [],
})

export const createSavedTrafficObject = (
  entity: TrafficEntity,
  savedAt: number,
  maximumLabelLength: number,
): SavedObject => {
  if (entity.kind === 'aircraft') {
    const id = entity.hex.trim().toLowerCase()
    return {
      kind: 'aircraft',
      id,
      savedLabel: cleanLabel(
        entity.callsign ?? entity.registration,
        id.toUpperCase(),
        maximumLabelLength,
      ),
      savedAt,
      ...(canonicalRegistration(entity.registration)
        ? { registration: canonicalRegistration(entity.registration) }
        : {}),
    }
  }
  const id = String(entity.mmsi)
  const imo = entity.imo === undefined ? undefined : String(entity.imo)
  return {
    kind: 'vessel',
    id,
    savedLabel: cleanLabel(entity.name, `MMSI ${id}`, maximumLabelLength),
    savedAt,
    ...(imo && isValidImo(imo) ? { imo } : {}),
  }
}

export const createSavedOrbitalObject = (
  position: Readonly<ModeledOrbitalPosition>,
  savedAt: number,
  maximumLabelLength: number,
): SavedObject => ({
  kind: 'orbital',
  id: position.noradCatalogId,
  savedLabel: cleanLabel(
    position.name,
    `NORAD ${position.noradCatalogId}`,
    maximumLabelLength,
  ),
  savedAt,
  ...(canonicalDesignator(position.internationalDesignator)
    ? {
        internationalDesignator: canonicalDesignator(
          position.internationalDesignator,
        ),
      }
    : {}),
  ...(orbitalFeatureOwner(position.id)
    ? { preferredOwner: orbitalFeatureOwner(position.id) }
    : {}),
})

export const createSavedAirportObject = (
  airport: Airport,
  source: AirportSource,
  savedAt: number,
  maximumLabelLength: number,
): SavedObject => ({
  kind: 'airport',
  id: airport.id,
  savedLabel: cleanLabel(
    airport.name,
    `Airport ${airport.id}`,
    maximumLabelLength,
  ),
  savedAt,
  ident: airport.ident,
  sourceVersion: source.outputVersion,
})

export const createSavedPortObject = (
  port: Port,
  source: PortSource,
  savedAt: number,
  maximumLabelLength: number,
): SavedObject => ({
  kind: 'port',
  id: port.id,
  savedLabel: cleanLabel(
    port.name,
    `Port ${port.id}`,
    maximumLabelLength,
  ),
  savedAt,
  sourceVersion: source.outputVersion,
})

export const parseSavedObject = (
  value: unknown,
  limits: SavedObjectsLimits,
): SavedObject | undefined => {
  if (!isRecord(value)) return undefined
  const allowedBase = ['kind', 'id', 'savedLabel', 'savedAt']
  if (
    !boundedText(value.savedLabel, limits.maxLabelLength) ||
    !timestamp(value.savedAt)
  ) {
    return undefined
  }
  let entry: SavedObject | undefined
  if (
    value.kind === 'aircraft' &&
    boundedText(value.id, 6, /^[0-9a-f]{6}$/)
  ) {
    if (
      value.registration !== undefined &&
      !boundedText(value.registration, 20, /^[A-Z0-9 .-]+$/)
    ) {
      return undefined
    }
    if (!onlyKeys(value, [...allowedBase, 'registration'])) return undefined
    entry = {
      kind: 'aircraft',
      id: value.id,
      savedLabel: value.savedLabel,
      savedAt: value.savedAt,
      ...(value.registration ? { registration: value.registration } : {}),
    }
  } else if (
    value.kind === 'vessel' &&
    boundedText(value.id, 9, /^[2-7][0-9]{8}$/)
  ) {
    if (
      value.imo !== undefined &&
      (typeof value.imo !== 'string' || !isValidImo(value.imo))
    ) {
      return undefined
    }
    if (!onlyKeys(value, [...allowedBase, 'imo'])) return undefined
    entry = {
      kind: 'vessel',
      id: value.id,
      savedLabel: value.savedLabel,
      savedAt: value.savedAt,
      ...(value.imo ? { imo: value.imo } : {}),
    }
  } else if (
    value.kind === 'orbital' &&
    typeof value.id === 'string' &&
    isOrbitalNoradCatalogId(value.id)
  ) {
    if (
      value.internationalDesignator !== undefined &&
      !boundedText(
        value.internationalDesignator,
        12,
        /^(?:[0-9]{4}-[0-9]{3}[A-Z]{1,3})$/,
      )
    ) {
      return undefined
    }
    if (
      value.preferredOwner !== undefined &&
      value.preferredOwner !== 'curated' &&
      value.preferredOwner !== 'starlink'
    ) {
      return undefined
    }
    if (
      !onlyKeys(value, [
        ...allowedBase,
        'internationalDesignator',
        'preferredOwner',
      ])
    ) {
      return undefined
    }
    entry = {
      kind: 'orbital',
      id: value.id,
      savedLabel: value.savedLabel,
      savedAt: value.savedAt,
      ...(value.internationalDesignator
        ? { internationalDesignator: value.internationalDesignator }
        : {}),
      ...(value.preferredOwner
        ? { preferredOwner: value.preferredOwner }
        : {}),
    }
  } else if (
    value.kind === 'airport' &&
    boundedText(value.id, 20, /^[0-9]+$/) &&
    boundedText(value.ident, 16, /^[A-Z0-9-]+$/i) &&
    boundedText(value.sourceVersion, 80)
  ) {
    if (
      !onlyKeys(value, [...allowedBase, 'ident', 'sourceVersion'])
    ) {
      return undefined
    }
    entry = {
      kind: 'airport',
      id: value.id,
      savedLabel: value.savedLabel,
      savedAt: value.savedAt,
      ident: value.ident,
      sourceVersion: value.sourceVersion,
    }
  } else if (
    value.kind === 'port' &&
    boundedText(value.id, 20, /^[0-9]+$/) &&
    boundedText(value.sourceVersion, 80)
  ) {
    if (!onlyKeys(value, [...allowedBase, 'sourceVersion'])) return undefined
    entry = {
      kind: 'port',
      id: value.id,
      savedLabel: value.savedLabel,
      savedAt: value.savedAt,
      sourceVersion: value.sourceVersion,
    }
  }
  if (!entry || encodedBytes(entry) > limits.maxRecordBytes) return undefined
  return entry
}

const parseDocument = (
  value: unknown,
  limits: SavedObjectsLimits,
): SavedObjectsLoadResult => {
  if (!isRecord(value) || value.version !== SAVED_OBJECTS_VERSION) {
    const futureVersion =
      isRecord(value) &&
      typeof value.version === 'number' &&
      value.version > SAVED_OBJECTS_VERSION
    return {
      phase: 'blocked',
      document: emptySavedObjectsDocument(),
      message: futureVersion
        ? 'Saved objects use a newer unsupported schema.'
        : 'Saved objects are malformed and were left unchanged.',
    }
  }
  if (
    !onlyKeys(value, ['version', 'revision', 'clearEpoch', 'entries']) ||
    !nonNegativeInteger(value.revision) ||
    !nonNegativeInteger(value.clearEpoch) ||
    !Array.isArray(value.entries)
  ) {
    return {
      phase: 'blocked',
      document: emptySavedObjectsDocument(),
      message: 'Saved objects are malformed and were left unchanged.',
    }
  }
  const entries = value.entries.flatMap((candidate) => {
    const entry = parseSavedObject(candidate, limits)
    return entry ? [entry] : []
  })
  const unique = new Map<string, SavedObject>()
  for (const entry of entries) {
    const key = savedObjectKey(entry)
    if (!unique.has(key)) unique.set(key, entry)
  }
  const document: SavedObjectsDocument = {
    version: SAVED_OBJECTS_VERSION,
    revision: value.revision,
    clearEpoch: value.clearEpoch,
    entries: [...unique.values()],
  }
  if (
    value.entries.length !== document.entries.length ||
    encodedBytes(document) > limits.maxDocumentBytes ||
    document.entries.length > limits.maxEntries ||
    [...movingKinds].some(
      (kind) =>
        document.entries.filter((entry) => entry.kind === kind).length >
        limits.maxMovingEntriesPerKind,
    )
  ) {
    return {
      phase: 'repair-needed',
      document,
      message:
        'Some saved-object data is invalid or oversized. Valid entries are read-only until Saved is cleared.',
    }
  }
  return { phase: 'ready', document }
}

export const readSavedObjects = (
  storage: SavedObjectsStorage | undefined,
  limits: SavedObjectsLimits,
): SavedObjectsLoadResult => {
  if (!storage) {
    return {
      phase: 'unavailable',
      document: emptySavedObjectsDocument(),
      message: 'Browser storage is unavailable. Saved objects cannot persist.',
    }
  }
  try {
    const raw = storage.getItem(SAVED_OBJECTS_STORAGE_KEY)
    if (raw === null) {
      return { phase: 'ready', document: emptySavedObjectsDocument() }
    }
    try {
      return parseDocument(JSON.parse(raw), limits)
    } catch {
      return {
        phase: 'blocked',
        document: emptySavedObjectsDocument(),
        message: 'Saved objects are malformed and were left unchanged.',
      }
    }
  } catch {
    return {
      phase: 'unavailable',
      document: emptySavedObjectsDocument(),
      message: 'Browser storage is unavailable. Saved objects cannot persist.',
    }
  }
}

const writeDocument = (
  storage: SavedObjectsStorage | undefined,
  document: SavedObjectsDocument,
  limits: SavedObjectsLimits,
): SavedObjectsMutationResult => {
  if (!storage) {
    return {
      ok: false,
      document,
      message: 'Browser storage is unavailable. The change was not saved.',
    }
  }
  const serialized = JSON.stringify(document)
  if (textEncoder.encode(serialized).byteLength > limits.maxDocumentBytes) {
    return {
      ok: false,
      document,
      message: 'Saved-object storage limit reached. Remove an entry first.',
    }
  }
  try {
    storage.setItem(SAVED_OBJECTS_STORAGE_KEY, serialized)
    const verified = storage.getItem(SAVED_OBJECTS_STORAGE_KEY)
    if (verified !== serialized) {
      return {
        ok: false,
        document: readSavedObjects(storage, limits).document,
        message:
          'Saved objects changed in another tab. Review the current list and try again.',
      }
    }
    return { ok: true, document, message: 'Saved.' }
  } catch {
    return {
      ok: false,
      document: readSavedObjects(storage, limits).document,
      message: 'Browser storage rejected the change. The prior list is unchanged.',
    }
  }
}

export const addSavedObject = (
  storage: SavedObjectsStorage | undefined,
  entry: SavedObject,
  limits: SavedObjectsLimits,
  expectedClearEpoch?: number,
): SavedObjectsMutationResult => {
  const loaded = readSavedObjects(storage, limits)
  if (loaded.phase !== 'ready') {
    return {
      ok: false,
      document: loaded.document,
      message: loaded.message,
    }
  }
  if (
    expectedClearEpoch !== undefined &&
    loaded.document.clearEpoch !== expectedClearEpoch
  ) {
    return {
      ok: false,
      document: loaded.document,
      message: 'Saved was cleared after this object was removed. Undo was cancelled.',
    }
  }
  const parsed = parseSavedObject(entry, limits)
  if (!parsed) {
    return {
      ok: false,
      document: loaded.document,
      message: 'This object does not have a supported saved identity.',
    }
  }
  const key = savedObjectKey(parsed)
  if (loaded.document.entries.some((candidate) => savedObjectKey(candidate) === key)) {
    return { ok: true, document: loaded.document, message: 'Already saved.' }
  }
  if (loaded.document.entries.length >= limits.maxEntries) {
    return {
      ok: false,
      document: loaded.document,
      message: `Saved is limited to ${limits.maxEntries} objects. Remove one first.`,
    }
  }
  if (
    movingKinds.has(parsed.kind) &&
    loaded.document.entries.filter((candidate) => candidate.kind === parsed.kind)
      .length >= limits.maxMovingEntriesPerKind
  ) {
    return {
      ok: false,
      document: loaded.document,
      message: `Saved is limited to ${limits.maxMovingEntriesPerKind} ${parsed.kind} entries. Remove one first.`,
    }
  }
  return writeDocument(
    storage,
    {
      ...loaded.document,
      revision: loaded.document.revision + 1,
      entries: [...loaded.document.entries, parsed],
    },
    limits,
  )
}

export const removeSavedObject = (
  storage: SavedObjectsStorage | undefined,
  key: string,
  limits: SavedObjectsLimits,
): SavedObjectsMutationResult => {
  const loaded = readSavedObjects(storage, limits)
  if (loaded.phase !== 'ready') {
    return {
      ok: false,
      document: loaded.document,
      message: loaded.message,
    }
  }
  const entries = loaded.document.entries.filter(
    (entry) => savedObjectKey(entry) !== key,
  )
  if (entries.length === loaded.document.entries.length) {
    return {
      ok: true,
      document: loaded.document,
      message: 'This object was already removed.',
    }
  }
  return writeDocument(
    storage,
    {
      ...loaded.document,
      revision: loaded.document.revision + 1,
      entries,
    },
    limits,
  )
}

export const clearSavedObjects = (
  storage: SavedObjectsStorage | undefined,
  limits: SavedObjectsLimits,
): SavedObjectsMutationResult => {
  if (!storage) {
    return {
      ok: false,
      document: emptySavedObjectsDocument(),
      message: 'Browser storage is unavailable. Saved objects were not cleared.',
    }
  }
  const loaded = readSavedObjects(storage, limits)
  const revision = loaded.document.revision + 1
  const clearEpoch = Math.max(
    loaded.document.clearEpoch + 1,
    Math.floor(Date.now()),
  )
  const document: SavedObjectsDocument = {
    version: SAVED_OBJECTS_VERSION,
    revision,
    clearEpoch,
    entries: [],
  }
  const result = writeDocument(storage, document, limits)
  return {
    ...result,
    message: result.ok
      ? 'Saved identities were cleared from this browser profile.'
      : result.message,
  }
}
