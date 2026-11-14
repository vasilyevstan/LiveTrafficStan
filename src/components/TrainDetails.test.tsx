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
