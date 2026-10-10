import { useEffect, useRef } from 'react'
import type { JourneyOverview } from '../app/journeyOverview'
import type { Theme } from '../app/theme'
import { formatTimestamp } from '../domain/format'
import { JOURNEY_COLORS } from '../map/journeyStyle'
import { DetailsPanel } from './DetailsPanel'

interface JourneyDetailsProps {
  overview: JourneyOverview
  theme: Theme
  trafficPauseMessage?: string
  onHide: () => void
  onReturn: () => void
  onClose: () => void
}

export function JourneyDetails({
  overview, theme, trafficPauseMessage, onHide, onReturn, onClose,
}: JourneyDetailsProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { snapshot } = overview
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [snapshot.revision])
  const endpoints = snapshot.endpoints.filter(endpoint => endpoint.role !== 'captured')
  const observedTimes = snapshot.segments
    .filter(segment => segment.certainty === 'observed')
    .flatMap(segment => segment.points.map(point => point.observedAt))
    .filter((time): time is number => time !== undefined)
  const observed = snapshot.segments.some(segment => segment.certainty === 'observed')
  const estimated = snapshot.segments.some(segment => segment.certainty === 'estimated')

  return (
    <DetailsPanel
      titleId="journey-title"
      closeLabel="Close captured route overview"
      onClose={onClose}
      heading={
        <div>
          <p className="eyebrow">Captured route</p>
          <h2 id="journey-title" ref={headingRef} tabIndex={-1} title={snapshot.title}>
            {snapshot.title} route
          </h2>
        </div>
      }
    >
      <div className="journey-actions">
        <button type="button" onClick={onHide}>Hide path</button>
        <button type="button" onClick={onReturn}>Return to local view</button>
      </div>
      <p className="metadata-status">Captured, not live. Not for navigation.</p>
      <p className="metadata-status">Position reported {formatTimestamp(snapshot.position.observedAt)}.</p>
      {(observed || estimated) && <div className="journey-key">
        <span><i style={{ borderColor: JOURNEY_COLORS[theme].past }} />Past / departure</span>
        {snapshot.segments.some(segment => segment.phase === 'remaining') &&
          <span><i style={{ borderColor: JOURNEY_COLORS[theme].remaining }} />Current to destination</span>}
        <span>Solid: observed. Dashed: estimated.</span>
      </div>}
      {!observed && !estimated && <p className="metadata-status">Route sections unavailable.</p>}
      {endpoints.length === 0 && <p className="metadata-status">Departure and destination unknown.</p>}
      <p className="metadata-status" role="status">
        {overview.fitPending ? 'Framing the captured path…' : overview.fitMessage}
      </p>
      {trafficPauseMessage && <p className="metadata-status">
        <strong>Live aircraft and ships paused.</strong> Zoom in to resume.
      </p>}
      <details className="context-details">
        <summary>Route details &amp; sources</summary>
        <p className="metadata-status">Captured route overview, not live.</p>
        <p className="metadata-status">{snapshot.title}</p>
        <p className="metadata-status">Solid: received positions. Dashed: estimated.</p>
        {endpoints.length > 0 && (
          <p className="metadata-status">{endpoints.map(endpoint => endpoint.label).join(' · ')}</p>
        )}
        {observedTimes.length > 0 && (
          <p className="metadata-status">Received coverage: {formatTimestamp(Math.min(...observedTimes))} to{' '}
            {formatTimestamp(Math.max(...observedTimes))}; gaps may remain.</p>
        )}
        {snapshot.limitations.map(message => <p className="metadata-status" key={message}>{message}</p>)}
        <p className="metadata-attribution">Sources:{' '}
          {snapshot.sources.map((source, index) => <span key={`${source.name}:${index}`}>
            {index > 0 ? ' · ' : ''}{source.url ? <a href={source.url}>{source.name}</a> : source.name}
            {source.retrievedAt !== undefined && <> (retrieved {formatTimestamp(source.retrievedAt)})</>}
          </span>)}. Not for navigation.
        </p>
      </details>
    </DetailsPanel>
  )
}
