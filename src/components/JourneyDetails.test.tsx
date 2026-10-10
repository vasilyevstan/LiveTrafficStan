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
})
