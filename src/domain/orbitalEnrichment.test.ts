import { describe, expect, it } from 'vitest'
import type { ModeledOrbitalPosition } from './orbital'
import {
  createOrbitalEnrichmentIndex,
  matchingOrbitalEnrichmentRecord,
  orbitalEnrichmentForPosition,
  type OrbitalEnrichmentRecord,
} from './orbitalEnrichment'

const record = (
  noradCatalogId: string,
): OrbitalEnrichmentRecord => ({
  noradCatalogId,
  objectNameAtReview: `OBJECT ${noradCatalogId}`,
  internationalDesignatorAtReview: '2026-001A',
  catalogTypeAtReview: 'PAY',
  purpose: {
    shortLabel: 'Reviewed purpose',
    description: 'Purpose supported by an authoritative source.',
    sourceName: 'Source',
    sourceTitle: 'Source title',
    sourceUrl: 'https://example.test/source',
    sourceRetrievedAt: '2026-09-29',
    sourceSha256: 'a'.repeat(64),
    identityEvidence: 'Exact reviewed identity chain.',
  },
})

const position = (
  noradCatalogId: string,
): ModeledOrbitalPosition => ({
  id: `orbital:${noradCatalogId}`,
  noradCatalogId,
  name: `OBJECT ${noradCatalogId}`,
  internationalDesignator: '2026-001A',
  objectType: 'PAY',
  elementEpoch: 1,
  snapshotRetrievedAt: 2,
  snapshotSha256: 'a'.repeat(64),
  modeledFor: 3,
  latitude: 10,
  longitude: 20,
  altitudeKm: 600,
  velocityKmPerSecond: 7.6,
})

describe('orbital enrichment identity', () => {
  it('matches exact six-digit and future larger NORAD IDs', () => {
    const records = [record('123456'), record('123456789')]
    const index = createOrbitalEnrichmentIndex(records)

    expect(
      matchingOrbitalEnrichmentRecord(position('123456'), index),
    ).toBe(records[0])
    expect(
      matchingOrbitalEnrichmentRecord(position('123456789'), index),
    ).toBe(records[1])
  })

  it('rejects duplicate, renamed, retyped, and redesignated identities', () => {
    expect(() =>
      createOrbitalEnrichmentIndex([record('123456'), record('123456')]),
    ).toThrow('duplicate NORAD IDs')

    const index = createOrbitalEnrichmentIndex([record('123456')])
    for (const mismatch of [
      { name: 'DIFFERENT OBJECT' },
      { internationalDesignator: '2026-002A' },
      { objectType: 'R/B' as const },
    ]) {
      expect(
        matchingOrbitalEnrichmentRecord(
          { ...position('123456'), ...mismatch },
          index,
        ),
      ).toBeUndefined()
    }
  })

  it('does not enrich an unreviewed current object', () => {
    expect(orbitalEnrichmentForPosition(position('999999999'))).toBeUndefined()
  })

  it('tags a reviewed current object with the complete catalog identity', () => {
    const current = {
      ...position('25544'),
      id: 'orbital:25544',
      name: 'ISS (ZARYA)',
      internationalDesignator: '1998-067A',
      snapshotSha256: 'b'.repeat(64),
    }
    const enrichment = orbitalEnrichmentForPosition(current)

    expect(enrichment).toMatchObject({
      noradCatalogId: '25544',
      manifestVersion: '2026-09-29-v1',
    })
    expect(enrichment?.identityKey).toBe(
      [
        'orbital:25544',
        '25544',
        'ISS (ZARYA)',
        '1998-067A',
        'PAY',
        'b'.repeat(64),
        '2026-09-29-v1',
      ].join('|'),
    )
  })
})
