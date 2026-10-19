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
