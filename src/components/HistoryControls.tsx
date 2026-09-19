import {
  isTrailDurationMinutes,
  TRAIL_DURATION_OPTIONS_MINUTES,
  type TrailPreferences,
} from '../domain/trailPreferences'

interface HistoryControlsProps {
  trailPreferences: TrailPreferences
  onTrailPreferencesChange: (preferences: TrailPreferences) => void
}

export function HistoryControls({
  trailPreferences,
  onTrailPreferencesChange,
}: HistoryControlsProps) {
  const setVisible = (visible: boolean) => {
    onTrailPreferencesChange({
      ...trailPreferences,
      visible,
    })
  }

  return (
    <fieldset className="control-group history-controls">
      <legend>Trail</legend>
      <div className="control-options control-options--two">
        <button
          type="button"
          className={trailPreferences.visible ? 'is-active' : undefined}
          aria-pressed={trailPreferences.visible}
          onClick={() => setVisible(true)}
        >
          SHOW
        </button>
        <button
          type="button"
          className={!trailPreferences.visible ? 'is-active' : undefined}
          aria-pressed={!trailPreferences.visible}
          onClick={() => setVisible(false)}
        >
          HIDE
        </button>
      </div>
      <label>
        <span>Selected trail duration</span>
        <select
          value={trailPreferences.durationMinutes}
          onChange={(event) => {
            const durationMinutes = Number(event.currentTarget.value)
            if (!isTrailDurationMinutes(durationMinutes)) return
            onTrailPreferencesChange({
              ...trailPreferences,
              durationMinutes,
            })
          }}
        >
          {TRAIL_DURATION_OPTIONS_MINUTES.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} MIN
            </option>
          ))}
        </select>
      </label>
      <p className="control-note control-note--muted">
        Session-only provider observations. Longer settings collect future
        points; they do not recreate missing history.
      </p>
    </fieldset>
  )
}
