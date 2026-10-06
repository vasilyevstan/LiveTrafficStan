import {
  useRef,
  useState,
  type FocusEvent,
  type MutableRefObject,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
} from 'react'
import type { ThemePreference } from '../app/theme'
import type { PlaceSearchState } from '../app/PlaceSearchController'
import type { AppCenter } from '../config/appConfig'
import type { Airport } from '../domain/airports'
import type { MapProjectionPreference } from '../domain/preferences'
import type { DisplayAircraft, DisplayVessel } from '../domain/traffic'
import type { TrailPreferences } from '../domain/trailPreferences'
import type { UnitSystem } from '../domain/units'
import type { VesselFilterState } from '../domain/vesselFilters'
import type { DisplayWeatherObservation } from '../domain/weatherObservations'
import type { OrbitalControllerState } from '../domain/orbital'
import type {
  OrbitalDiscoveryFilters,
  OrbitalDisplaySelection,
  OrbitalPopulationCounts,
} from '../domain/orbitalDiscovery'
import type {
  PlaybackRange,
  PlaybackState,
} from '../history/playback'
import type {
  HistoryPersistenceSettings,
  HistoryPersistenceStatus,
  HistoryRetentionHours,
} from '../history/settings'
import type { PlaceSearchResult } from '../providers/geocoding/photonProvider'
import { AircraftDiscovery } from './AircraftDiscovery'
import { AirportContext } from './AirportContext'
import { HistoryControls } from './HistoryControls'
import {
  LocationSearchDetails,
  LocationSearchInput,
} from './LocationSearch'
import { useLocationSearchModel } from './useLocationSearchModel'
import { VesselDiscovery } from './VesselDiscovery'
import { WeatherContext } from './WeatherContext'
import { OrbitalContext } from './OrbitalContext'
import { StarlinkContext } from './StarlinkContext'

interface TrafficControlsProps {
  masthead?: ReactNode
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
  marineProviderName?: string
  units: UnitSystem
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
  weatherVisible: boolean
  weatherLoading: boolean
  weatherWaiting: boolean
  weatherReady: boolean
  now: number
  weatherError?: string
  weatherStatusMessage?: string
  weatherObservations: readonly DisplayWeatherObservation[]
  selectedWeatherId: string | null
  weatherEmptyMessage: string
  weatherCanRefresh: boolean
  weatherRetryUsesAirports: boolean
  onWeatherVisibleChange: (visible: boolean) => void
  onWeatherSelect: (id: string) => void
  onRetryWeather: () => void
  onRefreshWeather: () => void
  orbitalVisible: boolean
  orbitalState: OrbitalControllerState
  selectedOrbitalId: string | null
  orbitalFilters: OrbitalDiscoveryFilters
  orbitalDisplay: OrbitalDisplaySelection
  orbitalCounts: OrbitalPopulationCounts
  orbitalPrimarySummary?: string
  orbitalPredictionHorizonMs: number
  orbitalMaximumQueryLength: number
  orbitalPageSize: number
  onOrbitalVisibleChange: (visible: boolean) => void
  onOrbitalFiltersChange: (filters: OrbitalDiscoveryFilters) => void
  onOrbitalSelect: (id: string, originId: string) => void
  onRetryOrbital: () => void
  starlinkVisible: boolean
  starlinkState: OrbitalControllerState
  starlinkCounts: OrbitalPopulationCounts
  onStarlinkVisibleChange: (visible: boolean) => void
  onRetryStarlink: () => void
  clusteringEnabled: boolean
  onClusteringEnabledChange: (enabled: boolean) => void
  trailPreferences: TrailPreferences
  onTrailPreferencesChange: (preferences: TrailPreferences) => void
  historySettings: HistoryPersistenceSettings
  historyStatus: HistoryPersistenceStatus
  historyRange?: PlaybackRange
  historyRecordCount: number
  playback: PlaybackState
  onHistoryEnabledChange: (enabled: boolean) => void
  onHistoryRetentionChange: (hours: HistoryRetentionHours) => void
  onClearHistory: () => void
  onRetryHistory: () => void
  onEnterHistory: () => void
  centerDisabled: boolean
  onCenter: () => void
  locationAvailable: boolean
  locationLoading: boolean
  locationMessage?: string
  onUseLocation: () => void
  themePreference: ThemePreference
  onThemePreferenceChange: (preference: ThemePreference) => void
  projectionPreference: MapProjectionPreference
  onProjectionPreferenceChange: (preference: MapProjectionPreference) => void
  onUnitsChange: (units: UnitSystem) => void
  shareDisabled: boolean
  onShare: () => void
  onResetPreferences: () => void
  preferenceStatus?: string
  manualShareUrl?: string
  appShellStatus?: string
  appUpdateAvailable: boolean
  appUpdateActivating: boolean
  onRefreshApp: () => void
  locationNavigationDisabled: boolean
  activeLocationLabel: string
  coordinatePrecision: number
  maximumLocationQueryLength: number
  placeSearchState: PlaceSearchState
  onPlaceSearch: (query: string) => void
  onLocationNavigate: (center: AppCenter) => void
  onPlaceResultSelect: (result: PlaceSearchResult) => void
  onPlaceSearchCancel: () => void
  mapToolsSummaryRef?: Ref<HTMLElement>
  settingsSummaryRef?: Ref<HTMLElement>
}

type PromotedActionKind =
  | 'app-update'
  | 'history'
  | 'weather'
  | 'airports'
  | 'ports'

interface PromotedAction {
  kind: PromotedActionKind
  label: string
  message: string
  buttonLabel: string
  disabled?: boolean
  run: () => void
}

const MAP_TOOL_TASKS = [
  ['layers', 'LAYERS'],
  ['find', 'FIND'],
  ['context', 'CONTEXT'],
  ['orbits', 'ORBITS'],
  ['sources', 'SOURCES'],
] as const

type MapToolTask = (typeof MAP_TOOL_TASKS)[number][0]

const operationIcons = {
  center: 'M12 3v3m0 12v3M3 12h3m12 0h3M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
  aircraft: 'm12 3 2 7 6 4v2l-6-2v4l2 2v1l-4-1-4 1v-1l2-2v-4l-6 2v-2l6-4 2-7Z',
  ships: 'M5 12V7h14v5M9 7V4h6v3M3 13l9-3 9 3-3 5H6l-3-5Zm0 8 3-1 3 1 3-1 3 1 3-1 3 1',
  orbits: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5m0-7 4 4m-2-6 4 4m-4 0-2 2',
  explore: 'm12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
} as const

function OperationIcon({ name }: { name: keyof typeof operationIcons }) {
  return (
    <svg className="operation-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={operationIcons[name]} />
    </svg>
  )
}

const handleDisclosureFocus = (
  event: FocusEvent<HTMLDetailsElement>,
  focusedWithinRef: MutableRefObject<boolean>,
) => {
  const summary = event.currentTarget.firstElementChild
  focusedWithinRef.current = event.target !== summary
}

const handleDisclosureBlur = (
  event: FocusEvent<HTMLDetailsElement>,
  focusedWithinRef: MutableRefObject<boolean>,
) => {
  const next = event.relatedTarget
  if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
    focusedWithinRef.current = false
  }
}

const handleDisclosureToggle = (
  event: SyntheticEvent<HTMLDetailsElement>,
  focusedWithinRef: MutableRefObject<boolean>,
) => {
  const details = event.currentTarget
  if (details.open) return

  const summary = details.firstElementChild
  if (
    summary instanceof HTMLElement &&
    (focusedWithinRef.current ||
      (document.activeElement instanceof Node &&
        details.contains(document.activeElement) &&
        document.activeElement !== summary))
  ) {
    globalThis.requestAnimationFrame(() => summary.focus())
  }
  focusedWithinRef.current = false
}

export function TrafficControls({
  marineProviderName = 'Digitraffic',
  masthead,
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
  units,
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
  weatherVisible,
  weatherLoading,
  weatherWaiting,
  weatherReady,
  now,
  weatherError,
  weatherStatusMessage,
  weatherObservations,
  selectedWeatherId,
  weatherEmptyMessage,
  weatherCanRefresh,
  weatherRetryUsesAirports,
  onWeatherVisibleChange,
  onWeatherSelect,
  onRetryWeather,
  onRefreshWeather,
  orbitalVisible,
  orbitalState,
  selectedOrbitalId,
  orbitalFilters,
  orbitalDisplay,
  orbitalCounts,
  orbitalPrimarySummary,
  orbitalPredictionHorizonMs,
  orbitalMaximumQueryLength,
  orbitalPageSize,
  onOrbitalVisibleChange,
  onOrbitalFiltersChange,
  onOrbitalSelect,
  onRetryOrbital,
  starlinkVisible,
  starlinkState,
  starlinkCounts,
  onStarlinkVisibleChange,
  onRetryStarlink,
  clusteringEnabled,
  onClusteringEnabledChange,
  trailPreferences,
  onTrailPreferencesChange,
  historySettings,
  historyStatus,
  historyRange,
  historyRecordCount,
  playback,
  onHistoryEnabledChange,
  onHistoryRetentionChange,
  onClearHistory,
  onRetryHistory,
  onEnterHistory,
  centerDisabled,
  onCenter,
  locationAvailable,
  locationLoading,
  locationMessage,
  onUseLocation,
  themePreference,
  onThemePreferenceChange,
  projectionPreference,
  onProjectionPreferenceChange,
  onUnitsChange,
  shareDisabled,
  onShare,
  onResetPreferences,
  preferenceStatus,
  manualShareUrl,
  appShellStatus,
  appUpdateAvailable,
  appUpdateActivating,
  onRefreshApp,
  locationNavigationDisabled,
  activeLocationLabel,
  coordinatePrecision,
  maximumLocationQueryLength,
  placeSearchState,
  onPlaceSearch,
  onLocationNavigate,
  onPlaceResultSelect,
  onPlaceSearchCancel,
  mapToolsSummaryRef,
  settingsSummaryRef,
}: TrafficControlsProps) {
  const mapToolsDetailsRef = useRef<HTMLDetailsElement>(null)
  const mapToolsBodyRef = useRef<HTMLDivElement>(null)
  const settingsDetailsRef = useRef<HTMLDetailsElement>(null)
  const orbitalToggleRef = useRef<HTMLButtonElement>(null)
  const [mapToolTask, setMapToolTask] =
    useState<MapToolTask>('layers')
  const focusedWithinMapToolsRef = useRef(false)
  const focusedWithinSettingsRef = useRef(false)
  const historyNeedsRecovery = [
    'blocked',
    'stale-tab',
    'error',
    'deletion-failed',
  ].includes(historyStatus.phase)
  const settingsPromotedAction: PromotedAction | undefined =
    appUpdateAvailable || appUpdateActivating
      ? {
          kind: 'app-update',
          label: 'App update',
          message:
            appShellStatus ??
            (appUpdateActivating
              ? 'Applying the application update.'
              : 'An application update is ready.'),
          buttonLabel: appUpdateActivating
            ? 'REFRESHING...'
            : 'REFRESH APP',
          disabled: appUpdateActivating,
          run: onRefreshApp,
        }
      : historyNeedsRecovery
        ? {
            kind: 'history',
            label: 'History unavailable',
            message:
              historyStatus.message ??
              'Private local history needs attention.',
            buttonLabel: 'RETRY HISTORY',
            run: onRetryHistory,
          }
        : undefined
  const operationalPromotedAction: PromotedAction | undefined =
    weatherVisible && weatherError
      ? {
          kind: 'weather',
          label: 'METAR unavailable',
          message: weatherError,
          buttonLabel: weatherRetryUsesAirports
            ? 'RETRY AIRPORTS'
            : 'RETRY METAR',
          run: onRetryWeather,
        }
      : airportsVisible && airportsError
        ? {
            kind: 'airports',
            label: 'Airports unavailable',
            message: airportsError,
            buttonLabel: 'RETRY AIRPORTS',
            run: onRetryAirports,
          }
        : portsVisible && portsError
          ? {
              kind: 'ports',
              label: 'Ports unavailable',
              message: portsError,
              buttonLabel: 'RETRY PORTS',
              run: onRetryPorts,
            }
          : undefined
  const [locationSearch, locationSearchInputRef] = useLocationSearchModel({
    coordinatePrecision,
    maximumQueryLength: maximumLocationQueryLength,
    searchState: placeSearchState,
    onSearch: onPlaceSearch,
    onNavigate: onLocationNavigate,
    onSelectResult: onPlaceResultSelect,
    onCancel: onPlaceSearchCancel,
    onRevealDetails: () => {
      if (settingsDetailsRef.current) {
        settingsDetailsRef.current.open = true
      }
    },
  })
  const orbitalLoading =
    orbitalState.phase === 'loading' ||
    orbitalState.phase === 'refreshing'
  const orbitalRetryAvailable =
    orbitalState.phase === 'unavailable' ||
    orbitalState.phase === 'clock-invalid'
  const orbitalStatusMessage = (() => {
    switch (orbitalState.phase) {
      case 'disabled':
        return undefined
      case 'loading':
        return 'Loading orbital catalog.'
      case 'refreshing':
        return orbitalState.positions.length > 0
          ? 'Refreshing catalog; positions retained.'
          : 'Refreshing catalog; positions temporarily unavailable.'
      case 'stale':
        return (
          orbitalState.message ??
          'Orbital catalog stale; positions remain labeled.'
        )
      case 'unavailable':
      case 'clock-invalid':
      case 'offline':
      case 'paused-hidden':
      case 'paused-history':
        return orbitalState.message
      case 'empty':
        return (
          orbitalState.message ??
          'Catalog loaded; positions unavailable.'
        )
      case 'ready':
        return orbitalState.message
    }
  })()
  const revealOrbitalObjects = () => {
    const details = mapToolsDetailsRef.current
    if (!details) return
    setMapToolTask('orbits')
    details.open = true
    globalThis.requestAnimationFrame(() => {
      mapToolsBodyRef.current?.scrollTo({ top: 0 })
      const target =
        details.querySelector<HTMLElement>(
          '.orbital-results button',
        ) ?? orbitalToggleRef.current
      target?.focus()
    })
  }
  const selectMapToolTask = (task: MapToolTask) => {
    setMapToolTask(task)
    globalThis.requestAnimationFrame(() => {
      mapToolsBodyRef.current?.scrollTo({ top: 0 })
    })
  }

  return (
    <>
    <header className="brand-panel">
      {masthead}
    </header>
    <div className="control-stack" aria-label="Map controls">
      <div className="workspace-dock">
      <button
        id="center-map-button"
        className="workspace-center"
        type="button"
        disabled={centerDisabled}
        onClick={onCenter}
        title="Center on session Home"
      >
        <OperationIcon name="center" />
        CENTER
      </button>
      <aside
        className={`control-panel control-panel--operations${
          operationalPromotedAction ? ' control-panel--urgent' : ''
        }`}
        aria-label="Operations"
      >
      <div
        className="control-options control-panel__primary"
        role="group"
        aria-label="Map operations"
      >
        <button
          type="button"
          className={aircraftVisible ? 'is-active' : undefined}
          aria-pressed={aircraftVisible}
          onClick={() => onAircraftVisibleChange(!aircraftVisible)}
        >
          <OperationIcon name="aircraft" />
          AIRCRAFT
        </button>
        <button
          type="button"
          className={vesselsVisible ? 'is-active' : undefined}
          aria-pressed={vesselsVisible}
          onClick={() => onVesselsVisibleChange(!vesselsVisible)}
        >
          <OperationIcon name="ships" />
          SHIPS
        </button>
        <button
          ref={orbitalToggleRef}
          id="orbital-layer-toggle"
          type="button"
          className={orbitalVisible ? 'is-active' : undefined}
          aria-pressed={orbitalVisible}
          aria-busy={orbitalVisible && orbitalLoading}
          onClick={() => onOrbitalVisibleChange(!orbitalVisible)}
        >
          <OperationIcon name="orbits" />
          {orbitalVisible && orbitalLoading ? 'ORBITS...' : 'ORBITS'}
        </button>
      </div>

      {orbitalPrimarySummary && (
        <div className="control-panel__urgent control-panel__orbital-summary">
          <span title={orbitalPrimarySummary}>
            {orbitalPrimarySummary}
          </span>
          <button
            type="button"
            aria-label="View modeled orbital objects"
            aria-controls="traffic-controls-map-tools"
            onClick={revealOrbitalObjects}
          >
            VIEW
          </button>
        </div>
      )}

      <div
        className="control-panel__urgent"
        hidden={!operationalPromotedAction}
        role={operationalPromotedAction ? 'status' : undefined}
        aria-live={operationalPromotedAction ? 'polite' : undefined}
        aria-atomic={operationalPromotedAction ? 'true' : undefined}
      >
        {operationalPromotedAction && (
          <>
            <span>
              {operationalPromotedAction.label}:{' '}
              {operationalPromotedAction.message}
            </span>
            <button
              type="button"
              disabled={operationalPromotedAction.disabled}
              onClick={operationalPromotedAction.run}
            >
              {operationalPromotedAction.buttonLabel}
            </button>
          </>
        )}
      </div>

      <details
        ref={mapToolsDetailsRef}
        id="traffic-controls-map-tools"
        name="traffic-control-panels"
        className="control-panel__more"
        onFocusCapture={(event) =>
          handleDisclosureFocus(event, focusedWithinMapToolsRef)
        }
        onBlurCapture={(event) =>
          handleDisclosureBlur(event, focusedWithinMapToolsRef)
        }
        onToggle={(event) =>
          handleDisclosureToggle(event, focusedWithinMapToolsRef)
        }
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !event.currentTarget.open) return
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.open = false
        }}
      >
        <summary
          id="traffic-controls-map-tools-summary"
          ref={mapToolsSummaryRef}
          title="Explore map: layers, discovery, context and sources"
        >
          <OperationIcon name="explore" />
          <span>More</span>
        </summary>
        <div
          ref={mapToolsBodyRef}
          className="control-panel__more-body"
          role="region"
          aria-label="Map tools"
          tabIndex={0}
        >
          <p className="workspace-panel-title">Explore map</p>
          <div
            className="control-panel__tasks"
            role="group"
            aria-label="Map tools view"
          >
            {MAP_TOOL_TASKS.map(([task, label]) => (
              <button
                key={task}
                id={`map-tools-task-${task}`}
                type="button"
                className={mapToolTask === task ? 'is-active' : undefined}
                aria-pressed={mapToolTask === task}
                aria-controls={`map-tools-panel-${task}`}
                onClick={() => selectMapToolTask(task)}
              >
                {label}
              </button>
            ))}
          </div>

          <section
            id="map-tools-panel-layers"
            className="control-panel__task"
            aria-labelledby="map-tools-task-layers"
            hidden={mapToolTask !== 'layers'}
          >
            <fieldset className="control-group">
              <legend>Layers</legend>
              <div className="control-options control-options--two">
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
                <button
                  type="button"
                  className={clusteringEnabled ? 'is-active' : undefined}
                  aria-pressed={clusteringEnabled}
                  onClick={() =>
                    onClusteringEnabledChange(!clusteringEnabled)
                  }
                >
                  CLUSTERS
                </button>
                <button
                  id="weather-layer-toggle"
                  type="button"
                  className={weatherVisible ? 'is-active' : undefined}
                  aria-pressed={weatherVisible}
                  aria-busy={
                    weatherVisible && (weatherLoading || weatherWaiting)
                  }
                  onClick={() => onWeatherVisibleChange(!weatherVisible)}
                >
                  {weatherVisible && weatherLoading ? 'METAR...' : 'METAR'}
                </button>
              </div>
              {portsVisible &&
                portsError &&
                operationalPromotedAction?.kind !== 'ports' && (
                <div className="control-note ports-status" role="status">
                  <span>Ports unavailable: {portsError}</span>
                  <button type="button" onClick={onRetryPorts}>
                    RETRY PORTS
                  </button>
                </div>
              )}
              {airportsVisible &&
                airportsError &&
                operationalPromotedAction?.kind !== 'airports' &&
                !(
                  operationalPromotedAction?.kind === 'weather' &&
                  weatherRetryUsesAirports
                ) && (
                <div className="control-note ports-status" role="status">
                  <span>Airports unavailable: {airportsError}</span>
                  <button type="button" onClick={onRetryAirports}>
                    RETRY AIRPORTS
                  </button>
                </div>
              )}
              {weatherVisible &&
                weatherError &&
                operationalPromotedAction?.kind !== 'weather' && (
                <div className="control-note ports-status" role="status">
                  <span>METAR unavailable: {weatherError}</span>
                  <button type="button" onClick={onRetryWeather}>
                    RETRY METAR
                  </button>
                </div>
              )}
              {weatherVisible && !weatherError && weatherStatusMessage && (
                <div className="control-note ports-status" role="status">
                  <span>{weatherStatusMessage}</span>
                  {weatherReady && (
                    <button
                      type="button"
                      disabled={!weatherCanRefresh}
                      onClick={onRefreshWeather}
                    >
                      REFRESH METAR
                    </button>
                  )}
                </div>
              )}
            </fieldset>
          </section>

          <section
            id="map-tools-panel-find"
            className="control-panel__task"
            aria-labelledby="map-tools-task-find"
            hidden={mapToolTask !== 'find'}
          >
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
              units={units}
              onFiltersChange={onVesselFiltersChange}
              onSelect={onVesselSelect}
            />
          </section>

          <section
            id="map-tools-panel-context"
            className="control-panel__task"
            aria-labelledby="map-tools-task-context"
            hidden={mapToolTask !== 'context'}
          >
            {airportsVisible && airportsReady && (
              <AirportContext
                airports={airportsInView}
                selectedAirportId={selectedAirportId}
                emptyMessage={airportsEmptyMessage}
                onSelect={onAirportSelect}
              />
            )}

            {weatherVisible && weatherReady && (
              <WeatherContext
                observations={weatherObservations}
                selectedObservationId={selectedWeatherId}
                emptyMessage={weatherEmptyMessage}
                now={now}
                onSelect={onWeatherSelect}
              />
            )}

            {!(
              (airportsVisible && airportsReady) ||
              (weatherVisible && weatherReady)
            ) && (
              <p className="control-note">
                Enable AIRPORTS or METAR in Layers.
              </p>
            )}
          </section>

          <section
            id="map-tools-panel-orbits"
            className="control-panel__task"
            aria-labelledby="map-tools-task-orbits"
            hidden={mapToolTask !== 'orbits'}
          >
            {orbitalVisible && orbitalStatusMessage && (
              <div className="control-note ports-status" role="status">
                <span>{orbitalStatusMessage}</span>
                {orbitalRetryAvailable && (
                  <button type="button" onClick={onRetryOrbital}>
                    RETRY ORBITS
                  </button>
                )}
              </div>
            )}

            {!orbitalVisible && (
              <p className="control-note">Enable ORBITS above.</p>
            )}

            <StarlinkContext
              parentVisible={orbitalVisible}
              enabled={starlinkVisible}
              live={playback.mode === 'live'}
              state={starlinkState}
              selectedId={selectedOrbitalId}
              counts={starlinkCounts}
              horizonMs={orbitalPredictionHorizonMs}
              pageSize={orbitalPageSize}
              onEnabledChange={onStarlinkVisibleChange}
              onSelect={onOrbitalSelect}
              onRetry={onRetryStarlink}
            />

            {orbitalVisible &&
              playback.mode === 'live' &&
              orbitalState.snapshot &&
              ![
                'loading',
                'unavailable',
                'clock-invalid',
                'paused-hidden',
                'paused-history',
              ].includes(orbitalState.phase) && (
                <OrbitalContext
                  state={orbitalState}
                  selectedId={selectedOrbitalId}
                  filters={orbitalFilters}
                  display={orbitalDisplay}
                  counts={orbitalCounts}
                  horizonMs={orbitalPredictionHorizonMs}
                  now={now}
                  maximumQueryLength={orbitalMaximumQueryLength}
                  pageSize={orbitalPageSize}
                  onFiltersChange={onOrbitalFiltersChange}
                  onSelect={onOrbitalSelect}
                />
              )}
          </section>

          <section
            id="map-tools-panel-sources"
            className="control-panel__task"
            aria-labelledby="map-tools-task-sources"
            hidden={mapToolTask !== 'sources'}
          >
            <fieldset className="control-group">
              <legend>Sources</legend>
              <ul className="control-source-list">
                <li>
                  Aircraft: <a href="https://www.adsb.lol/">ADSB.lol</a>.
                </li>
                <li>
                  Marine: {marineProviderName}. Original contributing
                  sources are credited in ship details and Provider details.
                </li>
                <li>
                  Photos: <a href="https://www.planespotters.net/photo/api">Planespotters</a>
                  {' · '}<a href="https://openwaters.io/ais/">Open Waters</a>
                  {' / '}<a href="https://commons.wikimedia.org/">Wikimedia Commons</a>
                  {' · '}individual image credits and licenses.
                </li>
                <li>
                  Ports:{' '}
                  <a href="https://www.naturalearthdata.com/downloads/10m-cultural-vectors/ports/">
                    Natural Earth
                  </a>{' '}
                  · public domain · generalized.
                </li>
                <li>
                  Airports:{' '}
                  <a href="https://ourairports.com/data/">OurAirports</a>{' '}
                  · public domain · not operational.
                </li>
                <li>
                  METAR:{' '}
                  <a href="https://aviationweather.gov/data/api/">
                    NOAA/NWS AWC
                  </a>{' '}
                  · public-domain observations · not forecasts or boards.
                </li>
                <li>
                  Orbits: <a href="https://celestrak.org/">CelesTrak</a>{' '}
                  · SGP4 modeled, not live/optical. Symbols show payload,
                  stage, debris, or unknown class.
                </li>
              </ul>
              <p className="control-note control-note--muted">
                METAR sends visible ICAO IDs via this app; source/retrieval
                times are in details.
                {' '}<a href="https://github.com/vasilyevstan/LiveTrafficStan/blob/main/docs/data-sources-and-licensing.md">Full data credits</a>.
              </p>
            </fieldset>
          </section>
        </div>
      </details>
      </aside>

      <aside
        className={`control-panel control-panel--settings${
          settingsPromotedAction ? ' control-panel--urgent' : ''
        }`}
        aria-label="Location and settings"
      >
        <div
          className="control-panel__urgent"
          hidden={!settingsPromotedAction}
          role={settingsPromotedAction ? 'status' : undefined}
          aria-live={settingsPromotedAction ? 'polite' : undefined}
          aria-atomic={settingsPromotedAction ? 'true' : undefined}
        >
          {settingsPromotedAction && (
              <>
                <span>
                  {settingsPromotedAction.label}:{' '}
                  {settingsPromotedAction.message}
              </span>
              <button
                type="button"
                disabled={settingsPromotedAction.disabled}
                onClick={settingsPromotedAction.run}
              >
                {settingsPromotedAction.buttonLabel}
              </button>
            </>
          )}
        </div>

        <details
          ref={settingsDetailsRef}
          id="traffic-controls-settings"
          name="traffic-control-panels"
          className="control-panel__more"
          onFocusCapture={(event) =>
            handleDisclosureFocus(event, focusedWithinSettingsRef)
          }
          onBlurCapture={(event) =>
            handleDisclosureBlur(event, focusedWithinSettingsRef)
          }
          onToggle={(event) =>
            handleDisclosureToggle(event, focusedWithinSettingsRef)
          }
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || !event.currentTarget.open) return
            event.preventDefault()
            event.stopPropagation()
            event.currentTarget.open = false
          }}
        >
          <summary
            id="traffic-controls-settings-summary"
            ref={settingsSummaryRef}
            title="View and settings: appearance, location and history"
          >
            <OperationIcon name="settings" />
            <span>Settings</span>
          </summary>
          <div
            className="control-panel__more-body"
            role="region"
            aria-label="Location and settings"
            tabIndex={0}
          >
            <p className="workspace-panel-title">View &amp; settings</p>
            <div className="workspace-navigation" role="group" aria-label="Map navigation">
              <LocationSearchInput
                model={locationSearch}
                inputRef={locationSearchInputRef}
                maximumQueryLength={maximumLocationQueryLength}
                searchState={placeSearchState}
                disabled={locationNavigationDisabled}
              />
            </div>
            <LocationSearchDetails
              model={locationSearch}
              activeLabel={activeLocationLabel}
              searchState={placeSearchState}
            />

            <fieldset className="control-group">
              <legend>Appearance</legend>
              <div
                className="control-options control-options--four"
                role="group"
                aria-label="Theme and trails"
              >
                {(['auto', 'light', 'dark'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={
                      themePreference === option ? 'is-active' : undefined
                    }
                    aria-pressed={themePreference === option}
                    onClick={() => onThemePreferenceChange(option)}
                  >
                    {option.toUpperCase()}
                  </button>
                ))}
                <button
                  type="button"
                  className={trailPreferences.visible ? 'is-active' : undefined}
                  aria-pressed={trailPreferences.visible}
                  onClick={() =>
                    onTrailPreferencesChange({
                      ...trailPreferences,
                      visible: !trailPreferences.visible,
                    })
                  }
                >
                  TRAILS
                </button>
              </div>
              <div
                className="control-options control-options--two control-options--projection"
                role="group"
                aria-label="Map projection"
              >
                {(['auto', 'flat'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={
                      projectionPreference === option ? 'is-active' : undefined
                    }
                    aria-pressed={projectionPreference === option}
                    onClick={() => onProjectionPreferenceChange(option)}
                  >
                    {option === 'auto' ? 'AUTO GLOBE' : 'FLAT'}
                  </button>
                ))}
              </div>
              <p className="control-note">
                Auto globe changes smoothly with map zoom.
              </p>
            </fieldset>

            <fieldset className="control-group">
              <legend>View</legend>
              <div className="control-options control-options--one">
                <button
                  type="button"
                  disabled={!locationAvailable || locationLoading}
                  aria-busy={locationLoading}
                  aria-describedby={
                    locationMessage ? 'location-status' : undefined
                  }
                  onClick={onUseLocation}
                >
                  {locationLoading ? 'LOCATING...' : 'USE LOCATION'}
                </button>
              </div>
              {locationMessage && (
                <p
                  id="location-status"
                  className="control-note"
                  role="status"
                >
                  {locationMessage}
                </p>
              )}
            </fieldset>

            <HistoryControls
              trailPreferences={trailPreferences}
              onTrailPreferencesChange={onTrailPreferencesChange}
              historySettings={historySettings}
              historyStatus={historyStatus}
              historyRange={historyRange}
              historyRecordCount={historyRecordCount}
              playback={playback}
              onHistoryEnabledChange={onHistoryEnabledChange}
              onHistoryRetentionChange={onHistoryRetentionChange}
              onClearHistory={onClearHistory}
              onRetryHistory={onRetryHistory}
              onEnterHistory={onEnterHistory}
              retryPromoted={settingsPromotedAction?.kind === 'history'}
              trailVisibilityPromoted
            />

            <fieldset className="control-group">
              <legend>Preferences</legend>
              <div className="control-options control-options--two">
                <button
                  type="button"
                  className={units === 'metric' ? 'is-active' : undefined}
                  aria-pressed={units === 'metric'}
                  onClick={() => onUnitsChange('metric')}
                >
                  METRIC
                </button>
                <button
                  type="button"
                  className={
                    units === 'aviation-nautical'
                      ? 'is-active'
                      : undefined
                  }
                  aria-pressed={units === 'aviation-nautical'}
                  onClick={() => onUnitsChange('aviation-nautical')}
                >
                  AVIATION / NAUTICAL
                </button>
                <button
                  type="button"
                  disabled={shareDisabled}
                  onClick={onShare}
                >
                  SHARE VIEW
                </button>
                <button type="button" onClick={onResetPreferences}>
                  RESET PREFERENCES
                </button>
                {appUpdateAvailable &&
                  settingsPromotedAction?.kind !== 'app-update' && (
                    <button
                      type="button"
                      disabled={appUpdateActivating}
                      onClick={onRefreshApp}
                    >
                      {appUpdateActivating
                        ? 'REFRESHING APP...'
                        : 'REFRESH APP'}
                    </button>
                  )}
              </div>
              {preferenceStatus && (
                <p className="control-note" role="status">
                  {preferenceStatus}
                </p>
              )}
              {manualShareUrl && (
                <label className="preference-share-link">
                  <span>Copy this share link</span>
                  <input
                    type="text"
                    readOnly
                    value={manualShareUrl}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
              )}
              {appShellStatus &&
                settingsPromotedAction?.kind !== 'app-update' && (
                <p className="control-note" role="status">
                  {appShellStatus}
                </p>
              )}
            </fieldset>
          </div>
        </details>
      </aside>
      </div>
    </div>
    </>
  )
}
