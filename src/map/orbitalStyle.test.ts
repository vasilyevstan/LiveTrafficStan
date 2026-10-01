import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import type { ModeledOrbitalPosition } from '../domain/orbital'
import {
  ORBITAL_STYLE_IMAGE_IDS,
  type OrbitalStyleImages,
} from './orbitalIcons'
import {
  installOrbitalStyle,
  LAYER_ORBITAL_HIGHLIGHT,
  LAYER_ORBITAL_POINTS,
  LAYER_ORBITAL_TRACK,
  orbitalPointFilter,
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
  sourceGroups: ['visual'],
  displayOrder: 694,
  elementEpoch: 1,
  snapshotRetrievedAt: 2,
  snapshotSha256: 'a'.repeat(64),
  modeledFor: 3,
  latitude: 10,
  longitude: 20,
  altitudeKm: 600,
  velocityKmPerSecond: 7.6,
}

const issPosition: ModeledOrbitalPosition = {
  ...position,
  id: 'orbital:25544',
  noradCatalogId: '25544',
  name: 'ISS (ZARYA)',
  internationalDesignator: '1998-067A',
  sourceGroups: ['visual', 'stations'],
  displayOrder: 25544,
}

const hubblePosition: ModeledOrbitalPosition = {
  ...position,
  id: 'orbital:20580',
  noradCatalogId: '20580',
  name: 'HST',
  internationalDesignator: '1990-037B',
  sourceGroups: ['visual', 'science'],
  displayOrder: 20580,
}

const imageSet = (theme: string) =>
  Object.fromEntries(
    ORBITAL_STYLE_IMAGE_IDS.map((id) => [
      id,
      { theme: `${theme}-${id}` },
    ]),
  ) as unknown as OrbitalStyleImages
const lightImages = imageSet('light')
const darkImages = imageSet('dark')

const createMap = () => {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers = [LAYER_SELECTED_TRAIL]
  const layerSpecs = new Map<string, unknown>()
  const imageIds = new Set<string>()
  const addLayer = vi.fn((layer: { id: string }, before?: string) => {
    const beforeIndex = before ? layers.indexOf(before) : -1
    if (beforeIndex >= 0) layers.splice(beforeIndex, 0, layer.id)
    else layers.push(layer.id)
    layerSpecs.set(layer.id, layer)
  })
  const map = {
    getStyle: () => ({
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
    }),
    hasImage: (id: string) => imageIds.has(id),
    addImage: vi.fn((id: string) => imageIds.add(id)),
    updateImage: vi.fn(),
    getSource: (id: string) => sources.get(id),
    addSource: (id: string) => {
      sources.set(id, { setData: vi.fn() })
    },
    getLayer: (id: string) =>
      layers.includes(id) ? { id } : undefined,
    addLayer,
    setLayoutProperty: vi.fn(),
    setFilter: vi.fn(),
    setPaintProperty: vi.fn(),
  } as unknown as MapLibreMap
  return {
    map,
    sources,
    layers,
    layerSpecs,
    imageIds,
    addLayer,
  }
}

describe('orbital map style', () => {
  it('installs one persistent source/layer set with stable IDs', () => {
    const {
      map,
      sources,
      layers,
      layerSpecs,
      imageIds,
      addLayer,
    } = createMap()
    const points = orbitalPositionFeatures([
      position,
      hubblePosition,
      issPosition,
    ])
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

    installOrbitalStyle(
      map,
      points,
      highlight,
      track,
      'light',
      true,
      lightImages,
      [position.id],
    )
    installOrbitalStyle(
      map,
      points,
      highlight,
      track,
      'dark',
      true,
      darkImages,
      [position.id],
    )
    installOrbitalStyle(
      map,
      points,
      highlight,
      track,
      'light',
      true,
      lightImages,
      [position.id],
    )

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
      LAYER_ORBITAL_HIGHLIGHT,
      LAYER_ORBITAL_POINTS,
      LAYER_SELECTED_TRAIL,
    ])
    expect(imageIds).toEqual(new Set(ORBITAL_STYLE_IMAGE_IDS))
    expect(map.addImage).toHaveBeenCalledTimes(
      ORBITAL_STYLE_IMAGE_IDS.length,
    )
    expect(map.updateImage).toHaveBeenCalledTimes(
      ORBITAL_STYLE_IMAGE_IDS.length * 2,
    )
    for (const imageId of ORBITAL_STYLE_IMAGE_IDS) {
      expect(map.updateImage).toHaveBeenCalledWith(
        imageId,
        darkImages[imageId],
      )
      expect(map.updateImage).toHaveBeenCalledWith(
        imageId,
        lightImages[imageId],
      )
    }
    expect(points.features[0]).toMatchObject({
      id: 'orbital:694',
      properties: {
        id: 'orbital:694',
        objectType: 'PAY',
        sourceGroups: 'visual',
        displayOrder: 694,
        markerIcon: 'orbital-payload',
      },
    })
    expect(points.features[0].properties?.featuredLabel).toBeUndefined()
    expect(points.features[1].properties?.featuredLabel).toBe('HUBBLE')
    expect(points.features[2].properties?.featuredLabel).toBe('ISS')
    expect(layerSpecs.get(LAYER_ORBITAL_POINTS)).toMatchObject({
      type: 'symbol',
      layout: {
        'icon-image': ['get', 'markerIcon'],
        'icon-size': [
          'case',
          ['has', 'featuredLabel'],
          1.08,
          0.72,
        ],
        'icon-rotation-alignment': 'viewport',
        'icon-pitch-alignment': 'viewport',
        'text-field': [
          'coalesce',
          ['get', 'featuredLabel'],
          '',
        ],
        'text-font': ['Noto Sans Regular'],
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
      LAYER_ORBITAL_TRACK,
      'line-color',
      '#087fa6',
    )
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      LAYER_ORBITAL_HIGHLIGHT,
      'circle-color',
      '#f7fcff',
    )
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      LAYER_ORBITAL_POINTS,
      'text-color',
      '#f7fcff',
    )
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      LAYER_ORBITAL_POINTS,
      'text-color',
      '#102d3b',
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
      lightImages,
      [position.id],
    )

    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      LAYER_ORBITAL_POINTS,
      'visibility',
      'none',
    )
  })

  it('retains every safe point while restoring the exact shown-ID filter', () => {
    const { map, sources, layerSpecs } = createMap()
    const rankHidden = {
      ...position,
      id: 'orbital:999',
      noradCatalogId: '999',
      displayOrder: 999,
    }
    const points = orbitalPositionFeatures([position, rankHidden])

    installOrbitalStyle(
      map,
      points,
      orbitalHighlightFeatures([position, rankHidden], position.id),
      orbitalTrackFeatures([]),
      'light',
      true,
      lightImages,
      [position.id],
    )

    expect(points.features.map(({ id }) => id)).toEqual([
      position.id,
      rankHidden.id,
    ])
    expect(layerSpecs.get(LAYER_ORBITAL_POINTS)).toMatchObject({
      filter: orbitalPointFilter([position.id]),
    })
    expect(map.setFilter).toHaveBeenLastCalledWith(
      LAYER_ORBITAL_POINTS,
      orbitalPointFilter([position.id]),
    )

    installOrbitalStyle(
      map,
      points,
      orbitalHighlightFeatures([position, rankHidden], rankHidden.id),
      orbitalTrackFeatures([]),
      'dark',
      true,
      darkImages,
      [rankHidden.id],
    )

    expect(sources.get(SOURCE_ORBITAL_POINTS)?.setData).toHaveBeenCalledWith(
      points,
    )
    expect(map.setFilter).toHaveBeenLastCalledWith(
      LAYER_ORBITAL_POINTS,
      orbitalPointFilter([rankHidden.id]),
    )
  })
})
