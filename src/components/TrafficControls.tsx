import type { Theme } from '../app/theme'
import type { PlaceSearchState } from '../app/PlaceSearchController'
import type { AppCenter } from '../config/appConfig'
import type { Airport } from '../domain/airports'
import type { DisplayAircraft, DisplayVessel } from '../domain/traffic'
import type { VesselFilterState } from '../domain/vesselFilters'
import type { PlaceSearchResult } from '../providers/geocoding/photonProvider'
import { AircraftDiscovery } from './AircraftDiscovery'
import { AirportContext } from './AirportContext'
import { LocationSearch } from './LocationSearch'
import { VesselDiscovery } from './VesselDiscovery'

interface TrafficControlsProps {
  aircraftQuery: string
  aircraftResults: readonly DisplayAircraft[]
  totalAircraft: number
  aircraftEmptyMessage: string
  onAircraftQueryChange: (query: string) => void
  onAircraftSelect: (id: string) => void
  vesselFilters: VesselFilterState
  vesselResults: readonly DisplayVessel[]
  totalVessels: number
  vesselEmptyMessage: string
  onVesselFiltersChange: (filters: VesselFilterState) => void
  onVesselSelect: (id: string) => void
  aircraftVisible: boolean
  onAircraftVisibleChange: (visible: boolean) => void
  vesselsVisible: boolean
  onVesselsVisibleChange: (visible: boolean) => void
  portsVisible: boolean
  portsLoading: boolean
  portsError?: string
  onPortsVisibleChange: (visible: boolean) => void
  onRetryPorts: () => void
  airportsVisible: boolean
  airportsLoading: boolean
  airportsReady: boolean
  airportsError?: string
  airportsInView: readonly Airport[]
  selectedAirportId: string | null
  airportsEmptyMessage: string
  onAirportsVisibleChange: (visible: boolean) => void
  onAirportSelect: (id: string) => void
  onRetryAirports: () => void
  centerDisabled: boolean
  onCenter: () => void
  locationAvailable: boolean
  locationLoading: boolean
  locationMessage?: string
  onUseLocation: () => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
  locationNavigationDisabled: boolean
  activeLocationLabel: string
  coordinatePrecision: number
  maximumLocationQueryLength: number
  placeSearchState: PlaceSearchState
  onPlaceSearch: (query: string) => void
  onLocationNavigate: (center: AppCenter) => void
  onPlaceResultSelect: (result: PlaceSearchResult) => void
  onPlaceSearchCancel: () => void
}

export function TrafficControls({
  aircraftQuery,
  aircraftResults,
  totalAircraft,
  aircraftEmptyMessage,
  onAircraftQueryChange,
  onAircraftSelect,
  vesselFilters,
  vesselResults,
  totalVessels,
  vesselEmptyMessage,
  onVesselFiltersChange,
  onVesselSelect,
  aircraftVisible,
  onAircraftVisibleChange,
  vesselsVisible,
  onVesselsVisibleChange,
  portsVisible,
  portsLoading,
  portsError,
  onPortsVisibleChange,
  onRetryPorts,
  airportsVisible,
  airportsLoading,
  airportsReady,
  airportsError,
  airportsInView,
  selectedAirportId,
  airportsEmptyMessage,
  onAirportsVisibleChange,
  onAirportSelect,
  onRetryAirports,
  centerDisabled,
  onCenter,
  locationAvailable,
  locationLoading,
  locationMessage,
  onUseLocation,
  theme,
  onThemeChange,
  locationNavigationDisabled,
  activeLocationLabel,
  coordinatePrecision,
  maximumLocationQueryLength,
  placeSearchState,
  onPlaceSearch,
  onLocationNavigate,
  onPlaceResultSelect,
  onPlaceSearchCancel,
}: TrafficControlsProps) {
  return (
    <aside className="control-panel" aria-label="Map controls">
      <LocationSearch
        disabled={locationNavigationDisabled}
        activeLabel={activeLocationLabel}
        coordinatePrecision={coordinatePrecision}
        maximumQueryLength={maximumLocationQueryLength}
        searchState={placeSearchState}
        onSearch={onPlaceSearch}
        onNavigate={onLocationNavigate}
        onSelectResult={onPlaceResultSelect}
        onCancel={onPlaceSearchCancel}
      />

      <fieldset className="control-group">
        <legend>Layers</legend>
        <div className="control-options control-options--two">
          <button
            type="button"
            className={aircraftVisible ? 'is-active' : undefined}
            aria-pressed={aircraftVisible}
            onClick={() => onAircraftVisibleChange(!aircraftVisible)}
          >
            AIRCRAFT
          </button>
          <button
            type="button"
            className={vesselsVisible ? 'is-active' : undefined}
            aria-pressed={vesselsVisible}
            onClick={() => onVesselsVisibleChange(!vesselsVisible)}
          >
            SHIPS
          </button>
          <button
            type="button"
            className={portsVisible ? 'is-active' : undefined}
            aria-pressed={portsVisible}
            aria-busy={portsVisible && portsLoading}
            onClick={() => onPortsVisibleChange(!portsVisible)}
          >
            {portsVisible && portsLoading ? 'PORTS...' : 'PORTS'}
          </button>
          <button
            id="airports-layer-toggle"
            type="button"
            className={airportsVisible ? 'is-active' : undefined}
            aria-pressed={airportsVisible}
            aria-busy={airportsVisible && airportsLoading}
            onClick={() => onAirportsVisibleChange(!airportsVisible)}
          >
            {airportsVisible && airportsLoading
              ? 'AIRPORTS...'
              : 'AIRPORTS'}
          </button>
        </div>
        {portsVisible && portsError && (
          <div className="control-note ports-status" role="status">
            <span>Ports unavailable: {portsError}</span>
            <button type="button" onClick={onRetryPorts}>
              RETRY PORTS
            </button>
          </div>
        )}
        {airportsVisible && airportsError && (
          <div className="control-note ports-status" role="status">
            <span>Airports unavailable: {airportsError}</span>
            <button type="button" onClick={onRetryAirports}>
              RETRY AIRPORTS
            </button>
          </div>
        )}
        <p className="control-note control-note--muted">
          Ports:{' '}
          <a href="https://www.naturalearthdata.com/downloads/10m-cultural-vectors/ports/">
            Natural Earth
          </a>{' '}
          (<a href="https://www.naturalearthdata.com/about/terms-of-use/">
            public domain
          </a>
          ); generalized and incomplete.
        </p>
        <p className="control-note control-note--muted">
          Airports: <a href="https://ourairports.com/data/">OurAirports</a>{' '}
          (<a href="https://ourairports.com/data/">public domain</a>); static
          large and medium airport context, not operational data.
        </p>
      </fieldset>

      <AircraftDiscovery
        query={aircraftQuery}
        aircraft={aircraftResults}
        totalAircraft={totalAircraft}
        aircraftVisible={aircraftVisible}
        emptyMessage={aircraftEmptyMessage}
        onQueryChange={onAircraftQueryChange}
        onSelect={onAircraftSelect}
      />

      <VesselDiscovery
        filters={vesselFilters}
        vessels={vesselResults}
        totalVessels={totalVessels}
        vesselsVisible={vesselsVisible}
        emptyMessage={vesselEmptyMessage}
        onFiltersChange={onVesselFiltersChange}
        onSelect={onVesselSelect}
      />

      {airportsVisible && airportsReady && (
        <AirportContext
          airports={airportsInView}
          selectedAirportId={selectedAirportId}
          emptyMessage={airportsEmptyMessage}
          onSelect={onAirportSelect}
        />
      )}

      <fieldset className="control-group">
        <legend>Theme</legend>
        <div className="control-options control-options--two">
          {(['light', 'dark'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={theme === option ? 'is-active' : undefined}
              aria-pressed={theme === option}
              onClick={() => onThemeChange(option)}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="control-group">
        <legend>View</legend>
        <div className="control-options control-options--two">
          <button
            type="button"
            disabled={centerDisabled}
            onClick={onCenter}
          >
            CENTER
          </button>
          <button
            type="button"
            disabled={!locationAvailable || locationLoading}
            aria-busy={locationLoading}
            aria-describedby={locationMessage ? 'location-status' : undefined}
            onClick={onUseLocation}
          >
            {locationLoading ? 'LOCATING...' : 'USE LOCATION'}
          </button>
        </div>
        {locationMessage && (
          <p id="location-status" className="control-note" role="status">
            {locationMessage}
          </p>
        )}
      </fieldset>

    </aside>
  )
}
