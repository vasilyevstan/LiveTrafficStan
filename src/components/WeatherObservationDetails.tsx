import {
  formatAge,
  formatSpeed,
  formatTimestamp,
  formatWeatherVisibility,
} from '../domain/format'
import type { UnitSystem } from '../domain/units'
import {
  flightCategoryLabel,
  type DisplayWeatherObservation,
  type WeatherObservationSource,
} from '../domain/weatherObservations'

interface WeatherObservationDetailsProps {
  observation: DisplayWeatherObservation
  source: WeatherObservationSource
  retrievedAt: number
  now: number
  units: UnitSystem
  onClose: () => void
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

const decimal = (value: number | undefined, suffix: string) =>
  value === undefined ? undefined : `${value.toFixed(1)} ${suffix}`

const wind = (
  observation: DisplayWeatherObservation,
  units: UnitSystem,
) => {
  if (
    observation.windDirection === undefined &&
    observation.windSpeedKph === undefined
  ) {
    return undefined
  }
  const direction =
    observation.windDirection === undefined
      ? 'Direction unavailable'
      : observation.windDirection === 'VRB'
        ? 'Variable'
        : `${observation.windDirection} deg`
  const speed =
    observation.windSpeedKph === undefined
      ? 'speed unavailable'
      : formatSpeed(observation.windSpeedKph, units)
  const gust =
    observation.windGustKph === undefined
      ? ''
      : `, gusting ${formatSpeed(observation.windGustKph, units)}`
  return `${direction}, ${speed}${gust}`
}

export function WeatherObservationDetails({
  observation,
  source,
  retrievedAt,
  now,
  units,
  onClose,
}: WeatherObservationDetailsProps) {
  return (
    <aside
      className="details-panel"
      aria-labelledby="selected-weather-title"
    >
      <div className="details-panel__heading">
        <div>
          <p className="eyebrow">Selected METAR observation</p>
          <h2 id="selected-weather-title">
            {observation.stationId} ·{' '}
            {flightCategoryLabel(observation.flightCategory)}
          </h2>
        </div>
        <button type="button" className="close-button" onClick={onClose}>
          Close
        </button>
      </div>

      <dl className="details-grid">
        <DetailRow label="Station" value={observation.siteName} />
        <DetailRow label="Report type" value={observation.reportType} />
        <DetailRow
          label="Observed"
          value={`${formatTimestamp(observation.observedAt)} (${formatAge(
            observation.observedAt,
            now,
          )})`}
        />
        <DetailRow
          label="Retrieved"
          value={`${formatTimestamp(retrievedAt)} (${formatAge(
            retrievedAt,
            now,
          )})`}
        />
        <DetailRow
          label="Temperature"
          value={decimal(observation.temperatureCelsius, 'C')}
        />
        <DetailRow
          label="Dewpoint"
          value={decimal(observation.dewpointCelsius, 'C')}
        />
        <DetailRow label="Wind" value={wind(observation, units)} />
        <DetailRow
          label="Visibility"
          value={
            observation.visibility === undefined
              ? undefined
              : formatWeatherVisibility(observation.visibility, units)
          }
        />
        <DetailRow
          label="Altimeter"
          value={decimal(observation.altimeterHpa, 'hPa')}
        />
        <DetailRow
          label="Coordinates"
          value={`${observation.latitude.toFixed(3)}, ${observation.longitude.toFixed(3)}`}
        />
      </dl>

      <p className="metadata-status">
        {observation.rawObservation}
      </p>
      <p className="metadata-status">
        Observed aviation weather only. Do not infer a forecast, airport
        operation, route, arrival, departure, or coverage guarantee.
      </p>
      <p className="metadata-attribution">
        <a href={source.apiUrl}>{source.name}</a> ·{' '}
        <a href={source.documentationUrl}>API documentation</a> ·{' '}
        <a href={source.termsUrl}>{source.licenseName}</a>.
      </p>
    </aside>
  )
}
