import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { GeoJSONSource, LayerSpecification, Map } from 'maplibre-gl'
import type { AllPaintProperties } from '@maplibre/maplibre-gl-style-spec'
import type { Theme } from '../app/theme'
import { isLocalRulerPoint, localRulerArc, type RulerPoints } from '../domain/localRuler'
import { JOURNEY_COLORS, SOURCE_JOURNEY, splitJourneyLine } from './journeyStyle'
import { LAYER_SELECTED_TRAIL } from './trafficStyle'

export const SOURCE_LOCAL_RULER = 'local-distance-ruler'
export const localRulerFeatures = (points: RulerPoints): FeatureCollection<LineString | Point> => {
  const arc = localRulerArc(points)
  if (!points.every(isLocalRulerPoint) || points.length === 2 && !arc) {
    return { type: 'FeatureCollection', features: [] }
  }
  return {
    type: 'FeatureCollection',
    features: [
      ...(arc ? splitJourneyLine(arc).map((coordinates, part): Feature<LineString> => ({
        type: 'Feature', id: `ruler-line:${part}`, properties: {},
        geometry: { type: 'LineString', coordinates },
      })) : []),
      ...points.map((point, index): Feature<Point> => ({
        type: 'Feature', id: `ruler-point:${index}`, properties: {},
        geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
      })),
    ],
  }
}

export const installLocalRulerStyle = (
  map: Pick<Map, 'getSource' | 'addSource' | 'getLayer' | 'addLayer' | 'setPaintProperty'>,
  points: RulerPoints,
  theme: Theme,
) => {
  if (!points.length && !map.getSource(SOURCE_LOCAL_RULER)) return
  const data = localRulerFeatures(points)
  const source = map.getSource<GeoJSONSource>(SOURCE_LOCAL_RULER)
  if (source) source.setData(data)
  else map.addSource(SOURCE_LOCAL_RULER, { type: 'geojson', data })
  const colors = JOURNEY_COLORS[theme]
  const layers: LayerSpecification[] = [
    {
      id: `${SOURCE_LOCAL_RULER}-halo`, source: SOURCE_LOCAL_RULER, type: 'line',
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-width': 6, 'line-color': colors.halo },
    },
    {
      id: `${SOURCE_LOCAL_RULER}-line`, source: SOURCE_LOCAL_RULER, type: 'line',
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-width': 3, 'line-color': colors.remaining, 'line-dasharray': [2, 2] },
    },
    {
      id: `${SOURCE_LOCAL_RULER}-points`, source: SOURCE_LOCAL_RULER, type: 'circle',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 5, 'circle-color': colors.remaining,
        'circle-stroke-width': 2, 'circle-stroke-color': colors.halo,
      },
    },
  ]
  const before = map.getLayer(`${SOURCE_JOURNEY}-observed-halo`)
    ? `${SOURCE_JOURNEY}-observed-halo`
    : map.getLayer(LAYER_SELECTED_TRAIL) ? LAYER_SELECTED_TRAIL : undefined
  for (const layer of layers) {
    if (!map.getLayer(layer.id)) map.addLayer(layer, before)
    else for (const [property, value] of Object.entries(layer.paint ?? {})) {
      map.setPaintProperty(layer.id, property as keyof AllPaintProperties, value)
    }
  }
}
