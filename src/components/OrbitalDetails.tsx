import { useState } from 'react'
import {
  formatAge,
  formatAltitude,
  formatSpeed,
  formatTimestamp,
} from '../domain/format'
import {
  orbitalObjectTypeLabel,
  type ModeledOrbitalPosition,
  type OrbitalCatalogSnapshot,
  type OrbitalCrossing,
} from '../domain/orbital'
import {
  orbitalEnrichmentForPosition,
  type OrbitalEnrichmentView,
} from '../domain/orbitalEnrichment'
import type { UnitSystem } from '../domain/units'
import type { OrbitalEnrichmentImageState } from '../app/useOrbitalEnrichmentImage'

interface OrbitalDetailsProps {
  position: ModeledOrbitalPosition
  crossing?: OrbitalCrossing
  snapshot: OrbitalCatalogSnapshot
  sourceName: string
  sourceWebsiteUrl: string
  sourceUsagePolicyUrl: string
  now: number
  online: boolean
  units: UnitSystem
  imageState: OrbitalEnrichmentImageState
  onImageLoaded?: (path: string, url: string) => void
  onImageFailed?: (path: string) => void
  onClose: () => void
}

const DetailRow = ({
  label,
  value,
}: {
  label: string
  value: string | undefined
}) =>
  value ? (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  ) : null

const OrbitalEnrichmentDetails = ({
  enrichment,
  imageState,
  online,
  onImageLoaded,
  onImageFailed,
}: {
  enrichment: OrbitalEnrichmentView
  imageState: OrbitalEnrichmentImageState
  online: boolean
  onImageLoaded?: (path: string, url: string) => void
  onImageFailed?: (path: string) => void
}) => {
  const image = enrichment.image
  const [decodeFailed, setDecodeFailed] = useState(false)
  const matchingImageState =
    imageState.phase !== 'unavailable' &&
    imageState.identityKey === enrichment.identityKey
      ? imageState
      : undefined
  const imagePhase = !image
    ? 'unavailable'
    : decodeFailed
      ? 'error'
      : (matchingImageState?.phase ?? 'loading')

  return (
    <section
      className="orbital-enrichment"
      aria-labelledby={`orbital-enrichment-heading-${enrichment.noradCatalogId}`}
    >
      <h3
        id={`orbital-enrichment-heading-${enrichment.noradCatalogId}`}
      >
        Purpose and image
      </h3>
      {image && matchingImageState?.phase === 'available' && !decodeFailed && (
        <a
          className="orbital-enrichment__image-link"
          href={image.identityEvidence.sourcePageUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            className="orbital-enrichment__image"
            src={matchingImageState.url}
            width={image.asset.width}
            height={image.asset.height}
            alt={image.alt}
            loading="eager"
            decoding="async"
            onLoad={() => {
              onImageLoaded?.(image.asset.path, matchingImageState.url)
            }}
            onError={() => {
              setDecodeFailed(true)
              onImageFailed?.(image.asset.path)
            }}
          />
        </a>
      )}

      {imagePhase === 'loading' && (
        <p className="metadata-status" role="status">
          Loading verified{' '}
          {image?.kind === 'photograph'
            ? 'historical photograph'
            : 'object illustration'}
          …
        </p>
      )}
      <p className="orbital-enrichment__purpose">
        <strong>{enrichment.purpose.shortLabel}</strong>
        {' — '}
        {enrichment.purpose.description}
      </p>
      <p className="metadata-attribution">
        Purpose: {' '}
        <a
          href={enrichment.purpose.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {enrichment.purpose.sourceName}
        </a>
        {enrichment.purpose.sourcePublishedAt
          ? ` · published ${enrichment.purpose.sourcePublishedAt}`
          : ''}
        {' · '}source retrieved {enrichment.purpose.sourceRetrievedAt}
        {' · '}reviewed {enrichment.reviewedAt}
        {' · '}manifest {enrichment.manifestVersion}
        {' · '}exact NORAD {enrichment.noradCatalogId}.
      </p>
      {image && (
        <p className="metadata-attribution orbital-enrichment__credit">
          {image.rights.creditLine}
          {image.source.capturedAt
            ? ` · captured ${image.source.capturedAt}`
            : ''}
          {` · source retrieved ${image.source.sourceRetrievedAt}`}
          {' · '}
          <a
            href={image.rights.usagePolicyUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {image.rights.usagePolicyName}
          </a>
          {' · '}
          {image.asset.modificationNotice}
        </p>
      )}
      {imagePhase === 'available' && image && (
        <>
          <p className="metadata-status">
            {image.kind === 'photograph'
              ? 'Historical photograph'
              : 'Reviewed illustration'}
            ; not a live view of this modeled position.
          </p>
          <p className="metadata-status">
            {image.rights.restrictions}
          </p>
        </>
      )}
      {imagePhase === 'unavailable' && (
        <p className="metadata-status">
          Verified image unavailable; no substitute shown.
        </p>
      )}
      {imagePhase === 'error' && (
        <p className="metadata-status metadata-status--error" role="alert">
          {online
            ? 'Verified image failed to load.'
            : 'Verified image is unavailable offline unless already cached.'}{' '}
          Modeled orbital data remains available.
        </p>
      )}
    </section>
  )
}

export function OrbitalDetails({
  position,
  crossing,
  snapshot,
  sourceName,
  sourceWebsiteUrl,
  sourceUsagePolicyUrl,
  now,
  online,
  units,
  imageState,
  onImageLoaded,
  onImageFailed,
  onClose,
}: OrbitalDetailsProps) {
  const enrichment = orbitalEnrichmentForPosition(position)
  const crossingValue = crossing?.currentlyInView
    ? 'In the visible map now'
    : crossing?.firstCrossingAt === undefined
      ? undefined
      : formatTimestamp(crossing.firstCrossingAt)

  return (
    <aside className="details-panel" aria-labelledby="selected-orbital-title">
      <div className="details-panel__heading">
        <div>
          <p className="eyebrow">Selected orbit</p>
          <h2 id="selected-orbital-title">{position.name}</h2>
        </div>
        <button type="button" className="close-button" onClick={onClose}>
          Close
        </button>
      </div>

      <dl className="details-grid">
        <DetailRow
          label="Catalog type"
          value={orbitalObjectTypeLabel(position.objectType)}
        />
        <DetailRow label="NORAD catalog ID" value={position.noradCatalogId} />
        <DetailRow
          label="International designator"
          value={position.internationalDesignator}
        />
        <DetailRow
          label="Modeled for"
          value={`${formatTimestamp(position.modeledFor)} (${formatAge(
            position.modeledFor,
            now,
          )})`}
        />
        <DetailRow
          label="Coordinates"
          value={`${position.latitude.toFixed(3)}, ${position.longitude.toFixed(3)}`}
        />
        <DetailRow
          label="Altitude"
          value={formatAltitude(position.altitudeKm * 1_000, units)}
        />
        <DetailRow
          label="Orbital speed"
          value={formatSpeed(position.velocityKmPerSecond * 3_600, units)}
        />
        <DetailRow label="First map crossing" value={crossingValue} />
        <DetailRow
          label="Element epoch"
          value={formatTimestamp(position.elementEpoch)}
        />
        <DetailRow
          label="Catalog retrieved"
          value={`${formatTimestamp(position.snapshotRetrievedAt)} (${formatAge(
            position.snapshotRetrievedAt,
            now,
          )})`}
        />
        <DetailRow
          label="Catalog snapshot"
          value={`Schema ${snapshot.schemaVersion} · ${snapshot.sha256.slice(
            0,
            12,
          )}`}
        />
      </dl>

      {enrichment ? (
        <OrbitalEnrichmentDetails
          key={enrichment.identityKey}
          enrichment={enrichment}
          imageState={imageState}
          online={online}
          onImageLoaded={onImageLoaded}
          onImageFailed={onImageFailed}
        />
      ) : (
        <section
          className="orbital-enrichment"
          aria-labelledby="orbital-enrichment-unavailable-heading"
        >
          <h3 id="orbital-enrichment-unavailable-heading">
            Purpose and image
          </h3>
          <p className="metadata-status">
            No reviewed exact-NORAD purpose or image is bundled for this
            object. No substitute shown.
          </p>
        </section>
      )}

      <p className="metadata-status">
        SGP4 model, not live. Crossing does not prove visibility, illumination,
        or status.
      </p>
      <p className="metadata-attribution">
        <a href={sourceWebsiteUrl}>{sourceName}</a> GP/SATCAT ·{' '}
        <a href={sourceUsagePolicyUrl}>usage policy</a> · retrieved{' '}
        {snapshot.retrievedAt}.
      </p>
    </aside>
  )
}
