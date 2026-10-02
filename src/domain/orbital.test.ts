import { describe, expect, it } from 'vitest'
import {
  canonicalOrbitalFeatureId,
  isOrbitalNoradCatalogId,
  orbitalFeatureBelongsTo,
  orbitalFeatureId,
  orbitalFeatureOwner,
  parseOrbitalFeatureId,
} from './orbital'

describe('orbital feature ownership', () => {
  it('preserves curated IDs and owner-qualifies Starlink IDs', () => {
    expect(orbitalFeatureId('25544')).toBe('orbital:25544')
    expect(orbitalFeatureId('25544', 'starlink')).toBe(
      'orbital:starlink:25544',
    )
    expect(orbitalFeatureId('25544')).not.toBe(
      orbitalFeatureId('25544', 'starlink'),
    )
  })

  it('parses owners and canonical worker IDs exactly', () => {
    expect(parseOrbitalFeatureId('orbital:25544')).toEqual({
      owner: 'curated',
      noradCatalogId: '25544',
      id: 'orbital:25544',
      canonicalId: 'orbital:25544',
    })
    expect(parseOrbitalFeatureId('orbital:starlink:70001')).toEqual({
      owner: 'starlink',
      noradCatalogId: '70001',
      id: 'orbital:starlink:70001',
      canonicalId: 'orbital:70001',
    })
    expect(orbitalFeatureOwner('orbital:starlink:70001')).toBe(
      'starlink',
    )
    expect(canonicalOrbitalFeatureId('orbital:starlink:70001')).toBe(
      'orbital:70001',
    )
    expect(
      orbitalFeatureBelongsTo('orbital:starlink:70001', 'starlink'),
    ).toBe(true)
  })

  it('rejects malformed and non-canonical identities', () => {
    for (const value of [
      '',
      'orbital:0',
      'orbital:00025544',
      'orbital:1000000000',
      'orbital:STARLINK:25544',
      'orbital:starlink:0',
      'orbital:starlink:25544:extra',
    ]) {
      expect(parseOrbitalFeatureId(value)).toBeUndefined()
    }
    expect(isOrbitalNoradCatalogId('25544')).toBe(true)
    expect(isOrbitalNoradCatalogId('00025544')).toBe(false)
  })
})
