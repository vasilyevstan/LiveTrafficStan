import type { AllPaintProperties } from '@maplibre/maplibre-gl-style-spec'
import type { ExpressionSpecification, GeoJSONSource, LayerSpecification, Map } from 'maplibre-gl'
import type { Theme } from '../app/theme'
import { EARTH_DAY_NIGHT_CONFIG } from '../config/appConfig'
import { nightHemisphere, solarSubpoint } from './earthDayNight'

export const SOURCE_EARTH_DAY_NIGHT = 'earth-day-night'
export const LAYER_EARTH_NIGHT = 'earth-night'
export const LAYER_EARTH_TERMINATOR = 'earth-terminator'

export interface EarthDayNightStyleState {
  source: GeoJSONSource
  time?: number
  theme: Theme
  captured: boolean
  visible: boolean
}

const COLORS = {
  light: { night: '#12243b', boundary: '#2d6580', opacity: 0.26 },
  dark: { night: '#02070f', boundary: '#93afc6', opacity: 0.5 },
} as const

export const installEarthDayNightStyle = (
  map: Pick<Map, 'getSource' | 'addSource' | 'getLayer' | 'addLayer' | 'getStyle' |
    'setPaintProperty' | 'setLayoutProperty' | 'getZoom'>,
  time: number,
  theme: Theme,
  captured: boolean,
  previous?: EarthDayNightStyleState,
): EarthDayNightStyleState | undefined => {
  const visible = captured || map.getZoom() < EARTH_DAY_NIGHT_CONFIG.maximumZoom
  let source = map.getSource<GeoJSONSource>(SOURCE_EARTH_DAY_NIGHT)
  if (!visible && !source) return undefined
  const bucket = Math.floor(time / EARTH_DAY_NIGHT_CONFIG.timeStepMs) * EARTH_DAY_NIGHT_CONFIG.timeStepMs
  if (previous && previous.source === source && previous.visible === visible && previous.theme === theme &&
    previous.captured === captured && (!visible || previous.time === bucket) &&
    map.getLayer(LAYER_EARTH_NIGHT) && map.getLayer(LAYER_EARTH_TERMINATOR)) return previous
  let dataTime = previous?.source === source ? previous?.time : undefined
  if (visible && (!source || dataTime !== bucket)) {
    const data = nightHemisphere(solarSubpoint(bucket))
    if (source) source.setData(data)
    else {
      map.addSource(SOURCE_EARTH_DAY_NIGHT, { type: 'geojson', data, maxzoom: 6, tolerance: 0 })
      source = map.getSource<GeoJSONSource>(SOURCE_EARTH_DAY_NIGHT)
    }
    dataTime = bucket
  }
  if (!source) throw new Error('The day/night map source could not be installed.')
  const colors = COLORS[theme]
  const opacity = (maximum: number): number | ExpressionSpecification => captured ? maximum : [
    'interpolate', ['linear'], ['zoom'],
    EARTH_DAY_NIGHT_CONFIG.fullOpacityMaximumZoom, maximum,
    EARTH_DAY_NIGHT_CONFIG.maximumZoom, 0,
  ]
  const layers: LayerSpecification[] = [
    {
      id: LAYER_EARTH_NIGHT, type: 'fill', source: SOURCE_EARTH_DAY_NIGHT,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': colors.night, 'fill-opacity': opacity(colors.opacity), 'fill-antialias': false },
    },
    {
      id: LAYER_EARTH_TERMINATOR, type: 'line', source: SOURCE_EARTH_DAY_NIGHT,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': colors.boundary, 'line-width': 1, 'line-opacity': opacity(0.65) },
    },
  ]
  const before = map.getStyle()?.layers.find(layer => layer.type === 'symbol')?.id
  for (const layer of layers) {
    if (!map.getLayer(layer.id)) map.addLayer(layer, before)
    else if (previous?.theme !== theme || previous.captured !== captured) {
      for (const [property, value] of Object.entries(layer.paint ?? {})) {
        map.setPaintProperty(layer.id, property as keyof AllPaintProperties, value)
      }
    }
    map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none')
  }
  return { source, time: dataTime, theme, captured, visible }
}
