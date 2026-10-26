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
  vesselReportedSpeedLabels,
  vesselResultContext,
  vesselResultLabel,
  withMinimumVesselLength,
  type VesselCategoryFilter,
  type VesselFilterState,
  type VesselMaximumLength,
  type VesselNavigationFilter,
  type VesselReportedSpeedFilter,
} from '../domain/vesselFilters'
import type { UnitSystem } from '../domain/units'
import { ObjectResultButton } from './ObjectResultButton'

interface VesselDiscoveryProps {
  filters: VesselFilterState
  vessels: readonly DisplayVessel[]
  totalVessels: number
  vesselsVisible: boolean
  emptyMessage: string
  units: UnitSystem
  onFiltersChange: (filters: VesselFilterState) => void
  onSelect: (id: string, originId: string) => void
}

const maximumLengthLabel = (value: VesselMaximumLength) =>
  value === null ? 'No maximum' : `${value} m`

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
    : `${vessels.length} of ${totalVessels} ships match; turn on SHIPS to select`

  return (
    <fieldset className="control-group vessel-discovery">
      <legend>Ships</legend>

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
          <span>Non-yacht minimum length</span>
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
          <span>Maximum length (all vessels)</span>
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
          <span>Include non-yachts with unknown length</span>
        </label>
      </div>

      <div className="vessel-discovery__summary">
        {totalVessels > 0 && <p role="status">{status}</p>}
        <button
          type="button"
          disabled={isDefaultVesselFilters(filters)}
          onClick={() => onFiltersChange(DEFAULT_VESSEL_FILTERS)}
        >
          RESET FILTERS
        </button>
      </div>
      {(filters.category === 'all' || filters.category === 'other') && (
        <p className="control-note control-note--muted">
          Yachts: reported sailing/pleasure type and length ≥8 m.
        </p>
      )}

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
              <ObjectResultButton
                prefix="vessel-discovery-result"
                disabled={!vesselsVisible}
                onSelect={(originId) => onSelect(vessel.id, originId)}
              >
                <strong>{vesselResultLabel(vessel)}</strong>
                <span>{vesselResultContext(vessel)}</span>
              </ObjectResultButton>
            </li>
          ))}
        </ul>
      )}
      {normalizedQuery && vessels.length > VESSEL_RESULT_LIMIT && (
        <p className="control-note control-note--muted">
          First {VESSEL_RESULT_LIMIT} of {vessels.length}.
        </p>
      )}
    </fieldset>
  )
}
