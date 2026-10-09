import type { ModeledOrbitalPosition, OrbitalControllerState } from './orbital'
import {
  orbitalCatalogPage,
  orbitalPositionInViewport,
  type OrbitalDisplaySelection,
} from './orbitalDiscovery'
import type { OrbitalViewport } from './orbitalViewport'
import type { ProviderStatus } from './traffic'

export interface InViewAvailability {
  available: boolean
  message?: string
}

export const aircraftInViewAvailability = ({
  historyActive,
  viewportReady,
  viewportEligible,
  online,
  status,
  count,
}: {
  historyActive: boolean
  viewportReady: boolean
  viewportEligible: boolean
  online: boolean
  status: ProviderStatus
  count: number
}): InViewAvailability => {
  if (historyActive) {
    return {
      available: false,
      message: 'HISTORY · current aircraft list paused. Return to Live to resume.',
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
        ? 'Partial · aircraft source unavailable; retained observations only.'
        : 'Aircraft source unavailable. This is not an empty result.',
    }
  }
  if (status.phase === 'idle' || status.phase === 'loading') {
    return { available: count > 0, message: 'Loading aircraft observations.' }
  }
  if (status.paused) {
    return {
      available: count > 0,
      message: 'Aircraft updates paused; retained observations only.',
    }
  }
  return {
    available: true,
    ...(status.updating
      ? { message: 'Updating aircraft; current observations retained.' }
      : {}),
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
