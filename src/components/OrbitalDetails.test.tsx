import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  ModeledOrbitalPosition,
  OrbitalCatalogSnapshot,
  StarlinkOrbitalCatalogSnapshot,
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

  it('puts verified description-only context before telemetry without loading an image', () => {
    const html = renderToStaticMarkup(
      <OrbitalDetails
        position={{ ...position, id: 'orbital:25994', noradCatalogId: '25994', name: 'TERRA', internationalDesignator: '1999-068A', objectType: 'PAY' }}
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
    expect(html).toContain('Earth-system observation')
    expect(html.indexOf('Earth-system observation')).toBeLessThan(html.indexOf('Catalog type'))
    expect(html).toContain('https://science.nasa.gov/mission/terra/')
    expect(html).toContain('source retrieved 2026-10-05')
    expect(html).toContain('Verified image unavailable; no substitute shown.')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('Loading verified')
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

  it('keeps Starlink ownership separate from curated enrichment for the same NORAD ID', () => {
    const starlinkPosition: ModeledOrbitalPosition = {
      ...position,
      id: 'orbital:starlink:25544',
      owner: 'starlink',
      noradCatalogId: '25544',
      name: 'STARLINK TEST REPRESENTATION',
      objectType: 'PAY',
      sourceGroups: ['starlink'],
    }
    const starlinkSnapshot: StarlinkOrbitalCatalogSnapshot = {
      ...snapshot,
      owner: 'starlink',
      schemaVersion: 2,
      sourceContractVersion: 2,
      catalogId: 'celestrak-starlink-shell-balanced-v1',
      records: [],
      starlink: {
        populationCount: 11_127,
        extraSatcatCount: 0,
        sampleLimit: 512,
        sampleAlgorithm: 'inclination-shell-raan-phase-grid-v1',
        samplingReferenceTime: '2026-10-01T20:01:00.000Z',
        sources: {
          gp: {
            url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=JSON',
            retrievedAt: '2026-10-01T20:01:00.000Z',
            recordCount: 11_127,
            decodedBytes: 4_700_510,
            sha256: 'b'.repeat(64),
          },
          satcat: {
            url: 'https://celestrak.org/satcat/records.php?GROUP=starlink&FORMAT=JSON',
            retrievedAt: '2026-10-01T20:02:00.000Z',
            recordCount: 11_127,
            decodedBytes: 3_684_991,
            sha256: 'c'.repeat(64),
          },
        },
      },
    }
    const html = renderToStaticMarkup(
      <OrbitalDetails
        position={starlinkPosition}
        snapshot={starlinkSnapshot}
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

    expect(html).toContain(
      'Starlink shell-balanced inclination/RAAN/phase sample',
    )
    expect(html).toContain('11,127 validated records')
    expect(html).toContain(
      'shell-balanced sample, not the full constellation',
    )
    expect(html).toContain(
      'General service context, not a verified purpose or operational status for this individual object',
    )
    expect(html).toContain('Constellation context')
    expect(html).toContain('Internet connectivity')
    expect(html).toContain('https://starlink.com/')
    expect(html).not.toContain(
      'Crewed microgravity science laboratory',
    )
  })
})
