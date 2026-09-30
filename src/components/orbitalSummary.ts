import type { OrbitalControllerState } from '../domain/orbital'
import type {
  OrbitalDisplaySelection,
  OrbitalPopulationCounts,
} from '../domain/orbitalDiscovery'

interface OrbitalSummaryOptions {
  visible: boolean
  historyActive: boolean
  state: OrbitalControllerState
  display: OrbitalDisplaySelection
  counts: OrbitalPopulationCounts
}

export const formatOrbitalSummary = ({
  visible,
  historyActive,
  state,
  display,
  counts,
}: OrbitalSummaryOptions) => {
  if (!visible) return undefined
  if (historyActive || state.phase === 'paused-history') {
    return 'ORBITS · HIDDEN IN HISTORY'
  }
  if (state.phase === 'disabled') return 'ORBITS · STARTING'
  if (state.phase === 'loading') return 'ORBITS · LOADING'
  if (state.phase === 'unavailable') return 'ORBITS · UNAVAILABLE'
  if (state.phase === 'clock-invalid') {
    return 'ORBITS · CHECK DEVICE CLOCK'
  }
  if (state.phase === 'empty') return 'ORBITS · NO SAFE POSITIONS'
  if (state.phase === 'offline' && state.positions.length === 0) {
    return 'ORBITS · OFFLINE'
  }
  const selectedException = display.selectedException
    ? display.selectedFiltered
      ? ' · +1 SELECTED EXCEPTION'
      : ' · 1 SELECTED EXCEPTION'
    : ''
  if (counts.catalogMatchCount === 0) {
    return `ORBITS · 0 MATCHING / ${counts.catalogCount} CATALOG${selectedException}`
  }
  if (!display.available) return 'ORBITS · MAP COUNTS UNAVAILABLE'
  return `ORBITS · ${display.matchingShownIds.length} SHOWN / ${counts.modeledMatchCount} MODELED${selectedException}`
}
