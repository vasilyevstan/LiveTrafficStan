import type { OrbitalControllerState } from '../domain/orbital'
import type {
  OrbitalDiscoveryFilters,
  OrbitalDisplaySelection,
  OrbitalPopulationCounts,
} from '../domain/orbitalDiscovery'
import { CapturedOrbitalDetails } from './CapturedOrbitalDetails'
import { OrbitalContext } from './OrbitalContext'
import { OrbitalDetails } from './OrbitalDetails'
import { StarlinkContext } from './StarlinkContext'

export interface AdvancedOrbitalControlsProps {
  orbitalVisible: boolean
  live: boolean
  orbitalState: OrbitalControllerState
  selectedId: string | null
  filters: OrbitalDiscoveryFilters
  display: OrbitalDisplaySelection
  counts: OrbitalPopulationCounts
  starlinkState: OrbitalControllerState
  starlinkCounts: OrbitalPopulationCounts
  horizonMs: number
  now: number
  maximumQueryLength: number
  pageSize: number
  showOrbitalContext: boolean
  onFiltersChange: (filters: OrbitalDiscoveryFilters) => void
  onSelect: (id: string, originId: string) => void
  onRetryStarlink: () => void
}

export function AdvancedOrbitalControls({
  orbitalVisible,
  live,
  orbitalState,
  selectedId,
  filters,
  display,
  counts,
  starlinkState,
  starlinkCounts,
  horizonMs,
  now,
  maximumQueryLength,
  pageSize,
  showOrbitalContext,
  onFiltersChange,
  onSelect,
  onRetryStarlink,
}: AdvancedOrbitalControlsProps) {
  return (
    <>
      <StarlinkContext
        parentVisible={orbitalVisible}
        live={live}
        state={starlinkState}
        selectedId={selectedId}
        counts={starlinkCounts}
        horizonMs={horizonMs}
        pageSize={pageSize}
        onSelect={onSelect}
        onRetry={onRetryStarlink}
      />
      {showOrbitalContext && (
        <OrbitalContext
          state={orbitalState}
          selectedId={selectedId}
          filters={filters}
          display={display}
          counts={counts}
          horizonMs={horizonMs}
          now={now}
          maximumQueryLength={maximumQueryLength}
          pageSize={pageSize}
          onFiltersChange={onFiltersChange}
          onSelect={onSelect}
        />
      )}
    </>
  )
}

export { CapturedOrbitalDetails, OrbitalDetails }
