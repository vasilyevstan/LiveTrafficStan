import { memo, useState } from 'react'
import { useAirportBoard } from '../app/useAirportBoard'
import { AIRPORT_BOARD_CONFIG as config } from '../config/appConfig'
import {
  AIRPORT_BOARD_STATUS_LABELS,
  type AirportBoardDirection,
  type AirportBoardFlight,
  type AirportBoardState,
  type AirportBoardTime,
} from '../domain/airportBoard'
import type { AirportBoardProvider } from '../providers/airportBoards/airportBoardProvider'
import { isAirportBoardIcao } from '../providers/airportBoards/airportBoardNormalization'

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const BoardTime = ({ value }: { value?: AirportBoardTime }) => {
  if (!value) return <span>Not reported</span>
  const zone = value.local.endsWith('Z') ? 'UTC' : `UTC${value.local.slice(-6)}`
  return (
    <time dateTime={value.local}>
      {value.local.slice(11, 16)}
      <span className="airport-board__clock-context">
        {value.local.slice(8, 10)} {months[Number(value.local.slice(5, 7)) - 1]}, {zone}
      </span>
    </time>
  )
}

export const AirportBoardRows = memo(function AirportBoardRows({
  flights,
  direction,
}: {
  flights: AirportBoardFlight[] | null
  direction: AirportBoardDirection
}) {
  if (flights === null) {
    return <p className="metadata-status">No {direction} board is available for this airport and window.</p>
  }
  if (flights.length === 0) {
    return <p className="metadata-status">No {direction} were returned for this window. Coverage may be incomplete.</p>
  }
  return (
    <ul className="airport-board__rows" aria-label={direction === 'arrivals' ? 'Arrivals' : 'Departures'}>
      {flights.map((flight, index) => (
        <li key={index}>
          <div className="airport-board__flight-heading">
            <strong><bdi>{flight.number}</bdi></strong>
            <span className={`airport-board__status airport-board__status--${flight.status.toLowerCase()}`}>
              {AIRPORT_BOARD_STATUS_LABELS[flight.status]}
            </span>
          </div>
          <p className="airport-board__destination">
            {direction === 'arrivals' ? 'From ' : 'To '}
            <bdi>{flight.otherAirport?.name ?? 'airport not reported'}</bdi>
            {flight.otherAirport?.iata && <> ({flight.otherAirport.iata})</>}
          </p>
          <dl className="airport-board__times">
            <div><dt>Scheduled</dt><dd><BoardTime value={flight.scheduled} /></dd></div>
            <div><dt>Revised</dt><dd><BoardTime value={flight.revised} /></dd></div>
          </dl>
          {(flight.gate || flight.terminal) && (
            <p className="airport-board__context">
              {flight.gate && <>Gate <bdi>{flight.gate}</bdi></>}
              {flight.gate && flight.terminal && ', '}
              {flight.terminal && <>terminal <bdi>{flight.terminal}</bdi></>}
            </p>
          )}
          <p className="airport-board__context">
            {flight.airline && <><bdi>{flight.airline}</bdi>, </>}
            {flight.codeshare === 'operator' ? 'operating flight'
              : flight.codeshare === 'codeshare' ? 'codeshare' : 'codeshare status unknown'}
            {flight.cargo && ', cargo'}
          </p>
          <p className="airport-board__context">
            {flight.quality.includes('live') ? 'Live updates supplied'
              : flight.quality.includes('schedule') ? 'Schedule only' : 'Update quality unknown'}
            {flight.quality.includes('approximate') && '; includes approximate data'}
          </p>
        </li>
      ))}
    </ul>
  )
})

interface AirportBoardContentProps {
  airportIcao?: string
  state: AirportBoardState
  now: number
  online: boolean
  historical: boolean
  visible: boolean
  retryAt: number
  onRequest: () => void
}

export function AirportBoardContent({
  airportIcao,
  state,
  now,
  online,
  historical,
  visible,
  retryAt,
  onRequest,
}: AirportBoardContentProps) {
  const [direction, setDirection] = useState<AirportBoardDirection>('arrivals')
  const supported = isAirportBoardIcao(airportIcao)
  const snapshot = online && visible && !historical && 'snapshot' in state && state.snapshot &&
    now - state.snapshot.retrievedAt < config.maximumDisplayAgeMs &&
    state.snapshot.retrievedAt <= now + config.maximumClockSkewMs
    ? state.snapshot : undefined
  const empty = snapshot && (snapshot.arrivals?.length ?? 0) + (snapshot.departures?.length ?? 0) === 0
  const refreshAt = Math.max(retryAt, snapshot
    ? snapshot.retrievedAt + (empty ? config.emptyCacheTtlMs : config.cacheTtlMs) : 0)
  const waiting = refreshAt > now
  const loading = state.phase === 'loading'
  const disabled = !supported || !online || historical || !visible || loading || waiting
  const message = !supported ? 'Boards require a four-letter ICAO airport code.'
    : historical ? 'Airport boards are not historical. Return to Live to load a board.'
      : !online ? 'Offline. Connect to load an airport board.'
        : loading ? 'Loading arrivals and departures...'
          : state.phase === 'error' ? state.message
            : state.phase === 'expired' ? 'This board expired. Load it again when needed.'
              : snapshot ? 'On-demand snapshot, not a continuously refreshed board.'
                : 'Load only when needed. The free allowance is shared across the app.'

  return (
    <section className="airport-board" aria-labelledby="airport-board-title" aria-busy={loading}>
      <div className="airport-board__heading">
        <h3 id="airport-board-title" hidden={Boolean(snapshot)}>Arrivals &amp; departures</h3>
        {snapshot && (
          <div className="airport-board__directions" role="group" aria-label="Board direction">
            {(['arrivals', 'departures'] as const).map(value => (
              <button
                key={value}
                id={`airport-board-${value}`}
                type="button"
                aria-pressed={direction === value}
                onClick={() => setDirection(value)}
              >
                {value === 'arrivals' ? 'Arrivals' : 'Departures'}
                {snapshot[value] !== null && ` (${snapshot[value].length})`}
              </button>
            ))}
          </div>
        )}
        <button
          id="airport-board-load-button" type="button" onClick={onRequest} disabled={disabled}
          className={snapshot ? 'airport-board__reload' : undefined}
          aria-label={snapshot ? 'Refresh airport board' : 'Load airport board'}
          aria-describedby={snapshot ? 'airport-board-reload-guidance' : undefined}
        >
          {loading ? 'Loading...' : snapshot ? 'Reload' : 'Load board'}
        </button>
      </div>
      <p className={`metadata-status${state.phase === 'error' ? ' metadata-status--error' : ''}${snapshot && state.phase === 'ready' ? ' airport-board__announcement-only' : ''}`} role="status">
        {message}
      </p>
      {retryAt > now && !historical && online && (
        <p className="airport-board__context">
          Next attempt after{' '}
          <time dateTime={new Date(refreshAt).toISOString()}>
            {new Date(refreshAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
          </time>.
        </p>
      )}
      <p className="airport-board__context">
        <a href={config.sourceUrl} target="_blank" rel="noopener" referrerPolicy="origin">{config.sourceName}</a>
        {snapshot && (
          <>
            {' '}- retrieved <time dateTime={new Date(snapshot.retrievedAt).toISOString()}>
              {new Date(snapshot.retrievedAt).toISOString().slice(11, 16)} UTC
            </time> ({Math.max(0, Math.floor((now - snapshot.retrievedAt) / 60_000))} min).
            {' '}Source update unknown.
          </>
        )}
      </p>
      {snapshot && <AirportBoardRows flights={snapshot[direction]} direction={direction} />}
      <details className="airport-board__about">
        <summary>About this board</summary>
        <p className="airport-board__context" id="airport-board-reload-guidance">
          Shared cache up to five minutes; at most 200 uncached boards per billing month,
          before other charged work. No automatic refresh.
          {waiting && <> Refresh after {new Date(refreshAt).toISOString().slice(0, 16).replace('T', ' ')} UTC.</>}
        </p>
        <p className="airport-board__context">
          Source update time is not supplied. Retrieval time describes when this app fetched the board.
        </p>
        {snapshot && (
        <>
          <p className="airport-board__context">
            Requested at{' '}
            <time dateTime={new Date(snapshot.requestedAt).toISOString()}>
              {new Date(snapshot.requestedAt).toISOString().slice(0, 16).replace('T', ' ')}
            </time>
            {' '}UTC: the preceding hour and following five hours, relative to that request.
            Times are airport-local, with UTC offsets. Revised times may be estimated or actual,
            at the gate or runway. Codeshares may appear separately. No link to live map aircraft is inferred.
          </p>
        </>
        )}
      </details>
    </section>
  )
}

export function AirportBoard({
  airportIcao,
  provider,
  now,
  online,
  historical,
}: {
  airportIcao?: string
  provider: AirportBoardProvider
  now: number
  online: boolean
  historical: boolean
}) {
  const result = useAirportBoard(airportIcao, provider, now, online, historical)
  return (
    <AirportBoardContent
      airportIcao={airportIcao}
      state={result.state}
      now={now}
      online={online}
      historical={historical}
      visible={result.visible}
      retryAt={result.retryAt}
      onRequest={result.request}
    />
  )
}
