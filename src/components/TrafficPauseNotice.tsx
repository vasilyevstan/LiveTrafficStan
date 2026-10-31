export interface TrafficPauseNoticeProps {
  retainedSample: boolean
  message: string
  onResume?: () => void
  inline?: boolean
}

export function TrafficPauseNotice({
  retainedSample, message, onResume, inline = false,
}: TrafficPauseNoticeProps) {
  return (
    <div className={inline ? 'traffic-pause-notice' : 'viewport-notice'}>
      <strong>{retainedSample ? 'Last local traffic sample' : 'Aircraft and ships paused'}</strong>
      <span>{retainedSample && 'Last local sample; not wider live coverage. '}{message}</span>
      {onResume && <button type="button" onClick={onResume}>RESUME LIVE</button>}
    </div>
  )
}
