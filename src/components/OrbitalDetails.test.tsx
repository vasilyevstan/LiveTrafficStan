import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  ModeledOrbitalPosition,
  OrbitalCatalogSnapshot,
} from '../domain/orbital'
import { orbitalEnrichmentForPosition } from '../domain/orbitalEnrichment'
import { OrbitalDetails } from './OrbitalDetails'

const position: ModeledOrbitalPosition = {
  id: 'orbital:733',
  noradCatalogId: '733',
  name: 'THOR AGENA D R/B',
  internationalDesignator: '1964-002A',
  objectType: 'R/B',
  elementEpoch: Date.UTC(2026, 8, 28, 0, 48),
  snapshotRetrievedAt: Date.UTC(2026, 8, 28, 18, 45),
  snapshotSha256: 'a'.repeat(64),
  modeledFor: Date.UTC(2026, 8, 28, 19),
  latitude: 59.437,
  longitude: 24.754,
  altitudeKm: 650,
  velocityKmPerSecond: 7.6,
}

const snapshot: OrbitalCatalogSnapshot = {
  schemaVersion: 1,
  sourceContractVersion: 1,
  group: 'visual',
  gpSourceUrl: 'https://example.test/gp',
  satcatSourceUrl: 'https://example.test/satcat',
  retrievedAt: '2026-09-28T18:45:00.000Z',
  recordCount: 1,
  records: [],
  sha256: 'a'.repeat(64),
}

describe('OrbitalDetails', () => {
  it('labels modeled data, exact catalog type, provenance, and limits', () => {
    const html = renderToStaticMarkup(
      <OrbitalDetails
        position={position}
        crossing={{
          id: position.id,
          noradCatalogId: position.noradCatalogId,
          name: position.name,
          objectType: position.objectType,
          currentlyInView: true,
          firstCrossingAt: position.modeledFor,
        }}
        snapshot={snapshot}
        sourceName="CelesTrak"
        sourceWebsiteUrl="https://celestrak.org/"
        sourceUsagePolicyUrl="https://celestrak.org/usage-policy.php"
        now={position.modeledFor}
        online
        units="metric"
        imageState={{ phase: 'unavailable' }}
        onClose={() => undefined}
      />,
    )

    expect(html).toContain('Selected orbit')
    expect(html).toContain('Rocket body')
    expect(html).toContain('NORAD catalog ID')
    expect(html).toContain('In the visible map now')
    expect(html).toContain('not live')
    expect(html).toContain('does not prove visibility')
    expect(html).toContain('CelesTrak')
    expect(html).toContain('No reviewed exact-NORAD purpose or image')
    expect(html).not.toContain('observed')
  })

  it('shows exact-NORAD purpose, a bundled verified image, and NASA attribution', () => {
    const issPosition: ModeledOrbitalPosition = {
      ...position,
      id: 'orbital:25544',
      noradCatalogId: '25544',
      name: 'ISS (ZARYA)',
      internationalDesignator: '1998-067A',
      objectType: 'PAY',
    }
    const enrichment = orbitalEnrichmentForPosition(issPosition)
    if (!enrichment) throw new Error('Expected ISS enrichment fixture')
    const html = renderToStaticMarkup(
      <OrbitalDetails
        position={issPosition}
        snapshot={snapshot}
        sourceName="CelesTrak"
        sourceWebsiteUrl="https://celestrak.org/"
        sourceUsagePolicyUrl="https://celestrak.org/usage-policy.php"
        now={issPosition.modeledFor}
        online
        units="metric"
        imageState={{
          phase: 'available',
          identityKey: enrichment.identityKey,
          url: 'blob:https://example.test/iss',
        }}
        onClose={() => undefined}
      />,
    )

    expect(html).toContain('Crewed microgravity science laboratory')
    expect(html).toContain('exact NORAD 25544')
    expect(html).toContain(
      'src="blob:https://example.test/iss"',
    )
    expect(html).toContain(
      'International Space Station photographed from Atlantis',
    )
    expect(html).toContain('Photo: NASA')
    expect(html).toContain('NASA Images and Media Usage Guidelines')
    expect(html).toContain('no local crop, resize, retouching')
    expect(html).not.toContain('generic satellite')
  })
})
