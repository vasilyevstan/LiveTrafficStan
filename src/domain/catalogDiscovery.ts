import { DISCOVERY_CONFIG } from '../config/discoveryConfig'
import type { Airport } from './airports'
import type { Port } from './ports'
import {
  orbitalFeatureId,
  preferOrbitalOwner,
  type ModeledOrbitalPosition,
  type OrbitalCatalogSnapshot,
  type OrbitalChannel,
  type OrbitalControllerState,
  type OrbitalObject,
} from './orbital'
import { DEFAULT_ORBITAL_DISCOVERY_FILTERS, discoverOrbitalCatalog } from './orbitalDiscovery'

export interface OrbitalCatalogEntry {
  id: string
  record: OrbitalObject
  snapshot: OrbitalCatalogSnapshot
  owner: OrbitalChannel
  position?: ModeledOrbitalPosition
}

const normalized = (value: string) => value.trim().toLocaleLowerCase('en-US')
const rank = (values: readonly (string | undefined)[], query: string) => {
  const text = values.flatMap((value) => value ? [normalized(value)] : [])
  if (!query) return 3
  if (text.includes(query)) return 0
  if (text.some((value) => value.startsWith(query))) return 1
  if (text.some((value) => value.includes(query))) return 2
  return undefined
}

export const discoverAirports = (records: readonly Airport[], query: string) => {
  const search = normalized(query)
  return records.flatMap((record) => {
    const score = rank([record.name, record.ident, record.icaoCode, record.iataCode, record.municipality], search)
    return score === undefined ? [] : [{ record, score }]
  }).sort((a, b) => a.score - b.score || a.record.name.localeCompare(b.record.name) || a.record.id.localeCompare(b.record.id))
    .map(({ record }) => record)
}

export const discoverPorts = (records: readonly Port[], query: string) => {
  const search = normalized(query)
  return records.flatMap((record) => {
    const score = rank([record.name], search)
    return score === undefined ? [] : [{ record, score }]
  }).sort((a, b) => a.score - b.score || a.record.rank - b.record.rank || a.record.name.localeCompare(b.record.name))
    .map(({ record }) => record)
}

export const loadedOrbitalCatalog = (
  curated: OrbitalControllerState,
  starlink: OrbitalControllerState,
  selectedId: string | null,
  now: number,
  maximumAgeMs: number,
) => {
  const entries = new Map<string, OrbitalCatalogEntry>()
  const unavailable: {
    owner: OrbitalChannel
    reason: 'not-loaded' | 'loading' | 'clock-invalid' | 'expired'
    retrievedAt?: string
  }[] = []
  for (const [owner, state] of [['curated', curated], ['starlink', starlink]] as const) {
    const snapshot = state.snapshot
    if (!snapshot) {
      unavailable.push({ owner, reason: state.phase === 'loading' ? 'loading' : 'not-loaded' })
      continue
    }
    const retrievedAt = Date.parse(snapshot.retrievedAt)
    const reason = state.phase === 'loading' ? 'loading'
      : state.phase === 'clock-invalid' || !Number.isFinite(retrievedAt) ||
        retrievedAt > now + DISCOVERY_CONFIG.futureToleranceMs ? 'clock-invalid'
        : now - retrievedAt >= maximumAgeMs ? 'expired' : undefined
    if (reason) {
      unavailable.push({ owner, reason, retrievedAt: snapshot?.retrievedAt })
      continue
    }
    const positions = new Map(state.positions.map((position) => [position.noradCatalogId, position]))
    for (const record of snapshot.records) {
      const candidate = positions.get(record.noradCatalogId)
      const position = ['ready', 'refreshing', 'stale', 'empty'].includes(state.phase) &&
        candidate && candidate.id === orbitalFeatureId(record.noradCatalogId, owner) &&
        candidate.snapshotSha256 === snapshot.sha256 && candidate.snapshotRetrievedAt === retrievedAt &&
        candidate.elementEpoch === Date.parse(record.epoch) &&
        candidate.modeledFor <= now + DISCOVERY_CONFIG.futureToleranceMs &&
        now - candidate.modeledFor <= DISCOVERY_CONFIG.maximumModeledPositionAgeMs ? candidate : undefined
      const entry: OrbitalCatalogEntry = {
        id: orbitalFeatureId(record.noradCatalogId, owner), record, snapshot, owner, position,
      }
      entries.set(record.noradCatalogId, preferOrbitalOwner(entries.get(record.noradCatalogId), entry, selectedId))
    }
  }
  return { entries: [...entries.values()], missing: unavailable.map(({ owner }) => owner), unavailable }
}

export const discoverLoadedOrbits = (entries: readonly OrbitalCatalogEntry[], query: string) => {
  const byNorad = new Map(entries.map((entry) => [entry.record.noradCatalogId, entry]))
  return discoverOrbitalCatalog(entries.map(({ record }) => record), query, DEFAULT_ORBITAL_DISCOVERY_FILTERS)
    .flatMap((record) => {
      const entry = byNorad.get(record.noradCatalogId)
      return entry ? [entry] : []
    })
}
