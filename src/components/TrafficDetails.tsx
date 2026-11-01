import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { DetailsPanel } from './DetailsPanel'
import {
  formatAge,
  formatAltitude,
  formatDimension,
  formatHeading,
  formatSpeed,
  formatTimestamp,
  formatVerticalSpeed,
  formatVesselSpeed,
} from '../domain/format'
import {
  countryForAircraftHex,
  flagStateForMmsi,
  formatCountryAllocation,
} from '../domain/countryAllocations'
import type {
  AircraftMetadataUnavailableReason,
  AircraftMetadataViewState,
} from '../domain/aircraftMetadata'
import type { AircraftPhotoViewState } from '../domain/aircraftPhoto'
import type { FlightRouteViewState } from '../domain/flightRoute'
import type { DisplayTrafficEntity } from '../domain/traffic'
import {
  aircraftAltitudeBandLabel,
  aircraftVerticalTrendLabel,
  trafficPresentation,
  vesselMotionLabel,
} from '../domain/trafficPresentation'
import type { UnitSystem } from '../domain/units'
import {
  vesselReferencePhotoSelection,
  dynamicVesselPhotoForSelection,
  vesselPhotoIdentity,
  vesselPhotoIdentityKey,
  type DynamicVesselPhoto,
  type VesselPhotoIdentity,
  type VesselPhotoViewState,
  type VesselReferencePhoto,
  type VesselReferencePhotoSelection,
} from '../domain/vesselPhoto'
import { DetailActionIcon } from './DetailActionIcon'

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
  aircraftPhotoEnabled?: boolean
  aircraftPhoto?: AircraftPhotoViewState
  vesselPhotoEnabled?: boolean
  vesselPhoto?: VesselPhotoViewState
  flightRouteEnabled?: boolean
  flightRoute?: FlightRouteViewState
  now: number
  units: UnitSystem
  historical?: boolean
  onRequestVesselPhoto?: () => void
  onShowJourney?: () => void
  journeyMessage?: string
  onViewFromHere?: () => void
  viewFromHereUnavailable?: string
  journeyPreparing?: boolean
  shareObject?: ReactNode
  onClose: () => void
}

const unavailableMetadataMessage = (
  reason: AircraftMetadataUnavailableReason,
  state: AircraftMetadataViewState,
) => {
  switch (reason) {
    case 'not-found':
      return 'No record for this ICAO24.'
    case 'ambiguous':
      return 'Duplicate registration; record hidden.'
    case 'registration-conflict':
      return 'Database/live registration mismatch.'
    case 'type-conflict':
      return 'Database/live type mismatch.'
    case 'invalid-identity':
      return 'Invalid ICAO24 for metadata.'
    case 'stale':
      return `Snapshot exceeds the ${
        state.phase === 'unavailable'
          ? (state.metadata?.staleAfterDays ?? 'configured')
          : 'configured'
      }-day age limit.`
    case 'future':
      return `Snapshot is over ${
        state.phase === 'unavailable'
          ? (state.metadata?.futureToleranceHours ?? 'the configured number of')
          : 'the configured number of'
      } hours ahead of this clock.`
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
        <p className="metadata-status">Loading metadata…</p>
      )}
      {state.phase === 'error' && (
        <p className="metadata-status metadata-status--error">
          Metadata unavailable: {state.message}. ADS-B remains live.
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
          <a href={source.repositoryUrl}>Mictronics</a>{' '}
          · <a href={source.licenseUrl}>ODC-By 1.0</a>
        </p>
      )}
      {source && (
        <details className="context-details">
          <summary>Metadata source &amp; match</summary>
          <p className="metadata-attribution">
            Mictronics aircraft-database · database age is not aircraft verification.
          </p>
        </details>
      )}
    </section>
  )
}

const airportLabel = ({ name, code }: { name: string; code?: string }) =>
  code ? `${name} (${code})` : name

function FlightRouteDetails({ state }: { state: FlightRouteViewState }) {
  if (state.phase !== 'available') return null
  return (
    <section
      className="flight-route"
      aria-label="Plausible route"
    >
      <dl className="details-grid aircraft-metadata__grid">
        <DetailRow label="Departure" value={airportLabel(state.route.departure)} />
        <DetailRow label="Destination" value={airportLabel(state.route.arrival)} />
      </dl>
    </section>
  )
}

function AircraftPhotoDetails({ state }: { state: AircraftPhotoViewState }) {
  if (state.phase !== 'available') return null
  return (
    <figure
      className="aircraft-metadata aircraft-photo"
    >
      <a
        className="aircraft-photo__link"
        href={state.photo.photoPageUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          className="aircraft-photo__image"
          src={state.photo.thumbnailUrl}
          width={state.photo.thumbnailWidth}
          height={state.photo.thumbnailHeight}
          alt={`Aircraft ${state.photo.icao24}`}
          loading="eager"
          decoding="async"
        />
      </a>
      <figcaption className="metadata-attribution aircraft-photo__credit">
        © {state.photo.photographer} ·{' '}
        <a href={state.photo.source.websiteUrl}>{state.photo.source.name}</a>
      </figcaption>
    </figure>
  )
}

function VesselPhotoDetails({
  photo,
}: {
  photo: VesselReferencePhoto | DynamicVesselPhoto
}) {
  const headingId = useId()
  const [failed, setFailed] = useState(false)
  const dynamic = 'lookupNumber' in photo
  const number = dynamic ? photo.lookupNumber : photo.imo
  const pageUrl = dynamic ? photo.pageUrl : photo.identityEvidence.commonsRevisionUrl
  const licenseUrl = dynamic ? photo.licenseUrl : photo.rights.licenseUrl
  const license = dynamic ? photo.license : photo.rights.licenseName
  return (
    <section
      className="vessel-photo"
      aria-labelledby={headingId}
    >
      <h3 id={headingId}>
        Vessel photo
      </h3>
      <p className="metadata-status">
        {dynamic
          ? `Open Waters photo lookup for reported ${photo.lookupKind} ${number}.`
          : `Exact AIS-reported IMO ${number} match.`}
      </p>
      <a
        className="vessel-photo__link"
        href={pageUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {!failed && <img
          className="vessel-photo__image"
          crossOrigin={dynamic ? 'anonymous' : undefined}
          src={dynamic ? photo.thumbnailUrl : photo.asset.path}
          width={dynamic ? photo.width : photo.asset.width}
          height={dynamic ? photo.height : photo.asset.height}
          alt={dynamic ? photo.description ?? `Vessel image listed for ${photo.lookupKind} ${number}` : photo.alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />}
        {failed && <span className="metadata-status metadata-status--error">Image failed to load. Open its source page.</span>}
      </a>
      <details className="context-details">
        <summary>Photo credits &amp; license</summary>
      <p className="metadata-attribution vessel-photo__credit">
        {dynamic ? photo.artist : photo.rights.author} ·{' '}
        <a
          href={pageUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {dynamic ? 'Wikimedia Commons via Open Waters' : photo.rights.sourceName}
        </a>
        {' · '}
        {licenseUrl ? <a
          href={licenseUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {license}
        </a> : license}
        {!dynamic && <> · {photo.asset.modificationNotice}</>}
      </p>
      </details>
      <p className="metadata-status">
        Historical reference only; not live confirmation.
      </p>
      {dynamic && photo.lookupKind === 'MMSI' && (
        <p className="metadata-status">
          MMSIs can be reassigned; not verified hull identity.
        </p>
      )}
    </section>
  )
}

function DynamicVesselPhotoStatus({
  identity, state, now, onRequest,
}: {
  identity: VesselPhotoIdentity | undefined
  state: VesselPhotoViewState
  now: number
  onRequest: () => void
}) {
  const current = identity && state.identityKey === vesselPhotoIdentityKey(identity)
    ? state : { phase: 'idle' } as const
  const throttled = current.phase === 'error' &&
    current.retryAt !== undefined && current.retryAt > now
  return (
    <section className="vessel-photo" aria-labelledby="vessel-photo-heading">
      <h3 id="vessel-photo-heading">Vessel photo</h3>
      <p className="metadata-status" role={current.phase === 'loading' ? 'status' : undefined}>
        {!identity ? 'No usable IMO or ordinary MMSI for photo lookup.'
          : current.phase === 'loading' ? 'Loading vessel photo from Open Waters…'
            : current.phase === 'unavailable' ? `Open Waters returned no photo for ${identity.kind} ${identity.number}; no substitute shown.`
              : 'Vessel-number lookup: Open Waters / Wikimedia Commons.'}
      </p>
      {current.phase === 'error' && (
        <p className="metadata-status metadata-status--error" role="alert">
          {throttled && current.retryAt !== undefined ? `Photo lookup can retry after ${formatTimestamp(current.retryAt)}.`
            : current.reason === 'invalid-response' ? 'No supported, attributed photo in the source response.'
              : current.reason === 'timeout' ? 'Vessel photo lookup timed out.'
                : current.reason === 'network' ? 'Vessel photos need an online connection.'
                : 'Vessel photo lookup is temporarily unavailable.'} Traffic data is unchanged.
        </p>
      )}
      {identity && <button
        type="button"
        className="aircraft-photo__action"
        disabled={current.phase === 'loading' || throttled}
        onClick={onRequest}
      >
        {current.phase === 'loading' ? 'Loading photo…' : throttled ? 'Try again later' : 'Try photo lookup'}
      </button>}
    </section>
  )
}

function VesselPhotoUnavailable({
  selection,
}: {
  selection: Exclude<
    VesselReferencePhotoSelection,
    { kind: 'available' }
  >
}) {
  return (
    <section className="vessel-photo" aria-labelledby="vessel-photo-heading">
      <h3 id="vessel-photo-heading">Vessel photo</h3>
      <p className="metadata-status">
        {selection.kind === 'invalid-imo'
          ? 'Unavailable: AIS has no valid IMO for exact-hull matching.'
          : `No reviewed exact-IMO photo for AIS-reported IMO ${selection.imo}; no substitute shown.`}
      </p>
    </section>
  )
}

export function TrafficDetails({
  entity,
  aircraftMetadata,
  aircraftPhotoEnabled = false,
  aircraftPhoto = { phase: 'idle' },
  vesselPhotoEnabled = false,
  vesselPhoto = { phase: 'idle' },
  flightRouteEnabled = false,
  flightRoute = { phase: 'idle' },
  now,
  units,
  historical = false,
  onRequestVesselPhoto = () => undefined,
  onShowJourney,
  journeyMessage,
  journeyPreparing = false,
  onViewFromHere,
  viewFromHereUnavailable,
  shareObject,
  onClose,
}: TrafficDetailsProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const viewReasonId = useId()
  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0
  }, [entity.id])

  const title =
    entity.kind === 'aircraft'
      ? (entity.callsign ?? entity.registration ?? entity.hex)
      : (entity.name ?? `MMSI ${entity.mmsi}`)
  const direction = entity.courseDegrees ?? entity.headingDegrees
  const countryAllocation =
    entity.kind === 'aircraft'
      ? countryForAircraftHex(entity.hex)
      : flagStateForMmsi(entity.mmsi)
  const presentation = trafficPresentation(entity)
  const vesselPhotoSelection =
    entity.kind === 'vessel' && !historical
      ? vesselReferencePhotoSelection(entity)
      : undefined
  const dynamicVesselPhoto = entity.kind === 'vessel' && !historical && vesselPhotoEnabled
    ? dynamicVesselPhotoForSelection(entity, vesselPhoto) : undefined
  const aircraftEnrichmentAvailable =
    entity.kind === 'aircraft' &&
    !historical &&
    (flightRouteEnabled && flightRoute.phase === 'available' ||
      aircraftPhotoEnabled && aircraftPhoto.phase === 'available')
  const aircraftEnrichment = aircraftEnrichmentAvailable ? (
    <div className="traffic-details__enrichment">
      {flightRouteEnabled && <FlightRouteDetails state={flightRoute} />}
      {aircraftPhotoEnabled && <AircraftPhotoDetails state={aircraftPhoto} />}
    </div>
  ) : null
  const vesselEnrichment = (
    <>
      {vesselPhotoSelection?.kind === 'available' && (
        <VesselPhotoDetails
          key={vesselPhotoSelection.photo.identityKey}
          photo={vesselPhotoSelection.photo}
        />
      )}
      {vesselPhotoSelection &&
        vesselPhotoSelection.kind !== 'available' && (
          dynamicVesselPhoto ? <VesselPhotoDetails
            key={`${vesselPhoto.identityKey}|${dynamicVesselPhoto.thumbnailUrl}`}
            photo={dynamicVesselPhoto}
          /> : vesselPhotoEnabled && entity.kind === 'vessel' ? <DynamicVesselPhotoStatus
            identity={vesselPhotoIdentity(entity)}
            state={vesselPhoto}
            now={now}
            onRequest={onRequestVesselPhoto}
          /> : <VesselPhotoUnavailable
            selection={vesselPhotoSelection}
          />
        )}

    </>
  )

  return (
    <DetailsPanel
      panelRef={panelRef}
      className={historical ? 'details-panel--historical' : 'details-panel--traffic-actions'}
      titleId="selected-traffic-title"
      closeLabel={`Close ${historical ? 'historical ' : ''}${
        entity.kind === 'aircraft' ? 'aircraft' : 'ship'
      } details`}
      onClose={onClose}
      headerAction={!historical ? shareObject : undefined}
      mobileActionPlacement="header"
      actionRow={!historical ? <>
        {onShowJourney && (
          <button type="button" className="traffic-details__icon-action traffic-details__path-action"
            aria-label={journeyPreparing ? 'Loading path' : 'Show path'}
            title={journeyPreparing ? 'Loading path' : 'Show path'}
            aria-busy={journeyPreparing || undefined}
            onClick={onShowJourney} disabled={journeyPreparing}>
            <DetailActionIcon name="path" />
          </button>
        )}
        {entity.kind === 'aircraft' && onViewFromHere && (
          <button type="button"
            className="traffic-details__icon-action orbital-view-entry"
            aria-label="View from here"
            title="View from here"
            data-aircraft-view-entry={entity.id}
            onClick={onViewFromHere} disabled={Boolean(viewFromHereUnavailable)}
            aria-describedby={viewFromHereUnavailable ? viewReasonId : undefined}>
            <DetailActionIcon name="view" />
          </button>
        )}
      </> : undefined}
      heading={
        <div>
          <p className="eyebrow">
            {historical ? 'Historical ' : 'Selected '}
            {entity.kind === 'aircraft' ? 'aircraft' : 'ship'}
          </p>
          <div className="details-panel__identity">
            <h2 id="selected-traffic-title" title={title}>{title}</h2>
          </div>
        </div>
      }
    >
      {!historical && journeyMessage && (
        <p className="metadata-status" role="status">{journeyMessage}</p>
      )}
      {!historical && entity.kind === 'aircraft' && onViewFromHere && viewFromHereUnavailable && (
        <p id={viewReasonId} className="metadata-status">{viewFromHereUnavailable}</p>
      )}

      {entity.freshness === 'stale' && (
        <p className="stale-notice">
          {historical
            ? 'Position was stale at this historical cursor'
            : 'Position is temporarily stale'}
        </p>
      )}

      {aircraftEnrichment}

      <dl className="details-grid">
        {entity.kind === 'aircraft' ? (
          <>
            <DetailRow label="Callsign" value={entity.callsign} />
            <DetailRow label="Registration" value={entity.registration} />
            <DetailRow label="ICAO hex" value={entity.hex} />
            <DetailRow
              label="Registration allocation"
              value={
                countryAllocation === undefined
                  ? undefined
                  : formatCountryAllocation(countryAllocation)
              }
            />
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
              label="Reported altitude band"
              value={
                presentation.kind === 'aircraft'
                  ? aircraftAltitudeBandLabel(
                      presentation.altitudeBand,
                      units,
                    )
                  : undefined
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
            <DetailRow
              label="Vertical trend"
              value={
                presentation.kind === 'aircraft'
                  ? aircraftVerticalTrendLabel(
                      presentation.verticalTrend,
                    )
                  : undefined
              }
            />
            <DetailRow label="Squawk" value={entity.squawk} />
          </>
        ) : (
          <>
            <DetailRow label="Vessel name" value={entity.name} />
            <DetailRow label="Vessel type" value={entity.vesselType} />
            <DetailRow label="MMSI" value={entity.mmsi} />
            <DetailRow
              label="Flag state"
              value={
                countryAllocation === undefined
                  ? undefined
                  : formatCountryAllocation(countryAllocation)
              }
            />
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
                  : formatVesselSpeed(entity.speedKph)
              }
            />
            <DetailRow
              label="Reported movement"
              value={
                presentation.kind === 'vessel'
                  ? vesselMotionLabel(presentation.motionState)
                  : undefined
              }
            />
            <DetailRow
              label="Heading (bow)"
              value={
                entity.headingDegrees === undefined
                  ? undefined
                  : formatHeading(entity.headingDegrees)
              }
            />
            <DetailRow
              label="Course over ground"
              value={
                entity.courseDegrees === undefined
                  ? undefined
                  : formatHeading(entity.courseDegrees)
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
      {vesselEnrichment}
      {entity.kind === 'vessel' && entity.attribution && (
        <details className="context-details">
          <summary>Contributing source credits</summary>
          <p className="metadata-attribution">{entity.attribution}</p>
        </details>
      )}
      {presentation.kind === 'vessel' &&
        presentation.navigationConflict && (
          <p className="metadata-status metadata-status--error">
            Speed and navigation status conflict; shown as reported.
          </p>
        )}
      {entity.kind === 'aircraft' && (
        <AircraftMetadataDetails state={aircraftMetadata} />
      )}
      {historical && (
        <p className="metadata-attribution">
          Historical provider report; current weather/metadata not joined.
        </p>
      )}
      {entity.kind === 'vessel' && (
        <p className="metadata-attribution">
          AIS static/voyage data may lag position; no ETA year or port link
          inferred.
        </p>
      )}
    </DetailsPanel>
  )
}
