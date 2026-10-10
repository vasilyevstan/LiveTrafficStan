import {
  isTrailDurationMinutes,
  TRAIL_DURATION_OPTIONS_MINUTES,
  type TrailPreferences,
} from '../domain/trailPreferences'
import { formatTimestamp } from '../domain/format'
import {
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
  retryPromoted?: boolean
  trailVisibilityPromoted?: boolean
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
      return 'Local history storage is blocked.'
    case 'stale-tab':
      return 'Another tab changed history. Retry to continue.'
    case 'quota-exceeded':
      return 'Local history is full; recording paused.'
    case 'error':
      return 'Local history unavailable. Retry to continue.'
    case 'deletion-failed':
      return 'History deletion failed. Retry to finish.'
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
  retryPromoted = false,
  trailVisibilityPromoted = false,
}: HistoryControlsProps) {
  const statusLabel = persistenceLabel(historyStatus)
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
        {!trailVisibilityPromoted && (
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
        )}
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
          Session observations only; no backfill.
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
          {statusLabel}
        </p>
        <p className="control-note">
          {historyStatus.recordCount} durable / {historyRecordCount} available
          {' · '}
          {formatLogicalBytes(historyStatus.logicalBytes)}
        </p>
        {historyRange && (
          <p className="control-note control-note--muted">
            Retained {formatTimestamp(historyRange.oldest)} to{' '}
            {formatTimestamp(historyRange.newest)}.
          </p>
        )}
        {['blocked', 'stale-tab', 'error', 'deletion-failed'].includes(
          historyStatus.phase,
        ) &&
          !retryPromoted && (
          <button
            type="button"
            className="history-action"
            onClick={onRetryHistory}
          >
            RETRY LOCAL HISTORY
          </button>
        )}

        {playback.mode === 'live' && (
          <button
            id="history-enter-button"
            type="button"
            className="history-action"
            disabled={!historyRange}
            onClick={onEnterHistory}
          >
            ENTER HISTORY
          </button>
        )}

        <p className="control-note control-note--muted">
          Private on-device records; no upload or sync.
        </p>
        <details className="context-details">
          <summary>Storage details</summary>
          {historyStatus.message && historyStatus.message !== statusLabel && (
            <p className="control-note">{historyStatus.message}</p>
          )}
          <p className="control-note">
            Local history: up to 60 min, origin-private, browser-evictable; no
            export, sync, or backend.
          </p>
        </details>
      </fieldset>
    </>
  )
}
