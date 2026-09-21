import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import type { Airport } from '../domain/airports'
import {
  AIRPORT_LAYER_IDS,
  LAYER_AIRPORT_LABELS_LARGE,
  LAYER_AIRPORTS_LARGE,
  LAYER_AIRPORTS_MEDIUM,
  SOURCE_AIRPORTS,
  airportFeatures,
  installAirportsStyle,
} from './airportsStyle'
import { LAYER_SELECTED_TRAIL } from './trafficStyle'

const baseStyle = () => ({
  version: 8 as const,
  glyphs: 'https://tiles.example.test/{fontstack}/{range}.pbf',
  sources: {},
  layers: [
    {
      id: 'base-label',
      type: 'symbol' as const,
      source: 'base',
      layout: { 'text-font': ['Noto Sans Regular'] },
    },
  ],
})

const airports: Airport[] = [
  {
    id: '10',
    name: 'FIRST',
    kind: 'large',
    ident: 'FIRST',
    isoCountry: 'EE',
    longitude: 24,
    latitude: 59,
  },
  {
    id: '20',
    name: 'SECOND',
    kind: 'medium',
    ident: 'SECOND',
    isoCountry: 'EE',
    longitude: 25,
    latitude: 60,
  },
]

describe('airport map style', () => {
  it('creates selected GeoJSON with picking-compatible application IDs', () => {
    expect(airportFeatures(airports, '20')).toEqual({
      type: 'FeatureCollection',
      features: [
        expect.objectContaining({
          id: '10',
          properties: expect.objectContaining({
            id: '10',
            selected: false,
          }),
        }),
        expect.objectContaining({
          id: '20',
          properties: expect.objectContaining({
            id: '20',
            selected: true,
          }),
        }),
      ],
    })
  })

  it('is idempotent, zoom-aware, theme-aware, persistent at high zoom, and installs below traffic', () => {
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
    const layers = new Map<string, Record<string, unknown>>([
      [LAYER_SELECTED_TRAIL, { id: LAYER_SELECTED_TRAIL }],
    ])
    const visibility = new Map<string, unknown>()
    const paint = new Map<string, unknown>()
    const addLayer = vi.fn(
      (layer: Record<string, unknown>, before?: string) => {
        layers.set(layer.id as string, { ...layer, before })
      },
    )
    const map = {
      getStyle: baseStyle,
      getSource: (id: string) => sources.get(id),
      addSource: (id: string) => {
        sources.set(id, { setData: vi.fn() })
      },
      getLayer: (id: string) => layers.get(id),
      addLayer,
      setLayoutProperty: (id: string, property: string, value: unknown) => {
        visibility.set(`${id}:${property}`, value)
      },
      setPaintProperty: (id: string, property: string, value: unknown) => {
        paint.set(`${id}:${property}`, value)
      },
    } as unknown as MapLibreMap

    installAirportsStyle(
      map,
      airportFeatures(airports, null),
      'light',
      true,
    )
    installAirportsStyle(
      map,
      airportFeatures(airports, '20'),
      'dark',
      false,
    )

    expect(sources.has(SOURCE_AIRPORTS)).toBe(true)
    expect(sources.get(SOURCE_AIRPORTS)?.setData).toHaveBeenCalledTimes(1)
    expect(addLayer).toHaveBeenCalledTimes(AIRPORT_LAYER_IDS.length)
    expect(
      addLayer.mock.calls.every(([, before]) => before === LAYER_SELECTED_TRAIL),
    ).toBe(true)
    expect(layers.get(LAYER_AIRPORTS_LARGE)).toMatchObject({
      minzoom: 4,
    })
    expect(layers.get(LAYER_AIRPORTS_LARGE)).not.toHaveProperty('maxzoom')
    expect(layers.get(LAYER_AIRPORTS_MEDIUM)).toMatchObject({
      minzoom: 7,
    })
    expect(layers.get(LAYER_AIRPORT_LABELS_LARGE)).toMatchObject({
      layout: { 'text-font': ['Noto Sans Regular'] },
    })
    expect(paint.get(`${LAYER_AIRPORTS_LARGE}:circle-color`)).toEqual([
      'case',
      ['get', 'selected'],
      '#f4f8ff',
      '#8ca6d6',
    ])
    for (const layerId of AIRPORT_LAYER_IDS) {
      expect(visibility.get(`${layerId}:visibility`)).toBe('none')
    }
  })
})
