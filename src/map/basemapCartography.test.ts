import type { StyleSpecification } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_MAP_STYLE_URLS } from '../config/appConfig'
import {
  applyBasemapCartography,
  needsBasemapStyleReset,
} from './basemapCartography'
import { trafficIconTreatment } from './icons'

const style = (): StyleSpecification => ({
  version: 8,
  sources: {
    openmaptiles: { type: 'vector', url: 'https://tiles.example.test/planet' },
    traffic: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [
    { id: 'background', type: 'background' },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' },
    {
      id: 'landcover_wood', type: 'fill', source: 'openmaptiles',
      'source-layer': 'landcover', minzoom: 10, maxzoom: 20,
      filter: ['==', ['get', 'class'], 'wood'],
      paint: { 'fill-pattern': 'wood-pattern', 'fill-opacity': 0.4 },
    },
    {
      id: 'building', type: 'fill', source: 'openmaptiles',
      'source-layer': 'building', minzoom: 12,
    },
    {
      id: 'highway_primary_casing', type: 'line', source: 'openmaptiles',
      'source-layer': 'transportation', paint: { 'line-width': 3 },
    },
    {
      id: 'highway_primary', type: 'line', source: 'openmaptiles',
      'source-layer': 'transportation', paint: { 'line-width': 2 },
    },
    {
      id: 'boundary_disputed', type: 'line', source: 'openmaptiles',
      'source-layer': 'boundary', paint: { 'line-dasharray': [1, 2] },
    },
    {
      id: 'water_label', type: 'symbol', source: 'openmaptiles',
      'source-layer': 'water_name',
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'] },
    },
    {
      id: 'city_label', type: 'symbol', source: 'openmaptiles',
      'source-layer': 'place', layout: { 'text-field': ['get', 'name'] },
    },
    {
      id: 'road_label', type: 'symbol', source: 'openmaptiles',
      'source-layer': 'transportation_name', layout: { 'text-field': ['get', 'name'] },
    },
    { id: 'traffic-aircraft-symbols', type: 'symbol', source: 'traffic' },
    {
      id: 'landcover_glacier', type: 'fill', source: 'openmaptiles',
      'source-layer': 'landcover',
    },
  ],
})

const fakeMap = (base = style()) => ({
  getStyle: () => base,
  setPaintProperty: vi.fn(),
  setLayerZoomRange: vi.fn(),
})

const luminance = (hex: string) => {
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

const contrast = (first: string, second: string) => {
  const levels = [luminance(first), luminance(second)].sort((a, b) => a - b)
  return (levels[1] + 0.05) / (levels[0] + 0.05)
}

describe('atlas basemap cartography', () => {
  it.each([
    [DEFAULT_MAP_STYLE_URLS.light, 'light', 'dark', true],
    [DEFAULT_MAP_STYLE_URLS.dark, 'dark', 'light', true],
    [DEFAULT_MAP_STYLE_URLS.light, 'light', 'light', false],
    [DEFAULT_MAP_STYLE_URLS.dark, 'dark', 'dark', false],
    [DEFAULT_MAP_STYLE_URLS.dark, 'light', 'dark', false],
    ['https://example.test/custom.json', 'light', 'dark', false],
  ] as const)('resets shared-style atlas paint only when leaving its owning theme', (url, previous, next, reset) => {
    expect(needsBasemapStyleReset(url, previous, next)).toBe(reset)
  })

  it.each(['light', 'dark'] as const)('colors %s geography without modifying source or label semantics', (theme) => {
    const base = style()
    const original = structuredClone(base)
    const map = fakeMap(base)
    applyBasemapCartography(map, theme, DEFAULT_MAP_STYLE_URLS[theme])

    expect(base).toEqual(original)
    expect(map.setPaintProperty).toHaveBeenCalledWith('water', 'fill-color', expect.any(String))
    expect(map.setPaintProperty).toHaveBeenCalledWith('building', 'fill-outline-color', expect.any(String))
    expect(map.setPaintProperty).toHaveBeenCalledWith('landcover_wood', 'fill-pattern', undefined)
    expect(map.setLayerZoomRange).toHaveBeenCalledExactlyOnceWith('landcover_wood', 5, 20)
    expect(map.setPaintProperty.mock.calls.some(([id]) => id === 'traffic-aircraft-symbols')).toBe(false)
    expect(map.setPaintProperty.mock.calls.some(([id]) => id === 'landcover_glacier')).toBe(false)
    expect(map.setPaintProperty.mock.calls.some(([, key]) => key === 'line-dasharray' || key === 'line-width')).toBe(false)
  })

  it('reinstalls the same light appearance after light-dark-light style replacement', () => {
    const map = fakeMap()
    applyBasemapCartography(map, 'light', DEFAULT_MAP_STYLE_URLS.light)
    const first = structuredClone(map.setPaintProperty.mock.calls)
    map.setPaintProperty.mockClear()
    applyBasemapCartography(map, 'dark', DEFAULT_MAP_STYLE_URLS.dark)
    expect(map.setPaintProperty.mock.calls).not.toEqual(first)
    map.setPaintProperty.mockClear()
    applyBasemapCartography(map, 'light', DEFAULT_MAP_STYLE_URLS.light)
    expect(map.setPaintProperty.mock.calls).toEqual(first)
  })

  it.each([
    'https://example.test/custom-style.json',
    'fallback:light',
    'fallback:dark',
    DEFAULT_MAP_STYLE_URLS.dark,
  ])('leaves custom/fallback/mismatched styles untouched: %s', (url) => {
    const map = fakeMap()
    applyBasemapCartography(map, 'light', url)
    expect(map.setPaintProperty).not.toHaveBeenCalled()
    expect(map.setLayerZoomRange).not.toHaveBeenCalled()
  })

  it('does not recolor a different vector source with matching layer names', () => {
    const map = fakeMap({
      version: 8,
      sources: {
        custom: { type: 'vector', url: 'https://tiles.example.test/custom' },
      },
      layers: [
        {
          id: 'landcover_wood',
          type: 'fill',
          source: 'custom',
          'source-layer': 'landcover',
        },
      ],
    })
    applyBasemapCartography(map, 'light', DEFAULT_MAP_STYLE_URLS.light)
    expect(map.setPaintProperty).not.toHaveBeenCalled()
    expect(map.setLayerZoomRange).not.toHaveBeenCalled()
  })

  it.each(['light', 'dark'] as const)('keeps %s map labels above 4.5:1 against their halos', (theme) => {
    const map = fakeMap()
    applyBasemapCartography(map, theme, DEFAULT_MAP_STYLE_URLS[theme])
    for (const id of ['city_label', 'road_label', 'water_label']) {
      const color = map.setPaintProperty.mock.calls.find(([layer, key]) => layer === id && key === 'text-color')?.[2]
      const halo = map.setPaintProperty.mock.calls.find(([layer, key]) => layer === id && key === 'text-halo-color')?.[2]
      if (typeof color !== 'string' || typeof halo !== 'string') {
        throw new Error(`Missing label paint for ${id}`)
      }
      expect(contrast(color, halo)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(['light', 'dark'] as const)('preserves %s blue vessel contrast over water', (theme) => {
    const map = fakeMap()
    applyBasemapCartography(map, theme, DEFAULT_MAP_STYLE_URLS[theme])
    const water = map.setPaintProperty.mock.calls.find(
      ([layer, key]) => layer === 'water' && key === 'fill-color',
    )?.[2]
    if (typeof water !== 'string') throw new Error('Missing water color')
    expect(
      contrast(trafficIconTreatment(theme).vesselFill, water),
    ).toBeGreaterThanOrEqual(3)
  })
})
