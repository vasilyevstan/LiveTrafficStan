import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
} from 'geojson'
import {
  type FilterSpecification,
  type GeoJSONSource,
  type LayerSpecification,
  type Map as MapLibreMap,
} from 'maplibre-gl'
import type { Theme } from '../app/theme'
import {
  orbitalFeatureBelongsTo,
  orbitalFeatureOwner,
  type OrbitalChannel,
  type ModeledOrbitalPosition,
  type OrbitalTrackSegment,
} from '../domain/orbital'
import { orbitalFeaturedMapLabelForPosition } from '../domain/orbitalEnrichment'
import {
  ORBITAL_STYLE_IMAGE_IDS,
  orbitalStyleImageId,
  STARLINK_STYLE_IMAGE_ID,
  type OrbitalStyleImageKey,
  type OrbitalStyleImages,
} from './orbitalIcons'
import { mapTextFont } from './textFont'
import { LAYER_SELECTED_TRAIL } from './trafficStyle'

export const SOURCE_ORBITAL_POINTS = 'orbital-modeled-points'
export const SOURCE_ORBITAL_HIGHLIGHT = 'orbital-selected-highlight'
export const SOURCE_ORBITAL_TRACK = 'orbital-predicted-track'
export const LAYER_ORBITAL_TRACK = 'orbital-predicted-track-line'
export const LAYER_ORBITAL_POINTS = 'orbital-modeled-point-symbols'
export const LAYER_ORBITAL_HIGHLIGHT = 'orbital-selected-highlight-circle'

export const SOURCE_STARLINK_POINTS = 'starlink-modeled-points'
export const SOURCE_STARLINK_HIGHLIGHT = 'starlink-selected-highlight'
export const SOURCE_STARLINK_TRACK = 'starlink-predicted-track'
export const LAYER_STARLINK_TRACK = 'starlink-predicted-track-line'
export const LAYER_STARLINK_POINTS = 'starlink-modeled-point-symbols'
export const LAYER_STARLINK_HIGHLIGHT =
  'starlink-selected-highlight-circle'

export const ORBITAL_LAYER_IDS = [
  LAYER_ORBITAL_TRACK,
  LAYER_ORBITAL_HIGHLIGHT,
  LAYER_ORBITAL_POINTS,
] as const

export const STARLINK_LAYER_IDS = [
  LAYER_STARLINK_TRACK,
  LAYER_STARLINK_HIGHLIGHT,
  LAYER_STARLINK_POINTS,
] as const

const ORBITAL_SOURCE_ATTRIBUTION =
  '<a href="https://celestrak.org/" target="_blank" rel="noreferrer">CelesTrak</a> · SGP4 · not live'

export const STARLINK_SOURCE_ATTRIBUTION =
  ORBITAL_SOURCE_ATTRIBUTION

const emptyPoints = (): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: [],
})

const positionOwner = (
  position: ModeledOrbitalPosition,
  fallback: OrbitalChannel,
) =>
  position.owner ??
  orbitalFeatureOwner(position.id) ??
  fallback

export const orbitalPositionFeatures = (
  positions: readonly ModeledOrbitalPosition[],
): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: positions.map(
    (position): Feature<Point> => {
      const featuredLabel =
        orbitalFeaturedMapLabelForPosition(position)
      return {
        type: 'Feature',
        id: position.id,
        properties: {
          id: position.id,
          owner: positionOwner(position, 'curated'),
          noradCatalogId: position.noradCatalogId,
          objectType: position.objectType,
          sourceGroups: position.sourceGroups.join(','),
          displayOrder: position.displayOrder,
          markerIcon: orbitalStyleImageId(position.objectType),
          ...(featuredLabel ? { featuredLabel } : {}),
        },
        geometry: {
          type: 'Point',
          coordinates: [position.longitude, position.latitude],
        },
      }
    },
  ),
})

export const starlinkPositionFeatures = (
  positions: readonly ModeledOrbitalPosition[],
): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: positions.map(
    (position): Feature<Point> => ({
      type: 'Feature',
      id: position.id,
      properties: {
        id: position.id,
        owner: positionOwner(position, 'starlink'),
        noradCatalogId: position.noradCatalogId,
        objectType: position.objectType,
        sourceGroups: position.sourceGroups.join(','),
        displayOrder: position.displayOrder,
        markerIcon:
          position.objectType === 'PAY'
            ? STARLINK_STYLE_IMAGE_ID
            : orbitalStyleImageId(position.objectType),
      },
      geometry: {
        type: 'Point',
        coordinates: [position.longitude, position.latitude],
      },
    }),
  ),
})

export const orbitalHighlightFeatures = (
  positions: readonly ModeledOrbitalPosition[],
  selectedId: string | null,
): FeatureCollection<Point> => {
  const selected = positions.find(({ id }) => id === selectedId)
  return selected
    ? {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: selected.id,
            properties: {
              id: selected.id,
              owner: positionOwner(selected, 'curated'),
              objectType: selected.objectType,
            },
            geometry: {
              type: 'Point',
              coordinates: [selected.longitude, selected.latitude],
            },
          },
        ],
      }
    : emptyPoints()
}

export const orbitalTrackFeatures = (
  segments: readonly OrbitalTrackSegment[],
  owner: OrbitalChannel = 'curated',
): FeatureCollection<LineString> => ({
  type: 'FeatureCollection',
  features: segments.flatMap((segment, index) =>
    segment.points.length < 2
      ? []
      : [
          {
            type: 'Feature',
            id:
              owner === 'starlink'
                ? `starlink-track:${index}`
                : `orbital-track:${index}`,
            properties: { owner },
            geometry: {
              type: 'LineString',
              coordinates: segment.points.map((point) => [
                point.longitude,
                point.latitude,
              ]),
            },
          } satisfies Feature<LineString>,
        ],
  ),
})

export const orbitalSelectionHighlightFeatures = (
  positions: readonly ModeledOrbitalPosition[],
  selectedId: string | null,
  owner: OrbitalChannel,
) =>
  orbitalHighlightFeatures(
    positions,
    orbitalFeatureBelongsTo(selectedId, owner) ? selectedId : null,
  )

export const orbitalSelectionTrackFeatures = (
  segments: readonly OrbitalTrackSegment[],
  selectedId: string | null,
  owner: OrbitalChannel,
) =>
  orbitalTrackFeatures(
    orbitalFeatureBelongsTo(selectedId, owner) ? segments : [],
    owner,
  )

type OrbitalGeoJson =
  | FeatureCollection<Point>
  | FeatureCollection<LineString>

export const setOrbitalSourceData = (
  map: MapLibreMap,
  sourceId: string,
  data: OrbitalGeoJson,
) => {
  const source = map.getSource(sourceId)
  if (source) (source as GeoJSONSource).setData(data)
}

const ensureSource = (
  map: MapLibreMap,
  id: string,
  data: OrbitalGeoJson,
  attribution?: string,
) => {
  const source = map.getSource(id)
  if (source) {
    ;(source as GeoJSONSource).setData(data)
  } else {
    map.addSource(id, {
      type: 'geojson',
      data,
      ...(attribution ? { attribution } : {}),
    })
  }
}

const ensureLayer = (
  map: MapLibreMap,
  layer: LayerSpecification,
  beforeLayerId?: string,
) => {
  if (!map.getLayer(layer.id)) {
    map.addLayer(layer, beforeLayerId)
  }
}

const ensureImage = (
  map: MapLibreMap,
  id: OrbitalStyleImageKey,
  image: ImageData,
) => {
  if (map.hasImage(id)) {
    map.updateImage(id, image)
  } else {
    map.addImage(id, image, { pixelRatio: 2 })
  }
}

const setLayerGroupVisibility = (
  map: MapLibreMap,
  layerIds: readonly string[],
  visible: boolean,
) => {
  for (const layerId of layerIds) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(
        layerId,
        'visibility',
        visible ? 'visible' : 'none',
      )
    }
  }
}

export const setOrbitalVisibility = (
  map: MapLibreMap,
  visible: boolean,
) => setLayerGroupVisibility(map, ORBITAL_LAYER_IDS, visible)

export const setStarlinkVisibility = (
  map: MapLibreMap,
  visible: boolean,
) => setLayerGroupVisibility(map, STARLINK_LAYER_IDS, visible)

export const orbitalPointFilter = (
  shownIds: readonly string[],
): FilterSpecification =>
  shownIds.length > 0
    ? ['in', ['get', 'id'], ['literal', shownIds]]
    : ['==', ['get', 'id'], '']

export const setOrbitalPointFilter = (
  map: MapLibreMap,
  shownIds: readonly string[],
) => {
  if (map.getLayer(LAYER_ORBITAL_POINTS)) {
    map.setFilter(LAYER_ORBITAL_POINTS, orbitalPointFilter(shownIds))
  }
}

export const setStarlinkPointFilter = (
  map: MapLibreMap,
  shownIds: readonly string[],
) => {
  if (map.getLayer(LAYER_STARLINK_POINTS)) {
    map.setFilter(LAYER_STARLINK_POINTS, orbitalPointFilter(shownIds))
  }
}

export const firstOrbitalLayerId = (map: MapLibreMap) =>
  map.getLayer(LAYER_ORBITAL_TRACK)
    ? LAYER_ORBITAL_TRACK
    : map.getLayer(LAYER_STARLINK_TRACK)
      ? LAYER_STARLINK_TRACK
      : undefined

export const orbitalPickLayerIds = (
  map: MapLibreMap,
  orbitalVisible: boolean,
  starlinkVisible: boolean,
) => {
  const layerIds = [
    ...(orbitalVisible
      ? [LAYER_ORBITAL_HIGHLIGHT, LAYER_ORBITAL_POINTS]
      : []),
    ...(starlinkVisible
      ? [LAYER_STARLINK_HIGHLIGHT, LAYER_STARLINK_POINTS]
      : []),
  ]
  return layerIds.filter((layerId) => map.getLayer(layerId))
}

export const installOrbitalStyle = (
  map: MapLibreMap,
  positions: FeatureCollection<Point>,
  highlight: FeatureCollection<Point>,
  track: FeatureCollection<LineString>,
  theme: Theme,
  visible: boolean,
  images: OrbitalStyleImages,
  shownIds: readonly string[],
) => {
  const selection = theme === 'dark' ? '#f7fcff' : '#102d3b'
  const trackColor = theme === 'dark' ? '#8fe7ff' : '#087fa6'
  const labelColor = theme === 'dark' ? '#f7fcff' : '#102d3b'
  const labelHalo = theme === 'dark' ? '#06131d' : '#f7fcff'
  const textFont = mapTextFont(map)

  for (const imageId of ORBITAL_STYLE_IMAGE_IDS) {
    ensureImage(map, imageId, images[imageId])
  }

  ensureSource(
    map,
    SOURCE_ORBITAL_POINTS,
    positions,
    ORBITAL_SOURCE_ATTRIBUTION,
  )
  ensureSource(map, SOURCE_ORBITAL_HIGHLIGHT, highlight)
  ensureSource(map, SOURCE_ORBITAL_TRACK, track)

  const selectedTrailLayerId = map.getLayer(LAYER_SELECTED_TRAIL)
    ? LAYER_SELECTED_TRAIL
    : undefined
  const trackBeforeLayerId = map.getLayer(LAYER_STARLINK_TRACK)
    ? LAYER_STARLINK_TRACK
    : selectedTrailLayerId
  const highlightBeforeLayerId = map.getLayer(
    LAYER_STARLINK_HIGHLIGHT,
  )
    ? LAYER_STARLINK_HIGHLIGHT
    : selectedTrailLayerId
  const pointsBeforeLayerId = map.getLayer(LAYER_STARLINK_POINTS)
    ? LAYER_STARLINK_POINTS
    : selectedTrailLayerId

  ensureLayer(
    map,
    {
      id: LAYER_ORBITAL_TRACK,
      type: 'line',
      source: SOURCE_ORBITAL_TRACK,
      paint: {
        'line-color': trackColor,
        'line-opacity': 0.74,
        'line-width': 2,
        'line-dasharray': [1.5, 1.5],
      },
    },
    trackBeforeLayerId,
  )
  ensureLayer(
    map,
    {
      id: LAYER_ORBITAL_HIGHLIGHT,
      type: 'circle',
      source: SOURCE_ORBITAL_HIGHLIGHT,
      paint: {
        'circle-radius': 11,
        'circle-color': selection,
        'circle-opacity': 0.12,
        'circle-stroke-color': selection,
        'circle-stroke-opacity': 0.95,
        'circle-stroke-width': 2,
      },
    },
    highlightBeforeLayerId,
  )
  ensureLayer(
    map,
    {
      id: LAYER_ORBITAL_POINTS,
      type: 'symbol',
      source: SOURCE_ORBITAL_POINTS,
      filter: orbitalPointFilter(shownIds),
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
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        ...(textFont
          ? {
              'text-field': [
                'coalesce',
                ['get', 'featuredLabel'],
                '',
              ],
              'text-font': textFont,
              'text-size': 12,
              'text-offset': [0, 1.45],
              'text-anchor': 'top',
              'text-optional': true,
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            }
          : {}),
      },
      paint: {
        'icon-opacity': 0.94,
        ...(textFont
          ? {
              'text-color': labelColor,
              'text-halo-color': labelHalo,
              'text-halo-width': 1.4,
            }
          : {}),
      },
    },
    pointsBeforeLayerId,
  )

  map.setPaintProperty(
    LAYER_ORBITAL_TRACK,
    'line-color',
    trackColor,
  )
  map.setPaintProperty(
    LAYER_ORBITAL_HIGHLIGHT,
    'circle-color',
    selection,
  )
  map.setPaintProperty(
    LAYER_ORBITAL_HIGHLIGHT,
    'circle-stroke-color',
    selection,
  )
  if (textFont) {
    map.setLayoutProperty(
      LAYER_ORBITAL_POINTS,
      'text-font',
      textFont,
    )
    map.setPaintProperty(
      LAYER_ORBITAL_POINTS,
      'text-color',
      labelColor,
    )
    map.setPaintProperty(
      LAYER_ORBITAL_POINTS,
      'text-halo-color',
      labelHalo,
    )
  }
  setOrbitalPointFilter(map, shownIds)
  setOrbitalVisibility(map, visible)
}

export const installStarlinkStyle = (
  map: MapLibreMap,
  positions: FeatureCollection<Point>,
  highlight: FeatureCollection<Point>,
  track: FeatureCollection<LineString>,
  theme: Theme,
  visible: boolean,
  images: OrbitalStyleImages,
  shownIds: readonly string[],
) => {
  const selection = theme === 'dark' ? '#f5f0ff' : '#32145f'
  const trackColor = theme === 'dark' ? '#c4b5fd' : '#6d28d9'

  for (const imageId of [
    ...ORBITAL_STYLE_IMAGE_IDS,
    STARLINK_STYLE_IMAGE_ID,
  ] as const) {
    ensureImage(map, imageId, images[imageId])
  }

  ensureSource(
    map,
    SOURCE_STARLINK_POINTS,
    positions,
    STARLINK_SOURCE_ATTRIBUTION,
  )
  ensureSource(map, SOURCE_STARLINK_HIGHLIGHT, highlight)
  ensureSource(map, SOURCE_STARLINK_TRACK, track)

  const selectedTrailLayerId = map.getLayer(LAYER_SELECTED_TRAIL)
    ? LAYER_SELECTED_TRAIL
    : undefined
  const trackBeforeLayerId = map.getLayer(LAYER_ORBITAL_HIGHLIGHT)
    ? LAYER_ORBITAL_HIGHLIGHT
    : selectedTrailLayerId
  const highlightBeforeLayerId = map.getLayer(LAYER_ORBITAL_POINTS)
    ? LAYER_ORBITAL_POINTS
    : selectedTrailLayerId

  ensureLayer(
    map,
    {
      id: LAYER_STARLINK_TRACK,
      type: 'line',
      source: SOURCE_STARLINK_TRACK,
      paint: {
        'line-color': trackColor,
        'line-opacity': 0.78,
        'line-width': 2,
        'line-dasharray': [3, 1.4],
      },
    },
    trackBeforeLayerId,
  )
  ensureLayer(
    map,
    {
      id: LAYER_STARLINK_HIGHLIGHT,
      type: 'circle',
      source: SOURCE_STARLINK_HIGHLIGHT,
      paint: {
        'circle-radius': 11,
        'circle-color': selection,
        'circle-opacity': 0.12,
        'circle-stroke-color': selection,
        'circle-stroke-opacity': 0.95,
        'circle-stroke-width': 2,
      },
    },
    highlightBeforeLayerId,
  )
  ensureLayer(
    map,
    {
      id: LAYER_STARLINK_POINTS,
      type: 'symbol',
      source: SOURCE_STARLINK_POINTS,
      filter: orbitalPointFilter(shownIds),
      layout: {
        'icon-image': ['get', 'markerIcon'],
        'icon-size': 0.78,
        'icon-rotation-alignment': 'viewport',
        'icon-pitch-alignment': 'viewport',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'icon-opacity': 0.96,
      },
    },
    selectedTrailLayerId,
  )

  map.setPaintProperty(
    LAYER_STARLINK_TRACK,
    'line-color',
    trackColor,
  )
  map.setPaintProperty(
    LAYER_STARLINK_HIGHLIGHT,
    'circle-color',
    selection,
  )
  map.setPaintProperty(
    LAYER_STARLINK_HIGHLIGHT,
    'circle-stroke-color',
    selection,
  )
  setStarlinkPointFilter(map, shownIds)
  setStarlinkVisibility(map, visible)
}
