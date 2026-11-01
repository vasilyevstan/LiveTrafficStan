import { useId, type ReactNode } from 'react'
import { DetailsPanel } from './DetailsPanel'
import { formatAltitude } from '../domain/format'
import { orbitalFeatureOwner, orbitalObjectTypeLabel, type ModeledOrbitalPosition } from '../domain/orbital'
import type { CapturedOrbitalView } from '../domain/orbitalView'
import type { UnitSystem } from '../domain/units'
import { APP_CONFIG } from '../config/appConfig'
import { DetailActionIcon } from './DetailActionIcon'

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
  shareObject?: ReactNode
  onReturn: () => void
  onTogglePlaying: () => void
}

export function CapturedOrbitalDetails({ view, ready, localTrafficAvailable = false, groundTrafficSuppressed = false, playing, position: displayedPosition, notice, statusMessage, online, units, shareObject, onReturn, onTogglePlaying }: Props) {
  const titleId = useId()
  const { snapshot } = view
  const position = displayedPosition ?? view.position
  const modeledAt = new Date(position.modeledFor).toISOString()
  const nativeGp = snapshot.sourceProvider === 'space-track'
  return (
    <DetailsPanel
      titleId={titleId}
      className="details-panel--orbital-view details-panel--compact-actions"
      closeLabel="Return to map"
      onClose={onReturn}
      headerAction={shareObject}
      mobileActionPlacement="header-always"
      actionRow={<>
        <button
          type="button"
          className="details-panel__icon-action"
          aria-label={playing ? 'Pause modeled view' : 'Play modeled view'}
          title={playing ? 'Pause' : 'Play'}
          disabled={!ready}
          onClick={onTogglePlaying}
        >
          <DetailActionIcon name={playing ? 'pause' : 'play'} />
        </button>
        <button
          type="button"
          className="details-panel__icon-action"
          aria-label="Return to map"
          title="Return"
          onClick={onReturn}
        >
          <DetailActionIcon name="return" />
        </button>
      </>}
      heading={
        <div className="orbital-view-heading">
          <h2 id={titleId} title={`Modeled 3D view from ${position.name}`}>From {position.name}</h2>
          <p className="metadata-status" role="status">
            {!ready ? 'Preparing modeled view...' : notice ?? <span aria-live="off">
              {playing ? 'Modeled' : 'Paused'} <time dateTime={modeledAt} title={modeledAt}>{modeledAt.slice(11, 19)} UTC</time>
              {' · '}{formatAltitude(position.altitudeKm * 1_000, units)}
            </span>}
          </p>
        </div>
      }
    >
      <p className="metadata-status">
        {position.travelBearingDegrees === undefined
          ? 'Travel direction unavailable. Drag or use arrows to look.'
          : 'Travel-relative look. Drag or use arrows; Pause holds the view.'}
      </p>
      <p className="metadata-status">Modeled Earth, not live or optical. No spacecraft attitude is inferred.</p>
      <p className="metadata-status">
        {localTrafficAvailable
          ? `Previous local area: ground markers only.${groundTrafficSuppressed ? ' Hidden at this scale.' : ''}`
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
          Approximate Earth map. Day/night shading uses the displayed modeled time, not optical visibility.
        </p>
        <p className="metadata-status">
          Real-time modeled motion; high orbits can appear still.
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
