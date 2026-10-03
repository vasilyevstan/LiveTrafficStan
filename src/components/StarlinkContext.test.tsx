import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  EMPTY_ORBITAL_PREDICTION,
  orbitalFeatureId,
  type ModeledOrbitalPosition,
  type OrbitalControllerState,
  type StarlinkOrbitalCatalogSnapshot,
} from '../domain/orbital'
import type { OrbitalPopulationCounts } from '../domain/orbitalDiscovery'
import { StarlinkContext } from './StarlinkContext'

const now = Date.UTC(2026, 9, 1, 21)
const record = {
  noradCatalogId: '70001',
  name: 'STARLINK-TEST',
  internationalDesignator: '2026-001A',
  objectType: 'PAY' as const,
  epoch: '2026-10-01T20:00:00.000000Z',
  meanMotion: 15.2,
  eccentricity: 0.001,
  inclination: 53,
  rightAscensionOfAscendingNode: 120,
  argumentOfPericenter: 30,
  meanAnomaly: 40,
  ephemerisType: 0,
  classificationType: 'U',
  elementSetNumber: 1,
  revolutionAtEpoch: 1,
  bstar: 0.0001,
  meanMotionDot: 0.00001,
  meanMotionDdot: 0,
  sourceGroups: ['starlink' as const],
  displayOrder: 70001,
}

const snapshot: StarlinkOrbitalCatalogSnapshot = {
  owner: 'starlink',
  schemaVersion: 1,
  sourceContractVersion: 1,
  catalogId: 'celestrak-starlink-sample-v1',
  sources: [
    {
      group: 'starlink',
      gpSourceUrl:
        'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=JSON',
      satcatSourceUrl:
        'https://celestrak.org/satcat/records.php?GROUP=starlink&FORMAT=JSON',
      gpRecordCount: 11_127,
      satcatRecordCount: 11_127,
    },
  ],
  retrievedAt: '2026-10-01T20:02:00.000Z',
  publishedAt: '2026-10-01T20:03:00.000Z',
  recordCount: 1,
  sha256: 'a'.repeat(64),
  records: [record],
  starlink: {
    populationCount: 11_127,
    extraSatcatCount: 0,
    sampleLimit: 150,
    sampleAlgorithm: 'inclination-raan-systematic-v1',
    sources: {
      gp: {
        url: snapshotSourceUrl('gp'),
        retrievedAt: '2026-10-01T20:01:00.000Z',
        recordCount: 11_127,
        decodedBytes: 4_700_510,
        sha256: 'b'.repeat(64),
      },
      satcat: {
        url: snapshotSourceUrl('satcat'),
        retrievedAt: '2026-10-01T20:02:00.000Z',
        recordCount: 11_127,
        decodedBytes: 3_684_991,
        sha256: 'c'.repeat(64),
      },
    },
  },
}

function snapshotSourceUrl(source: 'gp' | 'satcat') {
  return source === 'gp'
    ? 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=JSON'
    : 'https://celestrak.org/satcat/records.php?GROUP=starlink&FORMAT=JSON'
}

const position: ModeledOrbitalPosition = {
  id: orbitalFeatureId(record.noradCatalogId, 'starlink'),
  owner: 'starlink',
  noradCatalogId: record.noradCatalogId,
  name: record.name,
  internationalDesignator: record.internationalDesignator,
  objectType: record.objectType,
  sourceGroups: record.sourceGroups,
  displayOrder: record.displayOrder,
  elementEpoch: now,
  snapshotRetrievedAt: now,
  snapshotSha256: snapshot.sha256,
  modeledFor: now,
  latitude: 0,
  longitude: 0,
  altitudeKm: 550,
  velocityKmPerSecond: 7.6,
}

const counts: OrbitalPopulationCounts = {
  catalogCount: 1,
  acceptedCount: 1,
  modeledNowCount: 1,
  catalogMatchCount: 1,
  modeledMatchCount: 1,
  inFootprintCount: 1,
  shownInFootprintCount: 1,
  futureCrossingCount: 0,
}

const renderContext = (
  overrides: Partial<{
    parentVisible: boolean
    enabled: boolean
    live: boolean
    state: OrbitalControllerState
    counts: OrbitalPopulationCounts
  }> = {},
) =>
  renderToStaticMarkup(
    <StarlinkContext
      parentVisible={overrides.parentVisible ?? true}
      enabled={overrides.enabled ?? true}
      live={overrides.live ?? true}
      state={
        overrides.state ?? {
          phase: 'ready',
          acceptedCount: 1,
          positions: [position],
          prediction: {
            ...EMPTY_ORBITAL_PREDICTION,
            mode: 'world',
            results: [
              {
                id: position.id,
                owner: 'starlink',
                noradCatalogId: position.noradCatalogId,
                name: position.name,
                objectType: position.objectType,
                currentlyInView: true,
              },
            ],
          },
          snapshot,
        }
      }
      selectedId={null}
      counts={overrides.counts ?? counts}
      horizonMs={90 * 60_000}
      pageSize={20}
      onEnabledChange={() => undefined}
      onSelect={() => undefined}
      onRetry={() => undefined}
    />,
  )

describe('StarlinkContext', () => {
  it('keeps the child preference visible while ORBITS is off', () => {
    const html = renderContext({ parentVisible: false })
    expect(html).toContain('STARLINK ON')
    expect(html).toContain('Preference remembered')
    expect(html).not.toContain('Starlink systematic sample results')
  })

  it('reports source population, sample, modeled, and map counts distinctly', () => {
    const html = renderContext()
    expect(html).toContain('aria-label="Starlink sample summary"')
    expect(html).toContain('<dt>Modeled</dt><dd>1</dd>')
    expect(html).toContain('<span>of 1 sampled</span>')
    expect(html).toContain('<dt>In map</dt><dd>1</dd><span>1 shown</span>')
    expect(html).toContain('<dt>Next 90m</dt><dd>0</dd>')
    expect(html).toContain('Systematic sample from 11,127 source objects')
    expect(html).toContain('Not the full constellation')
    expect(html).toContain('not live telemetry')
    expect(html).toContain('STARLINK-TEST')
    expect(html).toContain('Safe modeled position · in map now')
  })

  it('labels schema-2 shell balancing and its four fixed sample quotas truthfully', () => {
    const shellSnapshot: StarlinkOrbitalCatalogSnapshot = {
      ...snapshot,
      schemaVersion: 2,
      sourceContractVersion: 2,
      catalogId: 'celestrak-starlink-shell-balanced-v1',
      starlink: {
        ...snapshot.starlink,
        sampleLimit: 512,
        sampleAlgorithm: 'inclination-shell-raan-phase-grid-v1',
        samplingReferenceTime: '2026-10-01T20:01:00.000Z',
        shells: [
          'low',
          'middle',
          'high',
          'polar',
        ].map((id) => ({
          id,
          inclinationMinimumDegrees: 0,
          inclinationMaximumDegreesExclusive: null,
          populationCount: 128,
          sampleCount: 128,
        })),
      },
    }
    const html = renderContext({
      state: {
        phase: 'ready',
        acceptedCount: 1,
        positions: [position],
        prediction: EMPTY_ORBITAL_PREDICTION,
        snapshot: shellSnapshot,
      },
    })

    expect(html).toContain(
      'Shell-balanced sample from 11,127 source objects',
    )
    expect(html).toContain(
      '4 inclination bands · 128/128/128/128 sampled',
    )
    expect(html).toContain(
      'aria-label="Shell-balanced sample results"',
    )
  })

  it('distinguishes unavailable map geometry from a pending crossing prediction', () => {
    const unavailable = renderContext({
      counts: {
        ...counts,
        inFootprintCount: undefined,
        shownInFootprintCount: undefined,
        futureCrossingCount: undefined,
      },
    })
    expect(unavailable).toContain(
      '<dt>Next 90m</dt><dd>—</dd><span>Unavailable</span>',
    )

    const updating = renderContext({
      counts: {
        ...counts,
        futureCrossingCount: undefined,
      },
    })
    expect(updating).toContain(
      '<dt>Next 90m</dt><dd>…</dd><span>Updating</span>',
    )
  })

  it('does not expose sample rows while disabled', () => {
    const html = renderContext({
      enabled: false,
      state: {
        phase: 'disabled',
        acceptedCount: 0,
        positions: [],
        prediction: EMPTY_ORBITAL_PREDICTION,
      },
    })
    expect(html).toContain('STARLINK OFF')
    expect(html).not.toContain('SOURCE REPORTED')
  })
})
