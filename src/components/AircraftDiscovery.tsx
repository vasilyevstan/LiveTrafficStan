import type { DisplayAircraft } from '../domain/traffic'
import {
  AIRCRAFT_RESULT_LIMIT,
  AIRCRAFT_SEARCH_MAX_LENGTH,
  normalizeAircraftSearchQuery,
} from '../domain/aircraftSearch'

interface AircraftDiscoveryProps {
  query: string
  aircraft: readonly DisplayAircraft[]
  totalAircraft: number
  aircraftVisible: boolean
  emptyMessage: string
  onQueryChange: (query: string) => void
  onSelect: (id: string) => void
}

const resultLabel = (aircraft: DisplayAircraft) =>
  aircraft.callsign ?? aircraft.registration ?? aircraft.hex.toUpperCase()

const resultContext = (aircraft: DisplayAircraft) =>
  [
    `ICAO24 ${aircraft.hex.toUpperCase()}`,
    aircraft.registration,
    aircraft.aircraftType,
    aircraft.freshness === 'stale' ? 'STALE' : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

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
      : `${aircraft.length} of ${totalAircraft} aircraft match; AIRCRAFT layer hidden`
    : aircraftVisible
      ? `${totalAircraft} aircraft in view`
      : `${totalAircraft} aircraft in view; AIRCRAFT layer hidden`

  return (
    <fieldset className="control-group vessel-discovery aircraft-discovery">
      <legend>Aircraft discovery</legend>

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

      <div className="vessel-discovery__summary">
        <p role="status">{status}</p>
        <p>Search is local to the current visible traffic area.</p>
      </div>

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
              <button
                id={`aircraft-discovery-result-${entity.id}`}
                type="button"
                disabled={!aircraftVisible}
                onClick={() => onSelect(entity.id)}
              >
                <strong>{resultLabel(entity)}</strong>
                <span>{resultContext(entity)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {normalizedQuery && aircraft.length > AIRCRAFT_RESULT_LIMIT && (
        <p className="control-note control-note--muted">
          Showing the first {AIRCRAFT_RESULT_LIMIT} of {aircraft.length}{' '}
          matches. All current aircraft remain visible on the map.
        </p>
      )}
      {normalizedQuery && aircraft.length > 0 && !aircraftVisible && (
        <p className="control-note">
          Show the AIRCRAFT layer to select a matching aircraft.
        </p>
      )}
    </fieldset>
  )
}
