import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import type { Port } from '../domain/ports'
import {
  LAYER_PORTS_MAJOR,
  LAYER_PORTS_MEDIUM,
  LAYER_PORTS_MINOR,
  LAYER_PORT_LABELS_MAJOR,
  LAYER_PORT_LABELS_MEDIUM,
  LAYER_PORT_LABELS_MINOR,
  PORT_LAYER_IDS,
  SOURCE_PORTS,
  installPortsStyle,
  portFeatures,
} from './portsStyle'
import { LAYER_AIRPORTS_MEDIUM } from './airportsStyle'
import { LAYER_AIRCRAFT_HALO } from './trafficStyle'

const ports: Port[] = [
  {
    id: '10',
    name: 'FIRST',
    rank: 3,
    longitude: 24,
    latitude: 59,
  },
  {
    id: '20',
    name: 'SECOND',
    rank: 8,
    longitude: 25,
    latitude: 60,
  },
]

describe('port map style', () => {
  it('creates selected GeoJSON without turning ports into traffic IDs', () => {
    expect(portFeatures(ports, '20')).toEqual({
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

  it('is idempotent, zoom-aware, theme-aware, and installs below traffic', () => {
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
    const layers = new Map<string, Record<string, unknown>>([
      [LAYER_AIRCRAFT_HALO, { id: LAYER_AIRCRAFT_HALO }],
    ])
    const visibility = new Map<string, unknown>()
    const paint = new Map<string, unknown>()
    const addLayer = vi.fn(
      (layer: Record<string, unknown>, before?: string) => {
        layers.set(layer.id as string, { ...layer, before })
      },
    )
    const map = {
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

    installPortsStyle(map, portFeatures(ports, null), 'light', true)
    installPortsStyle(map, portFeatures(ports, '20'), 'dark', false)

    expect(sources.has(SOURCE_PORTS)).toBe(true)
    expect(sources.get(SOURCE_PORTS)?.setData).toHaveBeenCalledTimes(1)
    expect(addLayer).toHaveBeenCalledTimes(PORT_LAYER_IDS.length)
    expect(addLayer.mock.calls.map(([layer]) => layer.id)).toEqual([
      LAYER_PORTS_MINOR,
      LAYER_PORTS_MEDIUM,
      LAYER_PORTS_MAJOR,
      LAYER_PORT_LABELS_MINOR,
      LAYER_PORT_LABELS_MEDIUM,
      LAYER_PORT_LABELS_MAJOR,
    ])
    expect(
      addLayer.mock.calls.every(([, before]) => before === LAYER_AIRCRAFT_HALO),
    ).toBe(true)
    expect(layers.get(LAYER_PORTS_MAJOR)).toMatchObject({
      minzoom: 5,
      maxzoom: 13,
    })
    expect(paint.get(`${LAYER_PORTS_MAJOR}:circle-color`)).toEqual([
      'case',
      ['get', 'selected'],
      '#f4f8fa',
      '#8fa9b2',
    ])
    for (const layerId of PORT_LAYER_IDS) {
      expect(visibility.get(`${layerId}:visibility`)).toBe('none')
    }
  })

  it('stays below airports when ports load after the airport style', () => {
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
    const layers = new Map<string, Record<string, unknown>>([
      [LAYER_AIRCRAFT_HALO, { id: LAYER_AIRCRAFT_HALO }],
      [LAYER_AIRPORTS_MEDIUM, { id: LAYER_AIRPORTS_MEDIUM }],
    ])
    const addLayer = vi.fn(
      (layer: Record<string, unknown>, before?: string) => {
        layers.set(layer.id as string, { ...layer, before })
      },
    )
    const map = {
      getSource: (id: string) => sources.get(id),
      addSource: (id: string) => {
        sources.set(id, { setData: vi.fn() })
      },
      getLayer: (id: string) => layers.get(id),
      addLayer,
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
    } as unknown as MapLibreMap

    installPortsStyle(map, portFeatures(ports, null), 'light', true)

    expect(
      addLayer.mock.calls.every(
        ([, before]) => before === LAYER_AIRPORTS_MEDIUM,
      ),
    ).toBe(true)
  })
})
