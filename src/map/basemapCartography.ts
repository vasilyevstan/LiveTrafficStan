import type { ExpressionSpecification, LayerSpecification, Map as MapLibreMap } from 'maplibre-gl'
import type { Theme } from '../app/theme'
import { BASEMAP_DETAIL_CONFIG, DEFAULT_MAP_STYLE_URLS } from '../config/appConfig'

const PALETTES = {
  light: {
    land: '#f1eddf',
    water: '#a3d1de',
    forest: '#b9cba2',
    park: '#cfdfb6',
    urban: '#e4d9c4',
    building: '#c6b399',
    buildingOutline: '#8b7965',
    runway: '#c3c7b9',
    pier: '#d2c2a7',
    road: '#fffdf4',
    majorRoad: '#bb8840',
    roadCasing: '#c7bcaa',
    boundary: '#958b78',
    text: '#1f332d',
    secondaryText: '#283f38',
    waterText: '#2c5264',
    grass: '#d0dab2',
    farmland: '#e1d6aa',
    rock: '#c7c3b5',
    sand: '#e7d4a7',
    wetland: '#adc9b8',
    industrial: '#cfc7bd',
    commercial: '#e4c9a8',
    civic: '#d1dac0',
    cemetery: '#bfcfa8',
    rail: '#8b7765',
  },
  dark: {
    land: '#263a3d',
    water: '#071b2a',
    forest: '#3c6350',
    park: '#3d5b48',
    urban: '#463e36',
    building: '#78644d',
    buildingOutline: '#ae9878',
    runway: '#455d64',
    pier: '#87765d',
    road: '#64757a',
    majorRoad: '#b39464',
    roadCasing: '#1b2c32',
    boundary: '#506661',
    text: '#e4e7d9',
    secondaryText: '#cad8cd',
    waterText: '#b3d2df',
    grass: '#3a5141',
    farmland: '#50513b',
    rock: '#58605b',
    sand: '#71634a',
    wetland: '#335857',
    industrial: '#51464d',
    commercial: '#66503d',
    civic: '#435a50',
    cemetery: '#3d5748',
    rail: '#a4aaa0',
  },
} as const

type Palette = (typeof PALETTES)[Theme]
type Paint = readonly (readonly [
  Parameters<MapLibreMap['setPaintProperty']>[1],
  string | number | undefined,
])[]
type BasemapMap = Pick<
  MapLibreMap,
  'getStyle' | 'setPaintProperty' | 'setLayerZoomRange'
> & {
  getLayer: (id: string) => unknown
  addLayer: (layer: LayerSpecification, before?: string) => void
}

export const LAYER_BASEMAP_BUILDINGS = 'basemap-detail-buildings'
export const LAYER_BASEMAP_LANDUSE = 'basemap-detail-landuse'
export const LAYER_BASEMAP_LANDMARKS = 'basemap-detail-landmarks'

export const needsBasemapStyleReset = (
  styleUrl: string,
  previousTheme: Theme,
  theme: Theme,
): boolean =>
  previousTheme !== theme &&
  styleUrl === DEFAULT_MAP_STYLE_URLS[previousTheme] &&
  styleUrl !== DEFAULT_MAP_STYLE_URLS[theme]

const layerPaint = (
  layer: LayerSpecification,
  colors: Palette,
): Paint => {
  if (layer.type === 'background' && layer.id === 'background') {
    return [['background-color', colors.land]]
  }
  if (!('source-layer' in layer) || layer.source !== 'openmaptiles') {
    return []
  }
  const sourceLayer = layer['source-layer']
  if (layer.type === 'fill') {
    if (sourceLayer === 'water') return [['fill-color', colors.water]]
    if (layer.id === 'landcover_wood') {
      return [
        ['fill-color', colors.forest],
        ['fill-opacity', 0.8],
        ['fill-pattern', undefined],
      ]
    }
    if (sourceLayer === 'park' || layer.id === 'landuse_park') {
      return [['fill-color', colors.park]]
    }
    if (layer.id === 'landuse_residential') {
      return [['fill-color', colors.urban]]
    }
    if (sourceLayer === 'building') {
      return [
        ['fill-color', colors.building],
        ['fill-outline-color', colors.buildingOutline],
      ]
    }
    if (sourceLayer === 'aeroway') return [['fill-color', colors.runway]]
    if (layer.id === 'road_area_pier') return [['fill-color', colors.pier]]
  }
  if (layer.type === 'line') {
    if (sourceLayer === 'waterway') return [['line-color', colors.water]]
    if (sourceLayer === 'boundary') return [['line-color', colors.boundary]]
    if (sourceLayer === 'aeroway') return [['line-color', colors.runway]]
    if (layer.id === 'road_pier') return [['line-color', colors.pier]]
    if (sourceLayer === 'transportation') {
      if (layer.id.startsWith('railway')) {
        return [['line-color', layer.id.includes('dashline') ? colors.land : colors.rail]]
      }
      if (/casing/.test(layer.id)) {
        return [['line-color', colors.roadCasing]]
      }
      if (/motorway|trunk|primary|major/.test(layer.id)) {
        return [['line-color', colors.majorRoad]]
      }
      if (/minor|service|street|path|track|tertiary|secondary|highway/.test(layer.id)) {
        return [['line-color', colors.road]]
      }
    }
  }
  if (layer.type === 'symbol' && layer.layout?.['text-field']) {
    if (sourceLayer === 'water_name' || sourceLayer === 'waterway') {
      return [
        ['text-color', colors.waterText],
        ['text-halo-color', colors.water],
      ]
    }
    if (
      sourceLayer === 'place' ||
      sourceLayer === 'poi' ||
      sourceLayer === 'transportation_name'
    ) {
      return [
        [
          'text-color',
          sourceLayer === 'place' ? colors.text : colors.secondaryText,
        ],
        ['text-halo-color', colors.land],
      ]
    }
  }
  return []
}

export const applyBasemapCartography = (
  map: BasemapMap,
  theme: Theme,
  styleUrl: string,
): void => {
  if (styleUrl !== DEFAULT_MAP_STYLE_URLS[theme]) return

  for (const layer of map.getStyle().layers) {
    for (const [property, value] of layerPaint(layer, PALETTES[theme])) {
      map.setPaintProperty(layer.id, property, value)
    }
    if (
      layer.type === 'fill' &&
      layer.source === 'openmaptiles' &&
      layer['source-layer'] === 'landcover' &&
      layer.id === 'landcover_wood'
    ) {
      map.setLayerZoomRange(layer.id, 5, layer.maxzoom ?? 24)
    }
    if ('source-layer' in layer && layer.source === 'openmaptiles') {
      if (layer.id === 'landuse_residential') {
        map.setLayerZoomRange(
          layer.id, layer.minzoom ?? 0, BASEMAP_DETAIL_CONFIG.urbanMaximumZoom,
        )
      }
      const minimumZoom =
        layer.id === 'railway' || layer.id === 'railway_dashline'
          ? BASEMAP_DETAIL_CONFIG.railwayMinimumZoom
          : layer.id === 'highway-name-major'
            ? BASEMAP_DETAIL_CONFIG.majorRoadNamesMinimumZoom
            : layer.id === 'highway-name-minor'
              ? BASEMAP_DETAIL_CONFIG.minorRoadNamesMinimumZoom
              : layer.id === 'highway-name-path'
                ? BASEMAP_DETAIL_CONFIG.pathNamesMinimumZoom
                : undefined
      if (minimumZoom !== undefined) {
        map.setLayerZoomRange(layer.id, minimumZoom, layer.maxzoom ?? 24)
      }
    }
  }

  const layers = map.getStyle().layers
  if (map.getStyle().sources.openmaptiles?.type !== 'vector') return
  const colors = PALETTES[theme]
  const beforeLandcover = layers.find(layer =>
    'source-layer' in layer && layer.source === 'openmaptiles' &&
    layer['source-layer'] === 'landcover')?.id
  for (const kind of ['grass', 'farmland', 'rock', 'sand', 'wetland'] as const) {
    const id = `basemap-detail-landcover-${kind}`
    if (!map.getLayer(id)) map.addLayer({
      id, type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
      minzoom: BASEMAP_DETAIL_CONFIG.landcoverMinimumZoom,
      filter: ['==', ['get', 'class'], kind],
      paint: { 'fill-color': colors[kind], 'fill-opacity': 0.6 },
    }, beforeLandcover)
    map.setPaintProperty(id, 'fill-color', colors[kind])
  }

  const landuseColor: ExpressionSpecification = ['match', ['get', 'class'],
    'industrial', colors.industrial,
    ['commercial', 'retail'], colors.commercial,
    ['hospital', 'school'], colors.civic,
    ['cemetery', 'grave_yard'], colors.cemetery,
    colors.land,
  ]
  if (!map.getLayer(LAYER_BASEMAP_LANDUSE)) map.addLayer({
    id: LAYER_BASEMAP_LANDUSE, type: 'fill', source: 'openmaptiles',
    'source-layer': 'landuse', minzoom: BASEMAP_DETAIL_CONFIG.landuseMinimumZoom,
    filter: ['match', ['get', 'class'],
      ['industrial', 'commercial', 'retail', 'hospital', 'school', 'cemetery', 'grave_yard'],
      true, false],
    paint: { 'fill-color': landuseColor, 'fill-opacity': 0.8 },
  }, layers.find(layer => 'source-layer' in layer &&
    layer['source-layer'] === 'waterway' && layer.type === 'line')?.id)
  map.setPaintProperty(LAYER_BASEMAP_LANDUSE, 'fill-color', landuseColor)

  if (!map.getLayer(LAYER_BASEMAP_LANDMARKS)) map.addLayer({
    id: LAYER_BASEMAP_LANDMARKS, type: 'symbol', source: 'openmaptiles',
    'source-layer': 'poi', minzoom: BASEMAP_DETAIL_CONFIG.landmarkMinimumZoom,
    filter: ['all', ['has', 'name'],
      ['<=', ['number', ['get', 'rank'], 100], BASEMAP_DETAIL_CONFIG.landmarkMaximumRank],
      ['match', ['get', 'class'],
        ['railway', 'ferry_terminal', 'hospital', 'college', 'school', 'attraction', 'stadium',
          'cemetery', 'park', 'town_hall', 'museum', 'castle', 'monument'],
        true, false]],
    layout: {
      'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
      'text-font': ['Noto Sans Regular'], 'text-size': 12,
      'text-max-width': 10, 'text-padding': 4,
      'symbol-sort-key': ['number', ['get', 'rank'], 100],
    },
    paint: { 'text-color': colors.secondaryText, 'text-halo-color': colors.land,
      'text-halo-width': 1.5 },
  }, layers.find(layer => layer.type === 'symbol')?.id)
  map.setPaintProperty(LAYER_BASEMAP_LANDMARKS, 'text-color', colors.secondaryText)
  map.setPaintProperty(LAYER_BASEMAP_LANDMARKS, 'text-halo-color', colors.land)

  if (!layers.some(layer => 'source-layer' in layer &&
    layer.source === 'openmaptiles' && layer['source-layer'] === 'building')) return
  if (!map.getLayer(LAYER_BASEMAP_BUILDINGS)) {
    const height: ExpressionSpecification = ['number', ['get', 'render_height'], 0]
    const base: ExpressionSpecification = ['number', ['get', 'render_min_height'], 0]
    map.addLayer({
      id: LAYER_BASEMAP_BUILDINGS, type: 'fill-extrusion',
      source: 'openmaptiles', 'source-layer': 'building',
      minzoom: BASEMAP_DETAIL_CONFIG.buildingsMinimumZoom,
      filter: ['all',
        ['!=', ['get', 'hide_3d'], true],
        ['==', ['typeof', ['get', 'render_height']], 'number'],
        ['>', height, BASEMAP_DETAIL_CONFIG.unknownBuildingHeightMeters],
        ['<', height, BASEMAP_DETAIL_CONFIG.maximumBuildingHeightMeters],
        ['any', ['!', ['has', 'render_min_height']],
          ['all', ['==', ['typeof', ['get', 'render_min_height']], 'number'],
            ['>=', base, 0], ['<', base, height]]],
      ],
      paint: {
        'fill-extrusion-color': colors.building,
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'],
          BASEMAP_DETAIL_CONFIG.buildingsMinimumZoom, 0,
          BASEMAP_DETAIL_CONFIG.buildingsFullHeightZoom, height],
        'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'],
          BASEMAP_DETAIL_CONFIG.buildingsMinimumZoom, 0,
          BASEMAP_DETAIL_CONFIG.buildingsFullHeightZoom, base],
        'fill-extrusion-opacity': 0.88,
      },
    }, layers.find(layer => layer.type === 'symbol')?.id)
  }
  map.setPaintProperty(LAYER_BASEMAP_BUILDINGS, 'fill-extrusion-color', colors.building)
}
