import type { FeatureCollection, Point } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { DisplayTrafficEntity } from '../domain/traffic'
import type { Theme } from '../app/theme'
import { sampleTrafficZoomContext } from './trafficZoomContext'

const SOURCE = 'traffic-last-reports'
export const REPORT_DOTS = 'traffic-last-report-dots'

export const reportDotFeatures = (
  map: Parameters<typeof sampleTrafficZoomContext>[0],
  reports: readonly DisplayTrafficEntity[],
  selectedId: string | null,
): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: (['aircraft', 'vessel'] as const).flatMap(kind =>
    sampleTrafficZoomContext(map, reports.filter(entity => entity.kind === kind), { id: selectedId })
      .map(entity => ({
        type: 'Feature' as const, id: entity.id,
        geometry: { type: 'Point' as const, coordinates: [entity.position.longitude, entity.position.latitude] },
        properties: { id: entity.id, kind, selected: entity.id === selectedId, stale: entity.freshness === 'stale' },
      })),
  ),
})

export const renderReportDots = (
  map: MapLibreMap, reports: readonly DisplayTrafficEntity[], selectedId: string | null, theme: Theme,
) => {
  const source = map.getSource<GeoJSONSource>(SOURCE)
  if (!source && !reports.length) return
  const data = reportDotFeatures(map, reports, selectedId)
  if (source) source.setData(data)
  else map.addSource(SOURCE, { type: 'geojson', data })
  if (!map.getLayer(REPORT_DOTS)) map.addLayer({
    id: REPORT_DOTS, source: SOURCE, type: 'circle',
    paint: {
      'circle-radius': ['case', ['get', 'selected'], 7, 5],
      'circle-color': ['match', ['get', 'kind'], 'aircraft', '#148fa9', '#326bc3'],
      'circle-opacity': ['case', ['get', 'stale'], 0.55, 0.92],
      'circle-stroke-width': ['case', ['get', 'selected'], 3, 1],
      'circle-stroke-color': theme === 'dark' ? '#f8fdff' : '#0f2938',
    },
  })
}
