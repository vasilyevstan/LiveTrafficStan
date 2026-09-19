import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { useAircraftTraffic } from './app/useAircraftTraffic'
import { useAircraftMetadata } from './app/useAircraftMetadata'
import { useAirports } from './app/useAirports'
import { LocationCameraIntent } from './app/locationCameraIntent'
import { useMarineTraffic } from './app/useMarineTraffic'
import { useNow } from './app/useNow'
import { usePlaceSearch } from './app/usePlaceSearch'
import { usePorts } from './app/usePorts'
import { useSessionLocation } from './app/useSessionLocation'
import { useTheme } from './app/useTheme'
import { useTrailHistory } from './app/useTrailHistory'
import { useWeatherObservations } from './app/useWeatherObservations'
import { AirportDetails } from './components/AirportDetails'
import { LiveStatus } from './components/LiveStatus'
import { PortDetails } from './components/PortDetails'
import { TrafficControls } from './components/TrafficControls'
import { TrafficDetails } from './components/TrafficDetails'
import { WeatherObservationDetails } from './components/WeatherObservationDetails'
import { APP_CONFIG } from './config/appConfig'
import type { AppCenter } from './config/appConfig'
import { orderAircraftSearchResults } from './domain/aircraftSearch'
import { airportsInViewport } from './domain/airports'
import {
  DEFAULT_LAYER_PREFERENCES,
  updateLayerPreference,
  type LayerPreferences,
} from './domain/layerPreferences'
import type { DisplayTrafficEntity, TrafficEntity } from './domain/traffic'
import {
  DEFAULT_VESSEL_FILTERS,
  filterVessels,
  orderVesselSearchResults,
} from './domain/vesselFilters'
import type { ViewportAssessment } from './domain/viewport'
import { formatTimestamp } from './domain/format'
import {
  displayWeatherObservations,
  selectWeatherStationIds,
} from './domain/weatherObservations'
import {
  mapErrorPresentation,
  type TrafficMapError,
} from './map/mapInitialization'
import { TrafficMap } from './map/TrafficMap'
import type { PlaceSearchResult } from './providers/geocoding/photonProvider'
import { StaticAircraftMetadataProvider } from './providers/aircraftMetadata/staticAircraftMetadataProvider'
import { StaticAirportsProvider } from './providers/airports/staticAirportsProvider'
import { StaticPortsProvider } from './providers/ports/staticPortsProvider'
import { AwcMetarProvider } from './providers/weather/awcMetarProvider'
import { filterTrafficByViewport } from './traffic/filter'
import { displayTraffic } from './traffic/freshness'

interface ViewRequest {
  id: number
  center: AppCenter
}

function App() {
  const [aircraftQuery, setAircraftQuery] = useState('')
  const [vesselFilters, setVesselFilters] = useState(
    DEFAULT_VESSEL_FILTERS,
  )
  const [layerPreferences, setLayerPreferences] = useState(
    DEFAULT_LAYER_PREFERENCES,
  )
  const {
    aircraftVisible,
    vesselsVisible,
    portsVisible,
    airportsVisible,
    clusteringEnabled,
    weatherVisible,
  } = layerPreferences
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null)
  const [selectedAirportId, setSelectedAirportId] = useState<string | null>(
    null,
  )
  const [selectedWeatherId, setSelectedWeatherId] = useState<string | null>(
    null,
  )
  const [mapError, setMapError] = useState<TrafficMapError | null>(null)
  const [viewportReport, setViewportReport] = useState<{
    assessment: ViewportAssessment
    viewRequestId: number
  } | null>(null)
  const [viewRequest, setViewRequest] = useState<ViewRequest>({
    id: 0,
    center: APP_CONFIG.center,
  })
  const [viewReady, setViewReady] = useState(false)
  const [activeLocationLabel, setActiveLocationLabel] = useState(
    `Home: ${APP_CONFIG.center.label}`,
  )
  const [historyResetRevision, setHistoryResetRevision] = useState(0)
  const appliedLocationRevisionRef = useRef(0)
  const airportSelectionGraceUntilRef = useRef(0)
  const locationCameraIntentRef = useRef(new LocationCameraIntent())
  const {
    theme,
    themePreference,
    setThemePreference,
  } = useTheme()
  const location = useSessionLocation(
    APP_CONFIG.center,
    APP_CONFIG.navigation,
  )
  const requestLocation = location.requestLocation
  const {
    state: placeSearchState,
    search: searchPlaces,
    cancel: cancelPlaceSearch,
  } = usePlaceSearch(
    APP_CONFIG.geocoder,
    APP_CONFIG.navigation.coordinatePrecision,
  )
  const now = useNow()
  const setLayerPreference = useCallback(
    (key: keyof LayerPreferences, value: boolean) => {
      setLayerPreferences((current) =>
        updateLayerPreference(current, key, value),
      )
    },
    [],
  )
  const setAircraftVisible = useCallback(
    (visible: boolean) =>
      setLayerPreference('aircraftVisible', visible),
    [setLayerPreference],
  )
  const setVesselsVisible = useCallback(
    (visible: boolean) =>
      setLayerPreference('vesselsVisible', visible),
    [setLayerPreference],
  )
  const setPortsVisible = useCallback(
    (visible: boolean) => setLayerPreference('portsVisible', visible),
    [setLayerPreference],
  )
  const setAirportsVisible = useCallback(
    (visible: boolean) =>
      setLayerPreference('airportsVisible', visible),
    [setLayerPreference],
  )
  const setClusteringEnabled = useCallback(
    (enabled: boolean) =>
      setLayerPreference('clusteringEnabled', enabled),
    [setLayerPreference],
  )
  const setWeatherVisible = useCallback(
    (visible: boolean) => setLayerPreference('weatherVisible', visible),
    [setLayerPreference],
  )
  const aircraftMetadataProvider = useMemo(
    () => new StaticAircraftMetadataProvider(APP_CONFIG.aircraftMetadata),
    [],
  )
  const portsProvider = useMemo(
    () => new StaticPortsProvider(APP_CONFIG.ports),
    [],
  )
  const portsResult = usePorts(portsVisible, portsProvider)
  const airportsProvider = useMemo(
    () => new StaticAirportsProvider(APP_CONFIG.airports),
    [],
  )
  const airportsResult = useAirports(
    airportsVisible || weatherVisible,
    airportsProvider,
  )
  const weatherProvider = useMemo(
    () => new AwcMetarProvider(APP_CONFIG.weather),
    [],
  )

  const commitNavigation = useCallback(
    (
      center: AppCenter,
      label: string,
      options: { explicit?: boolean } = {},
    ) => {
      cancelPlaceSearch()
      if (options.explicit !== false) {
        locationCameraIntentRef.current.beginExplicitViewIntent()
      }
      setSelectedId(null)
      setSelectedPortId(null)
      setSelectedAirportId(null)
      setSelectedWeatherId(null)
      setHistoryResetRevision((current) => current + 1)
      setViewportReport(null)
      setViewReady(true)
      setActiveLocationLabel(label)
      setViewRequest((current) => ({
        id: current.id + 1,
        center: { ...center, label },
      }))
    },
    [cancelPlaceSearch],
  )

  useEffect(() => {
    if (
      !location.initialReady ||
      location.revision <= appliedLocationRevisionRef.current
    ) {
      return
    }

    appliedLocationRevisionRef.current = location.revision
    setViewReady(true)
    const shouldNavigate =
      locationCameraIntentRef.current.consumeLocationResult()
    if (shouldNavigate) {
      commitNavigation(
        location.homeCenter,
        `Home: ${location.homeCenter.label}`,
        { explicit: false },
      )
    }
  }, [
    commitNavigation,
    location.initialReady,
    location.homeCenter,
    location.revision,
  ])

  useEffect(() => {
    if (
      !location.locating &&
      location.phase === 'error'
    ) {
      locationCameraIntentRef.current.cancelRequestedLocationNavigation()
    }
  }, [location.locating, location.phase])

  const currentAssessment =
    viewportReport?.viewRequestId === viewRequest.id
      ? viewportReport.assessment
      : null
  const activeViewport =
    viewReady && currentAssessment?.kind === 'eligible'
      ? currentAssessment.viewport
      : null
  const contextViewport =
    viewReady && currentAssessment
      ? currentAssessment.kind === 'eligible'
        ? currentAssessment.viewport
        : currentAssessment.viewport ?? null
      : null
  const trafficQuery = useMemo(
    () =>
      activeViewport
        ? {
            center: activeViewport.center,
            radiusKm: activeViewport.enclosingRadiusKm,
          }
        : null,
    [activeViewport],
  )
  const aircraftResult = useAircraftTraffic(trafficQuery, APP_CONFIG.aircraft)
  const marineResult = useMarineTraffic(trafficQuery, APP_CONFIG.marine)
  const viewportAircraft = useMemo(
    () =>
      activeViewport
        ? filterTrafficByViewport(aircraftResult.entities, activeViewport)
        : [],
    [activeViewport, aircraftResult.entities],
  )
  const viewportVessels = useMemo(
    () =>
      activeViewport
        ? filterTrafficByViewport(marineResult.entities, activeViewport)
        : [],
    [activeViewport, marineResult.entities],
  )

  const aircraft = useMemo(
    () => displayTraffic(viewportAircraft, now, APP_CONFIG.aircraft),
    [viewportAircraft, now],
  )
  const aircraftResults = useMemo(
    () => orderAircraftSearchResults(aircraft, aircraftQuery),
    [aircraft, aircraftQuery],
  )
  const currentVessels = useMemo(
    () => displayTraffic(viewportVessels, now, APP_CONFIG.marine),
    [now, viewportVessels],
  )
  const vessels = useMemo(
    () => filterVessels(currentVessels, vesselFilters),
    [currentVessels, vesselFilters],
  )
  const vesselResults = useMemo(
    () => orderVesselSearchResults(vessels, vesselFilters.query),
    [vesselFilters.query, vessels],
  )
  const ports = useMemo(
    () =>
      portsResult.state.phase === 'ready'
        ? portsResult.state.dataset.ports
        : [],
    [portsResult.state],
  )
  const airports = useMemo(
    () =>
      airportsResult.state.phase === 'ready'
        ? airportsResult.state.dataset.airports
        : [],
    [airportsResult.state],
  )
  const visibleAirports = useMemo(
    () =>
      contextViewport
        ? airportsInViewport(airports, contextViewport)
        : [],
    [airports, contextViewport],
  )
  const weatherStations = useMemo(
    () =>
      activeViewport
        ? airportsInViewport(airports, activeViewport)
        : [],
    [activeViewport, airports],
  )
  const weatherStationSelection = useMemo(
    () =>
      selectWeatherStationIds(
        weatherStations,
        APP_CONFIG.weather.maximumStations,
      ),
    [weatherStations],
  )
  const weatherStationIds =
    weatherStationSelection.kind === 'ready'
      ? weatherStationSelection.stationIds
      : []
  const weatherStationKey = weatherStationIds.join(',')
  const weatherQueryEnabled =
    weatherVisible &&
    Boolean(activeViewport) &&
    airportsResult.state.phase === 'ready' &&
    weatherStationSelection.kind === 'ready'
  const weatherResult = useWeatherObservations(
    weatherQueryEnabled,
    weatherStationIds,
    weatherProvider,
    now,
    APP_CONFIG.weather.requestCooldownMs,
  )
  const weatherDataset =
    weatherQueryEnabled &&
    weatherResult.state.phase === 'ready' &&
    weatherResult.state.stationKey === weatherStationKey
      ? weatherResult.state.dataset
      : undefined
  const weatherObservations = useMemo(
    () =>
      weatherDataset
        ? displayWeatherObservations(
            weatherDataset.observations,
            now,
            APP_CONFIG.weather.staleAfterMs,
            APP_CONFIG.weather.expireAfterMs,
          )
        : [],
    [
      now,
      weatherDataset,
    ],
  )
  const sourceEntities = useMemo<TrafficEntity[]>(
    () => [...viewportAircraft, ...viewportVessels],
    [viewportAircraft, viewportVessels],
  )
  const displayEntities = useMemo<DisplayTrafficEntity[]>(
    () => [...aircraft, ...vessels],
    [aircraft, vessels],
  )
  const selectedEntity = useMemo(
    () => displayEntities.find((entity) => entity.id === selectedId),
    [displayEntities, selectedId],
  )
  const selectedPort = useMemo(
    () => ports.find((port) => port.id === selectedPortId),
    [ports, selectedPortId],
  )
  const selectedAirport = useMemo(
    () => airports.find((airport) => airport.id === selectedAirportId),
    [airports, selectedAirportId],
  )
  const selectedWeather = useMemo(
    () =>
      weatherObservations.find(
        (observation) => observation.id === selectedWeatherId,
      ),
    [selectedWeatherId, weatherObservations],
  )
  const aircraftMetadata = useAircraftMetadata(
    selectedEntity?.kind === 'aircraft' ? selectedEntity : undefined,
    aircraftMetadataProvider,
    now,
  )
  const trail = useTrailHistory(
    sourceEntities,
    selectedId,
    now,
    APP_CONFIG.trail,
    historyResetRevision,
  )

  useEffect(() => {
    if (!selectedId) return
    if (
      !selectedEntity ||
      (selectedEntity.kind === 'aircraft' && !aircraftVisible) ||
      (selectedEntity.kind === 'vessel' && !vesselsVisible)
    ) {
      setSelectedId(null)
    }
  }, [aircraftVisible, selectedEntity, selectedId, vesselsVisible])

  useEffect(() => {
    if (!portsVisible && selectedPortId) setSelectedPortId(null)
  }, [portsVisible, selectedPortId])

  useEffect(() => {
    if (!airportsVisible && selectedAirportId) setSelectedAirportId(null)
  }, [airportsVisible, selectedAirportId])

  useEffect(() => {
    if (!weatherVisible && selectedWeatherId) setSelectedWeatherId(null)
  }, [selectedWeatherId, weatherVisible])

  useEffect(() => {
    if (selectedPortId && !selectedPort) setSelectedPortId(null)
  }, [selectedPort, selectedPortId])

  useEffect(() => {
    if (!selectedAirportId) return
    if (!selectedAirport) {
      setSelectedAirportId(null)
      return
    }
    if (
      contextViewport &&
      visibleAirports.some(({ id }) => id === selectedAirportId)
    ) {
      return
    }

    const delayMs = Math.max(
      0,
      airportSelectionGraceUntilRef.current - Date.now(),
    )
    if (delayMs === 0) {
      setSelectedAirportId(null)
      return
    }
    const timeout = window.setTimeout(() => {
      setSelectedAirportId((current) =>
        current === selectedAirportId ? null : current,
      )
    }, delayMs)
    return () => window.clearTimeout(timeout)
  }, [
    contextViewport,
    selectedAirport,
    selectedAirportId,
    visibleAirports,
  ])

  useEffect(() => {
    if (selectedWeatherId && !selectedWeather) {
      setSelectedWeatherId(null)
    }
  }, [selectedWeather, selectedWeatherId])

  const handleViewportChange = useCallback(
    (assessment: ViewportAssessment, reportViewRequestId: number) => {
      setViewportReport({
        assessment,
        viewRequestId: reportViewRequestId,
      })
    },
    [],
  )

  const handleCenter = useCallback(() => {
    commitNavigation(
      location.homeCenter,
      `Home: ${location.homeCenter.label}`,
    )
  }, [commitNavigation, location.homeCenter])

  const handleUseLocation = useCallback(() => {
    locationCameraIntentRef.current.requestLocationNavigation()
    cancelPlaceSearch()
    requestLocation()
  }, [cancelPlaceSearch, requestLocation])

  const handlePlaceSearch = useCallback(
    (query: string) => {
      locationCameraIntentRef.current.beginExplicitViewIntent()
      setViewReady(true)
      searchPlaces(query)
    },
    [searchPlaces],
  )

  const handleLocationNavigate = useCallback(
    (center: AppCenter) => {
      commitNavigation(center, center.label)
    },
    [commitNavigation],
  )

  const handlePlaceResultSelect = useCallback(
    (result: PlaceSearchResult) => {
      commitNavigation(result.center, result.label)
    },
    [commitNavigation],
  )

  const handleManualViewChange = useCallback(() => {
    locationCameraIntentRef.current.beginExplicitViewIntent()
    cancelPlaceSearch()
    setViewReady(true)
    setActiveLocationLabel('Custom view')
  }, [cancelPlaceSearch])

  const handleTrafficSelect = useCallback((id: string | null) => {
    setSelectedPortId(null)
    setSelectedAirportId(null)
    setSelectedWeatherId(null)
    setSelectedId(id)
  }, [])

  const handlePortSelect = useCallback((id: string | null) => {
    setSelectedId(null)
    setSelectedAirportId(null)
    setSelectedWeatherId(null)
    setSelectedPortId(id)
  }, [])

  const handleAirportSelect = useCallback((id: string | null) => {
    airportSelectionGraceUntilRef.current = id
      ? Date.now() + APP_CONFIG.navigation.viewportSettleMs + 100
      : 0
    setSelectedId(null)
    setSelectedPortId(null)
    setSelectedWeatherId(null)
    setSelectedAirportId(id)
  }, [])

  const handleWeatherSelect = useCallback((id: string | null) => {
    setSelectedId(null)
    setSelectedPortId(null)
    setSelectedAirportId(null)
    setSelectedWeatherId(id)
  }, [])

  const handleCloseAirport = useCallback(() => {
    const airportId = selectedAirportId
    airportSelectionGraceUntilRef.current = 0
    setSelectedAirportId(null)
    if (!airportId) return
    globalThis.requestAnimationFrame(() => {
      const target =
        document.getElementById(`airport-context-result-${airportId}`) ??
        document.getElementById('airports-layer-toggle')
      target?.focus()
    })
  }, [selectedAirportId])

  const handleCloseWeather = useCallback(() => {
    const observationId = selectedWeatherId
    setSelectedWeatherId(null)
    if (!observationId) return
    globalThis.requestAnimationFrame(() => {
      const target =
        document.getElementById(
          `weather-context-result-${observationId}`,
        ) ?? document.getElementById('weather-layer-toggle')
      target?.focus()
    })
  }, [selectedWeatherId])

  const mapErrorContent = mapError ? mapErrorPresentation(mapError) : null
  const mapSubtitle = !viewReady
    ? 'Preparing map view'
    : currentAssessment?.kind === 'eligible'
      ? 'Visible traffic area'
      : currentAssessment
        ? 'Traffic paused'
        : 'Updating map view'
  const vesselEmptyMessage =
    currentAssessment?.kind === 'ineligible'
      ? 'Live traffic is paused for this view.'
      : marineResult.status.phase === 'error'
        ? 'The marine source is unavailable.'
        : marineResult.status.phase === 'idle' ||
            marineResult.status.phase === 'loading'
          ? 'The marine source is connecting.'
          : 'No current ships are shown in this view.'
  const aircraftEmptyMessage =
    currentAssessment?.kind === 'ineligible'
      ? 'Live traffic is paused for this view.'
      : aircraftResult.status.phase === 'error'
        ? 'The aircraft source is unavailable.'
        : aircraftResult.status.phase === 'idle' ||
            aircraftResult.status.phase === 'loading'
          ? 'The aircraft source is connecting.'
          : 'No current aircraft are shown in this view.'
  const airportsEmptyMessage =
    contextViewport
      ? 'No large or medium airports are shown in this view.'
      : 'Airport context is unavailable while the map view is updating.'
  const weatherStateMatches =
    weatherResult.state.phase !== 'idle' &&
    weatherResult.state.stationKey === weatherStationKey
  const weatherReady = weatherDataset !== undefined
  const weatherLoading =
    weatherVisible &&
    (airportsResult.state.phase === 'loading' ||
      (weatherStateMatches && weatherResult.state.phase === 'loading'))
  const weatherWaiting =
    weatherVisible &&
    weatherStateMatches &&
    weatherResult.state.phase === 'waiting'
  const weatherError =
    !weatherVisible
      ? undefined
      : airportsResult.state.phase === 'error'
        ? `Airport station context unavailable: ${airportsResult.state.message}`
        : weatherStateMatches && weatherResult.state.phase === 'error'
          ? weatherResult.state.message
          : undefined
  const weatherStatusMessage =
    !weatherVisible
      ? undefined
      : !activeViewport
        ? 'METAR observations are paused until the map shows an eligible live-traffic view.'
        : airportsResult.state.phase === 'loading'
          ? 'Loading the pinned airport dataset used to choose METAR stations.'
          : weatherStationSelection.kind === 'too-many'
            ? `${weatherStationSelection.count} qualifying ICAO stations are visible. Zoom in to stay within the ${APP_CONFIG.weather.maximumStations}-station request limit.`
            : weatherWaiting &&
                weatherResult.state.phase === 'waiting'
              ? `The next request is available at ${formatTimestamp(
                  weatherResult.state.nextRequestAt,
                )}.`
              : weatherDataset
                ? `Retrieved ${formatTimestamp(weatherDataset.retrievedAt)}. Observations are not forecasts.`
                : undefined
  const weatherEmptyMessage =
    weatherStationIds.length === 0
      ? 'No qualifying four-letter ICAO METAR stations are shown in this view.'
      : 'No current METAR or SPECI observations were returned for this view.'
  const handleRetryWeather =
    airportsResult.state.phase === 'error'
      ? airportsResult.retry
      : weatherResult.retry

  return (
    <main className="app-shell">
      <TrafficMap
        viewCenter={viewRequest.center}
        viewLabel={activeLocationLabel}
        viewRadiusKm={APP_CONFIG.map.homeViewRadiusKm}
        maximumViewportRadiusKm={APP_CONFIG.map.maximumViewportRadiusKm}
        touchHitTolerancePx={APP_CONFIG.map.touchHitTolerancePx}
        clusterRadiusPx={APP_CONFIG.map.clustering.radiusPx}
        clusterMinimumPoints={APP_CONFIG.map.clustering.minimumPoints}
        clusterMaximumZoom={APP_CONFIG.map.clustering.maximumZoom}
        coordinatePrecision={APP_CONFIG.navigation.coordinatePrecision}
        mapStyleUrl={
          theme === 'dark'
            ? APP_CONFIG.map.darkStyleUrl
            : APP_CONFIG.map.lightStyleUrl
        }
        theme={theme}
        aircraft={aircraft}
        vessels={vessels}
        ports={ports}
        airports={airports}
        weatherObservations={weatherObservations}
        trail={activeViewport ? trail : []}
        selectedId={selectedId}
        selectedPortId={selectedPortId}
        selectedAirportId={selectedAirportId}
        selectedWeatherId={selectedWeatherId}
        aircraftVisible={aircraftVisible}
        vesselsVisible={vesselsVisible}
        portsVisible={portsVisible}
        airportsVisible={airportsVisible}
        weatherVisible={weatherVisible}
        clusteringEnabled={clusteringEnabled}
        interpolationDurationMs={APP_CONFIG.interpolationDurationMs}
        viewRequestId={viewRequest.id}
        viewportSettleMs={APP_CONFIG.navigation.viewportSettleMs}
        onSelect={handleTrafficSelect}
        onSelectPort={handlePortSelect}
        onSelectAirport={handleAirportSelect}
        onSelectWeather={handleWeatherSelect}
        onViewportChange={handleViewportChange}
        onManualViewChange={handleManualViewChange}
        onMapError={setMapError}
      />
      <div className="radar-shade" aria-hidden="true" />

      <div className="interface-layer">
        <header className="brand-panel">
          <div className="brand-panel__title">
            <div className="radar-mark" aria-hidden="true">
              <span />
            </div>
            <div>
              <h1>LiveTrafficStan</h1>
              <p>{mapSubtitle}</p>
            </div>
          </div>
          <LiveStatus
            aircraftCount={aircraftVisible ? aircraft.length : 0}
            vesselCount={vesselsVisible ? vessels.length : 0}
            aircraftStatus={aircraftResult.status}
            marineStatus={marineResult.status}
            marineCapabilities={marineResult.capabilities}
            now={now}
          />
        </header>

        <TrafficControls
          aircraftQuery={aircraftQuery}
          aircraftResults={aircraftResults}
          totalAircraft={aircraft.length}
          aircraftEmptyMessage={aircraftEmptyMessage}
          onAircraftQueryChange={setAircraftQuery}
          onAircraftSelect={handleTrafficSelect}
          vesselFilters={vesselFilters}
          vesselResults={vesselResults}
          totalVessels={currentVessels.length}
          vesselEmptyMessage={vesselEmptyMessage}
          onVesselFiltersChange={setVesselFilters}
          onVesselSelect={handleTrafficSelect}
          aircraftVisible={aircraftVisible}
          onAircraftVisibleChange={setAircraftVisible}
          vesselsVisible={vesselsVisible}
          onVesselsVisibleChange={setVesselsVisible}
          portsVisible={portsVisible}
          portsLoading={
            portsVisible && portsResult.state.phase === 'loading'
          }
          portsError={
            portsVisible && portsResult.state.phase === 'error'
              ? portsResult.state.message
              : undefined
          }
          onPortsVisibleChange={setPortsVisible}
          onRetryPorts={portsResult.retry}
          airportsVisible={airportsVisible}
          airportsLoading={
            airportsVisible && airportsResult.state.phase === 'loading'
          }
          airportsReady={airportsResult.state.phase === 'ready'}
          airportsError={
            airportsVisible && airportsResult.state.phase === 'error'
              ? airportsResult.state.message
              : undefined
          }
          airportsInView={visibleAirports}
          selectedAirportId={selectedAirportId}
          airportsEmptyMessage={airportsEmptyMessage}
          onAirportsVisibleChange={setAirportsVisible}
          onAirportSelect={handleAirportSelect}
          onRetryAirports={airportsResult.retry}
          weatherVisible={weatherVisible}
          weatherLoading={weatherLoading}
          weatherWaiting={weatherWaiting}
          weatherReady={weatherReady}
          now={now}
          weatherError={weatherError}
          weatherStatusMessage={weatherStatusMessage}
          weatherObservations={weatherObservations}
          selectedWeatherId={selectedWeatherId}
          weatherEmptyMessage={weatherEmptyMessage}
          weatherCanRefresh={weatherResult.canRefresh}
          onWeatherVisibleChange={setWeatherVisible}
          onWeatherSelect={handleWeatherSelect}
          onRetryWeather={handleRetryWeather}
          onRefreshWeather={weatherResult.refresh}
          clusteringEnabled={clusteringEnabled}
          onClusteringEnabledChange={setClusteringEnabled}
          centerDisabled={
            !location.initialReady || mapError?.kind === 'initialization'
          }
          onCenter={handleCenter}
          locationAvailable={location.canRequest}
          locationLoading={location.locating}
          locationMessage={location.message}
          onUseLocation={handleUseLocation}
          themePreference={themePreference}
          onThemePreferenceChange={setThemePreference}
          locationNavigationDisabled={mapError?.kind === 'initialization'}
          activeLocationLabel={activeLocationLabel}
          coordinatePrecision={APP_CONFIG.navigation.coordinatePrecision}
          maximumLocationQueryLength={
            APP_CONFIG.geocoder.maximumQueryLength
          }
          placeSearchState={placeSearchState}
          onPlaceSearch={handlePlaceSearch}
          onLocationNavigate={handleLocationNavigate}
          onPlaceResultSelect={handlePlaceResultSelect}
          onPlaceSearchCancel={cancelPlaceSearch}
        />

        {currentAssessment?.kind === 'ineligible' && (
          <div className="viewport-notice" role="status">
            <strong>Live traffic paused</strong>
            <span>{currentAssessment.message}</span>
          </div>
        )}

        {selectedEntity && (
          <TrafficDetails
            entity={selectedEntity}
            aircraftMetadata={aircraftMetadata}
            now={now}
            onClose={() => setSelectedId(null)}
          />
        )}

        {selectedPort && portsResult.state.phase === 'ready' && (
          <PortDetails
            port={selectedPort}
            source={portsResult.state.dataset.source}
            onClose={() => setSelectedPortId(null)}
          />
        )}

        {selectedAirport && airportsResult.state.phase === 'ready' && (
          <AirportDetails
            airport={selectedAirport}
            source={airportsResult.state.dataset.source}
            coordinatePrecision={APP_CONFIG.navigation.coordinatePrecision}
            onClose={handleCloseAirport}
          />
        )}

        {selectedWeather &&
          weatherResult.state.phase === 'ready' &&
          weatherResult.state.stationKey === weatherStationKey && (
            <WeatherObservationDetails
              observation={selectedWeather}
              source={weatherResult.state.dataset.source}
              retrievedAt={weatherResult.state.dataset.retrievedAt}
              now={now}
              onClose={handleCloseWeather}
            />
          )}

        {mapErrorContent && (
          <div className="map-error" role="status">
            <strong>{mapErrorContent.title}</strong>
            <span>{mapErrorContent.message}</span>
          </div>
        )}
      </div>
    </main>
  )
}

export default App
