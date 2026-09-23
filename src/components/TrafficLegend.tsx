import type { UnitSystem } from '../domain/units'
import {
  AIRCRAFT_ALTITUDE_BANDS,
  aircraftAltitudeBandLabel,
  vesselMotionLabel,
} from '../domain/trafficPresentation'

interface TrafficLegendProps {
  units: UnitSystem
  marineStaleAfterMs: number
}

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
        <h3>Aircraft altitude colors</h3>
        <ul className="traffic-legend__list">
          {AIRCRAFT_ALTITUDE_BANDS.map((band) => (
            <li key={band}>
              <span
                className={`traffic-legend__aircraft traffic-legend__aircraft--${band}`}
                aria-hidden="true"
              >
                AIR
              </span>
              <span>{aircraftAltitudeBandLabel(band, units)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="traffic-legend__section">
        <h3>Shapes and movement</h3>
        <ul className="traffic-legend__list">
          <li>
            <span
              className="traffic-legend__shape traffic-legend__shape--aircraft"
              aria-hidden="true"
            >
              AIR
            </span>
            <span>Winged silhouettes are aircraft.</span>
          </li>
          <li>
            <span
              className="traffic-legend__shape traffic-legend__shape--vessel"
              aria-hidden="true"
            >
              SHIP
            </span>
            <span>Long hull silhouettes are vessels.</span>
          </li>
          <li>
            <span className="traffic-legend__stopped" aria-hidden="true" />
            <span>{vesselMotionLabel('slow-stopped')}</span>
          </li>
        </ul>
      </div>

      <p className="control-note control-note--muted">
        Aircraft silhouettes reflect reported type metadata, and their color
        encodes reported barometric altitude. Selected details retain the
        reported vertical trend. Stale markers fade, while the neutral
        selection halo is not a traffic state.
      </p>
      <p className="control-note control-note--muted">
        Generic, cargo, tanker, passenger, fishing, exact AIS type-52 tug,
        sailing, pleasure, and high-speed vessels use distinct silhouettes.
        Sailing, pleasure, and high-speed shapes also require their exact
        reported AIS types. Other service codes remain generic. A red dot marks
        valid reported speed below 1 kn for either traffic kind. Unknown speed
        stays neutral; only moving ship silhouettes follow course. Navigation
        status stays separate from measured movement.
      </p>
      <p className="control-note control-note--muted">
        Mouse hover uses already-loaded callsign, reported aircraft type and
        altitude, vessel name, MMSI-derived flag, speed over ground in km/h and
        knots, and AIS destination. When aircraft photos are enabled, a stable
        aircraft hover can make one direct Planespotters lookup after a brief
        delay; vessel hover and route or metadata details make no additional
        request.
      </p>
      <p className="control-note control-note--muted">
        Moving sailing and pleasure craft are eligible from 8 m at 1 kn or
        faster while observations are no more than {freshnessSeconds} seconds
        old. Unknown, stale, and future observations are excluded from that
        yacht exception.
      </p>
      <p className="control-note control-note--muted">
        AIR and SEA count circles group eligible traffic; expand them to see
        individual shapes and stopped markers.
      </p>
    </section>
  )
}
