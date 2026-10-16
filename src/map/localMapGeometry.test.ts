import type { ProjectionSpecification } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import { supportsLocalMapGeometry } from './localMapGeometry'

const limits = { coordinatePrecision: 3, maximumRadiusKm: 100 }
const makeMap = (longitude = 24, latitude = 59, bearing = 0) => {
  const angle = bearing * Math.PI / 180
  return {
    getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
    getCenter: () => ({ lat: latitude, lng: longitude }),
    getPitch: () => 0,
    getProjection: (): ProjectionSpecification | undefined => ({ type: 'mercator' }),
    getBounds: () => ({
      getNorth: () => latitude + 0.05,
      getSouth: () => latitude - 0.05,
      getEast: () => longitude + 0.05,
      getWest: () => longitude - 0.05,
    }),
    project: () => ({ x: 0, y: 0 }),
    unproject: vi.fn(([x, y]: [number, number]) => ({
      lng: longitude + ((x - 400) * Math.cos(angle) - (y - 300) * Math.sin(angle)) / 10_000,
      lat: latitude + ((x - 400) * Math.sin(angle) + (y - 300) * Math.cos(angle)) / 10_000,
    })),
  }
}

describe('safe local map-tool geometry', () => {
  it.each([[24, 59, 0], [179.999, 59, 45], [-179.999, 80, 90], [24, -80, 180]])(
    'accepts safely local Flat geometry at %s/%s bearing %s without changing it',
    (longitude, latitude, bearing) => {
      const map = makeMap(longitude, latitude, bearing)
      expect(supportsLocalMapGeometry(map, 'flat', limits)).toBe(true)
      expect(map.unproject).toHaveBeenCalledTimes(32)
    },
  )

  it('rejects Auto even when its current renderer is Mercator', () => {
    const map = makeMap()
    expect(supportsLocalMapGeometry(map, 'auto', limits)).toBe(false)
    expect(map.unproject).not.toHaveBeenCalled()
  })

  it.each<ProjectionSpecification | undefined>([{ type: 'globe' }, undefined])(
    'requires actual known Mercator: %j',
    (projection) => {
      const map = makeMap()
      map.getProjection = () => projection
      expect(supportsLocalMapGeometry(map, 'flat', limits)).toBe(false)
      expect(map.unproject).not.toHaveBeenCalled()
    },
  )

  it.each([0, -1, NaN, Infinity])('checks a bad canvas dimension %s before sampling', (size) => {
    for (const dimension of ['clientWidth', 'clientHeight']) {
      const map = makeMap()
      map.getCanvas = () => ({ clientWidth: 800, clientHeight: 600, [dimension]: size })
      expect(supportsLocalMapGeometry(map, 'flat', limits)).toBe(false)
      expect(map.unproject).not.toHaveBeenCalled()
    }
  })

  it.each([0.50001, 20, NaN, Infinity])('rejects unsupported pitch %s', (pitch) => {
    const map = makeMap()
    map.getPitch = () => pitch
    expect(supportsLocalMapGeometry(map, 'flat', limits)).toBe(false)
  })

  it('keeps the existing half-degree tolerance', () => {
    const map = makeMap()
    map.getPitch = () => 0.5
    expect(supportsLocalMapGeometry(map, 'flat', limits)).toBe(true)
  })

  it('rejects wide, nonfinite and degenerate footprints', () => {
    const map = makeMap()
    map.unproject.mockImplementation(([x, y]) => ({ lng: (x - 400) / 100, lat: (y - 300) / 100 }))
    expect(supportsLocalMapGeometry(map, 'flat', limits)).toBe(false)
    map.unproject.mockReturnValue({ lat: NaN, lng: 24 })
    expect(supportsLocalMapGeometry(map, 'flat', limits)).toBe(false)
    map.unproject.mockReturnValue({ lat: 59, lng: 24 })
    expect(supportsLocalMapGeometry(map, 'flat', limits)).toBe(false)
  })
})
