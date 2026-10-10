import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { GeoJSONSource, LayerSpecification, Map as MapLibreMap } from 'maplibre-gl'
import type { Theme } from '../app/theme'
import type { JourneyCoordinate, JourneySnapshot } from '../domain/journey'
import { unwrapLongitude } from '../domain/viewport'
import { mapTextFont } from './textFont'
import { LAYER_SELECTED_TRAIL } from './trafficStyle'

export const SOURCE_JOURNEY = 'captured-journey'
export const JOURNEY_COLORS = {
  light: { past: '#a64b13', remaining: '#006c85', halo: '#ffffff' },
  dark: { past: '#f4b45f', remaining: '#62cce0', halo: '#10232e' },
} as const

export const splitJourneyLine = (points: readonly JourneyCoordinate[]): [number, number][][] => {
  const parts: [number, number][][] = []
  let part: [number, number][] = []
  for (const point of points) {
    const previous = part.at(-1)
    if (previous && Math.abs(point.longitude - previous[0]) > 180) {
      const unwrapped = unwrapLongitude(point.longitude, previous[0])
      if (unwrapped === previous[0]) {
        part.push([previous[0], point.latitude])
        continue
      }
      const seam = unwrapped > 180 ? 180 : -180
      const ratio = (seam - previous[0]) / (unwrapped - previous[0])
      const latitude = previous[1] + (point.latitude - previous[1]) * ratio
      part.push([seam, latitude])
      if (part.length > 1) parts.push(part)
      part = [[-seam, latitude]]
    }
    part.push([point.longitude, point.latitude])
  }
  if (part.length > 1) parts.push(part)
  return parts
}

export const journeyFeatures = (
  snapshot: JourneySnapshot | undefined,
): FeatureCollection<LineString | Point> => ({
  type: 'FeatureCollection',
  features: snapshot ? [
    ...snapshot.segments.flatMap((segment, index) =>
      splitJourneyLine(segment.points).map((coordinates, part): Feature<LineString> => ({
        type: 'Feature', id: `journey:${index}:${part}`,
        properties: { phase: segment.phase, certainty: segment.certainty },
        geometry: { type: 'LineString', coordinates },
      }))),
    ...snapshot.endpoints.map((point, index): Feature<Point> => ({
      type: 'Feature', id: `journey-point:${index}`,
      properties: { label: point.label, role: point.role },
      geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
    })),
  ] : [],
})

export const installJourneyStyle = (
  map: Pick<MapLibreMap, 'getSource' | 'addSource' | 'getLayer' | 'addLayer' | 'setPaintProperty' | 'getStyle'>,
  snapshot: JourneySnapshot | undefined,
  theme: Theme,
) => {
  if (!snapshot && !map.getSource(SOURCE_JOURNEY)) return
  const data = journeyFeatures(snapshot)
  const source = map.getSource<GeoJSONSource>(SOURCE_JOURNEY)
  if (source) source.setData(data)
  else map.addSource(SOURCE_JOURNEY, { type: 'geojson', data })
  const colors = JOURNEY_COLORS[theme]
  const layers: LayerSpecification[] = []
  for (const certainty of ['observed', 'estimated'] as const) {
    for (const halo of [true, false]) layers.push({
      id: `${SOURCE_JOURNEY}-${certainty}${halo ? '-halo' : ''}`,
      source: SOURCE_JOURNEY, type: 'line',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'certainty'], certainty]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': halo ? colors.halo : ['case', ['==', ['get', 'phase'], 'remaining'], colors.remaining, colors.past],
        'line-width': halo ? 6 : 3,
        'line-opacity': halo ? 0.85 : 1,
        ...(certainty === 'estimated' ? { 'line-dasharray': [2, 2] } : {}),
      },
    })
  }
  layers.push({
    id: `${SOURCE_JOURNEY}-points`, source: SOURCE_JOURNEY, type: 'circle',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'role'], 'captured'], 6, 4],
      'circle-color': ['case', ['==', ['get', 'role'], 'destination'], colors.remaining, colors.past],
      'circle-stroke-width': 2,
      'circle-stroke-color': colors.halo,
    },
  })
  const font = mapTextFont(map)
  if (font) layers.push({
    id: `${SOURCE_JOURNEY}-labels`, source: SOURCE_JOURNEY, type: 'symbol',
    filter: ['==', ['geometry-type'], 'Point'],
    layout: {
      'text-field': ['get', 'label'], 'text-font': font, 'text-size': 11,
      'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true,
    },
    paint: {
      'text-color': theme === 'dark' ? '#e5f3f7' : '#183641',
      'text-halo-color': colors.halo, 'text-halo-width': 1.5,
    },
  })
  for (const layer of layers) {
    if (!map.getLayer(layer.id)) {
      map.addLayer(layer, map.getLayer(LAYER_SELECTED_TRAIL) ? LAYER_SELECTED_TRAIL : undefined)
    } else {
      if (layer.type === 'line') {
        map.setPaintProperty(layer.id, 'line-color', layer.paint?.['line-color'])
      } else if (layer.type === 'circle') {
        map.setPaintProperty(layer.id, 'circle-color', layer.paint?.['circle-color'])
        map.setPaintProperty(layer.id, 'circle-stroke-color', layer.paint?.['circle-stroke-color'])
      } else if (layer.type === 'symbol') {
        map.setPaintProperty(layer.id, 'text-color', layer.paint?.['text-color'])
        map.setPaintProperty(layer.id, 'text-halo-color', layer.paint?.['text-halo-color'])
      }
    }
  }
}
