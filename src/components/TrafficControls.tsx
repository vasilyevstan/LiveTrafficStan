import type { Theme } from '../app/theme'

interface TrafficControlsProps {
  vesselLengthPresetsMeters: readonly number[]
  minimumVesselLengthMeters: number
  onMinimumVesselLengthChange: (lengthMeters: number) => void
  aircraftVisible: boolean
  onAircraftVisibleChange: (visible: boolean) => void
  vesselsVisible: boolean
  onVesselsVisibleChange: (visible: boolean) => void
  centerDisabled: boolean
  onCenter: () => void
  locationAvailable: boolean
  locationLoading: boolean
  locationMessage?: string
  onUseLocation: () => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
}

export function TrafficControls({
  vesselLengthPresetsMeters,
  minimumVesselLengthMeters,
  onMinimumVesselLengthChange,
  aircraftVisible,
  onAircraftVisibleChange,
  vesselsVisible,
  onVesselsVisibleChange,
  centerDisabled,
  onCenter,
  locationAvailable,
  locationLoading,
  locationMessage,
  onUseLocation,
  theme,
  onThemeChange,
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
