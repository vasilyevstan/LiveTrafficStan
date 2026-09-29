import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OrbitalContext } from './OrbitalContext'

describe('OrbitalContext', () => {
  it('orders truthful current/crossing labels without claiming visibility', () => {
    const now = Date.UTC(2026, 8, 28, 19)
    const html = renderToStaticMarkup(
      <OrbitalContext
        state={{
          phase: 'ready',
          positions: [],
          prediction: {
            mode: 'local',
            totalResults: 2,
            inViewCount: 1,
            futureCrossingCount: 1,
            trackSegments: [],
            results: [
              {
                id: 'orbital:1',
                noradCatalogId: '1',
                name: 'CURRENT PAYLOAD',
                objectType: 'PAY',
                currentlyInView: true,
                firstCrossingAt: now,
              },
              {
                id: 'orbital:2',
                noradCatalogId: '2',
                name: 'FUTURE BODY',
                objectType: 'R/B',
                currentlyInView: false,
                firstCrossingAt: now + 10 * 60_000,
              },
            ],
          },
        }}
        selectedId="orbital:2"
        horizonMs={90 * 60_000}
        now={now}
        onSelect={() => undefined}
      />,
    )

    expect(html).toContain('1 in view · 1 crossing within 90 min')
    expect(html).toContain('CURRENT PAYLOAD')
    expect(html).toContain('in view now')
    expect(html).toContain('FUTURE BODY')
    expect(html).toContain('in 10 min')
    expect(html).toContain(
      'Purpose: unavailable for this exact NORAD ID',
    )
    expect(html).toContain('SGP4 model; not live telemetry')
    expect(html).not.toContain('visible satellite')
  })

  it('explains whole-world behavior without inventing a crossing rank', () => {
    const html = renderToStaticMarkup(
      <OrbitalContext
        state={{
          phase: 'ready',
          positions: [],
          prediction: {
            mode: 'world',
            results: [],
            totalResults: 156,
            inViewCount: 156,
            futureCrossingCount: 0,
            trackSegments: [],
            message:
              'The whole world is visible, so upcoming crossing order is not meaningful.',
          },
        }}
        selectedId={null}
        horizonMs={90 * 60_000}
        now={0}
        onSelect={() => undefined}
      />,
    )
    expect(html).toContain('156 modeled objects over the visible world')
    expect(html).toContain('upcoming crossing order is not meaningful')
  })

  it('adds only a compact reviewed purpose for an exact current identity', () => {
    const now = Date.UTC(2026, 8, 29, 19)
    const html = renderToStaticMarkup(
      <OrbitalContext
        state={{
          phase: 'ready',
          positions: [
            {
              id: 'orbital:25544',
              noradCatalogId: '25544',
              name: 'ISS (ZARYA)',
              internationalDesignator: '1998-067A',
              objectType: 'PAY',
              elementEpoch: now,
              snapshotRetrievedAt: now,
              snapshotSha256: 'a'.repeat(64),
              modeledFor: now,
              latitude: 0,
              longitude: 0,
              altitudeKm: 420,
              velocityKmPerSecond: 7.7,
            },
          ],
          prediction: {
            mode: 'world',
            totalResults: 1,
            inViewCount: 1,
            futureCrossingCount: 0,
            trackSegments: [],
            results: [
              {
                id: 'orbital:25544',
                noradCatalogId: '25544',
                name: 'ISS (ZARYA)',
                objectType: 'PAY',
                currentlyInView: true,
                firstCrossingAt: now,
              },
            ],
          },
        }}
        selectedId={null}
        horizonMs={90 * 60_000}
        now={now}
        onSelect={() => undefined}
      />,
    )

    expect(html).toContain(
      'Purpose: Crewed microgravity science laboratory',
    )
  })

  it('does not present invalid-footprint counts as a known zero', () => {
    const html = renderToStaticMarkup(
      <OrbitalContext
        state={{
          phase: 'ready',
          positions: [],
          prediction: {
            mode: 'invalid',
            results: [],
            totalResults: 0,
            inViewCount: 0,
            futureCrossingCount: 0,
            trackSegments: [],
            message: 'Upcoming crossings are unavailable for this view.',
          },
        }}
        selectedId={null}
        horizonMs={90 * 60_000}
        now={0}
        onSelect={() => undefined}
      />,
    )

    expect(html).toContain('Crossing count unavailable for this view')
    expect(html).not.toContain('0 in view')
  })
})
