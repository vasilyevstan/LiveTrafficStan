import { describe, expect, it } from 'vitest'
import { VESSEL_FLAG_IMAGES, type VesselFlagImages } from '../vesselFlagImages'
import { MODEL_FLAG_ATLAS_GUTTER, buildModelFlagAtlas } from './modelFlagAtlas'

const solid = (rgba: readonly number[], width = 2, height = 1) => ({
  width,
  height,
  data: Uint8Array.from({ length: width * height * 4 }, (_, index) => rgba[index % 4]),
})

const pixel = (atlas: NonNullable<ReturnType<typeof buildModelFlagAtlas>>, x: number, y: number) =>
  Array.from(atlas.pixels.slice((y * atlas.width + x) * 4, (y * atlas.width + x) * 4 + 4))

describe('model flag atlas', () => {
  it('packs every bundled flag into one-based cells with transparent gutters', () => {
    const atlas = buildModelFlagAtlas(VESSEL_FLAG_IMAGES)!
    expect(atlas.slots.size).toBe(VESSEL_FLAG_IMAGES.size)
    expect(new Set(atlas.slots.values()).size).toBe(VESSEL_FLAG_IMAGES.size)
    expect(Math.min(...atlas.slots.values())).toBe(1)
    expect([atlas.flagWidth, atlas.flagHeight]).toEqual([28, 22])
    expect(atlas.width).toBe(atlas.columns * (28 + 2 * MODEL_FLAG_ATLAS_GUTTER))
    expect(atlas.width).toBeLessThanOrEqual(2048)
    expect(atlas.height).toBeLessThanOrEqual(2048)
    expect(pixel(atlas, 0, 0)).toEqual([0, 0, 0, 0])
  })

  it('premultiplies colour and places each flag inside its cell', () => {
    const images: VesselFlagImages = new Map([
      ['vessel-flag-AA', solid([200, 100, 50, 255])],
      ['vessel-flag-BB', solid([200, 100, 50, 128])],
    ])
    const atlas = buildModelFlagAtlas(images)!
    expect(atlas.slots).toEqual(new Map([['vessel-flag-AA', 1], ['vessel-flag-BB', 2]]))
    expect([atlas.columns, atlas.width, atlas.height]).toEqual([2, 8, 3])
    expect(pixel(atlas, 1, 1)).toEqual([200, 100, 50, 255])
    expect(pixel(atlas, 5, 1)).toEqual([100, 50, 25, 128])
    expect(pixel(atlas, 4, 1)).toEqual([0, 0, 0, 0])
  })

  it('rejects empty input and skips rasters with a different size', () => {
    expect(buildModelFlagAtlas(new Map())).toBeUndefined()
    const atlas = buildModelFlagAtlas(
      new Map([
        ['vessel-flag-AA', solid([1, 2, 3, 255])],
        ['vessel-flag-BB', solid([1, 2, 3, 255], 3, 1)],
      ]),
    )!
    expect([...atlas.slots.keys()]).toEqual(['vessel-flag-AA'])
  })
})
