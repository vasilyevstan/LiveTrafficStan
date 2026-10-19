import type { LayerSpecification, SourceSpecification, StyleSpecification } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import { BASEMAP_DETAIL_CONFIG, DEFAULT_MAP_STYLE_URLS } from '../config/appConfig'
import { createBasemapRelief, LAYER_BASEMAP_RELIEF } from './basemapRelief'

const fixture = () => {
  const sources = new Map<string, SourceSpecification>()
  const layers = new Map<string, LayerSpecification>([
    ['water', { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' }],
  ])
  const map = {
    getStyle: (): StyleSpecification => ({
      version: 8, sources: Object.fromEntries(sources), layers: [...layers.values()],
    }),
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => layers.get(id),
    addSource: vi.fn((id: string, source: SourceSpecification) => { sources.set(id, source) }),
    removeSource: vi.fn((id: string) => { sources.delete(id) }),
    addLayer: vi.fn((layer: LayerSpecification, _before?: string) => { layers.set(layer.id, layer) }),
    removeLayer: vi.fn((id: string) => { layers.delete(id) }),
    setPaintProperty: vi.fn(),
  }
  const onStatus = vi.fn()
  return { map, sources, layers, onStatus, relief: createBasemapRelief(map, onStatus) }
}

describe('optional basemap relief', () => {
  it('does no source or layer work while off', () => {
    const { map, relief, onStatus } = fixture()
    relief.install('light', DEFAULT_MAP_STYLE_URLS.light, false)
    expect(map.addSource).not.toHaveBeenCalled()
    expect(map.addLayer).not.toHaveBeenCalled()
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('uses one coarse native DEM source and hillshade below water, never terrain geometry', () => {
    const { map, relief, onStatus } = fixture()
    relief.install('light', DEFAULT_MAP_STYLE_URLS.light, true)
    relief.install('light', DEFAULT_MAP_STYLE_URLS.light, true)
    expect(map.addSource).toHaveBeenCalledExactlyOnceWith('basemap-relief-1', {
      type: 'raster-dem', encoding: 'terrarium', tileSize: 256,
      tiles: [BASEMAP_DETAIL_CONFIG.reliefTileTemplate], maxzoom: 7,
      attribution: expect.stringContaining('Mapzen and terrain contributors'),
    })
    expect(map.addLayer).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      id: LAYER_BASEMAP_RELIEF, type: 'hillshade', source: 'basemap-relief-1',
      minzoom: 4, maxzoom: 14,
    }), 'water')
    expect(onStatus).toHaveBeenCalledExactlyOnceWith('enabled')
  })

  it('updates theme paint without reacquisition or a duplicate layer', () => {
    const { map, relief } = fixture()
    relief.install('light', DEFAULT_MAP_STYLE_URLS.light, true)
    relief.install('dark', DEFAULT_MAP_STYLE_URLS.dark, true)
    relief.install('light', DEFAULT_MAP_STYLE_URLS.light, true)
    expect(map.addSource).toHaveBeenCalledTimes(1)
    expect(map.addLayer).toHaveBeenCalledTimes(1)
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      LAYER_BASEMAP_RELIEF, 'hillshade-shadow-color', '#6b6558',
    )
  })

  it('removes its layer before its source and fences errors from an older activation', () => {
    const { map, relief, sources, onStatus } = fixture()
    relief.install('light', DEFAULT_MAP_STYLE_URLS.light, true)
    relief.install('light', DEFAULT_MAP_STYLE_URLS.light, false)
    expect(map.removeLayer.mock.invocationCallOrder[0]).toBeLessThan(map.removeSource.mock.invocationCallOrder[0])
    expect(sources.size).toBe(0)
    relief.install('light', DEFAULT_MAP_STYLE_URLS.light, true)
    expect(sources.has('basemap-relief-2')).toBe(true)
    expect(relief.handleError({ sourceId: 'basemap-relief-1', error: new Error('Late error') })).toBe(true)
    expect(sources.has('basemap-relief-2')).toBe(true)
    expect(onStatus).not.toHaveBeenCalledWith('unavailable')
  })

  it('isolates active relief failure, retains water and does not retry on theme/style work', () => {
    const { map, relief, layers, onStatus } = fixture()
    relief.install('light', DEFAULT_MAP_STYLE_URLS.light, true)
    expect(relief.handleError({ sourceId: 'basemap-relief-1', error: new Error('HTTP 503') })).toBe(true)
    expect(layers.has('water')).toBe(true)
    expect(layers.has(LAYER_BASEMAP_RELIEF)).toBe(false)
    expect(onStatus).toHaveBeenLastCalledWith('unavailable')
    relief.install('dark', DEFAULT_MAP_STYLE_URLS.dark, true)
    expect(map.addSource).toHaveBeenCalledTimes(1)
    relief.install('dark', DEFAULT_MAP_STYLE_URLS.dark, false)
    relief.install('dark', DEFAULT_MAP_STYLE_URLS.dark, true)
    expect(map.addSource).toHaveBeenCalledTimes(2)
    expect(onStatus).toHaveBeenLastCalledWith('enabled')
  })

  it('reinstalls once after real style removal and ignores the obsolete source generation', () => {
    const { map, relief, sources, layers, onStatus } = fixture()
    relief.install('light', DEFAULT_MAP_STYLE_URLS.light, true)
    sources.clear()
    layers.delete(LAYER_BASEMAP_RELIEF)
    expect(relief.handleError({ sourceId: 'basemap-relief-1' })).toBe(true)
    expect(onStatus).not.toHaveBeenCalledWith('unavailable')
    relief.install('dark', DEFAULT_MAP_STYLE_URLS.dark, true)
    expect(map.addSource).toHaveBeenLastCalledWith('basemap-relief-2', expect.any(Object))
    expect(map.addLayer).toHaveBeenCalledTimes(2)
    expect(relief.handleError({ sourceId: 'basemap-relief-1' })).toBe(true)
    expect(sources.has('basemap-relief-2')).toBe(true)
  })

  it.each(['fallback:light', DEFAULT_MAP_STYLE_URLS.dark, 'https://example.test/custom.json'])(
    'does not attach to custom, fallback or mismatched styles: %s', styleUrl => {
      const { map, relief, onStatus } = fixture()
      relief.install('light', styleUrl, true)
      expect(map.addSource).not.toHaveBeenCalled()
      expect(onStatus).toHaveBeenLastCalledWith('unsupported')
    },
  )

  it.each([null, {}, { sourceId: 'traffic-aircraft' }, { error: new Error('Basemap error') }])(
    'leaves unrelated map errors to their current owners', event => {
      expect(fixture().relief.handleError(event)).toBe(false)
    },
  )

  it('removes only its own resources and cannot revive after disposal', () => {
    const { map, relief, layers, onStatus } = fixture()
    relief.install('light', DEFAULT_MAP_STYLE_URLS.light, true)
    relief.dispose()
    const calls = onStatus.mock.calls.length
    relief.install('light', DEFAULT_MAP_STYLE_URLS.light, true)
    relief.handleError({ sourceId: 'basemap-relief-1' })
    expect(map.addSource).toHaveBeenCalledTimes(1)
    expect(layers.has('water')).toBe(true)
    expect(onStatus).toHaveBeenCalledTimes(calls)
  })
})
