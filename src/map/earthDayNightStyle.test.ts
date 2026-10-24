import type { LayerSpecification } from 'maplibre-gl'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { EARTH_DAY_NIGHT_CONFIG } from '../config/appConfig'
import {
  installEarthDayNightStyle, LAYER_EARTH_NIGHT, SOURCE_EARTH_DAY_NIGHT,
} from './earthDayNightStyle'

const fixture = () => {
  const sources = new Map<string, { updateImage: ReturnType<typeof vi.fn> }>()
  const layers = new Map<string, LayerSpecification>()
  let zoom = 8
  let image: ImageData | undefined
  const map = {
    getZoom: vi.fn(() => zoom),
    getStyle: vi.fn().mockReturnValue({ layers: [{ id: 'basemap-labels', type: 'symbol' }] }),
    getSource: vi.fn().mockImplementation((id: string) => sources.get(id)),
    addSource: vi.fn().mockImplementation((id: string) => {
      sources.set(id, { updateImage: vi.fn(({ image: next }) => { image = next }) })
    }),
    getLayer: vi.fn().mockImplementation((id: string) => layers.get(id)),
    addLayer: vi.fn().mockImplementation((layer: LayerSpecification) => layers.set(layer.id, layer)),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
  }
  return { map, sources, layers, setZoom: (value: number) => { zoom = value }, image: () => image }
}
const time = Date.parse('2026-06-21T12:00:00Z')

vi.stubGlobal('ImageData', class {
  data: Uint8ClampedArray
  width: number
  height: number
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.data = new Uint8ClampedArray(width * height * 4)
  }
})
afterAll(() => vi.unstubAllGlobals())

describe('persistent Earth context map style', () => {
  it('does not install or compute a source on an ordinary close map', () => {
    const { map } = fixture()
    expect(installEarthDayNightStyle(map, time, 'light', false)).toBeUndefined()
    expect(map.addSource).not.toHaveBeenCalled()
    expect(map.addLayer).not.toHaveBeenCalled()
    expect(map.setLayoutProperty).not.toHaveBeenCalled()
  })

  it('uses one source below labels and traffic, native zoom fading and no glyphs', () => {
    const { map, setZoom, layers, image } = fixture()
    setZoom(2)
    const first = installEarthDayNightStyle(map, time, 'light', false)
    expect(first?.visible).toBe(true)
    const same = installEarthDayNightStyle(map, time + 1_000, 'light', false, first)
    expect(same).toBe(first)
    expect(map.addSource).toHaveBeenCalledTimes(1)
    expect(map.addLayer).toHaveBeenCalledTimes(1)
    for (const [layer, before] of map.addLayer.mock.calls) {
      expect(before).toBe('basemap-labels')
      expect(layer.source).toBe(SOURCE_EARTH_DAY_NIGHT)
      expect(layer.type).not.toBe('symbol')
    }
    const layer = layers.get(LAYER_EARTH_NIGHT)
    expect(layer?.type === 'raster' && layer.paint?.['raster-opacity']).toEqual([
      'interpolate', ['linear'], ['zoom'], EARTH_DAY_NIGHT_CONFIG.fullOpacityMaximumZoom, 0.26,
      EARTH_DAY_NIGHT_CONFIG.maximumZoom, 0,
    ])
    expect(layers.has('earth-terminator')).toBe(false)
    expect(layer?.type === 'raster' && layer.paint?.['raster-resampling']).toBe('linear')
    expect(layer?.type === 'raster' && layer.paint?.['raster-fade-duration']).toBe(0)
    expect(map.addSource.mock.calls[0]?.[1]).toMatchObject({ type: 'image' })
    expect(map.addSource.mock.calls[0]?.[1]).not.toHaveProperty('url')
    expect(image()!.data.byteLength).toBe(512 * 512 * 4)
    expect([...image()!.data.slice(0, 3)]).toEqual([18, 36, 59])
  })

  it('updates only active minute buckets, keeps paused modeled time and does not recompute on theme or capture changes', () => {
    const { map, setZoom, sources } = fixture()
    setZoom(2)
    let state = installEarthDayNightStyle(map, time, 'light', false)
    const shade = state?.shade
    const source = sources.get(SOURCE_EARTH_DAY_NIGHT)!
    state = installEarthDayNightStyle(map, time, 'dark', false, state)
    expect(state?.shade).toBe(shade)
    expect(source.updateImage).toHaveBeenCalledTimes(2)
    source.updateImage.mockClear()
    setZoom(8)
    state = installEarthDayNightStyle(map, time, 'dark', true, state)
    expect(state?.visible).toBe(true)
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      LAYER_EARTH_NIGHT, 'raster-opacity', 0.5,
    )
    expect(source.updateImage).not.toHaveBeenCalled()
    state = installEarthDayNightStyle(map, time + 60_000, 'dark', true, state)
    expect(source.updateImage).toHaveBeenCalledTimes(1)
    const paused = installEarthDayNightStyle(map, time + 60_000, 'dark', true, state)
    expect(paused).toBe(state)
    state = installEarthDayNightStyle(map, time + 60_000, 'dark', false, state)
    expect(state?.visible).toBe(false)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(LAYER_EARTH_NIGHT, 'visibility', 'none')
    state = installEarthDayNightStyle(map, time + 3 * 60_000, 'dark', false, state)
    expect(source.updateImage).toHaveBeenCalledTimes(1)
    setZoom(2)
    state = installEarthDayNightStyle(map, time + 3 * 60_000, 'dark', false, state)
    expect(state?.time).toBe(time + 3 * 60_000)
    expect(source.updateImage).toHaveBeenCalledTimes(2)
    expect(map.addSource).toHaveBeenCalledTimes(1)
  })

  it('rehydrates the current image and mode idempotently after style replacement', () => {
    const { map, sources, layers, image } = fixture()
    const first = installEarthDayNightStyle(map, time, 'dark', true)
    const accepted = image()
    sources.clear()
    layers.clear()
    const next = installEarthDayNightStyle(map, time, 'dark', true, first)
    expect(next?.source).not.toBe(first?.source)
    expect(image()).toEqual(accepted)
    expect(map.addSource).toHaveBeenCalledTimes(2)
    expect(map.addLayer).toHaveBeenCalledTimes(2)
    installEarthDayNightStyle(map, time, 'dark', true, next)
    expect(map.addSource).toHaveBeenCalledTimes(2)
    expect(map.addLayer).toHaveBeenCalledTimes(2)
  })
})
