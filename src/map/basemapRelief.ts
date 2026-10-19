import type { LayerSpecification, Map as MapLibreMap, SourceSpecification } from 'maplibre-gl'
import type { Theme } from '../app/theme'
import { BASEMAP_DETAIL_CONFIG, DEFAULT_MAP_STYLE_URLS } from '../config/appConfig'

export type BasemapReliefStatus = 'off' | 'enabled' | 'unsupported' | 'unavailable'
export const LAYER_BASEMAP_RELIEF = 'basemap-relief-shading'
const SOURCE_PREFIX = 'basemap-relief-'

type ReliefMap = Pick<MapLibreMap, 'getStyle' | 'setPaintProperty'> & {
  getSource: (id: string) => unknown
  getLayer: (id: string) => unknown
  addSource: (id: string, source: SourceSpecification) => void
  removeSource: (id: string) => void
  addLayer: (layer: LayerSpecification, before?: string) => void
  removeLayer: (id: string) => void
}

export const createBasemapRelief = (
  map: ReliefMap,
  onStatus: (status: BasemapReliefStatus) => void,
) => {
  let sourceId: string | undefined
  let revision = 0
  let enabled = false
  let failed = false
  let disposed = false
  let status: BasemapReliefStatus = 'off'
  const report = (next: BasemapReliefStatus) => {
    if (disposed || next === status) return
    status = next
    onStatus(next)
  }
  const remove = () => {
    const previous = sourceId
    sourceId = undefined
    if (map.getLayer(LAYER_BASEMAP_RELIEF)) map.removeLayer(LAYER_BASEMAP_RELIEF)
    if (previous && map.getSource(previous)) map.removeSource(previous)
  }
  return {
    install(theme: Theme, styleUrl: string, nextEnabled: boolean) {
      if (disposed) return
      if (enabled !== nextEnabled) failed = false
      enabled = nextEnabled
      if (!enabled || failed || styleUrl !== DEFAULT_MAP_STYLE_URLS[theme]) {
        remove()
        report(!enabled ? 'off' : failed ? 'unavailable' : 'unsupported')
        return
      }
      if (!sourceId || !map.getSource(sourceId)) {
        sourceId = `${SOURCE_PREFIX}${++revision}`
        map.addSource(sourceId, {
          type: 'raster-dem', encoding: 'terrarium', tileSize: 256,
          tiles: [BASEMAP_DETAIL_CONFIG.reliefTileTemplate],
          maxzoom: BASEMAP_DETAIL_CONFIG.reliefSourceMaximumZoom,
          attribution: 'Relief: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">Mapzen and terrain contributors</a>',
        })
      }
      const paint = {
        'hillshade-exaggeration': BASEMAP_DETAIL_CONFIG.reliefExaggeration,
        'hillshade-illumination-anchor': 'map',
        'hillshade-shadow-color': theme === 'dark' ? '#102126' : '#6b6558',
        'hillshade-highlight-color': theme === 'dark' ? '#597b74' : '#fffaf0',
        'hillshade-accent-color': theme === 'dark' ? '#20383a' : '#8b866f',
      } as const
      if (!map.getLayer(LAYER_BASEMAP_RELIEF)) map.addLayer({
        id: LAYER_BASEMAP_RELIEF, type: 'hillshade', source: sourceId,
        minzoom: BASEMAP_DETAIL_CONFIG.reliefMinimumZoom,
        maxzoom: BASEMAP_DETAIL_CONFIG.reliefMaximumZoom,
        paint,
      }, map.getStyle().layers.find(layer => layer.type === 'fill' &&
        layer.source === 'openmaptiles' && layer['source-layer'] === 'water')?.id)
      else for (const property of [
        'hillshade-exaggeration', 'hillshade-illumination-anchor',
        'hillshade-shadow-color', 'hillshade-highlight-color', 'hillshade-accent-color',
      ] as const) {
        map.setPaintProperty(LAYER_BASEMAP_RELIEF, property, paint[property])
      }
      report('enabled')
    },
    handleError(event: unknown): boolean {
      if (typeof event !== 'object' || event === null || !('sourceId' in event) ||
        typeof event.sourceId !== 'string' || !event.sourceId.startsWith(SOURCE_PREFIX)) return false
      if (!disposed && event.sourceId === sourceId && map.getSource(sourceId)) {
        failed = true
        remove()
        report('unavailable')
      }
      return true
    },
    dispose() {
      disposed = true
      remove()
    },
  }
}
