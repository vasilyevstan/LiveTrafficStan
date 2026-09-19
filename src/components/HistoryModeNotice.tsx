import type { Ref } from 'react'
import { formatTimestamp } from '../domain/format'
import {
  PLAYBACK_SPEEDS,
  type PlaybackSpeed,
  type PlaybackState,
} from '../history/playback'

interface HistoryModeNoticeProps {
  playback: Exclude<PlaybackState, { mode: 'live' }>
  entityCount: number
  playbackControlRef?: Ref<HTMLInputElement>
  onPlay: () => void
  onPause: () => void
  onScrub: (cursor: number) => void
  onSpeedChange: (speed: PlaybackSpeed) => void
  onReturnToLive: () => void
}

export function HistoryModeNotice({
  playback,
  entityCount,
  playbackControlRef,
  onPlay,
  onPause,
  onScrub,
  onSpeedChange,
  onReturnToLive,
}: HistoryModeNoticeProps) {
  return (
    <section
      className="history-mode-notice"
      aria-label="Historical traffic display"
    >
      <div className="history-mode-notice__summary">
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
      <label className="history-mode-notice__cursor">
        <span>Historical cursor {formatTimestamp(playback.cursor)}</span>
        <input
          ref={playbackControlRef}
          type="range"
          min={playback.range.oldest}
          max={playback.range.newest}
          step={1}
          value={playback.cursor}
          onChange={(event) =>
            onScrub(Number(event.currentTarget.value))
          }
        />
      </label>
      <div className="history-mode-notice__actions">
        <button
          type="button"
          className={
            playback.mode === 'history-playing' ? 'is-active' : undefined
          }
          aria-pressed={playback.mode === 'history-playing'}
          onClick={
            playback.mode === 'history-playing' ? onPause : onPlay
          }
        >
          {playback.mode === 'history-playing' ? 'PAUSE' : 'PLAY'}
        </button>
        <div
          className="history-mode-notice__speeds"
          role="group"
          aria-label="Playback speed"
        >
          {PLAYBACK_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={playback.speed === speed ? 'is-active' : undefined}
              aria-pressed={playback.speed === speed}
              onClick={() => onSpeedChange(speed)}
            >
              {speed}×
            </button>
          ))}
        </div>
        <button type="button" onClick={onReturnToLive}>
          RETURN TO LIVE
        </button>
      </div>
    </section>
  )
}
