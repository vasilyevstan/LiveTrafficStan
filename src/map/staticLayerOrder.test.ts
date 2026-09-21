import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import {
  AIRPORT_LAYER_IDS,
  airportFeatures,
  installAirportsStyle,
} from './airportsStyle'
import {
  PORT_LAYER_IDS,
  installPortsStyle,
  portFeatures,
} from './portsStyle'
import { LAYER_SELECTED_TRAIL } from './trafficStyle'
import {
  WEATHER_LAYER_IDS,
  installWeatherStyle,
  weatherFeatures,
} from './weatherStyle'

const installers = {
  ports: (map: MapLibreMap) =>
    installPortsStyle(map, portFeatures([], null), 'light', true),
  airports: (map: MapLibreMap) =>
    installAirportsStyle(map, airportFeatures([], null), 'light', true),
  weather: (map: MapLibreMap) =>
    installWeatherStyle(map, weatherFeatures([], null), 'light', true),
}

const permutations = [
  ['ports', 'airports', 'weather'],
  ['ports', 'weather', 'airports'],
  ['airports', 'ports', 'weather'],
  ['airports', 'weather', 'ports'],
  ['weather', 'ports', 'airports'],
  ['weather', 'airports', 'ports'],
] as const

const createMap = () => {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers: string[] = [LAYER_SELECTED_TRAIL]
  const map = {
    getStyle: () => ({
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
    }),
    getSource: (id: string) => sources.get(id),
    addSource: (id: string) => {
      sources.set(id, { setData: vi.fn() })
    },
    getLayer: (id: string) =>
      layers.includes(id) ? { id } : undefined,
    addLayer: (layer: { id: string }, before?: string) => {
      const index = before ? layers.indexOf(before) : -1
      if (index >= 0) layers.splice(index, 0, layer.id)
      else layers.push(layer.id)
    },
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
  } as unknown as MapLibreMap
  return { map, layers }
}

const range = (order: readonly string[], ids: readonly string[]) => {
  const indexes = ids.map((id) => order.indexOf(id))
  return {
    first: Math.min(...indexes),
    last: Math.max(...indexes),
  }
}

describe('static context layer order', () => {
  it.each(permutations)(
    'keeps ports below airports below weather for %s, %s, %s loading',
    (first, second, third) => {
      const { map, layers } = createMap()
      installers[first](map)
      installers[second](map)
      installers[third](map)

      const ports = range(layers, PORT_LAYER_IDS)
      const airports = range(layers, AIRPORT_LAYER_IDS)
      const weather = range(layers, WEATHER_LAYER_IDS)
      expect(ports.last).toBeLessThan(airports.first)
      expect(airports.last).toBeLessThan(weather.first)
      expect(weather.last).toBeLessThan(
        layers.indexOf(LAYER_SELECTED_TRAIL),
      )
    },
  )
})
