import type { Airport } from './airports'
import type { InViewAvailability } from './inView'
import type { OrbitalCatalogEntry } from './catalogDiscovery'
import type { OrbitalControllerState } from './orbital'
import { orbitalSearchAliases } from './orbitalDiscovery'
import type { Port } from './ports'
import type { SavedObject } from './savedObjects'
import type { DisplayAircraft, DisplayVessel } from './traffic'

export interface SavedObjectResolution {
  state:
    | 'current'
    | 'stale'
    | 'filtered'
    | 'unavailable'
    | 'missing'
    | 'catalog'
    | 'conflict'
  status: string
  detail?: string
  targetId?: string
}

export const matchesSavedObjectQuery = (entry: SavedObject, query: string) => {
  const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
  const search = normalized(query)
  if (!search) return true
  return [
    entry.savedLabel,
    entry.id,
    entry.kind === 'aircraft' ? entry.registration : undefined,
    entry.kind === 'vessel' ? entry.imo : undefined,
    entry.kind === 'orbital' ? entry.internationalDesignator : undefined,
    entry.kind === 'airport' ? entry.ident : undefined,
    ...(entry.kind === 'orbital' ? orbitalSearchAliases(entry.id) : []),
  ].some((value) => value && normalized(value).includes(search))
}

const changed = (saved: string | undefined, current: string | undefined) =>
  Boolean(saved && current && saved !== current.trim().toUpperCase())

const trafficObservationStatus = (
  freshness: DisplayAircraft['freshness'] | DisplayVessel['freshness'],
  availability: InViewAvailability,
) => {
  const historical = availability.message?.startsWith('HISTORY')
  const retained = Boolean(
    availability.message &&
    /offline|retained|paused|source unavailable/i.test(availability.message),
  )
  return historical
    ? 'Historical observation at playback cursor'
    : freshness === 'stale'
      ? 'Stale in current data'
      : retained
        ? 'Received in retained data'
        : 'Received now'
}

export const resolveSavedAircraft = (
  entry: Extract<SavedObject, { kind: 'aircraft' }>,
  aircraft: readonly DisplayAircraft[],
  displayVisible: boolean,
  availability: InViewAvailability,
  lastObservedAt?: number,
): SavedObjectResolution => {
  const entity = aircraft.find(
    (candidate) => candidate.hex.toLowerCase() === entry.id,
  )
  const retained = lastObservedAt === undefined
    ? undefined
    : `Last retained observation ${new Date(lastObservedAt).toISOString()}`
  if (entity) {
    if (changed(entry.registration, entity.registration)) {
      return {
        state: 'conflict',
        status: 'Reported identity changed',
        detail: [
          `Saved registration ${entry.registration}`,
          `current ${entity.registration}`,
          retained,
        ].filter(Boolean).join(' · '),
        targetId: entity.id,
      }
    }
    if (!displayVisible) {
      return {
        state: 'filtered',
        status: `${trafficObservationStatus(
          entity.freshness,
          availability,
        )} · hidden by layer`,
        detail: [availability.message, retained].filter(Boolean).join(' · ') || undefined,
      }
    }
    return {
      state: entity.freshness === 'stale' ? 'stale' : 'current',
      status: trafficObservationStatus(entity.freshness, availability),
      detail: [availability.message, retained].filter(Boolean).join(' · ') || undefined,
      targetId: entity.id,
    }
  }
  return availability.available
    ? {
        state: 'missing',
        status: 'Not in current data',
        detail: retained,
      }
    : {
        state: 'unavailable',
        status: 'Current status unavailable',
        detail: [availability.message, retained].filter(Boolean).join(' · '),
      }
}

export const resolveSavedVessel = (
  entry: Extract<SavedObject, { kind: 'vessel' }>,
  vessels: readonly DisplayVessel[],
  displayVisible: boolean,
  selectableVesselIds: ReadonlySet<string>,
  availability: InViewAvailability,
  lastObservedAt?: number,
): SavedObjectResolution => {
  const entity = vessels.find(
    (candidate) => String(candidate.mmsi) === entry.id,
  )
  const retained = lastObservedAt === undefined
    ? undefined
    : `Last retained observation ${new Date(lastObservedAt).toISOString()}`
  if (entity) {
    const currentImo = entity.imo === undefined ? undefined : String(entity.imo)
    if (changed(entry.imo, currentImo)) {
      return {
        state: 'conflict',
        status: 'Reported identity changed',
        detail: [
          `Saved IMO ${entry.imo}`,
          `current ${currentImo}`,
          retained,
        ].filter(Boolean).join(' · '),
        targetId: entity.id,
      }
    }
    if (!displayVisible) {
      return {
        state: 'filtered',
        status: `${trafficObservationStatus(
          entity.freshness,
          availability,
        )} · hidden by layer`,
        detail: [availability.message, retained].filter(Boolean).join(' · ') || undefined,
      }
    }
    if (!selectableVesselIds.has(entity.id)) {
      return {
        state: 'filtered',
        status: `${trafficObservationStatus(
          entity.freshness,
          availability,
        )} · filtered from display`,
        detail: [availability.message, retained].filter(Boolean).join(' · ') || undefined,
      }
    }
    return {
      state: entity.freshness === 'stale' ? 'stale' : 'current',
      status: trafficObservationStatus(entity.freshness, availability),
      detail: [availability.message, retained].filter(Boolean).join(' · ') || undefined,
      targetId: entity.id,
    }
  }
  return availability.available
    ? {
        state: 'missing',
        status: 'Not in current data',
        detail: [
          'Marine coverage is partial and regional.',
          retained,
        ].filter(Boolean).join(' · '),
      }
    : {
        state: 'unavailable',
        status: 'Current status unavailable',
        detail: [availability.message, retained].filter(Boolean).join(' · '),
      }
}

const orbitalStateMessage = (
  state: OrbitalControllerState,
  label: string,
) => {
  switch (state.phase) {
    case 'ready':
    case 'empty':
      return `${label} catalog loaded; no safe current modeled position.`
    case 'refreshing':
      return `${label} catalog updating; no safe current modeled position.`
    case 'stale':
      return `${label} catalog stale; no safe current modeled position.`
    case 'offline':
      return `${label} catalog offline; no safe current modeled position.`
    case 'paused-hidden':
      return 'Positions paused while this tab is hidden.'
    case 'paused-history':
      return 'Orbital modeling is paused in HISTORY.'
    case 'paused-capture':
      return 'Orbital modeling is paused for the captured view.'
    case 'clock-invalid':
      return 'Modeled state unavailable; check the device clock.'
    case 'disabled':
      return 'ORBITS is off.'
    case 'loading':
      return `${label} catalog loading.`
    case 'unavailable':
      return `${label} catalog unavailable.`
  }
}

export const resolveSavedOrbital = (
  entry: Extract<SavedObject, { kind: 'orbital' }>,
  catalog: readonly OrbitalCatalogEntry[],
  curated: OrbitalControllerState,
  starlink: OrbitalControllerState,
): SavedObjectResolution => {
  const resolved = catalog.find(
    (candidate) => candidate.record.noradCatalogId === entry.id,
  )
  if (resolved) {
    const sourceState =
      resolved.owner === 'starlink' ? starlink : curated
    const currentDesignator =
      resolved.record.internationalDesignator || undefined
    if (changed(entry.internationalDesignator, currentDesignator)) {
      return {
        state: 'conflict',
        status: 'Reported identity changed',
        detail: [
          `Saved designator ${entry.internationalDesignator}`,
          `current ${currentDesignator}`,
        ].filter(Boolean).join(' · '),
        targetId: resolved.id,
      }
    }
    if (resolved.position) {
      const stale = sourceState.phase === 'stale'
      return {
        state: stale ? 'stale' : 'current',
        status: stale
          ? 'Modeled from stale catalog'
          : sourceState.phase === 'refreshing'
            ? 'Modeled now · catalog updating'
            : 'Modeled now',
        detail: [
          `Element epoch ${resolved.record.epoch}`,
          `catalog retrieved ${resolved.snapshot.retrievedAt}`,
          sourceState.message,
        ].filter(Boolean).join(' · '),
        targetId: resolved.id,
      }
    }
    return {
      state: 'unavailable',
      status: orbitalStateMessage(
        sourceState,
        resolved.owner === 'starlink' ? 'Starlink sample' : 'Curated',
      ),
      detail: `Element epoch ${resolved.record.epoch} · catalog retrieved ${resolved.snapshot.retrievedAt}`,
    }
  }
  const sources = [curated, starlink]
  const loaded = sources.some(
    (state) =>
      state.snapshot &&
      ['ready', 'refreshing', 'stale', 'empty', 'offline'].includes(
        state.phase,
      ),
  )
  return loaded
    ? {
        state: 'missing',
        status: 'Not present in the loaded catalog or sample',
      }
    : {
        state: 'unavailable',
        status: 'Catalog unavailable',
        detail: [...new Set([
          orbitalStateMessage(curated, 'Curated'),
          orbitalStateMessage(starlink, 'Starlink sample'),
        ])].join(' '),
      }
}

export const resolveSavedAirport = (
  entry: Extract<SavedObject, { kind: 'airport' }>,
  airports: readonly Airport[],
  ready: boolean,
  sourceVersion?: string,
): SavedObjectResolution => {
  if (!ready) {
    return {
      state: 'unavailable',
      status: 'Catalog not loaded',
    }
  }
  const airport = airports.find((candidate) => candidate.id === entry.id)
  if (!airport) {
    return {
      state: 'missing',
      status: 'No longer in this catalog snapshot',
    }
  }
  const conflicts = [
    entry.ident !== airport.ident ? `Ident changed to ${airport.ident}` : undefined,
    sourceVersion && entry.sourceVersion !== sourceVersion
      ? `Saved from ${entry.sourceVersion}; loaded ${sourceVersion}`
      : undefined,
  ].filter(Boolean)
  return {
    state: conflicts.length ? 'conflict' : 'catalog',
    status: conflicts.length
      ? 'Catalog reference changed'
      : 'Catalog reference available',
    detail: conflicts.join(' · ') || undefined,
    targetId: airport.id,
  }
}

export const resolveSavedPort = (
  entry: Extract<SavedObject, { kind: 'port' }>,
  ports: readonly Port[],
  ready: boolean,
  sourceVersion?: string,
): SavedObjectResolution => {
  if (!ready) {
    return {
      state: 'unavailable',
      status: 'Catalog not loaded',
    }
  }
  const port = ports.find((candidate) => candidate.id === entry.id)
  if (!port) {
    return {
      state: 'missing',
      status: 'No longer in this catalog snapshot',
    }
  }
  const changedVersion =
    sourceVersion && entry.sourceVersion !== sourceVersion
  return {
    state: changedVersion ? 'conflict' : 'catalog',
    status: changedVersion
      ? 'Catalog snapshot changed'
      : 'Catalog reference available',
    detail: changedVersion
      ? `Saved from ${entry.sourceVersion}; loaded ${sourceVersion}`
      : undefined,
    targetId: port.id,
  }
}

export const savedObjectQuery = (entry: SavedObject) => {
  switch (entry.kind) {
    case 'aircraft':
      return `icao24:${entry.id}`
    case 'vessel':
      return `mmsi:${entry.id}`
    case 'orbital':
      return entry.id
    case 'airport':
      return entry.ident
    case 'port':
      return entry.savedLabel
  }
}

export const savedObjectContext = (entry: SavedObject) => {
  switch (entry.kind) {
    case 'aircraft':
      return `Aircraft · ICAO24 ${entry.id.toUpperCase()}${
        entry.registration ? ` · saved registration ${entry.registration}` : ''
      }`
    case 'vessel':
      return `Ship · MMSI ${entry.id}${
        entry.imo ? ` · saved IMO ${entry.imo}` : ''
      }`
    case 'orbital':
      return `Satellite · NORAD ${entry.id}${
        entry.internationalDesignator
          ? ` · ${entry.internationalDesignator}`
          : ''
      }`
    case 'airport':
      return `Airport · ${entry.ident} · OurAirports ${entry.id}`
    case 'port':
      return `Port · Natural Earth ${entry.id}`
  }
}
