import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  ModeledOrbitalPosition,
  OrbitalCatalogSnapshot,
} from '../domain/orbital'
import {
  DEFAULT_ORBITAL_DISCOVERY_FILTERS,
  selectOrbitalDisplay,
} from '../domain/orbitalDiscovery'
import { orbitalEnrichmentForPosition } from '../domain/orbitalEnrichment'
import { OrbitalDetails } from './OrbitalDetails'

const position: ModeledOrbitalPosition = {
  id: 'orbital:733',
  noradCatalogId: '733',
  name: 'THOR AGENA D R/B',
  internationalDesignator: '1964-002A',
  objectType: 'R/B',
  sourceGroups: ['visual'],
  displayOrder: 733,
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
  schemaVersion: 2,
  sourceContractVersion: 2,
  catalogId: 'celestrak-curated-v1',
  sources: [],
  retrievedAt: '2026-09-28T18:45:00.000Z',
  publishedAt: '2026-09-28T18:45:00.000Z',
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
        mapDisplay={{ available: true, selectedException: false }}
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
        mapDisplay={{ available: true, selectedException: true }}
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

  it('states when the international designator is unavailable', () => {
    const html = renderToStaticMarkup(
      <OrbitalDetails
        position={{ ...position, internationalDesignator: '' }}
        snapshot={snapshot}
        sourceName="CelesTrak"
        sourceWebsiteUrl="https://celestrak.org/"
        sourceUsagePolicyUrl="https://celestrak.org/usage-policy.php"
        now={position.modeledFor}
        online
        units="metric"
        imageState={{ phase: 'unavailable' }}
        mapDisplay={{ available: true, selectedException: false }}
        onClose={() => undefined}
      />,
    )

    expect(html).toContain('Designator unavailable')
  })

  it('reports map display unavailable for a Catalog selection before zoom settles', () => {
    const display = selectOrbitalDisplay(
      [position],
      DEFAULT_ORBITAL_DISCOVERY_FILTERS,
      undefined,
      position.id,
      {
        worldMaximumZoom: 2,
        midMaximumZoom: 4,
        worldLimit: 192,
        midLimit: 384,
        maximumRecords: 512,
      },
    )
    const html = renderToStaticMarkup(
      <OrbitalDetails
        position={position}
        snapshot={snapshot}
        sourceName="CelesTrak"
        sourceWebsiteUrl="https://celestrak.org/"
        sourceUsagePolicyUrl="https://celestrak.org/usage-policy.php"
        now={position.modeledFor}
        online
        units="metric"
        imageState={{ phase: 'unavailable' }}
        mapDisplay={
          display.available
            ? {
                available: true,
                selectedException: display.selectedException,
              }
            : { available: false }
        }
        onClose={() => undefined}
      />,
    )

    expect(display.available).toBe(false)
    expect(html).toContain(
      'Map display unavailable; no settled map zoom is available',
    )
    expect(html).not.toContain('Selected exception; shown')
    expect(html).not.toContain('Within the current zoom')
  })
})
