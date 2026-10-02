import type { OrbitalControllerState } from '../domain/orbital'
import type {
  OrbitalDisplaySelection,
  OrbitalPopulationCounts,
} from '../domain/orbitalDiscovery'

interface OrbitalSummaryOptions {
  visible: boolean
  historyActive: boolean
  horizonMs: number
  state: OrbitalControllerState
  display: OrbitalDisplaySelection
  counts: OrbitalPopulationCounts
  starlink?: {
    enabled: boolean
    state: OrbitalControllerState
    display: OrbitalDisplaySelection
    counts: OrbitalPopulationCounts
  }
}

export const formatOrbitalSummary = ({
  visible,
  historyActive,
  horizonMs,
  state,
  display,
  counts,
  starlink,
}: OrbitalSummaryOptions) => {
  if (!visible) return undefined
  if (historyActive || state.phase === 'paused-history') {
    return 'ORBITS · HIDDEN IN HISTORY'
  }
  if (starlink?.enabled) {
    const layerValue = (
      layerState: OrbitalControllerState,
      layerCounts: OrbitalPopulationCounts,
    ): number | string => {
      if (layerState.phase === 'disabled') return 'STARTING'
      if (layerState.phase === 'loading') return 'LOADING'
      if (layerState.phase === 'unavailable') return 'UNAVAILABLE'
      if (layerState.phase === 'clock-invalid') return 'CLOCK'
      if (
        layerState.phase === 'offline' &&
        layerState.positions.length === 0
      ) {
        return 'OFFLINE'
      }
      if (layerState.phase === 'empty') return 0
      return layerCounts.shownInFootprintCount ?? 'MAP ?'
    }
    const curatedValue = layerValue(state, counts)
    const starlinkValue = layerValue(
      starlink.state,
      starlink.counts,
    )
    if (
      typeof curatedValue === 'number' &&
      typeof starlinkValue === 'number'
    ) {
      const curatedPasses = counts.futureCrossingCount
      const starlinkPasses = starlink.counts.futureCrossingCount
      const passLabel =
        curatedPasses === undefined ||
        starlinkPasses === undefined
          ? 'PASSES UPDATING'
          : `${curatedPasses + starlinkPasses} ${
              curatedPasses + starlinkPasses === 1
                ? 'PASS'
                : 'PASSES'
            } ≤${Math.round(horizonMs / 60_000)}M`
      const selectedDisplay = display.selectedException
        ? display
        : starlink.display.selectedException
          ? starlink.display
          : undefined
      const selectedException = selectedDisplay
        ? selectedDisplay.selectedFiltered
          ? ' · +1 SELECTED EXCEPTION'
          : ' · 1 SELECTED EXCEPTION'
        : ''
      return `ORBITS · ${curatedValue + starlinkValue} SHOWN (C ${curatedValue} / S ${starlinkValue}) · ${passLabel}${selectedException}`
    }
    return `ORBITS · C ${curatedValue} · S ${starlinkValue}`
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
  if (
    !display.available ||
    counts.inFootprintCount === undefined ||
    counts.shownInFootprintCount === undefined
  ) {
    return 'ORBITS · MAP COUNTS UNAVAILABLE'
  }
  const passCount = counts.futureCrossingCount
  const passes =
    passCount === undefined
      ? 'PASSES UPDATING'
      : `${passCount} ${passCount === 1 ? 'PASS' : 'PASSES'} ≤${Math.round(
          horizonMs / 60_000,
        )}M`
  return `ORBITS · ${counts.shownInFootprintCount} SHOWN · ${passes}${selectedException}`
}
