import { describe, expect, it } from 'vitest'
import allocations from '../config/countryAllocations.generated.json'
import {
  countryForAircraftHex,
  flagStateForMmsi,
} from '../domain/countryAllocations'
import { VESSEL_FLAG_IMAGES, vesselFlagImageId } from './vesselFlags'

describe('bundled country flag artwork', () => {
  it('covers exactly the existing assigned MID countries with complete 2x pixels', () => {
    const countries = new Set(
      Object.values(allocations.mids).map((record) => record[1]),
    )
    expect(VESSEL_FLAG_IMAGES.size).toBe(countries.size)
    for (const [mid, [, iso2]] of Object.entries(allocations.mids)) {
      const country = flagStateForMmsi(Number(mid) * 1_000_000 + 123_456)
      expect(country?.iso2).toBe(iso2)
      const id = vesselFlagImageId(country?.iso2)
      expect(id).toBe(`vessel-flag-${iso2}`)
      const image = VESSEL_FLAG_IMAGES.get(id!)
      expect(image).toMatchObject({ width: 28, height: 22 })
      expect(image?.data.length).toBe(28 * 22 * 4)
    }
  })

  it('also covers every accepted aircraft range without additional artwork', () => {
    for (const [start, end, , iso2] of allocations.aircraftRanges) {
      for (const address of [start, end]) {
        const country = countryForAircraftHex(
          address.toString(16).padStart(6, '0'),
        )
        expect(country?.iso2).toBe(iso2)
        const id = vesselFlagImageId(country?.iso2)
        expect(id).toBe(`vessel-flag-${iso2}`)
        expect(VESSEL_FLAG_IMAGES.get(id!)).toMatchObject({
          width: 28,
          height: 22,
        })
      }
    }
  })

  it('uses actual flag pixels rather than platform-dependent emoji', () => {
    const image = VESSEL_FLAG_IMAGES.get('vessel-flag-EE')!
    const pixel = (x: number, y: number) =>
      [...image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)]
    expect(pixel(14, 4)).toEqual([23, 145, 255, 255])
    expect(pixel(14, 11)).toEqual([0, 0, 1, 255])
    expect(pixel(14, 17)).toEqual([255, 255, 255, 255])
    expect(pixel(0, 0)).toEqual([255, 255, 255, 255])
    expect(pixel(1, 1)).toEqual([15, 41, 56, 255])
  })

  it.each([undefined, 'ZZ', 'ee', '', 'EE-extra'])(
    'does not fabricate artwork for unavailable or invalid country %s',
    (iso2) => {
      expect(vesselFlagImageId(iso2)).toBeUndefined()
    },
  )
})
