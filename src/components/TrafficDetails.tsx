import {
  formatAge,
  formatAltitude,
  formatDimension,
  formatHeading,
  formatSpeed,
  formatTimestamp,
  formatVerticalSpeed,
} from '../domain/format'
import type { DisplayTrafficEntity } from '../domain/traffic'

interface DetailRowProps {
  label: string
  value: string | number | undefined
}

function DetailRow({ label, value }: DetailRowProps) {
  if (value === undefined || value === '') return null

  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

interface TrafficDetailsProps {
  entity: DisplayTrafficEntity
  now: number
  onClose: () => void
}

export function TrafficDetails({
  entity,
  now,
  onClose,
}: TrafficDetailsProps) {
  const title =
    entity.kind === 'aircraft'
      ? (entity.callsign ?? entity.registration ?? entity.hex)
      : (entity.name ?? `MMSI ${entity.mmsi}`)
  const direction = entity.courseDegrees ?? entity.headingDegrees

  return (
    <aside
      className="details-panel"
      aria-labelledby="selected-traffic-title"
    >
      <div className="details-panel__heading">
        <div>
          <p className="eyebrow">
            {entity.kind === 'aircraft' ? 'Selected aircraft' : 'Selected ship'}
          </p>
          <h2 id="selected-traffic-title">{title}</h2>
        </div>
        <button type="button" className="close-button" onClick={onClose}>
          Close
        </button>
      </div>

      {entity.freshness === 'stale' && (
        <p className="stale-notice">Position is temporarily stale</p>
      )}

      <dl className="details-grid">
        {entity.kind === 'aircraft' ? (
          <>
            <DetailRow label="Callsign" value={entity.callsign} />
            <DetailRow label="Registration" value={entity.registration} />
            <DetailRow label="ICAO hex" value={entity.hex} />
            <DetailRow label="Aircraft type" value={entity.aircraftType} />
            <DetailRow label="Category" value={entity.category} />
            <DetailRow
              label="Altitude"
              value={
                entity.altitudeMeters === undefined
                  ? undefined
                  : formatAltitude(entity.altitudeMeters)
              }
            />
            <DetailRow
              label="Ground speed"
              value={
                entity.speedKph === undefined
                  ? undefined
                  : formatSpeed(entity.speedKph)
              }
            />
            <DetailRow
              label="Direction"
              value={
                direction === undefined ? undefined : formatHeading(direction)
              }
            />
            <DetailRow
              label="Vertical speed"
              value={
                entity.verticalSpeedMps === undefined
                  ? undefined
                  : formatVerticalSpeed(entity.verticalSpeedMps)
              }
            />
            <DetailRow label="Squawk" value={entity.squawk} />
          </>
        ) : (
          <>
            <DetailRow label="Vessel name" value={entity.name} />
            <DetailRow label="Vessel type" value={entity.vesselType} />
            <DetailRow label="MMSI" value={entity.mmsi} />
            <DetailRow label="IMO" value={entity.imo} />
            <DetailRow label="Call sign" value={entity.callSign} />
            <DetailRow
              label="Length"
              value={
                entity.lengthMeters === undefined
                  ? undefined
                  : formatDimension(entity.lengthMeters)
              }
            />
            <DetailRow
              label="Width"
              value={
                entity.widthMeters === undefined
                  ? undefined
                  : formatDimension(entity.widthMeters)
              }
            />
            <DetailRow
              label="Draught"
              value={
                entity.draughtMeters === undefined
                  ? undefined
                  : formatDimension(entity.draughtMeters)
              }
            />
            <DetailRow
              label="Speed over ground"
              value={
                entity.speedKph === undefined
                  ? undefined
                  : formatSpeed(entity.speedKph)
              }
            />
            <DetailRow
              label="Course / heading"
              value={
                direction === undefined ? undefined : formatHeading(direction)
              }
            />
            <DetailRow
              label="Navigation status"
              value={entity.navigationStatus}
            />
            <DetailRow label="Destination" value={entity.destination} />
            <DetailRow label="ETA" value={entity.eta} />
          </>
        )}
        <DetailRow
          label="Last report"
          value={`${formatTimestamp(entity.position.observedAt)} (${formatAge(
            entity.position.observedAt,
            now,
          )})`}
        />
        <DetailRow label="Source" value={entity.provider} />
      </dl>
    </aside>
  )
}
