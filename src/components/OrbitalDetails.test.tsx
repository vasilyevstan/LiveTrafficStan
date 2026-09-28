import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  ModeledOrbitalPosition,
  OrbitalCatalogSnapshot,
} from '../domain/orbital'
import { OrbitalDetails } from './OrbitalDetails'

const position: ModeledOrbitalPosition = {
  id: 'orbital:694',
  noradCatalogId: '694',
  name: 'ATLAS CENTAUR 2',
  internationalDesignator: '1963-047A',
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
        units="metric"
        onClose={() => undefined}
      />,
    )

    expect(html).toContain('Selected modeled orbital object')
    expect(html).toContain('Rocket body')
    expect(html).toContain('NORAD catalog ID')
    expect(html).toContain('In the visible map now')
    expect(html).toContain('not live telemetry')
    expect(html).toContain('does not prove naked-eye visibility')
    expect(html).toContain('CelesTrak')
    expect(html).not.toContain('observed')
  })
})
