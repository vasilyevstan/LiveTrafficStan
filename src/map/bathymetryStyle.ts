import type { FeatureCollection, Point } from 'geojson'
import type { GeoJSONSource, LayerSpecification, Map as MapLibreMap } from 'maplibre-gl'
import type { Theme } from '../app/theme'
import { BATHYMETRY_CONFIG } from '../config/appConfig'
import { depthLabel, type DepthValuesState } from '../domain/bathymetry'
import { BathymetryTileError } from '../providers/bathymetry/depthTiles'
import { mapTextFont } from './textFont'

export const SOURCE_DEPTH_RASTER = 'modeled-depths-raster'
export const SOURCE_DEPTH_VALUES = 'modeled-depths-values'
export const LAYER_DEPTH_SHADING = 'modeled-depths-shading'
export const LAYER_DEPTH_LABELS = 'modeled-depths-labels'
export const DEPTH_TILE_TEMPLATE = 'modeled-depths://{z}/{x}/{y}'

export const depthFeatures = (state: DepthValuesState): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: state.samples.map(sample => ({
    type: 'Feature', id: sample.id,
    geometry: { type: 'Point', coordinates: [sample.longitude, sample.latitude] },
    properties: {
      label: `${depthLabel(sample.depthMeters)} ${state.source === 'emodnet' ? 'LAT' : 'MSL*'}`,
      depthMeters: sample.depthMeters, source: state.source,
    },
  })),
})

export const isBathymetryError = (event: unknown): boolean => {
  if (typeof event !== 'object' || event === null) return false
  return ('sourceId' in event &&
    (event.sourceId === SOURCE_DEPTH_RASTER || event.sourceId === SOURCE_DEPTH_VALUES)) ||
    ('error' in event && event.error instanceof BathymetryTileError)
}

type DepthMap = Pick<MapLibreMap,
  'getSource' | 'addSource' | 'getLayer' | 'addLayer' | 'getStyle' |
  'setPaintProperty' | 'setLayoutProperty'>

export const setBathymetryVisibility = (map: DepthMap, visible: boolean, numbersVisible = visible) => {
  if (map.getLayer(LAYER_DEPTH_SHADING)) map.setLayoutProperty(
    LAYER_DEPTH_SHADING, 'visibility', visible ? 'visible' : 'none',
  )
  if (map.getLayer(LAYER_DEPTH_LABELS)) map.setLayoutProperty(
    LAYER_DEPTH_LABELS, 'visibility', numbersVisible ? 'visible' : 'none',
  )
}

export const installBathymetryStyle = (
  map: DepthMap,
  theme: Theme,
  state: DepthValuesState,
  visible: boolean,
) => {
  if (!map.getSource(SOURCE_DEPTH_RASTER)) map.addSource(SOURCE_DEPTH_RASTER, {
    type: 'raster', tiles: [DEPTH_TILE_TEMPLATE],
    tileSize: BATHYMETRY_CONFIG.tileSize,
    maxzoom: BATHYMETRY_CONFIG.maximumTileZoom,
    attribution: 'Depths: <a href="https://emodnet.ec.europa.eu/en/bathymetry" target="_blank" rel="noreferrer">EMODnet</a> / <a href="https://www.gebco.net/" target="_blank" rel="noreferrer">GEBCO</a> · model, not navigation',
  })
  const data = depthFeatures(state)
  const source = map.getSource<GeoJSONSource>(SOURCE_DEPTH_VALUES)
  if (source) source.setData(data)
  else map.addSource(SOURCE_DEPTH_VALUES, { type: 'geojson', data })
  const layers = map.getStyle().layers
  const waterIndex = layers.findLastIndex(layer => layer.type === 'fill' && layer['source-layer'] === 'water')
  const beforeWaterDetails = waterIndex >= 0
    ? layers[waterIndex + 1]?.id
    : layers.find(layer => layer.type !== 'background')?.id
  const raster: LayerSpecification = {
    id: LAYER_DEPTH_SHADING, source: SOURCE_DEPTH_RASTER, type: 'raster',
    layout: { visibility: visible ? 'visible' : 'none' },
    paint: {
      'raster-opacity': theme === 'dark' ? 0.23 : 0.42,
      'raster-saturation': -0.15,
      'raster-brightness-max': theme === 'dark' ? 0.55 : 1,
      'raster-fade-duration': 0,
    },
  }
  if (!map.getLayer(raster.id)) map.addLayer(raster, beforeWaterDetails)
  else for (const property of [
    'raster-opacity', 'raster-saturation', 'raster-brightness-max', 'raster-fade-duration',
  ] as const) {
    map.setPaintProperty(raster.id, property, raster.paint?.[property])
  }
  const font = mapTextFont(map)
  if (font && !map.getLayer(LAYER_DEPTH_LABELS)) map.addLayer({
    id: LAYER_DEPTH_LABELS, source: SOURCE_DEPTH_VALUES, type: 'symbol',
    minzoom: BATHYMETRY_CONFIG.minimumLabelZoom,
    layout: {
      'text-field': ['get', 'label'], 'text-font': font, 'text-size': 11,
      'text-allow-overlap': false, 'text-ignore-placement': true, 'text-padding': 8,
      visibility: visible ? 'visible' : 'none',
    },
    paint: {
      'text-color': theme === 'dark' ? '#c2dce6' : '#274d5b',
      'text-halo-color': theme === 'dark' ? '#071b2a' : '#e7f5f5',
      'text-halo-width': 1.5,
    },
  }, layers.find(layer => layer.type === 'symbol')?.id)
  if (map.getLayer(LAYER_DEPTH_LABELS)) {
    map.setPaintProperty(LAYER_DEPTH_LABELS, 'text-color', theme === 'dark' ? '#c2dce6' : '#274d5b')
    map.setPaintProperty(LAYER_DEPTH_LABELS, 'text-halo-color', theme === 'dark' ? '#071b2a' : '#e7f5f5')
  }
  setBathymetryVisibility(map, visible)
}
