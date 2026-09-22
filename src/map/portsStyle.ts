import type { Feature, FeatureCollection, Point } from 'geojson'
import {
  type FilterSpecification,
  type GeoJSONSource,
  type LayerSpecification,
  type Map as MapLibreMap,
} from 'maplibre-gl'
import type { Theme } from '../app/theme'
import type { Port } from '../domain/ports'
import { LAYER_AIRPORTS_MEDIUM } from './airportsStyle'
import { mapTextFont, type MapTextFont } from './textFont'
import { LAYER_SELECTED_TRAIL } from './trafficStyle'
import { LAYER_WEATHER_HALO } from './weatherStyle'

export const SOURCE_PORTS = 'context-ports'
export const LAYER_PORTS_MAJOR = 'context-ports-major'
export const LAYER_PORTS_MEDIUM = 'context-ports-medium'
export const LAYER_PORTS_MINOR = 'context-ports-minor'
export const LAYER_PORT_LABELS_MAJOR = 'context-port-labels-major'
export const LAYER_PORT_LABELS_MEDIUM = 'context-port-labels-medium'
export const LAYER_PORT_LABELS_MINOR = 'context-port-labels-minor'

export const PORT_LAYER_IDS = [
  LAYER_PORTS_MAJOR,
  LAYER_PORTS_MEDIUM,
  LAYER_PORTS_MINOR,
  LAYER_PORT_LABELS_MAJOR,
  LAYER_PORT_LABELS_MEDIUM,
  LAYER_PORT_LABELS_MINOR,
] as const

const rankFilters: Record<
  'major' | 'medium' | 'minor',
  FilterSpecification
> = {
  major: ['<=', ['get', 'rank'], 4],
  medium: [
    'all',
    ['>=', ['get', 'rank'], 5],
    ['<=', ['get', 'rank'], 6],
  ],
  minor: ['>=', ['get', 'rank'], 7],
}

const themePaint = (theme: Theme) =>
  theme === 'dark'
    ? {
        fill: '#8fa9b2',
        selected: '#f4f8fa',
        stroke: '#16272d',
        text: '#d8e3e7',
        halo: '#142229',
      }
    : {
        fill: '#607b84',
        selected: '#203b44',
        stroke: '#f5fbfc',
        text: '#304c55',
        halo: '#f7fbfc',
      }

export const portFeatures = (
  ports: readonly Port[],
  selectedPortId: string | null,
): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: ports.map(
    (port): Feature<Point> => ({
      type: 'Feature',
      id: port.id,
      properties: {
        id: port.id,
        name: port.name,
        rank: port.rank,
        selected: port.id === selectedPortId,
      },
      geometry: {
        type: 'Point',
        coordinates: [port.longitude, port.latitude],
      },
    }),
  ),
})

const setSourceData = (
  map: MapLibreMap,
  data: FeatureCollection<Point>,
) => {
  const source = map.getSource(SOURCE_PORTS)
  if (source) {
    ;(source as GeoJSONSource).setData(data)
  } else {
    map.addSource(SOURCE_PORTS, {
      type: 'geojson',
      data,
    })
  }
}

const ensureLayer = (
  map: MapLibreMap,
  layer: LayerSpecification,
) => {
  if (!map.getLayer(layer.id)) {
    const beforeLayer = map.getLayer(LAYER_AIRPORTS_MEDIUM)
      ? LAYER_AIRPORTS_MEDIUM
      : map.getLayer(LAYER_WEATHER_HALO)
        ? LAYER_WEATHER_HALO
        : map.getLayer(LAYER_SELECTED_TRAIL)
          ? LAYER_SELECTED_TRAIL
          : undefined
    map.addLayer(layer, beforeLayer)
  }
}

const circleLayer = (
  id: string,
  filter: FilterSpecification,
  minzoom: number,
  paint: ReturnType<typeof themePaint>,
): LayerSpecification => ({
  id,
  type: 'circle',
  source: SOURCE_PORTS,
  minzoom,
  maxzoom: 13,
  filter,
  paint: {
    'circle-radius': [
      'case',
      ['get', 'selected'],
      6,
      3.5,
    ],
    'circle-color': [
      'case',
      ['get', 'selected'],
      paint.selected,
      paint.fill,
    ],
    'circle-opacity': 0.82,
    'circle-stroke-color': paint.stroke,
    'circle-stroke-width': [
      'case',
      ['get', 'selected'],
      2,
      1,
    ],
  },
})

const labelLayer = (
  id: string,
  filter: FilterSpecification,
  minzoom: number,
  paint: ReturnType<typeof themePaint>,
  textFont: MapTextFont,
): LayerSpecification => ({
  id,
  type: 'symbol',
  source: SOURCE_PORTS,
  minzoom,
  maxzoom: 13,
  filter,
  layout: {
    'text-field': ['get', 'name'],
    'text-font': textFont,
    'text-size': 11,
    'text-offset': [0, 0.9],
    'text-anchor': 'top',
    'text-optional': true,
    'symbol-sort-key': ['get', 'rank'],
  },
  paint: {
    'text-color': paint.text,
    'text-halo-color': paint.halo,
    'text-halo-width': 1.3,
  },
})

export const setPortsVisibility = (
  map: MapLibreMap,
  visible: boolean,
) => {
  for (const layerId of PORT_LAYER_IDS) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(
        layerId,
        'visibility',
        visible ? 'visible' : 'none',
      )
    }
  }
}

export const installPortsStyle = (
  map: MapLibreMap,
  data: FeatureCollection<Point>,
  theme: Theme,
  visible: boolean,
) => {
  const paint = themePaint(theme)
  const textFont = mapTextFont(map)
  setSourceData(map, data)

  for (const layer of [
    circleLayer(LAYER_PORTS_MINOR, rankFilters.minor, 9, paint),
    circleLayer(LAYER_PORTS_MEDIUM, rankFilters.medium, 7, paint),
    circleLayer(LAYER_PORTS_MAJOR, rankFilters.major, 5, paint),
    ...(textFont
      ? [
          labelLayer(
            LAYER_PORT_LABELS_MINOR,
            rankFilters.minor,
            10,
            paint,
            textFont,
          ),
          labelLayer(
            LAYER_PORT_LABELS_MEDIUM,
            rankFilters.medium,
            8,
            paint,
            textFont,
          ),
          labelLayer(
            LAYER_PORT_LABELS_MAJOR,
            rankFilters.major,
            6,
            paint,
            textFont,
          ),
        ]
      : []),
  ]) {
    ensureLayer(map, layer)
  }
  if (textFont) {
    for (const layerId of [
      LAYER_PORT_LABELS_MAJOR,
      LAYER_PORT_LABELS_MEDIUM,
      LAYER_PORT_LABELS_MINOR,
    ]) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'text-font', textFont)
      }
    }
  }

  for (const layerId of [
    LAYER_PORTS_MAJOR,
    LAYER_PORTS_MEDIUM,
    LAYER_PORTS_MINOR,
  ]) {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'circle-color', [
        'case',
        ['get', 'selected'],
        paint.selected,
        paint.fill,
      ])
      map.setPaintProperty(
        layerId,
        'circle-stroke-color',
        paint.stroke,
      )
    }
  }
  for (const layerId of [
    LAYER_PORT_LABELS_MAJOR,
    LAYER_PORT_LABELS_MEDIUM,
    LAYER_PORT_LABELS_MINOR,
  ]) {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'text-color', paint.text)
      map.setPaintProperty(layerId, 'text-halo-color', paint.halo)
    }
  }

  setPortsVisibility(map, visible)
}
