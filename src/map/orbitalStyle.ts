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
import type {
  ModeledOrbitalPosition,
  OrbitalTrackSegment,
} from '../domain/orbital'
import { orbitalFeaturedMapLabelForPosition } from '../domain/orbitalEnrichment'
import {
  ORBITAL_STYLE_IMAGE_IDS,
  orbitalStyleImageId,
  type OrbitalStyleImageId,
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

export const ORBITAL_LAYER_IDS = [
  LAYER_ORBITAL_TRACK,
  LAYER_ORBITAL_HIGHLIGHT,
  LAYER_ORBITAL_POINTS,
] as const

const SOURCE_ATTRIBUTION =
  'Orbits <a href="https://celestrak.org/" target="_blank" rel="noreferrer">CelesTrak</a> · SGP4 · not live'

const emptyPoints = (): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: [],
})

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
): FeatureCollection<LineString> => ({
  type: 'FeatureCollection',
  features: segments.flatMap((segment, index) =>
    segment.points.length < 2
      ? []
      : [
          {
            type: 'Feature',
            id: `orbital-track:${index}`,
            properties: {},
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

const ensureLayer = (map: MapLibreMap, layer: LayerSpecification) => {
  if (!map.getLayer(layer.id)) {
    map.addLayer(
      layer,
      map.getLayer(LAYER_SELECTED_TRAIL)
        ? LAYER_SELECTED_TRAIL
        : undefined,
    )
  }
}

const ensureImage = (
  map: MapLibreMap,
  id: OrbitalStyleImageId,
  image: ImageData,
) => {
  if (map.hasImage(id)) {
    map.updateImage(id, image)
  } else {
    map.addImage(id, image, { pixelRatio: 2 })
  }
}

export const setOrbitalVisibility = (
  map: MapLibreMap,
  visible: boolean,
) => {
  for (const layerId of ORBITAL_LAYER_IDS) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(
        layerId,
        'visibility',
        visible ? 'visible' : 'none',
      )
    }
  }
}

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
    SOURCE_ATTRIBUTION,
  )
  ensureSource(map, SOURCE_ORBITAL_HIGHLIGHT, highlight)
  ensureSource(map, SOURCE_ORBITAL_TRACK, track)

  ensureLayer(map, {
    id: LAYER_ORBITAL_TRACK,
    type: 'line',
    source: SOURCE_ORBITAL_TRACK,
    paint: {
      'line-color': trackColor,
      'line-opacity': 0.74,
      'line-width': 2,
      'line-dasharray': [1.5, 1.5],
    },
  })
  ensureLayer(map, {
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
  })
  ensureLayer(map, {
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
  })

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
