import { useId } from 'react'
import { DetailsPanel } from './DetailsPanel'
import { formatAltitude } from '../domain/format'
import type { AircraftViewPosition, CapturedAircraftView } from '../domain/aircraftView'
import type { UnitSystem } from '../domain/units'
import { APP_CONFIG } from '../config/appConfig'

interface Props {
  view: CapturedAircraftView
  ready: boolean
  playing: boolean
  position?: AircraftViewPosition
  latestObservedAt: number
  holding: boolean
  notice?: string
  online: boolean
  units: UnitSystem
  onReturn: () => void
  onTogglePlaying: () => void
}

export function CapturedAircraftDetails({ view, ready, playing, position: displayedPosition, latestObservedAt, holding, notice, online, units, onReturn, onTogglePlaying }: Props) {
  const titleId = useId()
  const position = displayedPosition ?? view.position
  const observedAt = new Date(position.observedAt).toISOString()
  const latestAt = new Date(latestObservedAt).toISOString()
  const expiresAt = new Date(latestObservedAt + APP_CONFIG.aircraft.expireAfterMs).toISOString()
  return (
    <DetailsPanel
      titleId={titleId}
      className="details-panel--orbital-view details-panel--aircraft-view"
      closeLabel="Return to map"
      onClose={onReturn}
      heading={
        <div className="orbital-view-heading">
          <h2 id={titleId} title={`3D view from aircraft ${position.name}`}>From {position.name}</h2>
          <p className="metadata-status" role="status">
            {!ready ? 'Preparing aircraft view...' : notice ?? (holding
              ? <>Holding at last report <time dateTime={latestAt} title={latestAt}>{latestAt.slice(11, 19)} UTC</time>; returns at {expiresAt.slice(11, 19)} UTC without a newer report.</>
              : <span aria-live="off">
                {playing ? 'Observed' : 'Paused'} <time dateTime={observedAt} title={observedAt}>{observedAt.slice(11, 19)} UTC</time>
                {' · '}{formatAltitude(position.altitudeKm * 1_000, units)}
              </span>)}
          </p>
          <div className="orbital-view-actions">
            <button type="button" className="orbital-view-return" disabled={!ready} onClick={onTogglePlaying}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" className="orbital-view-return" onClick={onReturn}>Return</button>
          </div>
        </div>
      }
    >
      <p className="metadata-status">
        {position.travelBearingDegrees === undefined
          ? 'Track unavailable. Drag or use arrows to look.'
          : 'Track-relative look. Drag or use arrows; Pause holds the view.'}
      </p>
      <p className="metadata-status">
        Observed ADS-B positions, moved only between reports about {Math.round(APP_CONFIG.aircraft.refreshIntervalMs / 1_000)} s behind.
        Not a cockpit or camera view; other traffic is hidden.
      </p>
      <details className="context-details">
        <summary>Position &amp; source</summary>
        <dl className="details-grid">
          <div className="detail-row"><dt>Aircraft</dt><dd>{position.name}</dd></div>
          <div className="detail-row"><dt>Displayed position</dt><dd>{observedAt}</dd></div>
          <div className="detail-row"><dt>Latest report</dt><dd>{latestAt}</dd></div>
          <div className="detail-row"><dt>Altitude</dt><dd>Barometric (pressure) altitude over a sea-level map without terrain.</dd></div>
        </dl>
        {!online && <p className="metadata-status">Offline; only already available basemap tiles may draw.</p>}
        <p className="metadata-attribution">
          Aircraft positions: <a href={APP_CONFIG.flightRoute.sourceWebsiteUrl}>ADSB.lol</a>
        </p>
      </details>
    </DetailsPanel>
  )
}
