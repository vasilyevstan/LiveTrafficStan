import { useEffect, useRef } from 'react'
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
  flightRouteEnabled?: boolean
  flightRoute?: FlightRouteViewState
  now: number
  units: UnitSystem
  historical?: boolean
  onRequestAircraftPhoto?: () => void
  onRequestFlightRoute?: () => void
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

const unavailableRouteMessage = (reason: FlightRouteUnavailableReason) => {
  switch (reason) {
    case 'invalid-identity':
      return 'A valid ICAO flight callsign, ICAO24 address, and current position are required.'
    case 'not-found':
      return 'No standing route is available for this callsign.'
    case 'implausible':
      return 'The standing route does not fit the aircraft’s current position.'
    case 'incomplete':
      return 'The standing route does not contain both an origin and destination.'
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

  return (
    <section
      className="flight-route"
      aria-labelledby="flight-route-heading"
    >
      <div className="flight-route__heading">
        <h3 id="flight-route-heading">Plausible route</h3>
        <button
          type="button"
          className="flight-route__action"
          disabled={loading || invalidIdentity || coolingDown}
          onClick={onRequest}
        >
          {loading
            ? 'Checking route…'
            : invalidIdentity
              ? 'Route lookup unavailable'
              : coolingDown
                ? 'Try again later'
                : state.phase === 'available'
                  ? 'Refresh plausible route'
                  : 'Find plausible route'}
        </button>
      </div>
      {state.phase === 'idle' && (
        <p className="metadata-status">
          Check one callsign-based standing route against the aircraft’s
          current position.
        </p>
      )}
      {loading && (
        <p className="metadata-status" role="status">
          Checking a plausible route…
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
            <DetailRow
              label="Flight"
              value={state.route.flightIcao}
            />
            <DetailRow label="Route status" value="Plausible" />
            {state.route.providerUpdatedAt !== undefined && (
              <DetailRow
                label="Standing-data file last modified"
                value={formatAge(state.route.providerUpdatedAt, now)}
              />
            )}
          </dl>
          <p className="metadata-status">
            This callsign standing-data route was checked against the
            aircraft’s current position. It may be stale or wrong and is not
            a filed flight plan, schedule, date-specific departure or arrival,
            diversion, or operational status. Reopening this exact flight
            reuses it in this tab for up to 6 hours.
          </p>
          {coolingDown && (
            <p className="metadata-status">
              Refresh is available after{' '}
              {formatTimestamp(retryAt)}.
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
            ? 'ADSB.lol is temporarily limiting route lookups.'
            : state.reason === 'configuration'
              ? 'Route lookup is temporarily unavailable.'
              : 'The route provider is unavailable.'}{' '}
          {coolingDown
            ? `Try again after ${formatTimestamp(retryAt)}. `
            : ''}
          Live ADS-B remains active.
        </p>
      )}
      <p className="metadata-attribution">
        Plausible route data by{' '}
        <a href={source.websiteUrl}>{source.name}</a> using{' '}
        <a href="https://github.com/vradarserver/standing-data">
          VRS Standing Data
        </a>
        . Map positions continue to come from ADSB.lol.
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
            Photo returned by Planespotters for ICAO24 {state.photo.icao24}.
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
            Photo © {state.photo.photographer} via{' '}
            <a href={state.photo.source.websiteUrl}>
              {state.photo.source.name}
            </a>
            . Open the image for its unchanged original photo page.
          </p>
        </>
      ) : (
        <>
          <p className="metadata-status">
            Loading sends ICAO24 {identity || 'unavailable'} and normal
            browser network metadata directly to Planespotters. Its returned
            thumbnail loads directly from the provider CDN. LiveTrafficStan
            keeps API JSON only in this tab for at most one hour and does not
            store image bytes. <a href={termsUrl}>Photo API terms</a>.
          </p>
          {loading && (
            <p className="metadata-status" role="status">
              Loading the selected-aircraft photo…
            </p>
          )}
          {state.phase === 'unavailable' && (
            <p className="metadata-status">
              {invalidIdentity
                ? 'Photo lookup requires a valid six-character ICAO24 address.'
                : `Planespotters returned no photo for ICAO24 ${identity}. No generic or model-level substitute is shown.`}
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
              ? 'Loading aircraft photo…'
              : invalidIdentity
                ? 'Aircraft photo unavailable'
                : throttled
                  ? 'Try again later'
                  : state.phase === 'idle'
                    ? 'Load aircraft photo'
                    : 'Try again'}
          </button>
        </>
      )}
    </section>
  )
}

export function TrafficDetails({
  entity,
  aircraftMetadata,
  aircraftPhotoEnabled = false,
  aircraftPhoto = { phase: 'idle' },
  aircraftPhotoTermsUrl =
    'https://www.planespotters.net/photo/api',
  flightRouteEnabled = false,
  flightRoute = { phase: 'idle' },
  now,
  units,
  historical = false,
  onRequestAircraftPhoto = () => undefined,
  onRequestFlightRoute = () => undefined,
  onClose,
}: TrafficDetailsProps) {
  const panelRef = useRef<HTMLElement>(null)
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

  return (
    <aside
      ref={panelRef}
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

      {entity.kind === 'aircraft' &&
        flightRouteEnabled &&
        !historical && (
          <FlightRouteDetails
            state={flightRoute}
            now={now}
            onRequest={onRequestFlightRoute}
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
      {presentation.kind === 'vessel' &&
        presentation.navigationConflict && (
          <p className="metadata-status metadata-status--error">
            Reported speed and navigation status disagree; both values are
            shown without reclassification.
          </p>
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
