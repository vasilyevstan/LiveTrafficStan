import { describe, expect, it } from 'vitest'
import type { ModeledOrbitalPosition } from './orbital'
import { interpolateOrbitalViewPosition } from './orbitalView'

const first: ModeledOrbitalPosition = {
  id: 'orbital:694', owner: 'curated', noradCatalogId: '694', name: 'Fixture',
  internationalDesignator: '1963-047A', objectType: 'R/B',
  sourceGroups: ['visual'], displayOrder: 0, elementEpoch: 1_000,
  snapshotRetrievedAt: 2_000, snapshotSha256: 'a'.repeat(64), modeledFor: 3_000,
  latitude: 45, longitude: 179.8, altitudeKm: 400, velocityKmPerSecond: 7.6,
}
const last = { ...first, modeledFor: 4_000, latitude: 45.1, longitude: -179.8, altitudeKm: 402 }

describe('orbital view pose interpolation', () => {
  it('uses only the accepted bracket, shortest wrapped longitude and unchanged source identity', () => {
    const result = interpolateOrbitalViewPosition(first, last, 3_500)
    expect(result).toEqual({
      ...last, modeledFor: 3_500, latitude: 45.05, longitude: 180, altitudeKm: 401,
    })
    expect(first.longitude).toBe(179.8)
    expect(last.longitude).toBe(-179.8)
    expect(interpolateOrbitalViewPosition(first, last, 3_000)).toEqual(first)
    expect(interpolateOrbitalViewPosition(first, last, 4_000)).toEqual(last)
    expect(interpolateOrbitalViewPosition(first, first, first.modeledFor)).toBe(first)
  })

  it.each([2_999, 4_001, Number.NaN, Number.POSITIVE_INFINITY])(
    'never extrapolates to an invalid or uncomputed time: %s',
    modeledFor => expect(interpolateOrbitalViewPosition(first, last, modeledFor)).toBeUndefined(),
  )

  it.each([
    { id: 'orbital:starlink:694', owner: 'starlink' as const },
    { owner: 'starlink' as const },
    { noradCatalogId: '695' },
    { snapshotSha256: 'b'.repeat(64) },
    { snapshotRetrievedAt: 2_001 },
    { elementEpoch: 1_001 },
    { modeledFor: 2_999 },
    { modeledFor: Number.NaN },
    { latitude: Number.NaN },
    { longitude: 181 },
    { altitudeKm: 0 },
    { velocityKmPerSecond: Number.NaN },
  ])('rejects mixed identities, source generations and unsafe endpoints: %j', override => {
    expect(interpolateOrbitalViewPosition(first, { ...last, ...override }, 3_500)).toBeUndefined()
  })
})
