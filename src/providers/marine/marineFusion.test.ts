import { describe, expect, it } from 'vitest'
import { normalizeAisVessel, normalizeDigitrafficVessel } from './digitrafficNormalization'
import { mergeMarineVessels } from './marineFusion'
import { AISSTREAM_PROVIDER_NAME } from './marineSourceNormalization'

const location = {
  mmsi: 230123456, latitude: 59.44, longitude: 24.75,
  observedAt: 1_800_000_000_000,
}
const earlier = normalizeDigitrafficVessel(
  location,
  {
    mmsi: location.mmsi, timestamp: location.observedAt,
    name: 'EXAMPLE', shipType: 37, referencePointA: 6,
    referencePointB: 3, referencePointC: 1, referencePointD: 1,
  },
  location.observedAt + 1,
)
const recent = normalizeAisVessel(
  { ...location, longitude: 24.751, observedAt: location.observedAt + 10_000 },
  { mmsi: location.mmsi, name: 'EXAMPLE' },
  location.observedAt + 10_001,
  AISSTREAM_PROVIDER_NAME,
  'AISStream',
)

describe('complementary marine observations', () => {
  it('uses the newest position and explicitly credits matching missing metadata', () => {
    const result = mergeMarineVessels(earlier, recent)
    expect(result.position).toEqual(recent.position)
    expect(result.provider).toBe(AISSTREAM_PROVIDER_NAME)
    expect(result.lengthMeters).toBe(9)
    expect(result.vesselType).toBe('Pleasure craft')
    expect(result.attribution).toContain('AISStream')
    expect(result.attribution).toContain('Fintraffic')
    expect(result.metadataObservedAt).toBeUndefined()
    expect(result.speedKph).toBeUndefined()
    expect(result.navigationStatus).toBeUndefined()
    expect(recent.lengthMeters).toBeUndefined()
  })

  it('produces the same result regardless of provider callback order', () => {
    expect(mergeMarineVessels(earlier, recent))
      .toEqual(mergeMarineVessels(recent, earlier))
  })

  it('does not splice conflicting identities or dimensions', () => {
    expect(mergeMarineVessels(earlier, { ...recent, name: 'OTHER' }).lengthMeters)
      .toBeUndefined()
    expect(mergeMarineVessels(earlier, { ...recent, lengthMeters: 90 }).vesselType)
      .toBeUndefined()
  })

  it('does not revive fields a newer report from the same source made unavailable', () => {
    expect(mergeMarineVessels(
      recent,
      { ...recent, name: undefined, position: { ...recent.position, observedAt: recent.position.observedAt + 1 } },
    ).name).toBeUndefined()
  })

  it('requires exact MMSI and stable identity equality', () => {
    expect(() => mergeMarineVessels(earlier, { ...recent, mmsi: 230123457 }))
      .toThrow('different vessel')
  })
})
