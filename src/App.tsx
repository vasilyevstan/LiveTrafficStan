import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { useAircraftTraffic } from './app/useAircraftTraffic'
import { useMarineTraffic } from './app/useMarineTraffic'
import { useNow } from './app/useNow'
import { useSessionLocation } from './app/useSessionLocation'
import { useTheme } from './app/useTheme'
import { useTrailHistory } from './app/useTrailHistory'
import { LiveStatus } from './components/LiveStatus'
import { TrafficControls } from './components/TrafficControls'
import { TrafficDetails } from './components/TrafficDetails'
import { APP_CONFIG } from './config/appConfig'
import type { DisplayTrafficEntity, TrafficEntity } from './domain/traffic'
import type { ViewportAssessment } from './domain/viewport'
import {
  mapErrorPresentation,
  type TrafficMapError,
} from './map/mapInitialization'
import { TrafficMap } from './map/TrafficMap'
import {
  filterTrafficByViewport,
  filterVesselsByMinimumLength,
} from './traffic/filter'
import { displayTraffic } from './traffic/freshness'

function App() {
  const [minimumVesselLengthMeters, setMinimumVesselLengthMeters] = useState(
    APP_CONFIG.defaultVesselLengthMeters,
  )
  const [aircraftVisible, setAircraftVisible] = useState(true)
  const [vesselsVisible, setVesselsVisible] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mapError, setMapError] = useState<TrafficMapError | null>(null)
  const [viewportReport, setViewportReport] = useState<{
    assessment: ViewportAssessment
    homeRequestId: number
  } | null>(null)
  const [homeRequestId, setHomeRequestId] = useState(0)
  const [appliedLocationRevision, setAppliedLocationRevision] = useState(0)
  const { theme, setTheme } = useTheme()
  const location = useSessionLocation(
    APP_CONFIG.center,
    APP_CONFIG.navigation,
  )
  const now = useNow()

  useEffect(() => {
    if (
      !location.initialReady ||
      location.revision <= appliedLocationRevision
    ) {
      return
    }

    setAppliedLocationRevision(location.revision)
    setViewportReport(null)
    setHomeRequestId((current) => current + 1)
  }, [
    appliedLocationRevision,
    location.initialReady,
    location.revision,
  ])

  const currentAssessment =
    viewportReport?.homeRequestId === homeRequestId
      ? viewportReport.assessment
      : null
  const locationRevisionApplied =
    location.initialReady &&
    appliedLocationRevision === location.revision
  const activeViewport =
    locationRevisionApplied && currentAssessment?.kind === 'eligible'
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
  const vessels = useMemo(
    () =>
      filterVesselsByMinimumLength(
        displayTraffic(viewportVessels, now, APP_CONFIG.marine),
        minimumVesselLengthMeters,
      ),
    [minimumVesselLengthMeters, now, viewportVessels],
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
  const trail = useTrailHistory(
    sourceEntities,
    selectedId,
    now,
    APP_CONFIG.trail,
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

  const handleViewportChange = useCallback(
    (assessment: ViewportAssessment, reportHomeRequestId: number) => {
      setViewportReport({
        assessment,
        homeRequestId: reportHomeRequestId,
      })
    },
    [],
  )

  const handleCenter = useCallback(() => {
    setViewportReport(null)
    setHomeRequestId((current) => current + 1)
  }, [])
  const mapErrorContent = mapError ? mapErrorPresentation(mapError) : null
  const mapSubtitle = !locationRevisionApplied
    ? 'Preparing map view'
    : currentAssessment?.kind === 'eligible'
      ? 'Visible traffic area'
      : currentAssessment
        ? 'Traffic paused'
        : 'Updating map view'

  return (
    <main className="app-shell">
      <TrafficMap
        homeCenter={location.homeCenter}
        homeViewRadiusKm={APP_CONFIG.map.homeViewRadiusKm}
        maximumViewportRadiusKm={APP_CONFIG.map.maximumViewportRadiusKm}
        coordinatePrecision={APP_CONFIG.navigation.coordinatePrecision}
        mapStyleUrl={
          theme === 'dark'
            ? APP_CONFIG.map.darkStyleUrl
            : APP_CONFIG.map.lightStyleUrl
        }
        theme={theme}
        aircraft={aircraft}
        vessels={vessels}
        trail={activeViewport ? trail : []}
        selectedId={selectedId}
        aircraftVisible={aircraftVisible}
        vesselsVisible={vesselsVisible}
        interpolationDurationMs={APP_CONFIG.interpolationDurationMs}
        homeRequestId={homeRequestId}
        viewportSettleMs={APP_CONFIG.navigation.viewportSettleMs}
        onSelect={setSelectedId}
        onViewportChange={handleViewportChange}
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
            now={now}
          />
        </header>

        <TrafficControls
          vesselLengthPresetsMeters={APP_CONFIG.vesselLengthPresetsMeters}
          minimumVesselLengthMeters={minimumVesselLengthMeters}
          onMinimumVesselLengthChange={setMinimumVesselLengthMeters}
          aircraftVisible={aircraftVisible}
          onAircraftVisibleChange={setAircraftVisible}
          vesselsVisible={vesselsVisible}
          onVesselsVisibleChange={setVesselsVisible}
          centerDisabled={
            !location.initialReady || mapError?.kind === 'initialization'
          }
          onCenter={handleCenter}
          locationAvailable={location.canRequest}
          locationLoading={location.locating}
          locationMessage={location.message}
          onUseLocation={location.requestLocation}
          theme={theme}
          onThemeChange={setTheme}
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
            now={now}
            onClose={() => setSelectedId(null)}
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
