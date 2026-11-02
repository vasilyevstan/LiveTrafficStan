export interface TrafficPauseNoticeProps {
  retainedSample: boolean
  message: string
  aircraftPaused?: boolean
  onResume?: () => void
  inline?: boolean
}

export function TrafficPauseNotice({
  retainedSample, message, aircraftPaused = true, onResume, inline = false,
}: TrafficPauseNoticeProps) {
  return (
    <div className={inline ? 'traffic-pause-notice' : 'viewport-notice'}>
      <strong>{retainedSample
        ? 'Last local traffic sample'
        : aircraftPaused ? 'Aircraft and ships paused' : 'Ships paused'}</strong>
      <span>{retainedSample && 'Last local sample; not wider live coverage. '}{message}</span>
      {onResume && (
        <button type="button" onClick={onResume}>
          {aircraftPaused ? 'RESUME LIVE' : 'SHOW LIVE SHIPS'}
        </button>
      )}
    </div>
  )
}
