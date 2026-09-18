interface TrafficControlsProps {
  radiusPresetsKm: readonly number[]
  radiusKm: number
  onRadiusChange: (radiusKm: number) => void
  vesselLengthPresetsMeters: readonly number[]
  minimumVesselLengthMeters: number
  onMinimumVesselLengthChange: (lengthMeters: number) => void
  aircraftVisible: boolean
  onAircraftVisibleChange: (visible: boolean) => void
  vesselsVisible: boolean
  onVesselsVisibleChange: (visible: boolean) => void
}

export function TrafficControls({
  radiusPresetsKm,
  radiusKm,
  onRadiusChange,
  vesselLengthPresetsMeters,
  minimumVesselLengthMeters,
  onMinimumVesselLengthChange,
  aircraftVisible,
  onAircraftVisibleChange,
  vesselsVisible,
  onVesselsVisibleChange,
}: TrafficControlsProps) {
  return (
    <aside className="control-panel" aria-label="Map controls">
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
        </div>
      </fieldset>

      <fieldset className="control-group">
        <legend>Radius</legend>
        <div className="control-options">
          {radiusPresetsKm.map((preset) => (
            <button
              key={preset}
              type="button"
              className={preset === radiusKm ? 'is-active' : undefined}
              aria-pressed={preset === radiusKm}
              onClick={() => onRadiusChange(preset)}
            >
              {preset} km
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="control-group">
        <legend>Minimum ship length</legend>
        <div className="control-options">
          {vesselLengthPresetsMeters.map((preset) => (
            <button
              key={preset}
              type="button"
              className={
                preset === minimumVesselLengthMeters ? 'is-active' : undefined
              }
              aria-pressed={preset === minimumVesselLengthMeters}
              onClick={() => onMinimumVesselLengthChange(preset)}
            >
              {preset} m
            </button>
          ))}
        </div>
      </fieldset>
    </aside>
  )
}
