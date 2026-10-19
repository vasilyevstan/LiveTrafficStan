import { useId } from 'react'
import { DetailsPanel } from './DetailsPanel'
import { formatAltitude } from '../domain/format'
import { orbitalFeatureOwner, orbitalObjectTypeLabel } from '../domain/orbital'
import type { CapturedOrbitalView } from '../domain/orbitalView'
import type { UnitSystem } from '../domain/units'
import { APP_CONFIG } from '../config/appConfig'

interface Props {
  view: CapturedOrbitalView
  ready: boolean
  notice?: string
  statusMessage?: string
  online: boolean
  units: UnitSystem
  onReturn: () => void
}

export function CapturedOrbitalDetails({ view, ready, notice, statusMessage, online, units, onReturn }: Props) {
  const titleId = useId()
  const { position, snapshot } = view
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
          <h2 id={titleId} title={`Captured modeled view from ${position.name}`}>From {position.name}</h2>
          <p className="metadata-status" role="status">
            {!ready ? 'Preparing captured view...' : notice ?? <>
              Captured model <time dateTime={modeledAt} title={modeledAt}>{modeledAt.slice(11, 19)} UTC</time>
              {' · '}{formatAltitude(position.altitudeKm * 1_000, units)}
            </>}
          </p>
          <button type="button" className="orbital-view-return" onClick={onReturn}>Return</button>
        </div>
      }
    >
      <p className="metadata-status">Drag or use arrows to look. The eye stays fixed.</p>
      <p className="metadata-status">Captured Earth-facing map model, not live or optical. No spacecraft attitude is inferred.</p>
      <details className="context-details">
        <summary>Model &amp; source</summary>
        <dl className="details-grid">
          <div className="detail-row"><dt>Object</dt><dd>{position.name}</dd></div>
          <div className="detail-row"><dt>Captured model</dt><dd>{modeledAt}</dd></div>
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
          Session-only; no follow, recording or share link.
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
