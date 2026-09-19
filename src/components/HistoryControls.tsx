import {
  isTrailDurationMinutes,
  TRAIL_DURATION_OPTIONS_MINUTES,
  type TrailPreferences,
} from '../domain/trailPreferences'
import { formatTimestamp } from '../domain/format'
import {
  PLAYBACK_SPEEDS,
  type PlaybackSpeed,
  type PlaybackRange,
  type PlaybackState,
} from '../history/playback'
import {
  HISTORY_RETENTION_HOURS,
  isHistoryRetentionHours,
  type HistoryPersistenceSettings,
  type HistoryPersistenceStatus,
  type HistoryRetentionHours,
} from '../history/settings'

interface HistoryControlsProps {
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
  onPlayHistory: () => void
  onPauseHistory: () => void
  onScrubHistory: (cursor: number) => void
  onPlaybackSpeedChange: (speed: PlaybackSpeed) => void
}

const formatLogicalBytes = (bytes: number) =>
  bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MiB logical`
    : `${Math.round(bytes / 1_024)} KiB logical`

const persistenceLabel = (status: HistoryPersistenceStatus) => {
  switch (status.phase) {
    case 'initializing':
      return 'Preparing private local history.'
    case 'disabled':
      return 'Private local history is off.'
    case 'ready':
      return 'Private local history is ready.'
    case 'writing':
      return 'Saving provider observations locally.'
    case 'blocked':
    case 'stale-tab':
    case 'quota-exceeded':
    case 'error':
    case 'deletion-failed':
      return status.message ?? 'Private local history needs attention.'
    case 'deletion-pending':
      return status.message ?? 'Deleting private local history.'
  }
}

export function HistoryControls({
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
  onPlayHistory,
  onPauseHistory,
  onScrubHistory,
  onPlaybackSpeedChange,
}: HistoryControlsProps) {
  const setVisible = (visible: boolean) => {
    onTrailPreferencesChange({
      ...trailPreferences,
      visible,
    })
  }

  return (
    <>
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
          Session provider observations only. Longer settings collect future
          points; they do not recreate missing history.
        </p>
      </fieldset>

      <fieldset className="control-group playback-controls">
        <legend>History</legend>
        <div className="control-options control-options--two">
          <button
            type="button"
            className={historySettings.enabled ? 'is-active' : undefined}
            aria-pressed={historySettings.enabled}
            disabled={
              historyStatus.phase === 'initializing' ||
              historyStatus.phase === 'deletion-pending'
            }
            onClick={() =>
              onHistoryEnabledChange(!historySettings.enabled)
            }
          >
            {historySettings.enabled ? 'DISABLE & DELETE' : 'ENABLE LOCAL'}
          </button>
          <button type="button" onClick={onClearHistory}>
            CLEAR HISTORY
          </button>
        </div>

        <label>
          <span>Maximum local retention</span>
          <select
            value={historySettings.retentionHours}
            onChange={(event) => {
              const hours = Number(event.currentTarget.value)
              if (!isHistoryRetentionHours(hours)) return
              onHistoryRetentionChange(hours)
            }}
          >
            {HISTORY_RETENTION_HOURS.map((hours) => (
              <option key={hours} value={hours}>
                {hours} {hours === 1 ? 'HOUR' : 'HOURS'}
              </option>
            ))}
          </select>
        </label>

        <p className="control-note" role="status">
          {persistenceLabel(historyStatus)}
          {' · '}
          {historyStatus.recordCount} durable / {historyRecordCount} available
          {' · '}
          {formatLogicalBytes(historyStatus.logicalBytes)}
        </p>
        {historyRange && (
          <p className="control-note control-note--muted">
            Available {formatTimestamp(historyRange.oldest)} to{' '}
            {formatTimestamp(historyRange.newest)}. This is the actual retained
            range, not the requested maximum.
          </p>
        )}
        {historyStatus.message &&
          !['blocked', 'stale-tab', 'quota-exceeded', 'error', 'deletion-failed']
            .includes(historyStatus.phase) && (
            <p className="control-note control-note--muted">
              {historyStatus.message}
            </p>
          )}
        {['blocked', 'stale-tab', 'error', 'deletion-failed'].includes(
          historyStatus.phase,
        ) && (
          <button
            type="button"
            className="history-action"
            onClick={onRetryHistory}
          >
            RETRY LOCAL HISTORY
          </button>
        )}

        {playback.mode === 'live' ? (
          <button
            type="button"
            className="history-action"
            disabled={!historyRange}
            onClick={onEnterHistory}
          >
            ENTER HISTORY
          </button>
        ) : (
          <>
            <label>
              <span>
                Historical cursor {formatTimestamp(playback.cursor)}
              </span>
              <input
                type="range"
                min={playback.range.oldest}
                max={playback.range.newest}
                step={1}
                value={playback.cursor}
                onChange={(event) =>
                  onScrubHistory(Number(event.currentTarget.value))
                }
              />
            </label>
            <div className="control-options control-options--two">
              <button
                type="button"
                className={
                  playback.mode === 'history-playing'
                    ? 'is-active'
                    : undefined
                }
                aria-pressed={playback.mode === 'history-playing'}
                onClick={
                  playback.mode === 'history-playing'
                    ? onPauseHistory
                    : onPlayHistory
                }
              >
                {playback.mode === 'history-playing' ? 'PAUSE' : 'PLAY'}
              </button>
              <span className="playback-speed-label">
                {playback.speed}× SPEED
              </span>
            </div>
            <div className="control-options">
              {PLAYBACK_SPEEDS.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  className={
                    playback.speed === speed ? 'is-active' : undefined
                  }
                  aria-pressed={playback.speed === speed}
                  onClick={() => onPlaybackSpeedChange(speed)}
                >
                  {speed}×
                </button>
              ))}
            </div>
          </>
        )}

        <p className="control-note control-note--muted">
          Session history lasts at most 60 minutes. Local history is optional,
          private to this browser origin, and may be evicted by the browser.
          No export, sharing, synchronization, or backend is used.
        </p>
      </fieldset>
    </>
  )
}
