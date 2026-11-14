import type { FeatureCollection, Point } from 'geojson'
import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
} from 'maplibre-gl'
import type { Theme } from '../app/theme'
import { TRAIN_SOURCE_IDS, type DisplayTrain, type TrainSourceId } from '../domain/trains'
import { TRAIN_SOURCES } from '../providers/rail/trainSources'
import { TRAIN_MODEL_PALETTE } from './models/trafficModelCatalog'
import { mapTextFont } from './textFont'
import { LAYER_SELECTED_TRAIL, setTrafficLayerVisibility } from './trafficStyle'

export const SOURCE_TRAINS = 'traffic-trains'
export const LAYER_TRAIN_HALO = 'traffic-train-halo'
export const LAYER_TRAIN_POINTS = 'traffic-train-points'
export const LAYER_TRAIN_LABELS = 'traffic-train-labels'
export const TRAIN_LAYER_IDS = [
  LAYER_TRAIN_HALO,
  LAYER_TRAIN_POINTS,
  LAYER_TRAIN_LABELS,
] as const
export const TRAIN_SELECTABLE_LAYER_IDS = [LAYER_TRAIN_POINTS, LAYER_TRAIN_LABELS] as const

const LABEL_MINIMUM_ZOOM = 10

const sourceLink = (sourceId: TrainSourceId) => {
  const source = TRAIN_SOURCES[sourceId]
  return `<a href="${source.websiteUrl}" target="_blank" rel="noreferrer">${source.attribution}</a>`
}

/**
 * One `Trains:` credit for only the given feeds, in canonical order. It is
 * given to the attribution control rather than the GeoJSON source, so a feed
 * that does not cover the view is not credited and a style reload needs no
 * credit reinstall. Settings and train details keep listing every feed.
 */
export const trainAttribution = (sourceIds: Iterable<TrainSourceId>) => {
  const credited = new Set(sourceIds)
  const links = TRAIN_SOURCE_IDS.filter((sourceId) => credited.has(sourceId)).map(sourceLink)
  return links.length > 0 ? `Trains: ${links.join(' · ')}` : undefined
}

// Flat dots share the model palette so a train keeps its hue across zoom 9.
const categoryColor = (theme: Theme): ExpressionSpecification => [
  'case',
  ['==', ['get', 'category'], 'freight'],
  TRAIN_MODEL_PALETTE[theme].freight[0],
  TRAIN_MODEL_PALETTE[theme].passenger[0],
]

const themePaint = (theme: Theme) => ({
  halo: theme === 'dark' ? '#f8fdff' : '#102f3a',
  stroke: theme === 'dark' ? '#0b1720' : '#ffffff',
  text: theme === 'dark' ? '#f2f7fa' : '#14262f',
  textHalo: theme === 'dark' ? '#07131d' : '#ffffff',
})

export const trainFeatures = (
  trains: readonly DisplayTrain[],
  selectedId: string | null,
): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: trains.map((train) => ({
    type: 'Feature',
    id: train.id,
    properties: {
      id: train.id,
      label: train.trainNumber ?? train.name,
      category: train.category,
      selected: train.id === selectedId,
      stale: train.freshness === 'stale',
      oriented: train.courseDegrees !== undefined,
    },
    geometry: {
      type: 'Point',
      coordinates: [train.longitude, train.latitude],
    },
  })),
})

/** While models are active they draw oriented trains; unoriented trains stay dots. */
export const trainPointFilter = (modelsActive: boolean): FilterSpecification =>
  modelsActive ? ['!=', ['get', 'oriented'], true] : ['boolean', true]

const ensureLayer = (map: MapLibreMap, layer: LayerSpecification) => {
  if (map.getLayer(layer.id)) return
  map.addLayer(layer, map.getLayer(LAYER_SELECTED_TRAIL) ? LAYER_SELECTED_TRAIL : undefined)
}

export const setTrainSourceData = (map: MapLibreMap, data: FeatureCollection<Point>) => {
  const source = map.getSource(SOURCE_TRAINS)
  if (source) (source as GeoJSONSource).setData(data)
}

export const setTrainVisibility = (map: MapLibreMap, visible: boolean) => {
  for (const layerId of TRAIN_LAYER_IDS) setTrafficLayerVisibility(map, layerId, visible)
}

export const setTrainModelsActive = (map: MapLibreMap, modelsActive: boolean) => {
  if (map.getLayer(LAYER_TRAIN_POINTS)) {
    map.setFilter(LAYER_TRAIN_POINTS, trainPointFilter(modelsActive))
  }
}

/** Idempotent; reinstalled after every `style.load`. */
export const installTrainStyle = (
  map: MapLibreMap,
  data: FeatureCollection<Point>,
  theme: Theme,
  visible: boolean,
  modelsActive: boolean,
) => {
  const paint = themePaint(theme)
  const fill = categoryColor(theme)
  const textFont = mapTextFont(map)
  if (map.getSource(SOURCE_TRAINS)) {
    setTrainSourceData(map, data)
  } else {
    map.addSource(SOURCE_TRAINS, { type: 'geojson', data })
  }

  ensureLayer(map, {
    id: LAYER_TRAIN_HALO,
    type: 'circle',
    source: SOURCE_TRAINS,
    filter: ['==', ['get', 'selected'], true],
    paint: {
      'circle-radius': 13,
      'circle-color': paint.halo,
      'circle-opacity': 0.16,
      'circle-stroke-color': paint.halo,
      'circle-stroke-opacity': 0.9,
      'circle-stroke-width': 2,
    },
  })
  ensureLayer(map, {
    id: LAYER_TRAIN_POINTS,
    type: 'circle',
    source: SOURCE_TRAINS,
    filter: trainPointFilter(modelsActive),
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3.5, 10, 6, 14, 8],
      'circle-color': fill,
      'circle-opacity': ['case', ['get', 'stale'], 0.5, 0.95],
      'circle-stroke-color': paint.stroke,
      'circle-stroke-width': 1.5,
    },
  })
  if (textFont) {
    ensureLayer(map, {
      id: LAYER_TRAIN_LABELS,
      type: 'symbol',
      source: SOURCE_TRAINS,
      minzoom: LABEL_MINIMUM_ZOOM,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': textFont,
        'text-size': 11,
        'text-offset': [0, 1.3],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: {
        'text-color': paint.text,
        'text-halo-color': paint.textHalo,
        'text-halo-width': 1.2,
        'text-opacity': ['case', ['get', 'stale'], 0.6, 1],
      },
    })
    if (map.getLayer(LAYER_TRAIN_LABELS)) {
      map.setLayoutProperty(LAYER_TRAIN_LABELS, 'text-font', textFont)
    }
  }

  if (map.getLayer(LAYER_TRAIN_HALO)) {
    map.setPaintProperty(LAYER_TRAIN_HALO, 'circle-color', paint.halo)
    map.setPaintProperty(LAYER_TRAIN_HALO, 'circle-stroke-color', paint.halo)
  }
  if (map.getLayer(LAYER_TRAIN_POINTS)) {
    map.setPaintProperty(LAYER_TRAIN_POINTS, 'circle-color', fill)
    map.setPaintProperty(LAYER_TRAIN_POINTS, 'circle-stroke-color', paint.stroke)
  }
  if (map.getLayer(LAYER_TRAIN_LABELS)) {
    map.setPaintProperty(LAYER_TRAIN_LABELS, 'text-color', paint.text)
    map.setPaintProperty(LAYER_TRAIN_LABELS, 'text-halo-color', paint.textHalo)
  }
  setTrainModelsActive(map, modelsActive)
  setTrainVisibility(map, visible)
}
