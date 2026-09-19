import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  WEATHER_OBSERVATION_RESULT_LIMIT,
  type DisplayWeatherObservation,
} from '../domain/weatherObservations'
import { WeatherContext } from './WeatherContext'

const observation = (index: number): DisplayWeatherObservation => ({
  id: `weather:EE${String(index).padStart(2, 'A')}`,
  stationId: `EE${String(index).padStart(2, 'A')}`.slice(0, 4),
  siteName: `Station ${index}`,
  longitude: 24.75,
  latitude: 59.44,
  observedAt: 100_000,
  reportType: 'METAR',
  flightCategory: index === 0 ? 'MVFR' : 'VFR',
  rawObservation: `METAR fixture ${index}`,
  freshness: index === 0 ? 'stale' : 'current',
})

describe('WeatherContext', () => {
  it('shows category, source age, stale status, and selection accessibly', () => {
    const html = renderToStaticMarkup(
      <WeatherContext
        observations={[observation(0)]}
        selectedObservationId={observation(0).id}
        emptyMessage="No observations"
        now={160_000}
        onSelect={() => undefined}
      />,
    )

    expect(html).toContain('METAR observations in this view')
    expect(html).toContain('MVFR')
    expect(html).toContain('1 min ago')
    expect(html).toContain('stale')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('not a forecast')
  })

  it('bounds the keyboard list and preserves an explicit empty state', () => {
    const observations = Array.from(
      { length: WEATHER_OBSERVATION_RESULT_LIMIT + 2 },
      (_, index) => observation(index),
    )
    const html = renderToStaticMarkup(
      <WeatherContext
        observations={observations}
        selectedObservationId={null}
        emptyMessage="No recent reports"
        now={160_000}
        onSelect={() => undefined}
      />,
    )
    expect((html.match(/<li>/g) ?? [])).toHaveLength(
      WEATHER_OBSERVATION_RESULT_LIMIT,
    )
    expect(html).toContain(
      `Showing the first ${WEATHER_OBSERVATION_RESULT_LIMIT}`,
    )

    const empty = renderToStaticMarkup(
      <WeatherContext
        observations={[]}
        selectedObservationId={null}
        emptyMessage="No recent reports"
        now={160_000}
        onSelect={() => undefined}
      />,
    )
    expect(empty).toContain('No recent reports')
  })
})
