import type {
  FeatureCollection,
  LineString,
  Point,
} from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import { TRAFFIC_MARKER_ICONS } from '../domain/traffic'
import {
  LAYER_AIRCRAFT,
  LAYER_VESSELS,
  SOURCE_AIRCRAFT,
  installTrafficStyle,
  type TrafficStyleImages,
  type TrafficStyleSnapshot,
} from './trafficStyle'

const points: FeatureCollection<Point> = {
  type: 'FeatureCollection',
  features: [],
}
const trail: FeatureCollection<LineString> = {
  type: 'FeatureCollection',
  features: [],
}
const imageSet = (theme: string) =>
  Object.fromEntries(
    TRAFFIC_MARKER_ICONS.map((id) => [id, { theme: `${theme}-${id}` }]),
  ) as unknown as TrafficStyleImages
const lightImages = imageSet('light')
const darkImages = imageSet('dark')

const snapshot = (
  theme: 'light' | 'dark',
): TrafficStyleSnapshot => ({
  theme,
  aircraft: points,
  vessels: points,
  trail,
  aircraftVisible: true,
  vesselsVisible: false,
})

describe('installTrafficStyle', () => {
  it('is idempotent and reapplies current data, visibility, and theme paint', () => {
    const imageIds = new Set<string>()
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
    const layers = new Map<string, unknown>()
    const paint = new Map<string, unknown>()
    const visibility = new Map<string, unknown>()
    const addImage = vi.fn((id: string) => imageIds.add(id))
    const updateImage = vi.fn()
    const addSource = vi.fn((id: string) => {
      sources.set(id, { setData: vi.fn() })
    })
    const addLayer = vi.fn((layer: { id: string }) => {
      layers.set(layer.id, layer)
    })
    const map = {
      hasImage: (id: string) => imageIds.has(id),
      addImage,
      updateImage,
      getSource: (id: string) => sources.get(id),
      addSource,
      getLayer: (id: string) => layers.get(id),
      addLayer,
      setPaintProperty: (id: string, property: string, value: unknown) => {
        paint.set(`${id}:${property}`, value)
      },
      setLayoutProperty: (id: string, property: string, value: unknown) => {
        visibility.set(`${id}:${property}`, value)
      },
    } as unknown as MapLibreMap

    installTrafficStyle(map, snapshot('light'), lightImages)
    installTrafficStyle(map, snapshot('dark'), darkImages)
    installTrafficStyle(map, snapshot('light'), lightImages)

    expect(addImage).toHaveBeenCalledTimes(TRAFFIC_MARKER_ICONS.length)
    expect(updateImage).toHaveBeenCalledTimes(
      TRAFFIC_MARKER_ICONS.length * 2,
    )
    expect(imageIds).toEqual(new Set(TRAFFIC_MARKER_ICONS))
    for (const imageId of TRAFFIC_MARKER_ICONS) {
      expect(updateImage).toHaveBeenCalledWith(
        imageId,
        darkImages[imageId],
      )
      expect(updateImage).toHaveBeenCalledWith(
        imageId,
        lightImages[imageId],
      )
    }
    expect(addSource).toHaveBeenCalledTimes(3)
    expect(addLayer).toHaveBeenCalledTimes(5)
    expect(sources.get(SOURCE_AIRCRAFT)?.setData).toHaveBeenCalledTimes(2)
    expect(paint.get('traffic-selected-trail:line-color')).toBe('#138daf')
    expect(paint.get(`${LAYER_AIRCRAFT}:icon-opacity`)).toEqual([
      'case',
      ['get', 'stale'],
      0.54,
      0.98,
    ])
    expect(visibility.get(`${LAYER_AIRCRAFT}:visibility`)).toBe('visible')
    expect(visibility.get(`${LAYER_VESSELS}:visibility`)).toBe('none')
  })
})
