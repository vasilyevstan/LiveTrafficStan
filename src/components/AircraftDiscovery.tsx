import type { DisplayAircraft } from '../domain/traffic'
import { ObjectResultButton } from './ObjectResultButton'
import {
  AIRCRAFT_RESULT_LIMIT,
  AIRCRAFT_SEARCH_MAX_LENGTH,
  aircraftResultContext,
  aircraftResultLabel,
  normalizeAircraftSearchQuery,
} from '../domain/aircraftSearch'

interface AircraftDiscoveryProps {
  query: string
  aircraft: readonly DisplayAircraft[]
  totalAircraft: number
  aircraftVisible: boolean
  emptyMessage: string
  onQueryChange: (query: string) => void
  onSelect: (id: string, originId: string) => void
}

export function AircraftDiscovery({
  query,
  aircraft,
  totalAircraft,
  aircraftVisible,
  emptyMessage,
  onQueryChange,
  onSelect,
}: AircraftDiscoveryProps) {
  const normalizedQuery = normalizeAircraftSearchQuery(query)
  const listedAircraft = aircraft.slice(0, AIRCRAFT_RESULT_LIMIT)
  const status = normalizedQuery
    ? aircraftVisible
      ? `${aircraft.length} of ${totalAircraft} aircraft match`
      : `${aircraft.length} of ${totalAircraft} aircraft match; turn on AIRCRAFT to select`
    : aircraftVisible
      ? `${totalAircraft} aircraft in view`
      : `${totalAircraft} aircraft in view; turn on AIRCRAFT to select`

  return (
    <fieldset className="control-group vessel-discovery aircraft-discovery">
      <legend>Aircraft</legend>

      <label className="vessel-discovery__label" htmlFor="aircraft-search">
        Callsign, registration, ICAO24, or type
      </label>
      <div className="vessel-discovery__search-row">
        <input
          id="aircraft-search"
          type="search"
          value={query}
          maxLength={AIRCRAFT_SEARCH_MAX_LENGTH}
          placeholder="Search current aircraft"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
        <button
          type="button"
          disabled={!query}
          onClick={() => onQueryChange('')}
        >
          CLEAR
        </button>
      </div>

      {totalAircraft > 0 && <div className="vessel-discovery__summary">
        <p role="status">{status}</p>
      </div>}

      {totalAircraft === 0 && (
        <p className="control-note" role="status">
          {emptyMessage}
        </p>
      )}
      {totalAircraft > 0 && normalizedQuery && aircraft.length === 0 && (
        <p className="control-note" role="status">
          No aircraft match the current search.
        </p>
      )}
      {normalizedQuery && aircraft.length > 0 && (
        <ul
          className="vessel-results aircraft-results"
          aria-label="Matching aircraft"
        >
          {listedAircraft.map((entity) => (
            <li key={entity.id}>
              <ObjectResultButton
                prefix="aircraft-discovery-result"
                disabled={!aircraftVisible}
                onSelect={(originId) => onSelect(entity.id, originId)}
              >
                <strong>{aircraftResultLabel(entity)}</strong>
                <span>{aircraftResultContext(entity)}</span>
              </ObjectResultButton>
            </li>
          ))}
        </ul>
      )}
      {normalizedQuery && aircraft.length > AIRCRAFT_RESULT_LIMIT && (
        <p className="control-note control-note--muted">
          First {AIRCRAFT_RESULT_LIMIT} of {aircraft.length}.
        </p>
      )}
    </fieldset>
  )
}
