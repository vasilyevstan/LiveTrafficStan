import { useEffect, useRef, useState } from 'react'
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
import type {
  FlightRouteUnavailableReason,
  FlightRouteViewState,
} from '../domain/flightRoute'
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
  aircraftPhotoTermsUrl?: string
  vesselPhotoEnabled?: boolean
  vesselPhoto?: VesselPhotoViewState
  flightRouteEnabled?: boolean
  flightRoute?: FlightRouteViewState
  now: number
  units: UnitSystem
  historical?: boolean
  onRequestAircraftPhoto?: () => void
  onRequestVesselPhoto?: () => void
  onRequestFlightRoute?: () => void
  onShowJourney?: () => void
  journeyMessage?: string
  journeyPreparing?: boolean
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

const unavailableRouteMessage = (reason: FlightRouteUnavailableReason) => {
  switch (reason) {
    case 'invalid-identity':
      return 'Needs callsign, ICAO24, and current position.'
    case 'not-found':
      return 'No standing route for this callsign.'
    case 'implausible':
      return 'Standing route does not fit the current position.'
    case 'incomplete':
      return 'Standing route lacks an origin or destination.'
  }
}

const airportLabel = ({ name, code }: { name: string; code?: string }) =>
  code ? `${name} (${code})` : name

function FlightRouteDetails({
  state,
  now,
  onRequest,
}: {
  state: FlightRouteViewState
  now: number
  onRequest: () => void
}) {
  const invalidIdentity =
    state.phase === 'unavailable' &&
    state.reason === 'invalid-identity'
  const loading = state.phase === 'loading'
  const retryAt =
    state.phase === 'error' || state.phase === 'available'
      ? state.retryAt
      : undefined
  const coolingDown =
    retryAt !== undefined && retryAt > now
  const source =
    state.phase === 'available'
      ? state.route.source
      : {
          name: 'ADSB.lol',
          websiteUrl: 'https://www.adsb.lol/',
        }
  const actionLabel =
    state.phase === 'available'
      ? coolingDown
        ? 'Refresh later'
        : 'Refresh'
      : state.phase === 'unavailable' && !invalidIdentity
        ? 'Try again'
        : state.phase === 'error'
          ? coolingDown
            ? 'Retry later'
            : 'Try again'
          : undefined

  return (
    <section
      className="flight-route"
      aria-labelledby="flight-route-heading"
    >
      <div className="flight-route__heading">
        <h3 id="flight-route-heading">Plausible route</h3>
        {actionLabel && (
          <button
            type="button"
            className="flight-route__action"
            disabled={coolingDown}
            onClick={onRequest}
          >
            {actionLabel}
          </button>
        )}
      </div>
      {(state.phase === 'idle' || loading) && (
        <p className="metadata-status" role="status">
          Checking route…
        </p>
      )}
      {state.phase === 'available' && (
        <>
          <dl className="details-grid aircraft-metadata__grid">
            <DetailRow
              label="Plausible origin"
              value={airportLabel(state.route.departure)}
            />
            <DetailRow
              label="Plausible destination"
              value={airportLabel(state.route.arrival)}
            />
            {state.route.providerUpdatedAt !== undefined && (
              <DetailRow
                label="Standing data age"
                value={formatAge(state.route.providerUpdatedAt, now)}
              />
            )}
          </dl>
          <p className="metadata-status">
            Standing-data estimate; not a filed plan and may be wrong.
          </p>
          {coolingDown && (
            <p className="metadata-status">
              Refresh after {formatTimestamp(retryAt)}.
            </p>
          )}
        </>
      )}
      {state.phase === 'unavailable' && (
        <p className="metadata-status">
          Route unavailable: {unavailableRouteMessage(state.reason)}
        </p>
      )}
      {state.phase === 'error' && (
        <p className="metadata-status metadata-status--error" role="alert">
          {state.reason === 'quota-exhausted'
            ? 'Route lookups limited.'
            : 'Route lookup unavailable.'}{' '}
          {coolingDown
            ? `Retry after ${formatTimestamp(retryAt)}. `
            : ''}
          Live traffic unaffected.
        </p>
      )}
      <p className="metadata-attribution">
        <a href={source.websiteUrl}>{source.name}</a> ·{' '}
        <a href="https://github.com/vradarserver/standing-data">
          VRS Standing Data
        </a>
      </p>
    </section>
  )
}

const aircraftPhotoErrorMessage = (
  state: Extract<AircraftPhotoViewState, { phase: 'error' }>,
  now: number,
) => {
  switch (state.reason) {
    case 'timeout':
      return 'The Planespotters photo request timed out.'
    case 'throttled':
      return state.retryAt !== undefined && state.retryAt > now
        ? `Planespotters is temporarily limiting requests. Try again after ${formatTimestamp(state.retryAt)}.`
        : 'Planespotters is temporarily limiting requests. Try again later.'
    case 'forbidden':
      return 'Planespotters rejected this browser request.'
    case 'invalid-response':
      return 'Planespotters returned an unsupported photo response.'
    case 'network':
      return 'The browser could not reach Planespotters.'
    case 'provider-error':
      return 'Planespotters could not provide a photo response.'
  }
}

function AircraftPhotoDetails({
  icao24,
  state,
  termsUrl,
  now,
  onRequest,
}: {
  icao24: string
  state: AircraftPhotoViewState
  termsUrl: string
  now: number
  onRequest: () => void
}) {
  const identity = state.identityKey ?? icao24.trim().toUpperCase()
  const loading = state.phase === 'loading'
  const invalidIdentity =
    state.phase === 'unavailable' &&
    state.reason === 'invalid-identity'
  const throttled =
    state.phase === 'error' &&
    state.reason === 'throttled' &&
    state.retryAt !== undefined &&
    state.retryAt > now

  return (
    <section
      className="aircraft-metadata aircraft-photo"
      aria-labelledby="aircraft-photo-heading"
    >
      <h3 id="aircraft-photo-heading">Aircraft photo</h3>

      {state.phase === 'available' ? (
        <>
          <p className="metadata-status">
            Planespotters match for ICAO24 {state.photo.icao24}.
          </p>
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
              alt={`Aircraft photo returned by Planespotters for ICAO24 ${state.photo.icao24}`}
              loading="lazy"
              decoding="async"
            />
          </a>
          <p className="metadata-attribution aircraft-photo__credit">
            Photo © {state.photo.photographer} ·{' '}
            <a href={state.photo.source.websiteUrl}>
              {state.photo.source.name}
            </a>
            {' · '}Open image for original.
          </p>
        </>
      ) : (
        <>
          <p className="metadata-status">Photo lookup sends ICAO24 to Planespotters.</p>
          <details className="context-details">
            <summary>Photo privacy &amp; terms</summary>
            <p className="metadata-status">
              Planespotters receives ICAO24 {identity || 'unavailable'} plus
              normal network metadata; its CDN serves the image. JSON cache:
              this tab, 1 hour; image bytes not stored.{' '}
              <a href={termsUrl}>Terms</a>.
            </p>
          </details>
          {loading && (
            <p className="metadata-status" role="status">
              Loading photo…
            </p>
          )}
          {state.phase === 'unavailable' && (
            <p className="metadata-status">
              {invalidIdentity
                ? 'Photo needs a valid six-character ICAO24.'
                : `No exact photo for ICAO24 ${identity}; no substitute shown.`}
            </p>
          )}
          {state.phase === 'error' && (
            <p
              className="metadata-status metadata-status--error"
              role="alert"
            >
              {aircraftPhotoErrorMessage(state, now)} Live ADS-B remains
              active.
            </p>
          )}
          <button
            type="button"
            className="aircraft-photo__action"
            disabled={loading || invalidIdentity || throttled}
            onClick={onRequest}
          >
            {loading
              ? 'Loading photo…'
              : invalidIdentity
                ? 'Photo unavailable'
                : throttled
                  ? 'Try again later'
                  : state.phase === 'idle'
                    ? 'Load photo'
                    : 'Try again'}
          </button>
        </>
      )}
    </section>
  )
}

function VesselPhotoDetails({
  photo,
}: {
  photo: VesselReferencePhoto | DynamicVesselPhoto
}) {
  const [failed, setFailed] = useState(false)
  const dynamic = 'lookupNumber' in photo
  const number = dynamic ? photo.lookupNumber : photo.imo
  const pageUrl = dynamic ? photo.pageUrl : photo.identityEvidence.commonsRevisionUrl
  const licenseUrl = dynamic ? photo.licenseUrl : photo.rights.licenseUrl
  const license = dynamic ? photo.license : photo.rights.licenseName
  return (
    <section
      className="vessel-photo"
      aria-labelledby={`vessel-photo-heading-${number}`}
    >
      <h3 id={`vessel-photo-heading-${number}`}>
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
  aircraftPhotoTermsUrl =
    'https://www.planespotters.net/photo/api',
  flightRouteEnabled = false,
  flightRoute = { phase: 'idle' },
  now,
  units,
  historical = false,
  onRequestAircraftPhoto = () => undefined,
  onRequestVesselPhoto = () => undefined,
  onRequestFlightRoute = () => undefined,
  onShowJourney,
  journeyMessage,
  journeyPreparing = false,
  onClose,
}: TrafficDetailsProps) {
  const panelRef = useRef<HTMLDivElement>(null)
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

  return (
    <DetailsPanel
      panelRef={panelRef}
      className={historical ? 'details-panel--historical' : undefined}
      titleId="selected-traffic-title"
      closeLabel={`Close ${historical ? 'historical ' : ''}${
        entity.kind === 'aircraft' ? 'aircraft' : 'ship'
      } details`}
      onClose={onClose}
      heading={
        <div>
          <p className="eyebrow">
            {historical ? 'Historical ' : 'Selected '}
            {entity.kind === 'aircraft' ? 'aircraft' : 'ship'}
          </p>
          <div className="details-panel__identity">
            <h2 id="selected-traffic-title" title={title}>{title}</h2>
            {!historical && onShowJourney && (
              <div className="journey-action">
                <button type="button" onClick={onShowJourney} disabled={journeyPreparing}>
                  {journeyPreparing ? 'Loading path...' : 'Show path'}
                </button>
              </div>
            )}
          </div>
        </div>
      }
    >
      {!historical && journeyMessage && (
        <p className="metadata-status" role="status">{journeyMessage}</p>
      )}

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

      {entity.kind === 'aircraft' &&
        flightRouteEnabled &&
        !historical && (
          <FlightRouteDetails
            state={flightRoute}
            now={now}
            onRequest={onRequestFlightRoute}
          />
        )}

      {entity.kind === 'aircraft' &&
        aircraftPhotoEnabled &&
        !historical && (
          <AircraftPhotoDetails
            icao24={entity.hex}
            state={aircraftPhoto}
            termsUrl={aircraftPhotoTermsUrl}
            now={now}
            onRequest={onRequestAircraftPhoto}
          />
        )}

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
