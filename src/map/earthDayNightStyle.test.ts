import type { FeatureCollection, LineString, Polygon } from 'geojson'
import type { LayerSpecification } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import { EARTH_DAY_NIGHT_CONFIG } from '../config/appConfig'
import {
  installEarthDayNightStyle, LAYER_EARTH_NIGHT, LAYER_EARTH_TERMINATOR, SOURCE_EARTH_DAY_NIGHT,
} from './earthDayNightStyle'

const fixture = () => {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers = new Map<string, LayerSpecification>()
  let zoom = 8
  let data: FeatureCollection<Polygon | LineString> | undefined
  const map = {
    getZoom: vi.fn(() => zoom),
    getStyle: vi.fn().mockReturnValue({ layers: [{ id: 'basemap-labels', type: 'symbol' }] }),
    getSource: vi.fn().mockImplementation((id: string) => sources.get(id)),
    addSource: vi.fn().mockImplementation((id: string, source: { data: typeof data }) => {
      data = source.data
      sources.set(id, { setData: vi.fn(next => { data = next }) })
    }),
    getLayer: vi.fn().mockImplementation((id: string) => layers.get(id)),
    addLayer: vi.fn().mockImplementation((layer: LayerSpecification) => layers.set(layer.id, layer)),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
  }
  return { map, sources, layers, setZoom: (value: number) => { zoom = value }, data: () => data }
}
const time = Date.parse('2026-06-21T12:00:00Z')

describe('persistent Earth context map style', () => {
  it('does not install or compute a source on an ordinary close map', () => {
    const { map } = fixture()
    expect(installEarthDayNightStyle(map, time, 'light', false)).toBeUndefined()
    expect(map.addSource).not.toHaveBeenCalled()
    expect(map.addLayer).not.toHaveBeenCalled()
    expect(map.setLayoutProperty).not.toHaveBeenCalled()
  })

  it('uses one source below labels and traffic, native zoom fading and no glyphs', () => {
    const { map, setZoom, layers, data } = fixture()
    setZoom(2)
    const first = installEarthDayNightStyle(map, time, 'light', false)
    expect(first?.visible).toBe(true)
    const same = installEarthDayNightStyle(map, time + 1_000, 'light', false, first)
    expect(same).toBe(first)
    expect(map.addSource).toHaveBeenCalledTimes(1)
    expect(map.addLayer).toHaveBeenCalledTimes(2)
    for (const [layer, before] of map.addLayer.mock.calls) {
      expect(before).toBe('basemap-labels')
      expect(layer.source).toBe(SOURCE_EARTH_DAY_NIGHT)
      expect(layer.type).not.toBe('symbol')
    }
    const fill = layers.get(LAYER_EARTH_NIGHT)
    expect(fill?.type === 'fill' && fill.paint?.['fill-opacity']).toEqual([
      'interpolate', ['linear'], ['zoom'], EARTH_DAY_NIGHT_CONFIG.fullOpacityMaximumZoom, 0.26,
      EARTH_DAY_NIGHT_CONFIG.maximumZoom, 0,
    ])
    expect(layers.get(LAYER_EARTH_TERMINATOR)?.type).toBe('line')
    expect(data()!.features.length).toBeGreaterThan(2)
  })

  it('updates only active minute buckets, keeps paused modeled time and does not recompute on theme or capture changes', () => {
    const { map, setZoom, sources } = fixture()
    setZoom(2)
    let state = installEarthDayNightStyle(map, time, 'light', false)
    const source = sources.get(SOURCE_EARTH_DAY_NIGHT)!
    state = installEarthDayNightStyle(map, time, 'dark', false, state)
    expect(source.setData).not.toHaveBeenCalled()
    setZoom(8)
    state = installEarthDayNightStyle(map, time, 'dark', true, state)
    expect(state?.visible).toBe(true)
    expect(map.setPaintProperty).toHaveBeenCalledWith(LAYER_EARTH_NIGHT, 'fill-opacity', 0.5)
    expect(source.setData).not.toHaveBeenCalled()
    state = installEarthDayNightStyle(map, time + 60_000, 'dark', true, state)
    expect(source.setData).toHaveBeenCalledTimes(1)
    const paused = installEarthDayNightStyle(map, time + 60_000, 'dark', true, state)
    expect(paused).toBe(state)
    state = installEarthDayNightStyle(map, time + 60_000, 'dark', false, state)
    expect(state?.visible).toBe(false)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(LAYER_EARTH_NIGHT, 'visibility', 'none')
    state = installEarthDayNightStyle(map, time + 3 * 60_000, 'dark', false, state)
    expect(source.setData).toHaveBeenCalledTimes(1)
    setZoom(2)
    state = installEarthDayNightStyle(map, time + 3 * 60_000, 'dark', false, state)
    expect(state?.time).toBe(time + 3 * 60_000)
    expect(source.setData).toHaveBeenCalledTimes(2)
    expect(map.addSource).toHaveBeenCalledTimes(1)
  })

  it('rehydrates the current geometry and mode idempotently after style replacement', () => {
    const { map, sources, layers, data } = fixture()
    const first = installEarthDayNightStyle(map, time, 'dark', true)
    const accepted = data()
    sources.clear()
    layers.clear()
    const next = installEarthDayNightStyle(map, time, 'dark', true, first)
    expect(next?.source).not.toBe(first?.source)
    expect(data()).toEqual(accepted)
    expect(map.addSource).toHaveBeenCalledTimes(2)
    expect(map.addLayer).toHaveBeenCalledTimes(4)
    installEarthDayNightStyle(map, time, 'dark', true, next)
    expect(map.addSource).toHaveBeenCalledTimes(2)
    expect(map.addLayer).toHaveBeenCalledTimes(4)
  })
})
