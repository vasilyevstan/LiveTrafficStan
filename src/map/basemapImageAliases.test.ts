import { describe, expect, it, vi } from 'vitest'
import { resolveDarkBasemapPlaceImage } from './basemapImageAliases'

describe('dark basemap place image aliases', () => {
  it('resolves the upstream hyphenated name from the loaded underscore sprite without another request', () => {
    const source = {
      data: {
        width: 1,
        height: 1,
        data: new Uint8Array([255, 255, 255, 255]),
      },
      pixelRatio: 2,
      sdf: true,
    }
    const images = new Set(['circle_11'])
    const map = {
      hasImage: vi.fn((id: string) => images.has(id)),
      getImage: vi.fn((id: string) => id === 'circle_11' ? source : undefined),
      addImage: vi.fn((id: string) => images.add(id)),
    }

    resolveDarkBasemapPlaceImage(map, 'circle-11')

    expect(map.getImage).toHaveBeenCalledExactlyOnceWith('circle_11')
    expect(map.addImage).toHaveBeenCalledExactlyOnceWith(
      'circle-11',
      source.data,
      { pixelRatio: 2, sdf: true },
    )
    expect(images.has('circle-11')).toBe(true)
  })

  it('ignores unrelated names, an already-resolved alias, or a sprite without the source image', () => {
    const map = {
      hasImage: vi.fn((id: string) => id === 'circle-11'),
      getImage: vi.fn(() => undefined),
      addImage: vi.fn(),
    }

    resolveDarkBasemapPlaceImage(map, 'other-image')
    resolveDarkBasemapPlaceImage(map, 'circle-11')
    expect(map.getImage).not.toHaveBeenCalled()
    expect(map.addImage).not.toHaveBeenCalled()

    map.hasImage.mockReturnValue(false)
    resolveDarkBasemapPlaceImage(map, 'circle-11')
    expect(map.getImage).toHaveBeenCalledExactlyOnceWith('circle_11')
    expect(map.addImage).not.toHaveBeenCalled()
  })
})
