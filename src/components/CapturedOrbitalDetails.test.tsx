import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CapturedOrbitalView } from '../domain/orbitalView'
import { CapturedOrbitalDetails } from './CapturedOrbitalDetails'
import { MobileInspectorContext } from './mobileWorkspace'

const view: CapturedOrbitalView = {
  revision: 1, viewRequestId: 2,
  position: {
    id: 'orbital:starlink:733', owner: 'starlink', noradCatalogId: '733', name: 'Fixture',
    internationalDesignator: '1964-002A', objectType: 'DEB', sourceGroups: ['visual'],
    displayOrder: 0, elementEpoch: 1_000, snapshotRetrievedAt: 2_000,
    snapshotSha256: 'a'.repeat(64), modeledFor: 3_000,
    latitude: 45, longitude: 15, altitudeKm: 550, velocityKmPerSecond: 7.6,
  },
  snapshot: {
    schemaVersion: 3, sourceContractVersion: 3, catalogId: 'space-track-starlink-shell-balanced-v1',
    sourceProvider: 'space-track', sources: [], retrievedAt: new Date(2_000).toISOString(),
    publishedAt: new Date(2_000).toISOString(), recordCount: 1, records: [], sha256: 'a'.repeat(64),
  },
}

describe('CapturedOrbitalDetails', () => {
  it('keeps the previous ground-report area separate from paused modeled time and high-scale omission', () => {
    const html = renderToStaticMarkup(
      <CapturedOrbitalDetails view={view} ready playing={false}
        localTrafficAvailable groundTrafficSuppressed online units="metric"
        onReturn={() => undefined} onTogglePlaying={() => undefined} />,
    )
    expect(html).toContain('Previous local area: ground markers only.')
    expect(html).toContain('Hidden at this scale.')
    expect(html).toContain('not live or optical')
    expect(html).toContain('>Paused <time')
    expect(html).not.toContain('Aircraft and ships paused')
  })

  it('labels the displayed moving model, exact type and identity and source without live/attitude claims', () => {
    const html = renderToStaticMarkup(
      <CapturedOrbitalDetails view={view} ready playing online units="metric"
        onReturn={() => undefined} onTogglePlaying={() => undefined}
        position={{ ...view.position, modeledFor: 4_000, altitudeKm: 551, travelBearingDegrees: 90 }} />,
    )
    expect(html).toContain('551,000 m')
    expect(html).toContain('1970-01-01T00:00:04.000Z')
    expect(html).toContain('Debris')
    expect(html).toContain('(DEB)')
    expect(html).toMatch(/role="status"><span aria-live="off">Modeled <time/)
    expect(html).toContain('Element epoch')
    expect(html).toContain('Catalog retrieved')
    expect(html).toContain('Space-Track.org / USSPACECOM')
    expect(html).toContain('not live or optical')
    expect(html).toContain('No spacecraft attitude is inferred')
    expect(html).toContain('Travel-relative look')
    expect(html).toContain('Earth-relative modeled travel; your look offset is retained')
    expect(html).not.toContain('Travel direction unavailable')
    expect(html).toContain('not the full constellation')
    expect(html).toContain('aria-label="Return to map"')
    expect(html).not.toContain('id="orbital:')
    expect(html).toContain('>Pause</button>')
    expect(html).not.toContain('eye stays fixed')
    expect(html).not.toContain('no follow')
    expect(html).not.toContain('Preparing modeled view')
  })

  it('keeps playback, Return and preparation/limit feedback outside a collapsed mobile body', () => {
    for (const [ready, notice, expected] of [
      [false, undefined, 'Preparing modeled view...'],
      [true, 'View limit reached; look back toward Earth.', 'View limit reached'],
    ] as const) {
      const html = renderToStaticMarkup(
        <MobileInspectorContext value={{
          mobile: true, compact: true, identity: 'capture:1', returnToTask: false,
          onExpand: () => undefined, onCollapse: () => undefined,
        }}>
          <CapturedOrbitalDetails view={view} ready={ready} playing={false} notice={notice} online units="metric"
            onReturn={() => undefined} onTogglePlaying={() => undefined} />
        </MobileInspectorContext>,
      )
      const bodyAt = html.indexOf('class="details-panel__body"')
      expect(html.slice(0, bodyAt)).toContain(expected)
      expect(html.slice(0, bodyAt)).toContain('orbital-view-return')
      expect(html.slice(0, bodyAt)).toContain('>Play</button>')
      expect(html.slice(0, bodyAt)).toMatch(ready ? /class="orbital-view-return">Play/ : /disabled="">Play/)
      expect(html.slice(bodyAt)).toContain('hidden=""')
    }
  })

  it('distinguishes paused model time while retaining real-time and slow-apparent-motion caveats', () => {
    const html = renderToStaticMarkup(
      <CapturedOrbitalDetails view={view} ready playing={false} online units="metric"
        onReturn={() => undefined} onTogglePlaying={() => undefined} />,
    )
    expect(html).toContain('>Paused <time')
    expect(html).toContain('Real-time modeled motion; high orbits can appear still.')
    expect(html).toContain('Day/night shading uses the displayed modeled time, not optical visibility.')
    expect(html).not.toContain('Session-only; no recording or share link')
    expect(html).toContain('Modeled time')
    expect(html).toContain('Travel direction unavailable')
    expect(html).toContain('Unavailable; neutral or last accepted direction')
    expect(html).not.toContain('Travel-relative look')
  })
})
