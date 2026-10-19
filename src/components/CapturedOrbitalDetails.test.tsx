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
  it('labels the frozen model, exact type and identity, altitude and provenance without live/attitude claims', () => {
    const html = renderToStaticMarkup(
      <CapturedOrbitalDetails view={view} ready online units="metric" onReturn={() => undefined} />,
    )
    expect(html).toContain('550,000 m')
    expect(html).toContain('1970-01-01T00:00:03.000Z')
    expect(html).toContain('Debris')
    expect(html).toContain('(DEB)')
    expect(html).toMatch(/role="status">Captured model <time/)
    expect(html).toContain('Element epoch')
    expect(html).toContain('Catalog retrieved')
    expect(html).toContain('Space-Track.org / USSPACECOM')
    expect(html).toContain('not live or optical')
    expect(html).toContain('No spacecraft attitude is inferred')
    expect(html).toContain('not the full constellation')
    expect(html).toContain('aria-label="Return to map"')
    expect(html).not.toContain('id="orbital:')
    expect(html).not.toContain('Preparing captured view')
  })

  it('keeps Return and preparation/limit feedback outside a collapsed mobile body', () => {
    for (const [ready, notice, expected] of [
      [false, undefined, 'Preparing captured view...'],
      [true, 'View limit reached; the captured eye has not moved.', 'View limit reached'],
    ] as const) {
      const html = renderToStaticMarkup(
        <MobileInspectorContext value={{
          mobile: true, compact: true, identity: 'capture:1', returnToTask: false,
          onExpand: () => undefined, onCollapse: () => undefined,
        }}>
          <CapturedOrbitalDetails view={view} ready={ready} notice={notice} online units="metric" onReturn={() => undefined} />
        </MobileInspectorContext>,
      )
      const bodyAt = html.indexOf('class="details-panel__body"')
      expect(html.slice(0, bodyAt)).toContain(expected)
      expect(html.slice(0, bodyAt)).toContain('orbital-view-return')
      expect(html.slice(bodyAt)).toContain('hidden=""')
    }
  })
})
