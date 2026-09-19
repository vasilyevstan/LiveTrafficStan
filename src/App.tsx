import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { useAircraftTraffic } from './app/useAircraftTraffic'
import { useAircraftMetadata } from './app/useAircraftMetadata'
import { LocationCameraIntent } from './app/locationCameraIntent'
import { useMarineTraffic } from './app/useMarineTraffic'
import { useNow } from './app/useNow'
import { usePlaceSearch } from './app/usePlaceSearch'
import { usePorts } from './app/usePorts'
import { useSessionLocation } from './app/useSessionLocation'
import { useTheme } from './app/useTheme'
import { useTrailHistory } from './app/useTrailHistory'
import { LiveStatus } from './components/LiveStatus'
import { PortDetails } from './components/PortDetails'
import { TrafficControls } from './components/TrafficControls'
import { TrafficDetails } from './components/TrafficDetails'
import { APP_CONFIG } from './config/appConfig'
import type { AppCenter } from './config/appConfig'
import type { DisplayTrafficEntity, TrafficEntity } from './domain/traffic'
import {
  DEFAULT_VESSEL_FILTERS,
  filterVessels,
  orderVesselSearchResults,
} from './domain/vesselFilters'
import type { ViewportAssessment } from './domain/viewport'
import {
  mapErrorPresentation,
  type TrafficMapError,
} from './map/mapInitialization'
import { TrafficMap } from './map/TrafficMap'
import type { PlaceSearchResult } from './providers/geocoding/photonProvider'
import { StaticAircraftMetadataProvider } from './providers/aircraftMetadata/staticAircraftMetadataProvider'
import { StaticPortsProvider } from './providers/ports/staticPortsProvider'
import { filterTrafficByViewport } from './traffic/filter'
import { displayTraffic } from './traffic/freshness'

interface ViewRequest {
  id: number
  center: AppCenter
}

function App() {
  const [vesselFilters, setVesselFilters] = useState(
    DEFAULT_VESSEL_FILTERS,
  )
  const [aircraftVisible, setAircraftVisible] = useState(true)
  const [vesselsVisible, setVesselsVisible] = useState(true)
  const [portsVisible, setPortsVisible] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null)
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
  const locationCameraIntentRef = useRef(new LocationCameraIntent())
  const { theme, setTheme } = useTheme()
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
  const aircraftMetadataProvider = useMemo(
    () => new StaticAircraftMetadataProvider(APP_CONFIG.aircraftMetadata),
    [],
  )
  const portsProvider = useMemo(
    () => new StaticPortsProvider(APP_CONFIG.ports),
    [],
  )
  const portsResult = usePorts(portsVisible, portsProvider)

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
    if (selectedPortId && !selectedPort) setSelectedPortId(null)
  }, [selectedPort, selectedPortId])

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
    setSelectedId(id)
  }, [])

  const handlePortSelect = useCallback((id: string | null) => {
    setSelectedId(null)
    setSelectedPortId(id)
  }, [])

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

  return (
    <main className="app-shell">
      <TrafficMap
        viewCenter={viewRequest.center}
        viewLabel={activeLocationLabel}
        viewRadiusKm={APP_CONFIG.map.homeViewRadiusKm}
        maximumViewportRadiusKm={APP_CONFIG.map.maximumViewportRadiusKm}
        touchHitTolerancePx={APP_CONFIG.map.touchHitTolerancePx}
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
        trail={activeViewport ? trail : []}
        selectedId={selectedId}
        selectedPortId={selectedPortId}
        aircraftVisible={aircraftVisible}
        vesselsVisible={vesselsVisible}
        portsVisible={portsVisible}
        interpolationDurationMs={APP_CONFIG.interpolationDurationMs}
        viewRequestId={viewRequest.id}
        viewportSettleMs={APP_CONFIG.navigation.viewportSettleMs}
        onSelect={handleTrafficSelect}
        onSelectPort={handlePortSelect}
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
          centerDisabled={
            !location.initialReady || mapError?.kind === 'initialization'
          }
          onCenter={handleCenter}
          locationAvailable={location.canRequest}
          locationLoading={location.locating}
          locationMessage={location.message}
          onUseLocation={handleUseLocation}
          theme={theme}
          onThemeChange={setTheme}
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
