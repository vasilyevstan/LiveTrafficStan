import { formatTimestamp } from '../domain/format'
import type { PlaybackState } from '../history/playback'

interface HistoryModeNoticeProps {
  playback: Exclude<PlaybackState, { mode: 'live' }>
  entityCount: number
  onReturnToLive: () => void
}

export function HistoryModeNotice({
  playback,
  entityCount,
  onReturnToLive,
}: HistoryModeNoticeProps) {
  return (
    <section
      className="history-mode-notice"
      aria-label="Historical traffic display"
    >
      <div>
        <strong>
          {playback.mode === 'history-playing'
            ? 'HISTORY PLAYING'
            : 'HISTORY PAUSED'}
        </strong>
        <span>{formatTimestamp(playback.cursor)}</span>
        <span>
          {entityCount === 0
            ? 'No recorded traffic at this cursor'
            : `${entityCount} recorded object${
                entityCount === 1 ? '' : 's'
              }`}
        </span>
      </div>
      <button type="button" onClick={onReturnToLive}>
        RETURN TO LIVE
      </button>
    </section>
  )
}
