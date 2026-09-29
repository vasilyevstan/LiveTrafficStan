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
import {
  installOrbitalStyle,
  LAYER_ORBITAL_HIGHLIGHT,
  LAYER_ORBITAL_POINTS,
  LAYER_ORBITAL_TRACK,
  orbitalHighlightFeatures,
  orbitalPositionFeatures,
  orbitalTrackFeatures,
} from './orbitalStyle'
import {
  ORBITAL_STYLE_IMAGE_IDS,
  type OrbitalStyleImages,
} from './orbitalIcons'

const orbitalImages = Object.fromEntries(
  ORBITAL_STYLE_IMAGE_IDS.map((id) => [id, { id }]),
) as unknown as OrbitalStyleImages

const installers = {
  ports: (map: MapLibreMap) =>
    installPortsStyle(map, portFeatures([], null), 'light', true),
  airports: (map: MapLibreMap) =>
    installAirportsStyle(map, airportFeatures([], null), 'light', true),
  weather: (map: MapLibreMap) =>
    installWeatherStyle(map, weatherFeatures([], null), 'light', true),
  orbital: (map: MapLibreMap) =>
    installOrbitalStyle(
      map,
      orbitalPositionFeatures([]),
      orbitalHighlightFeatures([], null),
      orbitalTrackFeatures([]),
      'light',
      true,
      orbitalImages,
    ),
}

type InstallerName = keyof typeof installers

const permutations = (
  values: readonly InstallerName[],
): InstallerName[][] =>
  values.length === 0
    ? [[]]
    : values.flatMap((value, index) =>
        permutations(values.filter((_, itemIndex) => itemIndex !== index)).map(
          (remaining) => [value, ...remaining],
        ),
      )

const installationOrders = permutations([
  'ports',
  'airports',
  'weather',
  'orbital',
])
const installationRows = installationOrders.map((order) => [order] as const)

const createMap = () => {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers: string[] = [LAYER_SELECTED_TRAIL]
  const images = new Set<string>()
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
    hasImage: (id: string) => images.has(id),
    addImage: (id: string) => {
      images.add(id)
    },
    updateImage: vi.fn(),
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
  it.each(installationRows)(
    'keeps static context and orbital layers ordered for %s loading',
    (order) => {
      const { map, layers } = createMap()
      for (const installer of order) installers[installer](map)

      const ports = range(layers, PORT_LAYER_IDS)
      const airports = range(layers, AIRPORT_LAYER_IDS)
      const weather = range(layers, WEATHER_LAYER_IDS)
      const orbital = range(layers, [
        LAYER_ORBITAL_TRACK,
        LAYER_ORBITAL_POINTS,
        LAYER_ORBITAL_HIGHLIGHT,
      ])
      expect(ports.last).toBeLessThan(airports.first)
      expect(airports.last).toBeLessThan(weather.first)
      expect(weather.last).toBeLessThan(orbital.first)
      expect(orbital.last).toBeLessThan(
        layers.indexOf(LAYER_SELECTED_TRAIL),
      )
    },
  )
})
