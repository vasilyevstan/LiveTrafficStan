import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { APP_CONFIG, type AppCenter } from './config/appConfig'
import {
  centerFromCoordinates,
  sameCenterCoordinates,
  type Coordinates,
} from './domain/center'
import type { DisplayTrafficEntity, TrafficEntity } from './domain/traffic'
import { TrafficMap } from './map/TrafficMap'
import {
  filterTrafficByRadius,
  filterVesselsByMinimumLength,
} from './traffic/filter'
import { displayTraffic } from './traffic/freshness'

function App() {
  const [radiusKm, setRadiusKm] = useState(APP_CONFIG.defaultRadiusKm)
  const [minimumVesselLengthMeters, setMinimumVesselLengthMeters] = useState(
    APP_CONFIG.defaultVesselLengthMeters,
  )
  const [aircraftVisible, setAircraftVisible] = useState(true)
  const [vesselsVisible, setVesselsVisible] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [queryCenter, setQueryCenter] = useState<AppCenter | null>(null)
  const [fitRequestId, setFitRequestId] = useState(0)
  const { theme, setTheme } = useTheme()
  const appliedLocationRevisionRef = useRef(0)
  const location = useSessionLocation(
    APP_CONFIG.center,
    APP_CONFIG.navigation,
  )
  const now = useNow()

  useEffect(() => {
    if (
      !location.initialReady ||
      location.revision <= appliedLocationRevisionRef.current
    ) {
      return
    }

    const alreadyStarted = queryCenter !== null
    appliedLocationRevisionRef.current = location.revision
    setQueryCenter(location.homeCenter)
    if (alreadyStarted) setFitRequestId((current) => current + 1)
  }, [
    location.homeCenter,
    location.initialReady,
    location.revision,
    queryCenter,
  ])

  const activeCenter = queryCenter ?? location.homeCenter
  const providersEnabled = queryCenter !== null
  const aircraftResult = useAircraftTraffic(
    activeCenter,
    radiusKm,
    APP_CONFIG.aircraft,
    providersEnabled,
  )
  const marineResult = useMarineTraffic(
    activeCenter,
    radiusKm,
    APP_CONFIG.marine,
    providersEnabled,
  )
  const nearbyAircraft = useMemo(
    () =>
      filterTrafficByRadius(
        aircraftResult.entities,
        activeCenter,
        radiusKm,
      ),
    [activeCenter, aircraftResult.entities, radiusKm],
  )
  const nearbyVessels = useMemo(
    () =>
      filterTrafficByRadius(
        marineResult.entities,
        activeCenter,
        radiusKm,
      ),
    [activeCenter, marineResult.entities, radiusKm],
  )

  const aircraft = useMemo(
    () => displayTraffic(nearbyAircraft, now, APP_CONFIG.aircraft),
    [nearbyAircraft, now],
  )
  const vessels = useMemo(
    () =>
      filterVesselsByMinimumLength(
        displayTraffic(nearbyVessels, now, APP_CONFIG.marine),
        minimumVesselLengthMeters,
      ),
    [minimumVesselLengthMeters, nearbyVessels, now],
  )
  const sourceEntities = useMemo<TrafficEntity[]>(
    () => [...nearbyAircraft, ...nearbyVessels],
    [nearbyAircraft, nearbyVessels],
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

  const requestFit = useCallback(() => {
    setFitRequestId((current) => current + 1)
  }, [])

  const handleRadiusChange = useCallback(
    (nextRadiusKm: number) => {
      if (nextRadiusKm === radiusKm) return
      setRadiusKm(nextRadiusKm)
      requestFit()
    },
    [radiusKm, requestFit],
  )

  const handleQueryCenterChange = useCallback((coordinates: Coordinates) => {
    const nextCenter = centerFromCoordinates(
      coordinates,
      APP_CONFIG.navigation.coordinatePrecision,
      'Map area',
    )
    setQueryCenter((current) => {
      if (current && sameCenterCoordinates(current, nextCenter)) return current
      return nextCenter
    })
  }, [])

  const handleCenter = useCallback(() => {
    setQueryCenter(location.homeCenter)
    requestFit()
  }, [location.homeCenter, requestFit])

  return (
    <main className="app-shell">
      {queryCenter ? (
        <TrafficMap
          center={queryCenter}
          radiusKm={radiusKm}
          mapStyleUrl={
            theme === 'dark'
              ? APP_CONFIG.map.darkStyleUrl
              : APP_CONFIG.map.lightStyleUrl
          }
          theme={theme}
          aircraft={aircraft}
          vessels={vessels}
          trail={trail}
          selectedId={selectedId}
          aircraftVisible={aircraftVisible}
          vesselsVisible={vesselsVisible}
          interpolationDurationMs={APP_CONFIG.interpolationDurationMs}
          fitRequestId={fitRequestId}
          panSettleMs={APP_CONFIG.navigation.panSettleMs}
          onSelect={setSelectedId}
          onQueryCenterChange={handleQueryCenterChange}
          onMapError={setMapError}
        />
      ) : (
        <div className="traffic-map map-placeholder" role="status">
          Resolving the starting area...
        </div>
      )}
      <div className="radar-shade" aria-hidden="true" />

      <div className="interface-layer">
        <header className="brand-panel">
          <div className="brand-panel__title">
            <div className="radar-mark" aria-hidden="true">
              <span />
            </div>
            <div>
              <h1>LiveTrafficStan</h1>
              <p>
                {activeCenter.label} / {radiusKm} km
              </p>
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
          radiusPresetsKm={APP_CONFIG.radiusPresetsKm}
          radiusKm={radiusKm}
          onRadiusChange={handleRadiusChange}
          vesselLengthPresetsMeters={APP_CONFIG.vesselLengthPresetsMeters}
          minimumVesselLengthMeters={minimumVesselLengthMeters}
          onMinimumVesselLengthChange={setMinimumVesselLengthMeters}
          aircraftVisible={aircraftVisible}
          onAircraftVisibleChange={setAircraftVisible}
          vesselsVisible={vesselsVisible}
          onVesselsVisibleChange={setVesselsVisible}
          centerDisabled={!queryCenter}
          onCenter={handleCenter}
          locationAvailable={location.canRequest}
          locationLoading={location.locating}
          locationMessage={location.message}
          onUseLocation={location.requestLocation}
          theme={theme}
          onThemeChange={setTheme}
        />

        {selectedEntity && (
          <TrafficDetails
            entity={selectedEntity}
            now={now}
            onClose={() => setSelectedId(null)}
          />
        )}

        {mapError && (
          <div className="map-error" role="status">
            <strong>Map data issue</strong>
            <span>{mapError}</span>
          </div>
        )}
      </div>
    </main>
  )
}

export default App
