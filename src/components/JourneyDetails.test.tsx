import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { JourneyOverview } from '../app/journeyOverview'
import { JourneyDetails } from './JourneyDetails'

const overview: JourneyOverview = {
  snapshot: {
    revision: 1, identity: 'test', title: 'Test ship', kind: 'vessel',
    capturedAt: 1_800_000_010_000,
    position: { latitude: 59, longitude: 24, observedAt: 1_800_000_000_000 },
    segments: [], endpoints: [],
    limitations: ['Departure and destination locations are unknown.'],
    sources: [{ name: 'Fintraffic Digitraffic', url: 'https://www.digitraffic.fi/' }],
  },
  returnCamera: { latitude: 59, longitude: 24, zoom: 10, pitch: 0, bearing: 0 },
  returnLabel: 'Home', fitPending: false, fitMessage: 'Explore the captured path.',
}

describe('captured journey inspector', () => {
  it('keeps timestamps, unknowns, sources, accessible X and explicit navigation without live-detail work', () => {
    const html = renderToStaticMarkup(<JourneyDetails
      overview={overview} theme="light" trafficPauseMessage="Zoom in for live traffic."
      onHide={() => undefined} onReturn={() => undefined} onClose={() => undefined}
    />)
    expect(html).toContain('Captured route overview, not live.')
    expect(html).toContain('Position reported')
    expect(html).toContain('Solid: received positions. Dashed: estimated.')
    expect(html).toContain('Departure and destination locations are unknown.')
    expect(html).toContain('Live aircraft and ships paused.')
    expect(html).toContain('Close captured route overview')
    expect(html).not.toContain('>Close<')
    expect(html).toContain('>Hide path<')
    expect(html).toContain('>Return to local view<')
    expect(html).toContain('https://www.digitraffic.fi/')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('aircraft-metadata')
  })

  it('does not describe a context-only capture as an estimated route', () => {
    const html = renderToStaticMarkup(<JourneyDetails
      overview={overview} theme="light"
      onHide={() => undefined} onReturn={() => undefined} onClose={() => undefined}
    />)
    const defaultBody = html.split('<details class="context-details">')[0]
    expect(defaultBody).toContain('Captured, not live. Not for navigation.')
    expect(defaultBody).toContain('Route sections unavailable.')
    expect(defaultBody).not.toContain('journey-key')
    expect(defaultBody).not.toContain('Estimated route')
    expect(html).toContain('<summary>Route details &amp; sources</summary>')
    expect(html).not.toContain(' open=""')
  })

  it('distinguishes observed and estimated sections while retaining complete coverage details', () => {
    const html = renderToStaticMarkup(<JourneyDetails
      overview={{
        ...overview,
        snapshot: {
          ...overview.snapshot,
          segments: [
            { phase: 'past', certainty: 'observed', source: 'Fixture source', points: [
              { latitude: 59, longitude: 24, observedAt: 1_800_000_000_000 },
              { latitude: 59, longitude: 24.1, observedAt: 1_800_000_001_000 },
            ] },
            { phase: 'remaining', certainty: 'estimated', source: 'Fixture model', points: [
              { latitude: 59, longitude: 24.1 }, { latitude: 59.1, longitude: 24.2 },
            ] },
          ],
        },
      }}
      theme="dark"
      onHide={() => undefined} onReturn={() => undefined} onClose={() => undefined}
    />)
    expect(html).toContain('Solid: observed. Dashed: estimated.')
    expect(html).toContain('Current to destination')
    expect(html).toContain('Departure and destination unknown.')
    expect(html).toContain('Received coverage:')
    expect(html).toContain(overview.snapshot.limitations[0])
  })
})
