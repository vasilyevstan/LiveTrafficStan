import type { DisplayVessel } from '../domain/traffic'
import {
  DEFAULT_VESSEL_FILTERS,
  isDefaultVesselFilters,
  normalizeVesselSearchQuery,
  VESSEL_CATEGORY_LABELS,
  VESSEL_MAXIMUM_LENGTH_OPTIONS,
  VESSEL_MINIMUM_LENGTH_OPTIONS,
  VESSEL_NAVIGATION_LABELS,
  VESSEL_RESULT_LIMIT,
  VESSEL_SEARCH_MAX_LENGTH,
  vesselFilterSummary,
  vesselReportedSpeedLabels,
  withMinimumVesselLength,
  type VesselCategoryFilter,
  type VesselFilterState,
  type VesselMaximumLength,
  type VesselNavigationFilter,
  type VesselReportedSpeedFilter,
} from '../domain/vesselFilters'
import type { UnitSystem } from '../domain/units'

interface VesselDiscoveryProps {
  filters: VesselFilterState
  vessels: readonly DisplayVessel[]
  totalVessels: number
  vesselsVisible: boolean
  emptyMessage: string
  units: UnitSystem
  onFiltersChange: (filters: VesselFilterState) => void
  onSelect: (id: string) => void
}

const maximumLengthLabel = (value: VesselMaximumLength) =>
  value === null ? 'No maximum' : `${value} m`

const resultLabel = (vessel: DisplayVessel) =>
  vessel.name ?? vessel.callSign ?? `MMSI ${vessel.mmsi}`

const resultContext = (vessel: DisplayVessel) =>
  [
    `MMSI ${vessel.mmsi}`,
    vessel.imo === undefined ? undefined : `IMO ${vessel.imo}`,
    vessel.callSign,
  ]
    .filter(Boolean)
    .join(' · ')

export function VesselDiscovery({
  filters,
  vessels,
  totalVessels,
  vesselsVisible,
  emptyMessage,
  units,
  onFiltersChange,
  onSelect,
}: VesselDiscoveryProps) {
  const normalizedQuery = normalizeVesselSearchQuery(filters.query)
  const listedVessels = vessels.slice(0, VESSEL_RESULT_LIMIT)
  const status = vesselsVisible
    ? `${vessels.length} of ${totalVessels} ships shown`
    : `${vessels.length} of ${totalVessels} ships match; SHIPS layer hidden`

  return (
    <fieldset className="control-group vessel-discovery">
      <legend>Vessel discovery</legend>

      <label className="vessel-discovery__label" htmlFor="vessel-search">
        Name, callsign, MMSI, or IMO
      </label>
      <div className="vessel-discovery__search-row">
        <input
          id="vessel-search"
          type="search"
          value={filters.query}
          maxLength={VESSEL_SEARCH_MAX_LENGTH}
          placeholder="Search current ships"
          onChange={(event) =>
            onFiltersChange({
              ...filters,
              query: event.currentTarget.value,
            })
          }
        />
        <button
          type="button"
          disabled={!filters.query}
          onClick={() => onFiltersChange({ ...filters, query: '' })}
        >
          CLEAR
        </button>
      </div>

      <div className="vessel-discovery__filters">
        <label>
          <span>Vessel type</span>
          <select
            value={filters.category}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                category: event.currentTarget.value as VesselCategoryFilter,
              })
            }
          >
            {Object.entries(VESSEL_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Navigation</span>
          <select
            value={filters.navigation}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                navigation:
                  event.currentTarget.value as VesselNavigationFilter,
              })
            }
          >
            {Object.entries(VESSEL_NAVIGATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Reported speed</span>
          <select
            value={filters.reportedSpeed}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                reportedSpeed:
                  event.currentTarget.value as VesselReportedSpeedFilter,
              })
            }
          >
            {Object.entries(vesselReportedSpeedLabels(units)).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>
        </label>

        <label>
          <span>Minimum length</span>
          <select
            value={filters.minimumLengthMeters}
            onChange={(event) =>
              onFiltersChange(
                withMinimumVesselLength(
                  filters,
                  Number(event.currentTarget.value) as
                    VesselFilterState['minimumLengthMeters'],
                ),
              )
            }
          >
            {VESSEL_MINIMUM_LENGTH_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value === 0 ? 'No minimum' : `${value} m`}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Maximum length</span>
          <select
            value={filters.maximumLengthMeters ?? ''}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                maximumLengthMeters:
                  event.currentTarget.value === ''
                    ? null
                    : (Number(event.currentTarget.value) as Exclude<
                        VesselMaximumLength,
                        null
                      >),
              })
            }
          >
            {VESSEL_MAXIMUM_LENGTH_OPTIONS.map((value) => (
              <option
                key={value ?? 'none'}
                value={value ?? ''}
                disabled={
                  value !== null && value < filters.minimumLengthMeters
                }
              >
                {maximumLengthLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="vessel-discovery__checkbox">
          <input
            type="checkbox"
            checked={filters.includeUnknownLength}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                includeUnknownLength: event.currentTarget.checked,
              })
            }
          />
          <span>Include unknown length</span>
        </label>
      </div>

      <div className="vessel-discovery__summary">
        <p role="status">{status}</p>
        <p>{vesselFilterSummary(filters, units)}</p>
        <button
          type="button"
          disabled={isDefaultVesselFilters(filters)}
          onClick={() => onFiltersChange(DEFAULT_VESSEL_FILTERS)}
        >
          RESET FILTERS
        </button>
      </div>

      {totalVessels === 0 && (
        <p className="control-note" role="status">
          {emptyMessage}
        </p>
      )}
      {totalVessels > 0 && vessels.length === 0 && (
        <p className="control-note" role="status">
          No ships match the current vessel filters.
        </p>
      )}
      {normalizedQuery && vessels.length > 0 && (
        <ul className="vessel-results" aria-label="Matching vessels">
          {listedVessels.map((vessel) => (
            <li key={vessel.id}>
              <button
                type="button"
                disabled={!vesselsVisible}
                onClick={() => onSelect(vessel.id)}
              >
                <strong>{resultLabel(vessel)}</strong>
                <span>{resultContext(vessel)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {normalizedQuery && vessels.length > VESSEL_RESULT_LIMIT && (
        <p className="control-note control-note--muted">
          Showing the first {VESSEL_RESULT_LIMIT} of {vessels.length} matches.
          All matches remain visible on the map.
        </p>
      )}
      {normalizedQuery && vessels.length > 0 && !vesselsVisible && (
        <p className="control-note">
          Show the SHIPS layer to select a matching vessel.
        </p>
      )}
    </fieldset>
  )
}
