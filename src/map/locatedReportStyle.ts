import type { FeatureCollection, Point } from 'geojson'
import type { GeoJSONSource, LayerSpecification, Map as MapLibreMap } from 'maplibre-gl'
import type { AllPaintProperties } from '@maplibre/maplibre-gl-style-spec'
import type { Theme } from '../app/theme'
import type { LocatedReportMarker } from '../domain/locatedReport'
import { JOURNEY_COLORS, SOURCE_JOURNEY } from './journeyStyle'
import { mapTextFont } from './textFont'
import { LAYER_SELECTED_TRAIL } from './trafficStyle'

export const SOURCE_LOCATED_REPORT = 'located-last-report'

const reportTime = new Intl.DateTimeFormat(undefined, {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
})

export const locatedReportLabel = (marker: Pick<LocatedReportMarker, 'name' | 'reportedAt'>) =>
  `${marker.name} · last report ${reportTime.format(marker.reportedAt)}`

export const locatedReportFeatures = (marker: LocatedReportMarker | undefined): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: marker && Number.isFinite(marker.latitude) && Math.abs(marker.latitude) <= 90 &&
    Number.isFinite(marker.longitude) && Math.abs(marker.longitude) <= 180 && Number.isFinite(marker.reportedAt)
    ? [{
        type: 'Feature', id: 'located-report',
        properties: { label: locatedReportLabel(marker) },
        geometry: { type: 'Point', coordinates: [marker.longitude, marker.latitude] },
      }]
    : [],
})

export const installLocatedReportStyle = (
  map: Pick<MapLibreMap, 'getSource' | 'addSource' | 'getLayer' | 'addLayer' | 'setPaintProperty' | 'getStyle'>,
  marker: LocatedReportMarker | undefined,
  theme: Theme,
) => {
  if (!marker && !map.getSource(SOURCE_LOCATED_REPORT)) return
  const data = locatedReportFeatures(marker)
  const source = map.getSource<GeoJSONSource>(SOURCE_LOCATED_REPORT)
  if (source) source.setData(data)
  else map.addSource(SOURCE_LOCATED_REPORT, { type: 'geojson', data })
  const colors = JOURNEY_COLORS[theme]
  const layers: LayerSpecification[] = [
    {
      id: `${SOURCE_LOCATED_REPORT}-ring`, source: SOURCE_LOCATED_REPORT, type: 'circle',
      paint: {
        'circle-radius': 16, 'circle-color': colors.past, 'circle-opacity': 0.12,
        'circle-stroke-width': 2, 'circle-stroke-color': colors.past, 'circle-stroke-opacity': 0.9,
      },
    },
    {
      id: `${SOURCE_LOCATED_REPORT}-point`, source: SOURCE_LOCATED_REPORT, type: 'circle',
      paint: {
        'circle-radius': 4, 'circle-color': colors.past,
        'circle-stroke-width': 2, 'circle-stroke-color': colors.halo,
      },
    },
  ]
  const font = mapTextFont(map)
  if (font) layers.push({
    id: `${SOURCE_LOCATED_REPORT}-label`, source: SOURCE_LOCATED_REPORT, type: 'symbol',
    layout: {
      'text-field': ['get', 'label'], 'text-font': font, 'text-size': 12,
      'text-offset': [0, 1.6], 'text-anchor': 'top', 'text-max-width': 14,
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': theme === 'dark' ? '#e5f3f7' : '#183641',
      'text-halo-color': colors.halo, 'text-halo-width': 1.5,
    },
  })
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
