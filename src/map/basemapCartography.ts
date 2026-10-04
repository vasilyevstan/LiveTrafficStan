import type { LayerSpecification, Map as MapLibreMap } from 'maplibre-gl'
import type { Theme } from '../app/theme'
import { DEFAULT_MAP_STYLE_URLS } from '../config/appConfig'

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
>

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
}
