import type { Feature, FeatureCollection, Point } from 'geojson'
import {
  type FilterSpecification,
  type GeoJSONSource,
  type LayerSpecification,
  type Map as MapLibreMap,
} from 'maplibre-gl'
import type { Theme } from '../app/theme'
import type { Airport } from '../domain/airports'
import { LAYER_SELECTED_TRAIL } from './trafficStyle'
import { LAYER_WEATHER_HALO } from './weatherStyle'

export const SOURCE_AIRPORTS = 'context-airports'
export const LAYER_AIRPORTS_LARGE = 'context-airports-large'
export const LAYER_AIRPORTS_MEDIUM = 'context-airports-medium'
export const LAYER_AIRPORT_LABELS_LARGE = 'context-airport-labels-large'
export const LAYER_AIRPORT_LABELS_MEDIUM = 'context-airport-labels-medium'

export const AIRPORT_LAYER_IDS = [
  LAYER_AIRPORTS_LARGE,
  LAYER_AIRPORTS_MEDIUM,
  LAYER_AIRPORT_LABELS_LARGE,
  LAYER_AIRPORT_LABELS_MEDIUM,
] as const

const kindFilter = (kind: Airport['kind']): FilterSpecification => [
  '==',
  ['get', 'kind'],
  kind,
]

const themePaint = (theme: Theme) =>
  theme === 'dark'
    ? {
        fill: '#8ca6d6',
        selected: '#f4f8ff',
        stroke: '#15233d',
        text: '#dce7fb',
        halo: '#121d32',
      }
    : {
        fill: '#607aa7',
        selected: '#21375f',
        stroke: '#f5f8ff',
        text: '#304a76',
        halo: '#f8faff',
      }

export const airportFeatures = (
  airports: readonly Airport[],
  selectedAirportId: string | null,
): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: airports.map(
    (airport): Feature<Point> => ({
      type: 'Feature',
      id: airport.id,
      properties: {
        id: airport.id,
        name: airport.name,
        kind: airport.kind,
        selected: airport.id === selectedAirportId,
      },
      geometry: {
        type: 'Point',
        coordinates: [airport.longitude, airport.latitude],
      },
    }),
  ),
})

const setSourceData = (
  map: MapLibreMap,
  data: FeatureCollection<Point>,
) => {
  const source = map.getSource(SOURCE_AIRPORTS)
  if (source) {
    ;(source as GeoJSONSource).setData(data)
  } else {
    map.addSource(SOURCE_AIRPORTS, {
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
    map.addLayer(
      layer,
      map.getLayer(LAYER_WEATHER_HALO)
        ? LAYER_WEATHER_HALO
        : map.getLayer(LAYER_SELECTED_TRAIL)
          ? LAYER_SELECTED_TRAIL
          : undefined,
    )
  }
}

const circleLayer = (
  id: string,
  kind: Airport['kind'],
  minzoom: number,
  radius: number,
  paint: ReturnType<typeof themePaint>,
): LayerSpecification => ({
  id,
  type: 'circle',
  source: SOURCE_AIRPORTS,
  minzoom,
  filter: kindFilter(kind),
  paint: {
    'circle-radius': ['case', ['get', 'selected'], radius + 2, radius],
    'circle-color': [
      'case',
      ['get', 'selected'],
      paint.selected,
      paint.fill,
    ],
    'circle-opacity': 0.84,
    'circle-stroke-color': paint.stroke,
    'circle-stroke-width': ['case', ['get', 'selected'], 2, 1],
  },
})

const labelLayer = (
  id: string,
  kind: Airport['kind'],
  minzoom: number,
  paint: ReturnType<typeof themePaint>,
): LayerSpecification => ({
  id,
  type: 'symbol',
  source: SOURCE_AIRPORTS,
  minzoom,
  filter: kindFilter(kind),
  layout: {
    'text-field': ['get', 'name'],
    'text-size': 11,
    'text-offset': [0, 1],
    'text-anchor': 'top',
    'text-optional': true,
  },
  paint: {
    'text-color': paint.text,
    'text-halo-color': paint.halo,
    'text-halo-width': 1.3,
  },
})

export const setAirportsVisibility = (
  map: MapLibreMap,
  visible: boolean,
) => {
  for (const layerId of AIRPORT_LAYER_IDS) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(
        layerId,
        'visibility',
        visible ? 'visible' : 'none',
      )
    }
  }
}

export const installAirportsStyle = (
  map: MapLibreMap,
  data: FeatureCollection<Point>,
  theme: Theme,
  visible: boolean,
) => {
  const paint = themePaint(theme)
  setSourceData(map, data)

  for (const layer of [
    circleLayer(LAYER_AIRPORTS_MEDIUM, 'medium', 7, 3.5, paint),
    circleLayer(LAYER_AIRPORTS_LARGE, 'large', 4, 4.5, paint),
    labelLayer(LAYER_AIRPORT_LABELS_MEDIUM, 'medium', 8, paint),
    labelLayer(LAYER_AIRPORT_LABELS_LARGE, 'large', 5, paint),
  ]) {
    ensureLayer(map, layer)
  }

  for (const layerId of [
    LAYER_AIRPORTS_LARGE,
    LAYER_AIRPORTS_MEDIUM,
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
    LAYER_AIRPORT_LABELS_LARGE,
    LAYER_AIRPORT_LABELS_MEDIUM,
  ]) {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'text-color', paint.text)
      map.setPaintProperty(layerId, 'text-halo-color', paint.halo)
    }
  }

  setAirportsVisibility(map, visible)
}
