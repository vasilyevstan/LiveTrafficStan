import { useId } from 'react'
import { DetailsPanel } from './DetailsPanel'
import { formatAltitude } from '../domain/format'
import { orbitalFeatureOwner, orbitalObjectTypeLabel, type ModeledOrbitalPosition } from '../domain/orbital'
import type { CapturedOrbitalView } from '../domain/orbitalView'
import type { UnitSystem } from '../domain/units'
import { APP_CONFIG } from '../config/appConfig'

interface Props {
  view: CapturedOrbitalView
  ready: boolean
  localTrafficAvailable?: boolean
  groundTrafficSuppressed?: boolean
  playing: boolean
  position?: Readonly<ModeledOrbitalPosition>
  notice?: string
  statusMessage?: string
  online: boolean
  units: UnitSystem
  onReturn: () => void
  onTogglePlaying: () => void
}

export function CapturedOrbitalDetails({ view, ready, localTrafficAvailable = false, groundTrafficSuppressed = false, playing, position: displayedPosition, notice, statusMessage, online, units, onReturn, onTogglePlaying }: Props) {
  const titleId = useId()
  const { snapshot } = view
  const position = displayedPosition ?? view.position
  const modeledAt = new Date(position.modeledFor).toISOString()
  const nativeGp = snapshot.sourceProvider === 'space-track'
  return (
    <DetailsPanel
      titleId={titleId}
      className="details-panel--orbital-view"
      closeLabel="Return to map"
      onClose={onReturn}
      heading={
        <div className="orbital-view-heading">
          <h2 id={titleId} title={`Modeled 3D view from ${position.name}`}>From {position.name}</h2>
          <p className="metadata-status" role="status">
            {!ready ? 'Preparing modeled view...' : notice ?? <span aria-live="off">
              {playing ? 'Modeled' : 'Paused'} <time dateTime={modeledAt} title={modeledAt}>{modeledAt.slice(11, 19)} UTC</time>
              {' · '}{formatAltitude(position.altitudeKm * 1_000, units)}
            </span>}
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
          ? 'Travel direction unavailable. Drag or use arrows to look.'
          : 'Travel-relative look. Drag or use arrows; Pause holds the view.'}
      </p>
      <p className="metadata-status">Earth-facing map model, not live or optical. No spacecraft attitude is inferred.</p>
      <p className="metadata-status">
        {localTrafficAvailable
          ? `Previous local area reports: sampled ground annotations, not traffic visible from the spacecraft.${groundTrafficSuppressed ? ' Not drawn at this scale.' : ''}`
          : 'Aircraft and ships paused: no eligible previous local area.'}
      </p>
      <details className="context-details">
        <summary>Model &amp; source</summary>
        <dl className="details-grid">
          <div className="detail-row"><dt>Object</dt><dd>{position.name}</dd></div>
          <div className="detail-row"><dt>Modeled time</dt><dd>{modeledAt}</dd></div>
          <div className="detail-row"><dt>Forward reference</dt><dd>
            {position.travelBearingDegrees === undefined
              ? 'Unavailable; neutral or last accepted direction.'
              : 'Earth-relative modeled travel; your look offset is retained.'}
          </dd></div>
          <div className="detail-row"><dt>Catalog type</dt><dd>{orbitalObjectTypeLabel(position.objectType)} ({position.objectType})</dd></div>
          <div className="detail-row"><dt>NORAD</dt><dd>{position.noradCatalogId}</dd></div>
          <div className="detail-row"><dt>Element epoch</dt><dd>{new Date(position.elementEpoch).toISOString()}</dd></div>
          <div className="detail-row"><dt>Catalog retrieved</dt><dd>{new Date(position.snapshotRetrievedAt).toISOString()}</dd></div>
          <div className="detail-row"><dt>Snapshot</dt><dd>{snapshot.catalogId} · {snapshot.sha256.slice(0, 12)}</dd></div>
        </dl>
        {statusMessage && <p className="metadata-status">{statusMessage}</p>}
        {!online && <p className="metadata-status">Offline; only already available basemap tiles may draw.</p>}
        <p className="metadata-status">
          {orbitalFeatureOwner(position.id) === 'starlink' ? 'Bounded Starlink sample, not the full constellation. ' : ''}
          Approximate spherical Earth map, not a camera feed or terrain/visibility model.
          Normal-speed modeled motion; geostationary objects may appear still.
          Session-only; no recording or share link.
        </p>
        <p className="metadata-attribution">
          SGP4 · <a href={nativeGp ? 'https://www.space-track.org/' : APP_CONFIG.orbital.sourceWebsiteUrl}>
            {nativeGp ? 'Space-Track.org / USSPACECOM' : APP_CONFIG.orbital.sourceName}
          </a> GP data · <a href={nativeGp ? 'https://www.space-track.org/documentation#/odr' : APP_CONFIG.orbital.sourceUsagePolicyUrl}>
            {nativeGp ? 'basic-data use' : 'usage policy'}
          </a>
        </p>
        {snapshot.curationReference && (
          <p className="metadata-attribution">Dated <a href="https://celestrak.org/">CelesTrak</a> membership reference · {snapshot.curationReference.retrievedAt}.</p>
        )}
      </details>
    </DetailsPanel>
  )
}
