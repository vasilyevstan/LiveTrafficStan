import { formatAge } from '../domain/format'
import {
  WEATHER_OBSERVATION_RESULT_LIMIT,
  weatherObservationSummary,
  type DisplayWeatherObservation,
} from '../domain/weatherObservations'

interface WeatherContextProps {
  observations: readonly DisplayWeatherObservation[]
  selectedObservationId: string | null
  emptyMessage: string
  now: number
  onSelect: (id: string) => void
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
        <p>Observed aviation weather; not a forecast.</p>
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
              <button
                id={`weather-context-result-${observation.id}`}
                type="button"
                aria-pressed={observation.id === selectedObservationId}
                onClick={() => onSelect(observation.id)}
              >
                <strong>{weatherObservationSummary(observation)}</strong>
                <span>
                  {observation.siteName} ·{' '}
                  {formatAge(observation.observedAt, now)}
                  {observation.freshness === 'stale' ? ' · stale' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {observations.length > WEATHER_OBSERVATION_RESULT_LIMIT && (
        <p className="control-note control-note--muted">
          Showing the first {WEATHER_OBSERVATION_RESULT_LIMIT} of{' '}
          {observations.length} observations in this view.
        </p>
      )}
    </fieldset>
  )
}
