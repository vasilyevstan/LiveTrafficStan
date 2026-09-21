import type { UnitSystem } from '../domain/units'
import {
  AIRCRAFT_ALTITUDE_BANDS,
  aircraftAltitudeBandLabel,
  aircraftAltitudeBandCode,
  aircraftVerticalTrendLabel,
  vesselMotionLabel,
  type AircraftVerticalTrend,
  type VesselMotionState,
} from '../domain/trafficPresentation'

interface TrafficLegendProps {
  units: UnitSystem
  marineStaleAfterMs: number
}

const verticalTrendCode: Record<AircraftVerticalTrend, string> = {
  climb: 'UP',
  descent: 'DN',
  small: 'BAR',
  unknown: '?',
}

const verticalTrendOrder: AircraftVerticalTrend[] = [
  'climb',
  'descent',
  'small',
  'unknown',
]

const vesselMotionCode: Record<VesselMotionState, string> = {
  moving: 'GO',
  'slow-stopped': 'BAR',
  unknown: '?',
}

const vesselMotionOrder: VesselMotionState[] = [
  'moving',
  'slow-stopped',
  'unknown',
]

export function TrafficLegend({
  units,
  marineStaleAfterMs,
}: TrafficLegendProps) {
  const freshnessSeconds = marineStaleAfterMs / 1_000

  return (
    <section
      className="control-group traffic-legend"
      aria-labelledby="traffic-legend-heading"
    >
      <p id="traffic-legend-heading" className="eyebrow">
        Traffic legend
      </p>

      <div className="traffic-legend__section">
        <h3>Aircraft altitude rings</h3>
        <ul className="traffic-legend__list">
          {AIRCRAFT_ALTITUDE_BANDS.map((band) => (
            <li key={band}>
              <span
                className={`traffic-legend__ring traffic-legend__ring--${band}`}
                aria-hidden="true"
              >
                {aircraftAltitudeBandCode(band)}
              </span>
              <span>{aircraftAltitudeBandLabel(band, units)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="traffic-legend__section">
        <h3>Aircraft trend badges</h3>
        <ul className="traffic-legend__list">
          {verticalTrendOrder.map((trend) => (
            <li key={trend}>
              <span className="traffic-legend__badge" aria-hidden="true">
                {verticalTrendCode[trend]}
              </span>
              <span>{aircraftVerticalTrendLabel(trend)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="traffic-legend__section">
        <h3>Ship movement badges</h3>
        <ul className="traffic-legend__list">
          {vesselMotionOrder.map((state) => (
            <li key={state}>
              <span className="traffic-legend__badge" aria-hidden="true">
                {vesselMotionCode[state]}
              </span>
              <span>{vesselMotionLabel(state)}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="control-note control-note--muted">
        Aircraft silhouettes reflect reported type metadata. Rings encode
        reported barometric altitude; badges encode reported vertical trend.
        Stale markers fade, while the selection halo is not a traffic state.
      </p>
      <p className="control-note control-note--muted">
        Sailing, pleasure, and high-speed silhouettes require those exact
        reported AIS types. Other ships retain their reported category shape.
        Only moving silhouettes follow course. Navigation status stays
        separate from measured movement.
      </p>
      <p className="control-note control-note--muted">
        Moving sailing and pleasure craft are eligible from 8 m at 1 kn or
        faster while observations are no more than {freshnessSeconds} seconds
        old. Unknown, stale, and future observations are excluded from that
        yacht exception.
      </p>
      <p className="control-note control-note--muted">
        AIR and SEA count circles group eligible traffic; expand them to see
        individual shapes and badges.
      </p>
    </section>
  )
}
