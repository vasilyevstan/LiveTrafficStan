import { formatAge } from '../domain/format'
import {
  WEATHER_OBSERVATION_RESULT_LIMIT,
  weatherObservationSummary,
  type DisplayWeatherObservation,
} from '../domain/weatherObservations'
import { ObjectResultButton } from './ObjectResultButton'

interface WeatherContextProps {
  observations: readonly DisplayWeatherObservation[]
  selectedObservationId: string | null
  emptyMessage: string
  now: number
  onSelect: (id: string, originId: string) => void
}

export function WeatherContext({
  observations,
  selectedObservationId,
  emptyMessage,
  now,
  onSelect,
}: WeatherContextProps) {
  const listed = observations.slice(0, WEATHER_OBSERVATION_RESULT_LIMIT)

  return (
    <fieldset className="control-group vessel-discovery weather-context">
      <legend>METAR observations in this view</legend>
      <div className="vessel-discovery__summary">
        <p role="status">
          {observations.length} current observation
          {observations.length === 1 ? '' : 's'}
        </p>
        <p>Observed weather; not a forecast.</p>
      </div>

      {observations.length === 0 ? (
        <p className="control-note" role="status">
          {emptyMessage}
        </p>
      ) : (
        <ul
          className="vessel-results weather-results"
          aria-label="METAR observations in this view"
        >
          {listed.map((observation) => (
            <li key={observation.id}>
              <ObjectResultButton
                prefix="weather-context-result"
                aria-pressed={observation.id === selectedObservationId}
                onSelect={(originId) => onSelect(observation.id, originId)}
              >
                <strong>{weatherObservationSummary(observation)}</strong>
                <span>
                  {observation.siteName} ·{' '}
                  {formatAge(observation.observedAt, now)}
                  {observation.freshness === 'stale' ? ' · stale' : ''}
                </span>
              </ObjectResultButton>
            </li>
          ))}
        </ul>
      )}

      {observations.length > WEATHER_OBSERVATION_RESULT_LIMIT && (
        <p className="control-note control-note--muted">
          First {WEATHER_OBSERVATION_RESULT_LIMIT} of {observations.length}{' '}
          shown.
        </p>
      )}
    </fieldset>
  )
}
