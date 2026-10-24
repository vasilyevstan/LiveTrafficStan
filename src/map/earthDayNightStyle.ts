import type { AllPaintProperties } from '@maplibre/maplibre-gl-style-spec'
import type { ExpressionSpecification, ImageSource, LayerSpecification, Map } from 'maplibre-gl'
import type { Theme } from '../app/theme'
import { EARTH_DAY_NIGHT_CONFIG } from '../config/appConfig'
import { ORBITAL_VIEW_MAXIMUM_LATITUDE } from '../domain/orbitalView'
import { nightShade, solarSubpoint } from './earthDayNight'

export const SOURCE_EARTH_DAY_NIGHT = 'earth-day-night'
export const LAYER_EARTH_NIGHT = 'earth-night'

export interface EarthDayNightStyleState {
  source: ImageSource
  shade?: Uint8ClampedArray
  time?: number
  theme: Theme
  captured: boolean
  visible: boolean
}

const COLORS = {
  light: { night: [18, 36, 59], opacity: 0.26 },
  dark: { night: [2, 7, 15], opacity: 0.5 },
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
  let source = map.getSource<ImageSource>(SOURCE_EARTH_DAY_NIGHT)
  if (!visible && !source) return undefined
  const bucket = Math.floor(time / EARTH_DAY_NIGHT_CONFIG.timeStepMs) * EARTH_DAY_NIGHT_CONFIG.timeStepMs
  if (previous && previous.source === source && previous.visible === visible && previous.theme === theme &&
    previous.captured === captured && (!visible || previous.time === bucket) &&
    map.getLayer(LAYER_EARTH_NIGHT)) return previous
  let dataTime = previous?.source === source ? previous?.time : undefined
  let shade = previous?.source === source ? previous?.shade : undefined
  if (visible && (!source || dataTime !== bucket)) {
    shade = nightShade(solarSubpoint(bucket))
    if (!source) {
      const limit = ORBITAL_VIEW_MAXIMUM_LATITUDE
      map.addSource(SOURCE_EARTH_DAY_NIGHT, {
        type: 'image',
        coordinates: [[-180, limit], [180, limit], [180, -limit], [-180, -limit]],
      })
      source = map.getSource<ImageSource>(SOURCE_EARTH_DAY_NIGHT)
    }
    dataTime = bucket
  }
  if (!source) throw new Error('The day/night map source could not be installed.')
  const colors = COLORS[theme]
  if (shade && (previous?.source !== source || previous.shade !== shade || previous.theme !== theme)) {
    const image = new ImageData(EARTH_DAY_NIGHT_CONFIG.textureSize, EARTH_DAY_NIGHT_CONFIG.textureSize)
    for (let index = 0; index < shade.length; index++) {
      const offset = index * 4
      image.data[offset] = colors.night[0]
      image.data[offset + 1] = colors.night[1]
      image.data[offset + 2] = colors.night[2]
      image.data[offset + 3] = shade[index]!
    }
    source.updateImage({ image })
  }
  const opacity: number | ExpressionSpecification = captured ? colors.opacity : [
    'interpolate', ['linear'], ['zoom'],
    EARTH_DAY_NIGHT_CONFIG.fullOpacityMaximumZoom, colors.opacity,
    EARTH_DAY_NIGHT_CONFIG.maximumZoom, 0,
  ]
  const layers: LayerSpecification[] = [
    {
      id: LAYER_EARTH_NIGHT, type: 'raster', source: SOURCE_EARTH_DAY_NIGHT,
      paint: { 'raster-opacity': opacity, 'raster-resampling': 'linear', 'raster-fade-duration': 0 },
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
  return { source, shade, time: dataTime, theme, captured, visible }
}
