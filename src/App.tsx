import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { useAircraftTraffic } from './app/useAircraftTraffic'
import { useMarineTraffic } from './app/useMarineTraffic'
import { useNow } from './app/useNow'
import { useTrailHistory } from './app/useTrailHistory'
import { LiveStatus } from './components/LiveStatus'
import { TrafficControls } from './components/TrafficControls'
import { TrafficDetails } from './components/TrafficDetails'
import { APP_CONFIG } from './config/appConfig'
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
  const now = useNow()

  const aircraftResult = useAircraftTraffic(
    APP_CONFIG.center,
    radiusKm,
    APP_CONFIG.aircraft,
  )
  const marineResult = useMarineTraffic(
    APP_CONFIG.center,
    radiusKm,
    APP_CONFIG.marine,
  )
  const nearbyAircraft = useMemo(
    () =>
      filterTrafficByRadius(
        aircraftResult.entities,
        APP_CONFIG.center,
        radiusKm,
      ),
    [aircraftResult.entities, radiusKm],
  )
  const nearbyVessels = useMemo(
    () =>
      filterTrafficByRadius(
        marineResult.entities,
        APP_CONFIG.center,
        radiusKm,
      ),
    [marineResult.entities, radiusKm],
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

  return (
    <main className="app-shell">
      <TrafficMap
        center={APP_CONFIG.center}
        radiusKm={radiusKm}
        mapStyleUrl={APP_CONFIG.map.styleUrl}
        aircraft={aircraft}
        vessels={vessels}
        trail={trail}
        selectedId={selectedId}
        aircraftVisible={aircraftVisible}
        vesselsVisible={vesselsVisible}
        interpolationDurationMs={APP_CONFIG.interpolationDurationMs}
        onSelect={setSelectedId}
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
              <p>
                {APP_CONFIG.center.label} / {radiusKm} km
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
          onRadiusChange={setRadiusKm}
          vesselLengthPresetsMeters={APP_CONFIG.vesselLengthPresetsMeters}
          minimumVesselLengthMeters={minimumVesselLengthMeters}
          onMinimumVesselLengthChange={setMinimumVesselLengthMeters}
          aircraftVisible={aircraftVisible}
          onAircraftVisibleChange={setAircraftVisible}
          vesselsVisible={vesselsVisible}
          onVesselsVisibleChange={setVesselsVisible}
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
