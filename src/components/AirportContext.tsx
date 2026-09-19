import {
  AIRPORT_RESULT_LIMIT,
  airportKindLabel,
  type Airport,
} from '../domain/airports'

interface AirportContextProps {
  airports: readonly Airport[]
  selectedAirportId: string | null
  emptyMessage: string
  onSelect: (id: string) => void
}

const airportCodes = (airport: Airport) =>
  [
    airport.icaoCode ? `ICAO ${airport.icaoCode}` : undefined,
    airport.iataCode ? `IATA ${airport.iataCode}` : undefined,
    airport.ident !== airport.icaoCode ? `Ident ${airport.ident}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

export function AirportContext({
  airports,
  selectedAirportId,
  emptyMessage,
  onSelect,
}: AirportContextProps) {
  const listedAirports = airports.slice(0, AIRPORT_RESULT_LIMIT)

  return (
    <fieldset className="control-group vessel-discovery airport-context">
      <legend>Airports in this view</legend>
      <div className="vessel-discovery__summary">
        <p role="status">
          {airports.length} airport{airports.length === 1 ? '' : 's'} in view
        </p>
        <p>Static large and medium airport context.</p>
      </div>

      {airports.length === 0 ? (
        <p className="control-note" role="status">
          {emptyMessage}
        </p>
      ) : (
        <ul
          className="vessel-results airport-results"
          aria-label="Airports in this view"
        >
          {listedAirports.map((airport) => (
            <li key={airport.id}>
              <button
                id={`airport-context-result-${airport.id}`}
                type="button"
                aria-pressed={airport.id === selectedAirportId}
                onClick={() => onSelect(airport.id)}
              >
                <strong>{airport.name}</strong>
                <span>
                  {[airportKindLabel(airport.kind), airportCodes(airport)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {airports.length > AIRPORT_RESULT_LIMIT && (
        <p className="control-note control-note--muted">
          Showing the first {AIRPORT_RESULT_LIMIT} of {airports.length}{' '}
          airports in this view.
        </p>
      )}
    </fieldset>
  )
}
