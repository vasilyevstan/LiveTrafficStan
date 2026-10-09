import type { ModeledOrbitalPosition, OrbitalControllerState } from './orbital'
import {
  orbitalCatalogPage,
  orbitalPositionInViewport,
  type OrbitalDisplaySelection,
} from './orbitalDiscovery'
import type { OrbitalViewport } from './orbitalViewport'
import type { ProviderStatus, Vessel } from './traffic'
import { VESSEL_RESULT_LIMIT } from './vesselFilters'

export interface InViewAvailability {
  available: boolean
  message?: string
}

interface TrafficInViewOptions {
  historyActive: boolean
  viewportReady: boolean
  viewportEligible: boolean
  online: boolean
  status: ProviderStatus
  count: number
}

const trafficInViewAvailability = ({
  historyActive,
  viewportReady,
  viewportEligible,
  online,
  status,
  count,
}: TrafficInViewOptions, kind: 'aircraft' | 'ships'): InViewAvailability => {
  const title = kind === 'aircraft' ? 'Aircraft' : 'Ship'
  const source = kind === 'aircraft' ? 'aircraft source' : 'marine source'
  if (historyActive) {
    return {
      available: false,
      message: `HISTORY · current ${kind} list paused. Return to Live to resume.`,
    }
  }
  if (!viewportReady) {
    return { available: false, message: 'Updating the map view.' }
  }
  if (!viewportEligible) {
    return {
      available: false,
      message: 'Traffic paused. Zoom in or reduce tilt; last-local samples are not live counts.',
    }
  }
  if (!online) {
    return {
      available: count > 0,
      message: 'Offline · last received, unexpired observations only.',
    }
  }
  if (status.phase === 'error') {
    return {
      available: count > 0,
      message: count > 0
        ? `Partial · ${source} unavailable; retained observations only.`
        : `${kind === 'aircraft' ? 'Aircraft' : 'Marine'} source unavailable. This is not an empty result.`,
    }
  }
  if (status.phase === 'idle' || status.phase === 'loading') {
    return { available: count > 0, message: `Loading ${kind} observations.` }
  }
  if (status.paused) {
    return {
      available: count > 0,
      message: `${title} updates paused; retained observations only.`,
    }
  }
  return {
    available: true,
    ...(status.updating
      ? { message: `Updating ${kind}; current observations retained.` }
      : {}),
  }
}

export const aircraftInViewAvailability = (options: TrafficInViewOptions) =>
  trafficInViewAvailability(options, 'aircraft')

export const vesselInViewAvailability = (options: TrafficInViewOptions) => {
  const availability = trafficInViewAvailability(options, 'ships')
  if (
    availability.available && options.online && !options.status.paused &&
    options.status.phase === 'live' && options.status.error
  ) {
    return {
      ...availability,
      message: [
        availability.message,
        `Partial · ${options.status.error}`,
      ].filter(Boolean).join(' '),
    }
  }
  return availability
}

export type VesselInViewRanking = 'length' | 'draught'

export const vesselInViewMeasurement = (
  vessel: Vessel,
  ranking: VesselInViewRanking,
) => {
  const value = ranking === 'length' ? vessel.lengthMeters : vessel.draughtMeters
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

export const rankVesselsInView = <T extends Vessel>(
  vessels: readonly T[],
  ranking: VesselInViewRanking,
) => {
  const secondary = ranking === 'length' ? 'draught' : 'length'
  const ranked = vessels
    .map((vessel) => ({
      vessel,
      measurement: vesselInViewMeasurement(vessel, ranking),
    }))
    .filter((entry): entry is { vessel: T; measurement: number } =>
      entry.measurement !== undefined,
    )
    .sort((first, second) =>
      second.measurement - first.measurement ||
      (vesselInViewMeasurement(second.vessel, secondary) ?? 0) -
        (vesselInViewMeasurement(first.vessel, secondary) ?? 0) ||
      first.vessel.mmsi - second.vessel.mmsi,
    )
  return {
    rows: ranked.slice(0, VESSEL_RESULT_LIMIT).map(({ vessel }) => vessel),
    rankableCount: ranked.length,
    unrankedCount: vessels.length - ranked.length,
  }
}

export interface InViewOrbit {
  position: ModeledOrbitalPosition
  shown: boolean
}

export interface OrbitalInView extends InViewAvailability {
  rows: readonly InViewOrbit[]
  shownCount: number
  partial: boolean
  sourceMessages: readonly string[]
  selectedOutside?: {
    position: ModeledOrbitalPosition
    reason: 'view' | 'filters'
  }
}

interface OrbitalInViewSource {
  state: OrbitalControllerState
  display: OrbitalDisplaySelection
}

const usableSource = ({ state, display }: OrbitalInViewSource) =>
  display.available && state.acceptedCount > 0 && (
    ['ready', 'refreshing', 'stale', 'empty'].includes(state.phase) ||
    (state.phase === 'offline' && state.positions.length > 0)
  )

const sourceMessage = (source: OrbitalInViewSource, label: string) => {
  switch (source.state.phase) {
    case 'ready': return undefined
    case 'empty': return `${label}: no safe modeled positions.`
    case 'disabled':
    case 'loading': return `${label}: loading.`
    case 'refreshing': return `${label}: updating; safe positions retained.`
    case 'stale': return `${label}: stale catalog.`
    case 'offline': return `${label}: offline.`
    case 'paused-hidden': return `${label}: paused while hidden.`
    case 'paused-history': return `${label}: hidden in HISTORY.`
    case 'clock-invalid': return `${label}: check the device clock.`
    case 'unavailable': return `${label}: unavailable. Use More for source details and retry.`
  }
}

export const deriveOrbitalInView = ({
  enabled,
  historyActive,
  curated,
  starlink,
  viewport,
  selectedId,
}: {
  enabled: boolean
  historyActive: boolean
  curated: OrbitalInViewSource
  starlink: OrbitalInViewSource
  viewport: OrbitalViewport | undefined
  selectedId: string | null
}): OrbitalInView => {
  const empty = { rows: [], shownCount: 0, partial: false, sourceMessages: [] }
  if (historyActive) {
    return {
      ...empty,
      available: false,
      message: 'HISTORY · orbital modeling is paused. Return to Live to resume.',
    }
  }
  if (!enabled) {
    return {
      ...empty,
      available: false,
      message: 'ORBITS is off. Enable it in the main controls to include curated objects and the bounded Starlink sample.',
    }
  }
  if (!viewport || viewport.kind === 'invalid') {
    return {
      ...empty,
      available: false,
      message: 'In-view counts unavailable for this map geometry. Modeled points may still be shown; zoom in or use a safe flat view.',
    }
  }
  const sources = [curated, starlink]
  const usable = sources.filter(usableSource)
  const sourceMessages = [
    sourceMessage(curated, 'Curated catalog'),
    sourceMessage(starlink, 'Starlink sample'),
  ].filter((value): value is string => Boolean(value))
  const positions = new Map<string, InViewOrbit>()
  for (const source of usable) {
    const shownIds = new Set(source.display.matchingShownIds)
    for (const position of source.display.matchingPositions) {
      if (!orbitalPositionInViewport(position, viewport)) continue
      const existing = positions.get(position.noradCatalogId)
      // Match the map's curated-first ownership, retaining an explicit selection.
      positions.set(position.noradCatalogId, {
        position: existing && position.id !== selectedId ? existing.position : position,
        shown: Boolean(existing?.shown || shownIds.has(position.id)),
      })
    }
  }
  const rows = [...positions.values()]
  const selectedSource = usable.find(({ state }) =>
    state.positions.some(({ id }) => id === selectedId),
  )
  const selected = selectedSource?.state.positions.find(({ id }) => id === selectedId)
  const selectedOutside = selected && !rows.some(({ position }) => position.id === selected.id)
    ? {
        position: selected,
        reason: orbitalPositionInViewport(selected, viewport)
          ? 'filters' as const
          : 'view' as const,
      }
    : undefined
  return {
    available: usable.length > 0,
    rows,
    shownCount: rows.filter(({ shown }) => shown).length,
    partial: usable.length < sources.length,
    sourceMessages,
    selectedOutside,
    ...(usable.length === 0
      ? { message: 'Current modeled positions are unavailable, not a confirmed empty view.' }
      : {}),
  }
}

export const inViewPage = <Row extends { key: string }>(
  rows: readonly Row[],
  requestedPage: number,
  pageSize: number,
  focusedKey: string | null,
) => {
  const focusedIndex = focusedKey
    ? rows.findIndex(({ key }) => key === focusedKey)
    : -1
  return orbitalCatalogPage(
    rows,
    focusedIndex < 0 ? requestedPage : Math.floor(focusedIndex / pageSize),
    pageSize,
  )
}
