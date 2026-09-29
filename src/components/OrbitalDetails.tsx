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
import type { UnitSystem } from '../domain/units'

interface OrbitalDetailsProps {
  position: ModeledOrbitalPosition
  crossing?: OrbitalCrossing
  snapshot: OrbitalCatalogSnapshot
  sourceName: string
  sourceWebsiteUrl: string
  sourceUsagePolicyUrl: string
  now: number
  units: UnitSystem
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

export function OrbitalDetails({
  position,
  crossing,
  snapshot,
  sourceName,
  sourceWebsiteUrl,
  sourceUsagePolicyUrl,
  now,
  units,
  onClose,
}: OrbitalDetailsProps) {
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
