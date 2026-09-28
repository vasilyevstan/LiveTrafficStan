import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
} from 'geojson'
import {
  type ExpressionSpecification,
  type GeoJSONSource,
  type LayerSpecification,
  type Map as MapLibreMap,
} from 'maplibre-gl'
import type { Theme } from '../app/theme'
import type {
  ModeledOrbitalPosition,
  OrbitalTrackSegment,
} from '../domain/orbital'
import { LAYER_SELECTED_TRAIL } from './trafficStyle'

export const SOURCE_ORBITAL_POINTS = 'orbital-modeled-points'
export const SOURCE_ORBITAL_HIGHLIGHT = 'orbital-selected-highlight'
export const SOURCE_ORBITAL_TRACK = 'orbital-predicted-track'
export const LAYER_ORBITAL_TRACK = 'orbital-predicted-track-line'
export const LAYER_ORBITAL_POINTS = 'orbital-modeled-points-circles'
export const LAYER_ORBITAL_HIGHLIGHT = 'orbital-selected-highlight-circle'

export const ORBITAL_LAYER_IDS = [
  LAYER_ORBITAL_TRACK,
  LAYER_ORBITAL_POINTS,
  LAYER_ORBITAL_HIGHLIGHT,
] as const

const SOURCE_ATTRIBUTION =
  'Orbital elements and catalog types: <a href="https://celestrak.org/" target="_blank" rel="noreferrer">CelesTrak</a>; positions modeled locally with SGP4, not live telemetry'

const typeColor = (theme: Theme): ExpressionSpecification => [
  'match',
  ['get', 'objectType'],
  'PAY',
  theme === 'dark' ? '#67d8ff' : '#087fa6',
  'R/B',
  theme === 'dark' ? '#ffb45f' : '#b85f00',
  'DEB',
  theme === 'dark' ? '#ff7db8' : '#b62e69',
  theme === 'dark' ? '#aab8c0' : '#65747c',
] as ExpressionSpecification

const emptyPoints = (): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: [],
})

export const orbitalPositionFeatures = (
  positions: readonly ModeledOrbitalPosition[],
): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: positions.map(
    (position): Feature<Point> => ({
      type: 'Feature',
      id: position.id,
      properties: {
        id: position.id,
        noradCatalogId: position.noradCatalogId,
        objectType: position.objectType,
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

export const installOrbitalStyle = (
  map: MapLibreMap,
  positions: FeatureCollection<Point>,
  highlight: FeatureCollection<Point>,
  track: FeatureCollection<LineString>,
  theme: Theme,
  visible: boolean,
) => {
  const colors = typeColor(theme)
  const stroke = theme === 'dark' ? '#06131a' : '#ffffff'
  const selection = theme === 'dark' ? '#f7fcff' : '#102d3b'
  const trackColor = theme === 'dark' ? '#8fe7ff' : '#087fa6'

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
    id: LAYER_ORBITAL_POINTS,
    type: 'circle',
    source: SOURCE_ORBITAL_POINTS,
    paint: {
      'circle-radius': 5,
      'circle-color': colors,
      'circle-opacity': 0.9,
      'circle-stroke-color': stroke,
      'circle-stroke-width': 1.2,
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

  map.setPaintProperty(
    LAYER_ORBITAL_TRACK,
    'line-color',
    trackColor,
  )
  map.setPaintProperty(
    LAYER_ORBITAL_POINTS,
    'circle-color',
    colors,
  )
  map.setPaintProperty(
    LAYER_ORBITAL_POINTS,
    'circle-stroke-color',
    stroke,
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
  setOrbitalVisibility(map, visible)
}
