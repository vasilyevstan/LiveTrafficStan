import {
  airportKindLabel,
  type Airport,
  type AirportSource,
} from '../domain/airports'
import type { AirportBoardProvider } from '../providers/airportBoards/airportBoardProvider'
import { AirportBoard } from './AirportBoard'
import { DetailsPanel } from './DetailsPanel'

interface AirportDetailsProps {
  airport: Airport
  source: AirportSource
  coordinatePrecision: number
  onClose: () => void
  board?: {
    provider: AirportBoardProvider
    now: number
    online: boolean
    historical: boolean
  }
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

export function AirportDetails({
  airport,
  source,
  coordinatePrecision,
  onClose,
  board,
}: AirportDetailsProps) {
  return (
    <DetailsPanel
      className={board && !board.historical ? 'details-panel--airport-board' : undefined}
      titleId="selected-airport-title"
      closeLabel="Close airport details"
      onClose={onClose}
    >
      <div className="details-panel__heading">
        <div>
          <p className="eyebrow">Selected airport</p>
          <h2 id="selected-airport-title" title={airport.name}>{airport.name}</h2>
        </div>
      </div>

      {board && <AirportBoard airportIcao={airport.icaoCode} {...board} />}
      {board && <h3 className="airport-facts-title">Airport facts</h3>}
      <dl className="details-grid">
        <DetailRow label="Category" value={airportKindLabel(airport.kind)} />
        <DetailRow label="ICAO code" value={airport.icaoCode} />
        <DetailRow label="IATA code" value={airport.iataCode} />
        <DetailRow label="OurAirports ID" value={airport.id} />
        <DetailRow label="Ident" value={airport.ident} />
        <DetailRow label="Municipality" value={airport.municipality} />
        <DetailRow label="ISO country code" value={airport.isoCountry} />
        <DetailRow
          label="Coordinates"
          value={`${airport.latitude.toFixed(coordinatePrecision)}, ${airport.longitude.toFixed(coordinatePrecision)}`}
        />
      </dl>

      <p className="metadata-status">
        Static, incomplete context; not for navigation. No status, schedule,
        route, or aircraft link inferred.
      </p>
      <p className="metadata-attribution">
        <a href={source.repositoryUrl}>{source.name}</a> ·{' '}
        {source.commit.slice(0, 12)} · {source.publishedAt.slice(0, 10)} ·{' '}
        <a href={source.termsUrl}>{source.licenseName}</a> ·{' '}
        {source.outputVersion}.
      </p>
    </DetailsPanel>
  )
}
