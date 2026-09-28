import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import type { ModeledOrbitalPosition } from '../domain/orbital'
import {
  installOrbitalStyle,
  LAYER_ORBITAL_HIGHLIGHT,
  LAYER_ORBITAL_POINTS,
  LAYER_ORBITAL_TRACK,
  orbitalHighlightFeatures,
  orbitalPositionFeatures,
  orbitalTrackFeatures,
  SOURCE_ORBITAL_HIGHLIGHT,
  SOURCE_ORBITAL_POINTS,
  SOURCE_ORBITAL_TRACK,
} from './orbitalStyle'
import { LAYER_SELECTED_TRAIL } from './trafficStyle'

const position: ModeledOrbitalPosition = {
  id: 'orbital:694',
  noradCatalogId: '694',
  name: 'ATLAS CENTAUR 2',
  internationalDesignator: '1963-047A',
  objectType: 'PAY',
  elementEpoch: 1,
  snapshotRetrievedAt: 2,
  snapshotSha256: 'a'.repeat(64),
  modeledFor: 3,
  latitude: 10,
  longitude: 20,
  altitudeKm: 600,
  velocityKmPerSecond: 7.6,
}

const createMap = () => {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers = [LAYER_SELECTED_TRAIL]
  const addLayer = vi.fn((layer: { id: string }, before?: string) => {
    const beforeIndex = before ? layers.indexOf(before) : -1
    if (beforeIndex >= 0) layers.splice(beforeIndex, 0, layer.id)
    else layers.push(layer.id)
  })
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: (id: string) => {
      sources.set(id, { setData: vi.fn() })
    },
    getLayer: (id: string) =>
      layers.includes(id) ? { id } : undefined,
    addLayer,
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
  } as unknown as MapLibreMap
  return { map, sources, layers, addLayer }
}

describe('orbital map style', () => {
  it('installs one persistent source/layer set with stable IDs', () => {
    const { map, sources, layers, addLayer } = createMap()
    const points = orbitalPositionFeatures([position])
    const highlight = orbitalHighlightFeatures(
      [position],
      position.id,
    )
    const track = orbitalTrackFeatures([
      {
        points: [
          { modeledFor: 1, latitude: 1, longitude: 2 },
          { modeledFor: 2, latitude: 3, longitude: 4 },
        ],
      },
    ])

    installOrbitalStyle(map, points, highlight, track, 'light', true)
    installOrbitalStyle(map, points, highlight, track, 'dark', true)

    expect([...sources.keys()].sort()).toEqual(
      [
        SOURCE_ORBITAL_HIGHLIGHT,
        SOURCE_ORBITAL_POINTS,
        SOURCE_ORBITAL_TRACK,
      ].sort(),
    )
    expect(addLayer).toHaveBeenCalledTimes(3)
    expect(layers).toEqual([
      LAYER_ORBITAL_TRACK,
      LAYER_ORBITAL_POINTS,
      LAYER_ORBITAL_HIGHLIGHT,
      LAYER_SELECTED_TRAIL,
    ])
    expect(points.features[0]).toMatchObject({
      id: 'orbital:694',
      properties: {
        id: 'orbital:694',
        objectType: 'PAY',
      },
    })
    expect(highlight.features).toHaveLength(1)
    expect(track.features).toHaveLength(1)
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      LAYER_ORBITAL_TRACK,
      'line-color',
      '#8fe7ff',
    )
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      LAYER_ORBITAL_POINTS,
      'circle-stroke-color',
      '#06131a',
    )
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      LAYER_ORBITAL_HIGHLIGHT,
      'circle-color',
      '#f7fcff',
    )
  })

  it('restores hidden visibility without removing modeled data', () => {
    const { map } = createMap()
    installOrbitalStyle(
      map,
      orbitalPositionFeatures([position]),
      orbitalHighlightFeatures([position], null),
      orbitalTrackFeatures([]),
      'light',
      false,
    )

    expect(map.setLayoutProperty).toHaveBeenCalledTimes(3)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      LAYER_ORBITAL_POINTS,
      'visibility',
      'none',
    )
  })
})
