import { formatAge, formatSpeed, formatTimestamp } from '../domain/format'
import { trainCategoryLabel, type DisplayTrain } from '../domain/trains'
import type { UnitSystem } from '../domain/units'
import { TRAIN_SOURCES } from '../providers/rail/trainSources'
import { DetailsPanel } from './DetailsPanel'

interface TrainDetailsProps {
  train: DisplayTrain
  receivedAt?: number
  /** Report age after which a source-specific lag disclosure is shown. */
  lagNoticeAfterMs: number
  now: number
  units: UnitSystem
  onClose: () => void
}

const DetailRow = ({ label, value }: { label: string; value: string | undefined }) =>
  value ? (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  ) : null

const course = (train: DisplayTrain) =>
  train.courseDegrees === undefined
    ? 'Unavailable; shown as a dot'
    : `${Math.round(train.courseDegrees)} deg · ${
        train.courseOrigin === 'derived'
          ? 'from two observed positions'
          : 'reported by source'}`

export function TrainDetails({
  train,
  receivedAt,
  lagNoticeAfterMs,
  now,
  units,
  onClose,
}: TrainDetailsProps) {
  const source = TRAIN_SOURCES[train.sourceId]
  const lagging = train.sourceId === 'lirr' && now - train.observedAt > lagNoticeAfterMs

  return (
    <DetailsPanel
      titleId="selected-train-title"
      closeLabel="Close train details"
      onClose={onClose}
      heading={
        <div>
          <p className="eyebrow">Selected train · {trainCategoryLabel(train.category)}</p>
          <h2 id="selected-train-title">{train.name}</h2>
        </div>
      }
    >
      <dl className="details-grid">
        <DetailRow label="Line" value={train.line} />
        <DetailRow label="Destination" value={train.destination} />
        <DetailRow label="Operator" value={train.operator} />
        <DetailRow label="Vehicle" value={train.vehicleLabel} />
        <DetailRow
          label="Speed"
          value={train.speedKph === undefined ? undefined : formatSpeed(train.speedKph, units)}
        />
        <DetailRow label="Course" value={course(train)} />
        <DetailRow
          label="Observed"
          value={`${formatTimestamp(train.observedAt)} (${formatAge(train.observedAt, now)})`}
        />
        <DetailRow
          label="Received"
          value={receivedAt === undefined
            ? undefined
            : `${formatTimestamp(receivedAt)} (${formatAge(receivedAt, now)})`}
        />
        <DetailRow
          label="Coordinates"
          value={`${train.latitude.toFixed(3)}, ${train.longitude.toFixed(3)}`}
        />
      </dl>

      {train.freshness === 'stale' && (
        <p className="metadata-status" role="status">
          Stale report; the train may have moved.
        </p>
      )}
      {lagging && (
        <p className="metadata-status" role="status">
          MTA reports may lag; this position was observed {formatAge(train.observedAt, now)}.
        </p>
      )}
      <p className="metadata-status">
        Last reported position; not predicted, scheduled, or snapped to track.
      </p>
      <p className="metadata-attribution">
        <a href={source.websiteUrl} target="_blank" rel="noreferrer">{source.name}</a> ·{' '}
        <a href={source.licenseUrl} target="_blank" rel="noreferrer">{source.licenseName}</a>
      </p>
      <p className="metadata-attribution">{source.attribution}</p>
    </DetailsPanel>
  )
}
