import type { FeatureCollection, Point } from 'geojson'
import type {
  GeoJSONSource,
  ExpressionSpecification,
  LayerSpecification,
  Map as MapLibreMap,
} from 'maplibre-gl'
import type { Theme } from '../app/theme'
import type { DisplayWeatherObservation } from '../domain/weatherObservations'
import {
  LAYER_SELECTED_TRAIL,
  setTrafficLayerVisibility,
} from './trafficStyle'
import { mapTextFont } from './textFont'

export const SOURCE_WEATHER = 'context-weather'
export const LAYER_WEATHER_HALO = 'context-weather-halo'
export const LAYER_WEATHER_POINTS = 'context-weather-points'
export const LAYER_WEATHER_LABELS = 'context-weather-labels'
export const WEATHER_LAYER_IDS = [
  LAYER_WEATHER_LABELS,
  LAYER_WEATHER_POINTS,
  LAYER_WEATHER_HALO,
] as const

const SOURCE_ATTRIBUTION =
  'METAR/SPECI: <a href="https://aviationweather.gov/data/api/" target="_blank" rel="noreferrer">NOAA/NWS Aviation Weather Center</a> (U.S. public domain unless marked otherwise)'

const categoryColor = (theme: Theme): ExpressionSpecification => [
  'match',
  ['get', 'category'],
  'VFR',
  theme === 'dark' ? '#3fcf8e' : '#167a4b',
  'MVFR',
  theme === 'dark' ? '#63b3ff' : '#2768b2',
  'IFR',
  theme === 'dark' ? '#ff7070' : '#b72f36',
  'LIFR',
  theme === 'dark' ? '#e67bff' : '#8d3aa8',
  theme === 'dark' ? '#8b9ca7' : '#5f7078',
]

const themePaint = (theme: Theme) => ({
  halo: theme === 'dark' ? '#f8fdff' : '#102f3a',
  stroke: theme === 'dark' ? '#effcff' : '#ffffff',
  text: '#ffffff',
  textHalo: theme === 'dark' ? '#07131d' : '#173944',
})

export const weatherFeatures = (
  observations: readonly DisplayWeatherObservation[],
  selectedId: string | null,
): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: observations.map((observation) => ({
    type: 'Feature',
    id: observation.id,
    properties: {
      id: observation.id,
      stationId: observation.stationId,
      category: observation.flightCategory,
      selected: observation.id === selectedId,
      stale: observation.freshness === 'stale',
    },
    geometry: {
      type: 'Point',
      coordinates: [observation.longitude, observation.latitude],
    },
  })),
})

const ensureSource = (
  map: MapLibreMap,
  data: FeatureCollection<Point>,
) => {
  const source = map.getSource(SOURCE_WEATHER)
  if (source) {
    ;(source as GeoJSONSource).setData(data)
  } else {
    map.addSource(SOURCE_WEATHER, {
      type: 'geojson',
      data,
      attribution: SOURCE_ATTRIBUTION,
    })
  }
}

const ensureLayer = (map: MapLibreMap, layer: LayerSpecification) => {
  if (!map.getLayer(layer.id)) {
    map.addLayer(
      layer,
      map.getLayer(LAYER_SELECTED_TRAIL)
        ? LAYER_SELECTED_TRAIL
        : undefined,
    )
  }
}

export const setWeatherVisibility = (
  map: MapLibreMap,
  visible: boolean,
) => {
  for (const layerId of WEATHER_LAYER_IDS) {
    setTrafficLayerVisibility(map, layerId, visible)
  }
}

export const installWeatherStyle = (
  map: MapLibreMap,
  data: FeatureCollection<Point>,
  theme: Theme,
  visible: boolean,
) => {
  const paint = themePaint(theme)
  const fill = categoryColor(theme)
  const textFont = mapTextFont(map)
  ensureSource(map, data)

  ensureLayer(map, {
    id: LAYER_WEATHER_HALO,
    type: 'circle',
    source: SOURCE_WEATHER,
    filter: ['==', ['get', 'selected'], true],
    paint: {
      'circle-radius': 17,
      'circle-color': paint.halo,
      'circle-opacity': 0.16,
      'circle-stroke-color': paint.halo,
      'circle-stroke-opacity': 0.9,
      'circle-stroke-width': 2,
    },
  })
  ensureLayer(map, {
    id: LAYER_WEATHER_POINTS,
    type: 'circle',
    source: SOURCE_WEATHER,
    paint: {
      'circle-radius': 13,
      'circle-color': fill,
      'circle-opacity': ['case', ['get', 'stale'], 0.55, 0.92],
      'circle-stroke-color': paint.stroke,
      'circle-stroke-width': 1.5,
    },
  })
  if (textFont) {
    ensureLayer(map, {
      id: LAYER_WEATHER_LABELS,
      type: 'symbol',
      source: SOURCE_WEATHER,
      layout: {
        'text-field': [
          'case',
          ['get', 'stale'],
          [
            'concat',
            ['coalesce', ['get', 'category'], 'METAR'],
            ' STALE',
          ],
          ['coalesce', ['get', 'category'], 'METAR'],
        ],
        'text-font': textFont,
        'text-size': 9,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': paint.text,
        'text-halo-color': paint.textHalo,
        'text-halo-width': 1,
        'text-opacity': ['case', ['get', 'stale'], 0.62, 1],
      },
    })
    if (map.getLayer(LAYER_WEATHER_LABELS)) {
      map.setLayoutProperty(
        LAYER_WEATHER_LABELS,
        'text-font',
        textFont,
      )
    }
  }

  if (map.getLayer(LAYER_WEATHER_HALO)) {
    map.setPaintProperty(LAYER_WEATHER_HALO, 'circle-color', paint.halo)
    map.setPaintProperty(
      LAYER_WEATHER_HALO,
      'circle-stroke-color',
      paint.halo,
    )
  }
  if (map.getLayer(LAYER_WEATHER_POINTS)) {
    map.setPaintProperty(LAYER_WEATHER_POINTS, 'circle-color', fill)
    map.setPaintProperty(
      LAYER_WEATHER_POINTS,
      'circle-stroke-color',
      paint.stroke,
    )
  }
  if (map.getLayer(LAYER_WEATHER_LABELS)) {
    map.setPaintProperty(LAYER_WEATHER_LABELS, 'text-color', paint.text)
    map.setPaintProperty(
      LAYER_WEATHER_LABELS,
      'text-halo-color',
      paint.textHalo,
    )
  }
  setWeatherVisibility(map, visible)
}
