import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import type { ModeledOrbitalPosition } from '../domain/orbital'
import {
  ORBITAL_STYLE_IMAGE_IDS,
  STARLINK_STYLE_IMAGE_ID,
  type OrbitalStyleImages,
} from './orbitalIcons'
import {
  installOrbitalStyle,
  installStarlinkStyle,
  LAYER_ORBITAL_HIGHLIGHT,
  LAYER_ORBITAL_POINTS,
  LAYER_ORBITAL_TRACK,
  LAYER_STARLINK_HIGHLIGHT,
  LAYER_STARLINK_POINTS,
  LAYER_STARLINK_TRACK,
  orbitalPickLayerIds,
  orbitalPointFilter,
  orbitalHighlightFeatures,
  orbitalPositionFeatures,
  orbitalSelectionHighlightFeatures,
  orbitalSelectionTrackFeatures,
  orbitalTrackFeatures,
  SOURCE_ORBITAL_HIGHLIGHT,
  SOURCE_ORBITAL_POINTS,
  SOURCE_ORBITAL_TRACK,
  SOURCE_STARLINK_HIGHLIGHT,
  SOURCE_STARLINK_POINTS,
  SOURCE_STARLINK_TRACK,
  STARLINK_LAYER_IDS,
  STARLINK_SOURCE_ATTRIBUTION,
  starlinkPositionFeatures,
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

const starlinkPosition: ModeledOrbitalPosition = {
  ...position,
  id: 'orbital:starlink:44713',
  owner: 'starlink',
  noradCatalogId: '44713',
  name: 'STARLINK-1007',
  internationalDesignator: '2019-074A',
  sourceGroups: ['starlink'],
  displayOrder: 7,
}

const imageSet = (theme: string) =>
  Object.fromEntries(
    [...ORBITAL_STYLE_IMAGE_IDS, STARLINK_STYLE_IMAGE_ID].map(
      (id) => [
        id,
        { theme: `${theme}-${id}` },
      ],
    ),
  ) as unknown as OrbitalStyleImages
const lightImages = imageSet('light')
const darkImages = imageSet('dark')

const createMap = () => {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const sourceSpecs = new Map<string, unknown>()
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
    addSource: (id: string, specification: unknown) => {
      sources.set(id, { setData: vi.fn() })
      sourceSpecs.set(id, specification)
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
    sourceSpecs,
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
        owner: 'curated',
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

  it('installs a separate persistent Starlink source, layers, icon, filter, and attribution', () => {
    const {
      map,
      sources,
      sourceSpecs,
      layers,
      layerSpecs,
      imageIds,
      addLayer,
    } = createMap()
    const rankHidden = {
      ...starlinkPosition,
      id: 'orbital:starlink:20580',
      noradCatalogId: '20580',
    }
    const exactDebris = {
      ...starlinkPosition,
      id: 'orbital:starlink:20581',
      noradCatalogId: '20581',
      objectType: 'DEB' as const,
    }
    const points = starlinkPositionFeatures([
      starlinkPosition,
      rankHidden,
      exactDebris,
    ])
    const highlight = orbitalSelectionHighlightFeatures(
      [starlinkPosition, rankHidden],
      starlinkPosition.id,
      'starlink',
    )
    const track = orbitalSelectionTrackFeatures(
      [
        {
          points: [
            { modeledFor: 1, latitude: 1, longitude: 2 },
            { modeledFor: 2, latitude: 3, longitude: 4 },
          ],
        },
      ],
      starlinkPosition.id,
      'starlink',
    )

    installStarlinkStyle(
      map,
      points,
      highlight,
      track,
      'light',
      true,
      lightImages,
      [starlinkPosition.id],
    )
    installStarlinkStyle(
      map,
      points,
      highlight,
      track,
      'dark',
      false,
      darkImages,
      [rankHidden.id],
    )
    installStarlinkStyle(
      map,
      points,
      highlight,
      track,
      'light',
      true,
      lightImages,
      [starlinkPosition.id],
    )

    expect([...sources.keys()].sort()).toEqual(
      [
        SOURCE_STARLINK_HIGHLIGHT,
        SOURCE_STARLINK_POINTS,
        SOURCE_STARLINK_TRACK,
      ].sort(),
    )
    expect(addLayer).toHaveBeenCalledTimes(3)
    expect(layers).toEqual([
      LAYER_STARLINK_TRACK,
      LAYER_STARLINK_HIGHLIGHT,
      LAYER_STARLINK_POINTS,
      LAYER_SELECTED_TRAIL,
    ])
    expect(imageIds).toEqual(
      new Set([
        ...ORBITAL_STYLE_IMAGE_IDS,
        STARLINK_STYLE_IMAGE_ID,
      ]),
    )
    expect(map.addImage).toHaveBeenCalledWith(
      STARLINK_STYLE_IMAGE_ID,
      lightImages[STARLINK_STYLE_IMAGE_ID],
      { pixelRatio: 2 },
    )
    expect(map.updateImage).toHaveBeenCalledWith(
      STARLINK_STYLE_IMAGE_ID,
      darkImages[STARLINK_STYLE_IMAGE_ID],
    )
    expect(map.updateImage).toHaveBeenLastCalledWith(
      STARLINK_STYLE_IMAGE_ID,
      lightImages[STARLINK_STYLE_IMAGE_ID],
    )
    expect(points.features.map(({ id }) => id)).toEqual([
      starlinkPosition.id,
      rankHidden.id,
      exactDebris.id,
    ])
    expect(points.features[0]).toMatchObject({
      id: starlinkPosition.id,
      properties: {
        id: starlinkPosition.id,
        owner: 'starlink',
        markerIcon: STARLINK_STYLE_IMAGE_ID,
        sourceGroups: 'starlink',
      },
    })
    expect(points.features[1].properties?.featuredLabel).toBeUndefined()
    expect(points.features[2].properties?.markerIcon).toBe(
      'orbital-debris',
    )
    expect(layerSpecs.get(LAYER_STARLINK_POINTS)).toMatchObject({
      type: 'symbol',
      source: SOURCE_STARLINK_POINTS,
      filter: orbitalPointFilter([starlinkPosition.id]),
      layout: {
        'icon-image': ['get', 'markerIcon'],
      },
    })
    expect(map.setFilter).toHaveBeenLastCalledWith(
      LAYER_STARLINK_POINTS,
      orbitalPointFilter([starlinkPosition.id]),
    )
    for (const layerId of STARLINK_LAYER_IDS) {
      expect(map.setLayoutProperty).toHaveBeenCalledWith(
        layerId,
        'visibility',
        'none',
      )
    }
    expect(sourceSpecs.get(SOURCE_STARLINK_POINTS)).toMatchObject({
      attribution: STARLINK_SOURCE_ATTRIBUTION,
    })
    expect(STARLINK_SOURCE_ATTRIBUTION).toContain('CelesTrak')
    expect(STARLINK_SOURCE_ATTRIBUTION).toContain(
      'Starlink sample',
    )
    expect(STARLINK_SOURCE_ATTRIBUTION).toContain('SGP4')
    expect(STARLINK_SOURCE_ATTRIBUTION).toContain('not live')
    expect(STARLINK_SOURCE_ATTRIBUTION).not.toMatch(
      /active fleet|optical/i,
    )
  })

  it('keeps selected highlights and predicted tracks on the owning channel only', () => {
    const segments = [
      {
        points: [
          { modeledFor: 1, latitude: 1, longitude: 2 },
          { modeledFor: 2, latitude: 3, longitude: 4 },
        ],
      },
    ]

    expect(
      orbitalSelectionHighlightFeatures(
        [position],
        position.id,
        'curated',
      ).features,
    ).toHaveLength(1)
    expect(
      orbitalSelectionHighlightFeatures(
        [starlinkPosition],
        position.id,
        'starlink',
      ).features,
    ).toHaveLength(0)
    expect(
      orbitalSelectionTrackFeatures(
        segments,
        position.id,
        'curated',
      ).features,
    ).toHaveLength(1)
    expect(
      orbitalSelectionTrackFeatures(
        segments,
        position.id,
        'starlink',
      ).features,
    ).toHaveLength(0)

    expect(
      orbitalSelectionHighlightFeatures(
        [position],
        starlinkPosition.id,
        'curated',
      ).features,
    ).toHaveLength(0)
    expect(
      orbitalSelectionHighlightFeatures(
        [starlinkPosition],
        starlinkPosition.id,
        'starlink',
      ).features,
    ).toHaveLength(1)
    expect(
      orbitalSelectionTrackFeatures(
        segments,
        starlinkPosition.id,
        'curated',
      ).features,
    ).toHaveLength(0)
    expect(
      orbitalSelectionTrackFeatures(
        segments,
        starlinkPosition.id,
        'starlink',
      ).features[0],
    ).toMatchObject({
      id: 'starlink-track:0',
      properties: { owner: 'starlink' },
    })
  })

  it('aggregates both visible orbital channels into one exact-pick surface', () => {
    const { map } = createMap()
    installStarlinkStyle(
      map,
      starlinkPositionFeatures([starlinkPosition]),
      orbitalSelectionHighlightFeatures(
        [starlinkPosition],
        null,
        'starlink',
      ),
      orbitalSelectionTrackFeatures([], null, 'starlink'),
      'light',
      true,
      lightImages,
      [starlinkPosition.id],
    )
    installOrbitalStyle(
      map,
      orbitalPositionFeatures([position]),
      orbitalSelectionHighlightFeatures(
        [position],
        null,
        'curated',
      ),
      orbitalSelectionTrackFeatures([], null, 'curated'),
      'light',
      true,
      lightImages,
      [position.id],
    )

    expect(orbitalPickLayerIds(map, true, true)).toEqual([
      LAYER_ORBITAL_HIGHLIGHT,
      LAYER_ORBITAL_POINTS,
      LAYER_STARLINK_HIGHLIGHT,
      LAYER_STARLINK_POINTS,
    ])
    expect(orbitalPickLayerIds(map, false, true)).toEqual([
      LAYER_STARLINK_HIGHLIGHT,
      LAYER_STARLINK_POINTS,
    ])
    expect(orbitalPickLayerIds(map, true, false)).toEqual([
      LAYER_ORBITAL_HIGHLIGHT,
      LAYER_ORBITAL_POINTS,
    ])
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
