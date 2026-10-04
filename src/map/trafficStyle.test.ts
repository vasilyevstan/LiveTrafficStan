import type {
  FeatureCollection,
  LineString,
  Point,
} from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import { TRAFFIC_STYLE_IMAGE_IDS } from '../domain/trafficPresentation'
import {
  LAYER_AIRCRAFT_CLUSTER_COUNT,
  LAYER_AIRCRAFT_CLUSTERS,
  LAYER_AIRCRAFT,
  LAYER_AIRCRAFT_HALO,
  LAYER_AIRCRAFT_STOPPED,
  LAYER_VESSEL_HALO,
  LAYER_VESSEL_FLAGS,
  LAYER_VESSEL_STOPPED,
  LAYER_VESSELS,
  SOURCE_AIRCRAFT,
  installTrafficStyle,
  type TrafficStyleImages,
  type TrafficStyleSnapshot,
} from './trafficStyle'
import { VESSEL_FLAG_IMAGES } from './vesselFlags'

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
    TRAFFIC_STYLE_IMAGE_IDS.map((id) => [
      id,
      { theme: `${theme}-${id}` },
    ]),
  ) as unknown as TrafficStyleImages
const lightImages = imageSet('light')
const darkImages = imageSet('dark')
const baseStyle = () => ({
  version: 8 as const,
  glyphs: 'https://tiles.example.test/{fontstack}/{range}.pbf',
  sources: {},
  layers: [
    {
      id: 'base-label',
      type: 'symbol' as const,
      source: 'base',
      layout: { 'text-font': ['Noto Sans Regular'] },
    },
  ],
})

const snapshot = (
  theme: 'light' | 'dark',
): TrafficStyleSnapshot => ({
  theme,
  aircraft: points,
  vessels: points,
  trail,
  aircraftVisible: true,
  vesselsVisible: false,
  clusteringEnabled: false,
  clusterRadiusPx: 42,
  clusterMinimumPoints: 3,
  clusterMaximumZoom: 10,
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
    const sourceOptions = new Map<string, unknown>()
    const addSource = vi.fn((id: string, options: unknown) => {
      sources.set(id, { setData: vi.fn() })
      sourceOptions.set(id, options)
    })
    const addLayer = vi.fn((layer: { id: string }) => {
      layers.set(layer.id, layer)
    })
    const map = {
      getStyle: baseStyle,
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

    expect(addImage).toHaveBeenCalledTimes(
      TRAFFIC_STYLE_IMAGE_IDS.length + VESSEL_FLAG_IMAGES.size,
    )
    expect(updateImage).toHaveBeenCalledTimes(
      (TRAFFIC_STYLE_IMAGE_IDS.length + VESSEL_FLAG_IMAGES.size) * 2,
    )
    expect(imageIds).toEqual(
      new Set([...TRAFFIC_STYLE_IMAGE_IDS, ...VESSEL_FLAG_IMAGES.keys()]),
    )
    for (const imageId of TRAFFIC_STYLE_IMAGE_IDS) {
      expect(updateImage).toHaveBeenCalledWith(
        imageId,
        darkImages[imageId],
      )
      expect(updateImage).toHaveBeenCalledWith(
        imageId,
        lightImages[imageId],
      )
    }
    for (const [imageId, image] of VESSEL_FLAG_IMAGES) {
      expect(addImage).toHaveBeenCalledWith(imageId, image, { pixelRatio: 2 })
      expect(updateImage).toHaveBeenCalledWith(imageId, image)
    }
    expect(addSource).toHaveBeenCalledTimes(3)
    expect(addLayer).toHaveBeenCalledTimes(12)
    expect(sources.get(SOURCE_AIRCRAFT)?.setData).toHaveBeenCalledTimes(2)
    expect(sourceOptions.get(SOURCE_AIRCRAFT)).toMatchObject({
      cluster: false,
      clusterRadius: 42,
      clusterMaxZoom: 10,
      clusterMinPoints: 3,
    })
    expect(layers.get(LAYER_AIRCRAFT)).toMatchObject({
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['get', 'markerIcon'],
        'icon-size': ['*', ['get', 'markerScale'], 1.08],
      },
    })
    expect(layers.get(LAYER_VESSELS)).toMatchObject({
      layout: {
        'icon-size': ['*', ['get', 'markerScale'], 0.86],
      },
    })
    expect(layers.get(LAYER_VESSEL_FLAGS)).toMatchObject({
      source: 'traffic-vessels',
      filter: [
        'all',
        ['!', ['has', 'point_count']],
        ['has', 'flagIcon'],
      ],
      layout: {
        'icon-image': ['get', 'flagIcon'],
        'icon-size': 1,
        'icon-anchor': 'top-left',
        'icon-offset': [
          'interpolate', ['linear'], ['get', 'markerScale'],
          0, ['literal', [2, 2]], 4, ['literal', [58, 58]],
        ],
        'icon-rotate': 0,
        'icon-rotation-alignment': 'viewport',
        'icon-pitch-alignment': 'viewport',
      },
    })
    expect(layers.get(LAYER_AIRCRAFT_STOPPED)).toMatchObject({
      filter: [
        'all',
        ['!', ['has', 'point_count']],
        ['==', ['get', 'motionState'], 'slow-stopped'],
      ],
      paint: {
        'circle-color': '#c1121f',
        'circle-translate': [11, -11],
      },
    })
    expect(layers.get(LAYER_VESSEL_STOPPED)).toMatchObject({
      filter: [
        'all',
        ['!', ['has', 'point_count']],
        ['==', ['get', 'motionState'], 'slow-stopped'],
      ],
    })
    const layerOrder = [...layers.keys()]
    expect(layerOrder).not.toContain('traffic-aircraft-altitude')
    expect(layerOrder.indexOf(LAYER_AIRCRAFT)).toBeLessThan(
      layerOrder.indexOf(LAYER_AIRCRAFT_STOPPED),
    )
    expect(layerOrder.indexOf(LAYER_VESSELS)).toBeLessThan(
      layerOrder.indexOf(LAYER_VESSEL_STOPPED),
    )
    expect(layers.get(LAYER_AIRCRAFT_CLUSTERS)).toMatchObject({
      filter: ['has', 'point_count'],
    })
    expect(layers.get(LAYER_AIRCRAFT_CLUSTER_COUNT)).toMatchObject({
      layout: {
        'text-font': ['Noto Sans Regular'],
        'text-field': [
          'concat',
          'AIR ',
          ['to-string', ['get', 'point_count_abbreviated']],
        ],
      },
    })
    expect(paint.get('traffic-selected-trail:line-color')).toBe('#138daf')
    expect(paint.get(`${LAYER_AIRCRAFT}:icon-opacity`)).toEqual([
      'case',
      ['get', 'stale'],
      0.54,
      0.98,
    ])
    expect(paint.get(`${LAYER_AIRCRAFT_HALO}:circle-color`)).toBe(
      '#0f2938',
    )
    expect(paint.get(`${LAYER_VESSEL_HALO}:circle-color`)).toBe(
      '#0f2938',
    )
    expect(
      paint.get(`${LAYER_AIRCRAFT_STOPPED}:circle-color`),
    ).toBe('#c1121f')
    expect(visibility.get(`${LAYER_AIRCRAFT}:visibility`)).toBe('visible')
    expect(
      visibility.get(`${LAYER_AIRCRAFT_CLUSTERS}:visibility`),
    ).toBe('visible')
    expect(
      visibility.get(`${LAYER_AIRCRAFT_STOPPED}:visibility`),
    ).toBe('visible')
    expect(visibility.get(`${LAYER_VESSELS}:visibility`)).toBe('none')
    expect(visibility.get(`${LAYER_VESSEL_FLAGS}:visibility`)).toBe('none')
    expect(paint.get(`${LAYER_VESSEL_FLAGS}:icon-opacity`)).toEqual(
      paint.get(`${LAYER_VESSELS}:icon-opacity`),
    )
    expect(visibility.get(`${LAYER_VESSEL_STOPPED}:visibility`)).toBe(
      'none',
    )

    imageIds.clear()
    sources.clear()
    layers.clear()
    installTrafficStyle(
      map,
      { ...snapshot('dark'), vesselsVisible: true },
      darkImages,
    )
    expect(imageIds.has('vessel-flag-EE')).toBe(true)
    expect(imageIds.size).toBe(
      TRAFFIC_STYLE_IMAGE_IDS.length + VESSEL_FLAG_IMAGES.size,
    )
    expect(sources.size).toBe(3)
    expect(layers.size).toBe(12)
    expect(visibility.get(`${LAYER_VESSEL_FLAGS}:visibility`)).toBe('visible')
    expect(paint.get(`${LAYER_VESSEL_FLAGS}:icon-opacity`)).toEqual([
      'case', ['get', 'stale'], 0.52, 0.98,
    ])
  })
})
