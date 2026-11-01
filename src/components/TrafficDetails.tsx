import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import type { AircraftMetadataViewState } from '../domain/aircraftMetadata'
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
  type DynamicVesselPhoto,
  type VesselPhotoViewState,
  type VesselReferencePhoto,
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
  onShowJourney?: () => void
  journeyMessage?: string
  onViewFromHere?: () => void
  viewFromHereUnavailable?: string
  journeyPreparing?: boolean
  shareObject?: ReactNode
  onClose: () => void
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
  if (state.phase !== 'available') return null

  const { source } = state.metadata

  return (
    <section
      className="aircraft-metadata"
      aria-labelledby="aircraft-metadata-heading"
    >
      <h3 id="aircraft-metadata-heading">Aircraft metadata</h3>
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
      <p className="metadata-attribution">
        Snapshot {source.publishedAt.slice(0, 10)} ·{' '}
        <a href={source.repositoryUrl}>Mictronics</a>{' '}
        · <a href={source.licenseUrl}>ODC-By 1.0</a>
      </p>
      <details className="context-details">
        <summary>Metadata source &amp; match</summary>
        <p className="metadata-attribution">
          Mictronics aircraft-database · database age is not aircraft verification.
        </p>
      </details>
    </section>
  )
}

const airportLabel = ({ name, code }: { name: string; code?: string }) =>
  code ? `${name} (${code})` : name

interface TrafficPhotoProps {
  href: string
  src: string
  width?: number
  height?: number
  alt: string
  title?: string
  loading: 'eager' | 'lazy'
  crossOrigin?: 'anonymous'
  referrerPolicy?: 'no-referrer'
  credit: ReactNode
}

function TrafficPhoto({ href, title, credit, ...image }: TrafficPhotoProps) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <figure className="traffic-photo">
      <a
        className="traffic-photo__link"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
      >
        <img
          className="traffic-photo__image"
          {...image}
          decoding="async"
          onError={() => setFailed(true)}
        />
      </a>
      <figcaption className="metadata-attribution traffic-photo__credit">
        {credit}
      </figcaption>
    </figure>
  )
}

function TrafficRoute({
  label,
  rows,
}: {
  label: string
  rows: ReadonlyArray<readonly [string, string | undefined]>
}) {
  if (!rows.some(([, value]) => value)) return null
  return (
    <section className="traffic-route" aria-label={label}>
      <dl className="details-grid">
        {rows.map(([rowLabel, value]) => (
          <DetailRow key={rowLabel} label={rowLabel} value={value} />
        ))}
      </dl>
    </section>
  )
}

function AircraftPhotoDetails({
  photo,
}: {
  photo: Extract<AircraftPhotoViewState, { phase: 'available' }>['photo']
}) {
  return (
    <TrafficPhoto
      href={photo.photoPageUrl}
      src={photo.thumbnailUrl}
      width={photo.thumbnailWidth}
      height={photo.thumbnailHeight}
      alt={`Aircraft ${photo.icao24}`}
      loading="eager"
      credit={<>
        © {photo.photographer} ·{' '}
        <a href={photo.source.websiteUrl}>{photo.source.name}</a>
      </>}
    />
  )
}

function VesselPhotoDetails({
  photo,
}: {
  photo: VesselReferencePhoto | DynamicVesselPhoto
}) {
  const dynamic = 'lookupNumber' in photo
  const pageUrl = dynamic ? photo.pageUrl : photo.identityEvidence.commonsRevisionUrl
  const licenseUrl = dynamic ? photo.licenseUrl : photo.rights.licenseUrl
  const license = dynamic ? photo.license : photo.rights.licenseName
  const match = dynamic
    ? `Open Waters photo for reported ${photo.lookupKind} ${photo.lookupNumber}${
      photo.lookupKind === 'MMSI' ? '; MMSIs can be reassigned' : ''}`
    : `Exact AIS-reported IMO ${photo.imo} reference photo`
  return (
    <TrafficPhoto
      href={pageUrl}
      title={`${match}; not live confirmation`}
      src={dynamic ? photo.thumbnailUrl : photo.asset.path}
      width={dynamic ? photo.width : photo.asset.width}
      height={dynamic ? photo.height : photo.asset.height}
      alt={dynamic
        ? photo.description ?? `Vessel image listed for ${photo.lookupKind} ${photo.lookupNumber}`
        : photo.alt}
      loading="lazy"
      crossOrigin={dynamic ? 'anonymous' : undefined}
      referrerPolicy="no-referrer"
      credit={<>
        {dynamic ? photo.artist : photo.rights.author} ·{' '}
        <a href={pageUrl} target="_blank" rel="noopener noreferrer">
          {dynamic ? 'Wikimedia Commons via Open Waters' : photo.rights.sourceName}
        </a>
        {' · '}
        {licenseUrl ? (
          <a href={licenseUrl} target="_blank" rel="noopener noreferrer">
            {license}
          </a>
        ) : license}
        {!dynamic && <>
          {' · '}
          <abbr title={photo.asset.modificationNotice}>modified</abbr>
        </>}
      </>}
    />
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
  onShowJourney,
  journeyMessage,
  journeyPreparing = false,
  onViewFromHere,
  viewFromHereUnavailable,
  shareObject,
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
  const photo = entity.kind === 'aircraft'
    ? !historical && aircraftPhotoEnabled && aircraftPhoto.phase === 'available' && (
      <AircraftPhotoDetails
        key={`${aircraftPhoto.identityKey}|${aircraftPhoto.photo.thumbnailUrl}`}
        photo={aircraftPhoto.photo}
      />
    )
    : vesselPhotoSelection?.kind === 'available' ? (
      <VesselPhotoDetails
        key={vesselPhotoSelection.photo.identityKey}
        photo={vesselPhotoSelection.photo}
      />
    ) : dynamicVesselPhoto && (
      <VesselPhotoDetails
        key={`${vesselPhoto.identityKey}|${dynamicVesselPhoto.thumbnailUrl}`}
        photo={dynamicVesselPhoto}
      />
    )
  const route = entity.kind === 'aircraft'
    ? !historical && flightRouteEnabled && flightRoute.phase === 'available' && (
      <TrafficRoute
        label="Plausible route"
        rows={[
          ['Departure', airportLabel(flightRoute.route.departure)],
          ['Destination', airportLabel(flightRoute.route.arrival)],
        ]}
      />
    )
    : (entity.destination || entity.eta) && (
      <TrafficRoute
        label="Reported destination"
        rows={[['Destination', entity.destination], ['ETA', entity.eta]]}
      />
    )
  const enrichment = photo || route ? (
    <div className="traffic-details__enrichment">
      {photo}
      {route}
    </div>
  ) : null

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
            title={viewFromHereUnavailable ?? 'View from here'}
            data-aircraft-view-entry={entity.id}
            onClick={onViewFromHere} disabled={Boolean(viewFromHereUnavailable)}>
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
      {entity.freshness === 'stale' && (
        <p className="stale-notice">
          {historical
            ? 'Position was stale at this historical cursor'
            : 'Position is temporarily stale'}
        </p>
      )}

      {enrichment}

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
    </DetailsPanel>
  )
}
