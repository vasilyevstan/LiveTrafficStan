import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DisplayTrain } from '../domain/trains'
import { TrainDetails } from './TrainDetails'

const base: DisplayTrain = {
  id: 'train:fintraffic:2026-11-14:9',
  sourceId: 'fintraffic',
  name: 'IC 9',
  category: 'long-distance',
  operator: 'VR',
  longitude: 24.9412,
  latitude: 60.1712,
  observedAt: 100_000,
  speedKph: 120,
  courseDegrees: 12.4,
  courseOrigin: 'derived',
  freshness: 'current',
}

const render = (train: DisplayTrain, now = 110_000) => renderToStaticMarkup(
  <TrainDetails train={train} receivedAt={105_000} lagNoticeAfterMs={60_000}
    now={now} units="metric" onClose={() => undefined} />,
)

describe('TrainDetails', () => {
  it('shows Elron number, route, schedule, delay and last stop with operator-map attribution', () => {
    const html = render({
      ...base, id: 'train:elron:2026-11-14:106', sourceId: 'elron',
      name: 'Elron 106', category: 'passenger', operator: 'Elron', trainNumber: '106',
      line: 'Tallinn - Tartu', origin: 'Tallinn', destination: 'Tartu',
      scheduledDepartureAt: Date.parse('2026-11-14T18:34:00Z'),
      scheduledArrivalAt: Date.parse('2026-11-14T21:22:00Z'),
      delayMinutes: 2, lastStop: 'Kärkna',
      speedKph: undefined, courseDegrees: undefined, courseOrigin: undefined,
    })
    for (const text of [
      'Elron 106', 'Train number', '106', 'From', 'Tallinn', 'Destination', 'Tartu',
      '20:34 EET', '23:22 EET', '2 min late', 'Last stop', 'Kärkna',
      'public Elron (AS Eesti Liinirongid) train map', 'not an official API',
      'No published open-data licence', 'https://elron.ee/en/kasutustingimused',
      'No passenger GPS is collected by TrackStan', 'Unavailable; shown as a dot',
    ]) expect(html).toContain(text)
    expect(html).not.toContain('CC BY 4.0')
  })

  it('formats schedule times in the source zone and never invents a delay', () => {
    const html = render({
      ...base, sourceId: 'mbta', delayMinutes: undefined,
      scheduledDepartureAt: Date.parse('2026-07-14T18:34:00Z'),
    })
    expect(html).toContain('14:34 EDT')
    expect(html).not.toContain('Delay')
    expect(render({ ...base, delayMinutes: 0 })).toContain('On time')
    expect(render({ ...base, delayMinutes: -3 })).toContain('3 min early')
  })

  it('shows reported facts, derived course origin, clocks, and attribution', () => {
    const html = render(base)
    expect(html).toContain('Long-distance passenger')
    expect(html).toContain('IC 9')
    expect(html).toContain('120 km/h')
    expect(html).toContain('12 deg · from two observed positions')
    expect(html).toContain('Observed')
    expect(html).toContain('Received')
    expect(html).toContain('60.171, 24.941')
    expect(html).toContain('CC BY 4.0')
    expect(html).toContain('Source: Fintraffic / digitraffic.fi, license CC 4.0 BY')
    expect(html).toContain('not predicted, scheduled, or snapped to track')
    expect(html).not.toContain('MTA reports may lag')
  })

  it('never invents course or speed and discloses stale and lagging MTA reports', () => {
    const html = render({
      ...base,
      id: 'train:lirr:1',
      sourceId: 'lirr',
      speedKph: undefined,
      courseDegrees: undefined,
      courseOrigin: undefined,
      freshness: 'stale',
    }, 200_000)
    expect(html).toContain('Unavailable; shown as a dot')
    expect(html).not.toContain('Speed')
    expect(html).toContain('Stale report')
    expect(html).toContain('MTA reports may lag; this position was observed 2 min ago.')
    expect(html).toContain('not endorsed by the MTA')
  })
})
