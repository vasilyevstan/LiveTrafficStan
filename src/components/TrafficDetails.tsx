import {
  formatAge,
  formatAltitude,
  formatDimension,
  formatHeading,
  formatSpeed,
  formatTimestamp,
  formatVerticalSpeed,
} from '../domain/format'
import type {
  AircraftMetadataUnavailableReason,
  AircraftMetadataViewState,
} from '../domain/aircraftMetadata'
import type { DisplayTrafficEntity } from '../domain/traffic'
import type { UnitSystem } from '../domain/units'

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
  aircraftMetadata: AircraftMetadataViewState
  now: number
  units: UnitSystem
  historical?: boolean
  onClose: () => void
}

const unavailableMetadataMessage = (
  reason: AircraftMetadataUnavailableReason,
  state: AircraftMetadataViewState,
) => {
  switch (reason) {
    case 'not-found':
      return 'No current database record exists for this ICAO24 address.'
    case 'ambiguous':
      return 'The database registration is duplicated, so this record is not safe to show.'
    case 'registration-conflict':
      return 'The database record does not match the live registration.'
    case 'type-conflict':
      return 'The database record does not match the live aircraft type.'
    case 'invalid-identity':
      return 'The live ICAO24 identity is not valid for metadata lookup.'
    case 'stale':
      return `The database snapshot exceeded its ${
        state.phase === 'unavailable'
          ? (state.metadata?.staleAfterDays ?? 'configured')
          : 'configured'
      }-day publication-age limit.`
    case 'future':
      return `The database snapshot is more than ${
        state.phase === 'unavailable'
          ? (state.metadata?.futureToleranceHours ?? 'the configured number of')
          : 'the configured number of'
      } hours ahead of this device clock.`
  }
}

const wakeCategoryLabel = (wakeCategory: string) => {
  switch (wakeCategory) {
    case 'L':
      return 'L · light'
    case 'M':
      return 'M · medium'
    case 'H':
      return 'H · heavy'
    case 'J':
      return 'J · super'
    default:
      return wakeCategory
  }
}

function AircraftMetadataDetails({
  state,
}: {
  state: AircraftMetadataViewState
}) {
  if (state.phase === 'idle') return null

  const source =
    state.phase === 'available'
      ? state.metadata.source
      : state.phase === 'unavailable'
        ? state.metadata?.source
        : undefined

  return (
    <section
      className="aircraft-metadata"
      aria-labelledby="aircraft-metadata-heading"
    >
      <h3 id="aircraft-metadata-heading">Aircraft metadata</h3>
      {state.phase === 'loading' && (
        <p className="metadata-status">Loading selected-aircraft metadata…</p>
      )}
      {state.phase === 'error' && (
        <p className="metadata-status metadata-status--error">
          Metadata unavailable: {state.message}. Live ADS-B remains active.
        </p>
      )}
      {state.phase === 'unavailable' && (
        <p className="metadata-status">
          Metadata unavailable:{' '}
          {unavailableMetadataMessage(state.reason, state)}
        </p>
      )}
      {state.phase === 'available' && (
        <dl className="details-grid aircraft-metadata__grid">
          <div className="detail-row">
            <dt>Model description</dt>
            <dd>{state.metadata.modelDescription}</dd>
          </div>
          <div className="detail-row">
            <dt>Database registration</dt>
            <dd>{state.metadata.databaseRegistration}</dd>
          </div>
          <div className="detail-row">
            <dt>Type designator</dt>
            <dd>{state.metadata.typeCode}</dd>
          </div>
          {state.metadata.configuration && (
            <div className="detail-row">
              <dt>Configuration code</dt>
              <dd>{state.metadata.configuration}</dd>
            </div>
          )}
          {state.metadata.wakeCategory && (
            <div className="detail-row">
              <dt>Wake category</dt>
              <dd>{wakeCategoryLabel(state.metadata.wakeCategory)}</dd>
            </div>
          )}
          <div className="detail-row">
            <dt>Match confidence</dt>
            <dd>
              {state.metadata.confidence === 'registration-verified'
                ? 'ICAO24 and live registration verified'
                : 'ICAO24 only · live registration unavailable'}
            </dd>
          </div>
        </dl>
      )}
      {source && (
        <p className="metadata-attribution">
          Snapshot {source.publishedAt.slice(0, 10)} ·{' '}
          <a href={source.repositoryUrl}>Mictronics aircraft-database</a>{' '}
          derivative under <a href={source.licenseUrl}>ODC-By 1.0</a>.
          Publication age is not per-aircraft verification age.
        </p>
      )}
    </section>
  )
}

export function TrafficDetails({
  entity,
  aircraftMetadata,
  now,
  units,
  historical = false,
  onClose,
}: TrafficDetailsProps) {
  const title =
    entity.kind === 'aircraft'
      ? (entity.callsign ?? entity.registration ?? entity.hex)
      : (entity.name ?? `MMSI ${entity.mmsi}`)
  const direction = entity.courseDegrees ?? entity.headingDegrees

  return (
    <aside
      className={`details-panel${
        historical ? ' details-panel--historical' : ''
      }`}
      aria-labelledby="selected-traffic-title"
    >
      <div className="details-panel__heading">
        <div>
          <p className="eyebrow">
            {historical ? 'Historical ' : 'Selected '}
            {entity.kind === 'aircraft' ? 'aircraft' : 'ship'}
          </p>
          <h2 id="selected-traffic-title">{title}</h2>
        </div>
        <button type="button" className="close-button" onClick={onClose}>
          Close
        </button>
      </div>

      {entity.freshness === 'stale' && (
        <p className="stale-notice">
          {historical
            ? 'Position was stale at this historical cursor'
            : 'Position is temporarily stale'}
        </p>
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
                  : formatAltitude(entity.altitudeMeters, units)
              }
            />
            <DetailRow
              label="Ground speed"
              value={
                entity.speedKph === undefined
                  ? undefined
                  : formatSpeed(entity.speedKph, units)
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
                  : formatVerticalSpeed(entity.verticalSpeedMps, units)
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
                  : formatSpeed(entity.speedKph, units)
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
            <DetailRow
              label="AIS-reported destination"
              value={entity.destination}
            />
            <DetailRow
              label="AIS ETA (year not supplied)"
              value={entity.eta}
            />
            <DetailRow
              label="Metadata report"
              value={
                entity.metadataObservedAt === undefined
                  ? 'Unavailable'
                  : `${formatTimestamp(entity.metadataObservedAt)} (${formatAge(
                      entity.metadataObservedAt,
                      now,
                    )})`
              }
            />
          </>
        )}
        <DetailRow
          label={
            entity.kind === 'vessel' ? 'Position report' : 'Last report'
          }
          value={`${formatTimestamp(entity.position.observedAt)} (${formatAge(
            entity.position.observedAt,
            now,
          )})`}
        />
        <DetailRow label="Source" value={entity.provider} />
      </dl>
      {entity.kind === 'aircraft' && (
        <AircraftMetadataDetails state={aircraftMetadata} />
      )}
      {historical && (
        <p className="metadata-attribution">
          Historical provider observation. Current weather and third-party
          aircraft metadata are intentionally not joined to this time.
        </p>
      )}
      {entity.kind === 'vessel' && (
        <p className="metadata-attribution">
          AIS static and voyage fields are reported separately from position
          updates. Values are shown as supplied; no ETA year or port
          relationship is inferred.
        </p>
      )}
    </aside>
  )
}
