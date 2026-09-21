import type {
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
import {
  TRAFFIC_STYLE_IMAGE_IDS,
  type TrafficStyleImageId,
} from '../domain/trafficPresentation'
import { mapTextFont } from './textFont'

export const SOURCE_AIRCRAFT = 'traffic-aircraft'
export const SOURCE_VESSELS = 'traffic-vessels'
export const SOURCE_TRAIL = 'traffic-trail'
export const LAYER_SELECTED_TRAIL = 'traffic-selected-trail'
export const LAYER_AIRCRAFT = 'traffic-aircraft-symbols'
export const LAYER_VESSELS = 'traffic-vessel-symbols'
export const LAYER_AIRCRAFT_ALTITUDE = 'traffic-aircraft-altitude'
export const LAYER_AIRCRAFT_BADGE = 'traffic-aircraft-state-badges'
export const LAYER_VESSEL_BADGE = 'traffic-vessel-motion-badges'
export const LAYER_AIRCRAFT_HALO = 'traffic-aircraft-halo'
export const LAYER_VESSEL_HALO = 'traffic-vessel-halo'
export const LAYER_AIRCRAFT_CLUSTERS = 'traffic-aircraft-clusters'
export const LAYER_VESSEL_CLUSTERS = 'traffic-vessel-clusters'
export const LAYER_AIRCRAFT_CLUSTER_COUNT =
  'traffic-aircraft-cluster-count'
export const LAYER_VESSEL_CLUSTER_COUNT =
  'traffic-vessel-cluster-count'

export const AIRCRAFT_TRAFFIC_LAYER_IDS = [
  LAYER_AIRCRAFT_ALTITUDE,
  LAYER_AIRCRAFT,
  LAYER_AIRCRAFT_BADGE,
  LAYER_AIRCRAFT_HALO,
  LAYER_AIRCRAFT_CLUSTERS,
  LAYER_AIRCRAFT_CLUSTER_COUNT,
] as const

export const VESSEL_TRAFFIC_LAYER_IDS = [
  LAYER_VESSELS,
  LAYER_VESSEL_BADGE,
  LAYER_VESSEL_HALO,
  LAYER_VESSEL_CLUSTERS,
  LAYER_VESSEL_CLUSTER_COUNT,
] as const

type TrafficGeoJson =
  | FeatureCollection<Point>
  | FeatureCollection<LineString>

export type TrafficStyleImages = Record<TrafficStyleImageId, ImageData>

export interface TrafficStyleSnapshot {
  theme: Theme
  aircraft: FeatureCollection<Point>
  vessels: FeatureCollection<Point>
  trail: FeatureCollection<LineString>
  aircraftVisible: boolean
  vesselsVisible: boolean
  clusteringEnabled: boolean
  clusterRadiusPx: number
  clusterMinimumPoints: number
  clusterMaximumZoom: number
}

const themePaint = (theme: Theme) =>
  theme === 'dark'
    ? {
        trail: '#7ce5ff',
        trailOpacity: 0.82,
        aircraftHalo: '#5ce2ff',
        vesselHalo: '#ffc06d',
        aircraftAltitudeLow: '#38bdf8',
        aircraftAltitudeMedium: '#2dd4bf',
        aircraftAltitudeHigh: '#8b5cf6',
        aircraftAltitudeCruise: '#e879f9',
        aircraftAltitudeUnknown: '#94a3b8',
        aircraftCluster: '#087c9d',
        aircraftClusterStroke: '#8cecff',
        vesselCluster: '#a85c18',
        vesselClusterStroke: '#ffd298',
        clusterText: '#f8fdff',
        clusterTextHalo: '#07131d',
        liveIconOpacity: 0.98,
        staleIconOpacity: 0.52,
      }
    : {
        trail: '#138daf',
        trailOpacity: 0.72,
        aircraftHalo: '#35c8ef',
        vesselHalo: '#f1a246',
        aircraftAltitudeLow: '#0369a1',
        aircraftAltitudeMedium: '#0f766e',
        aircraftAltitudeHigh: '#6d28d9',
        aircraftAltitudeCruise: '#a21caf',
        aircraftAltitudeUnknown: '#64748b',
        aircraftCluster: '#0f7894',
        aircraftClusterStroke: '#d4f7ff',
        vesselCluster: '#b76720',
        vesselClusterStroke: '#fff0d2',
        clusterText: '#ffffff',
        clusterTextHalo: '#16323c',
        liveIconOpacity: 0.98,
        staleIconOpacity: 0.54,
      }

export const setTrafficSourceData = (
  map: MapLibreMap,
  sourceId: string,
  data: TrafficGeoJson,
) => {
  const source = map.getSource(sourceId)
  if (source) (source as GeoJSONSource).setData(data)
}

export const setTrafficLayerVisibility = (
  map: MapLibreMap,
  layerId: string,
  visible: boolean,
) => {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
  }
}

const ensureImage = (
  map: MapLibreMap,
  id: TrafficStyleImageId,
  image: ImageData,
) => {
  if (map.hasImage(id)) {
    map.updateImage(id, image)
  } else {
    map.addImage(id, image, { pixelRatio: 2 })
  }
}

const ensureSource = (
  map: MapLibreMap,
  id: string,
  data: TrafficGeoJson,
) => {
  if (map.getSource(id)) {
    setTrafficSourceData(map, id, data)
  } else {
    map.addSource(id, {
      type: 'geojson',
      data,
    })
  }
}

const ensurePointSource = (
  map: MapLibreMap,
  id: string,
  data: FeatureCollection<Point>,
  snapshot: TrafficStyleSnapshot,
) => {
  if (map.getSource(id)) {
    setTrafficSourceData(map, id, data)
  } else {
    map.addSource(id, {
      type: 'geojson',
      data,
      cluster: snapshot.clusteringEnabled,
      clusterRadius: snapshot.clusterRadiusPx,
      clusterMaxZoom: snapshot.clusterMaximumZoom,
      clusterMinPoints: snapshot.clusterMinimumPoints,
    })
  }
}

const ensureLayer = (map: MapLibreMap, layer: LayerSpecification) => {
  if (!map.getLayer(layer.id)) map.addLayer(layer)
}

export const installTrafficStyle = (
  map: MapLibreMap,
  snapshot: TrafficStyleSnapshot,
  images: TrafficStyleImages,
) => {
  const paint = themePaint(snapshot.theme)
  const textFont = mapTextFont(map)

  for (const imageId of TRAFFIC_STYLE_IMAGE_IDS) {
    ensureImage(map, imageId, images[imageId])
  }

  ensureSource(map, SOURCE_TRAIL, snapshot.trail)
  ensurePointSource(map, SOURCE_AIRCRAFT, snapshot.aircraft, snapshot)
  ensurePointSource(map, SOURCE_VESSELS, snapshot.vessels, snapshot)

  ensureLayer(map, {
    id: LAYER_SELECTED_TRAIL,
    type: 'line',
    source: SOURCE_TRAIL,
    paint: {
      'line-color': paint.trail,
      'line-opacity': paint.trailOpacity,
      'line-width': 2.4,
      'line-dasharray': [1, 2],
    },
  })

  const altitudeColor: ExpressionSpecification = [
    'match',
    ['get', 'altitudeBand'],
    'low',
    paint.aircraftAltitudeLow,
    'medium',
    paint.aircraftAltitudeMedium,
    'high',
    paint.aircraftAltitudeHigh,
    'cruise',
    paint.aircraftAltitudeCruise,
    paint.aircraftAltitudeUnknown,
  ]
  const altitudeRadius: ExpressionSpecification = [
    'match',
    ['get', 'altitudeBand'],
    'low',
    10,
    'medium',
    11.5,
    'high',
    13,
    'cruise',
    14.5,
    10,
  ]
  const trafficOpacity: ExpressionSpecification = [
    'case',
    ['get', 'stale'],
    paint.staleIconOpacity,
    paint.liveIconOpacity,
  ]

  ensureLayer(map, {
    id: LAYER_AIRCRAFT_ALTITUDE,
    type: 'circle',
    source: SOURCE_AIRCRAFT,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': altitudeRadius,
      'circle-color': altitudeColor,
      'circle-opacity': [
        'case',
        ['get', 'stale'],
        0.12,
        0.22,
      ],
      'circle-stroke-color': altitudeColor,
      'circle-stroke-opacity': trafficOpacity,
      'circle-stroke-width': 2.4,
    },
  })

  for (const [id, source, color] of [
    [LAYER_AIRCRAFT_HALO, SOURCE_AIRCRAFT, paint.aircraftHalo],
    [LAYER_VESSEL_HALO, SOURCE_VESSELS, paint.vesselHalo],
  ] as const) {
    ensureLayer(map, {
      id,
      type: 'circle',
      source,
      filter: [
        'all',
        ['!', ['has', 'point_count']],
        ['==', ['get', 'selected'], true],
      ],
      paint: {
        'circle-radius': 16,
        'circle-color': color,
        'circle-opacity': 0.18,
        'circle-stroke-color': color,
        'circle-stroke-opacity': 0.75,
        'circle-stroke-width': 2,
      },
    })
  }

  ensureLayer(map, {
    id: LAYER_AIRCRAFT,
    type: 'symbol',
    source: SOURCE_AIRCRAFT,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['get', 'markerIcon'],
      'icon-size': ['get', 'markerScale'],
      'icon-rotate': ['get', 'heading'],
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: {
      'icon-opacity': trafficOpacity,
    },
  })
  ensureLayer(map, {
    id: LAYER_VESSELS,
    type: 'symbol',
    source: SOURCE_VESSELS,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['get', 'markerIcon'],
      'icon-size': ['get', 'markerScale'],
      'icon-rotate': ['get', 'heading'],
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: {
      'icon-opacity': trafficOpacity,
    },
  })

  for (const [id, source, property] of [
    [
      LAYER_AIRCRAFT_BADGE,
      SOURCE_AIRCRAFT,
      'stateBadgeIcon',
    ],
    [
      LAYER_VESSEL_BADGE,
      SOURCE_VESSELS,
      'motionBadgeIcon',
    ],
  ] as const) {
    ensureLayer(map, {
      id,
      type: 'symbol',
      source,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['get', property],
        'icon-size': 0.42,
        'icon-offset': [19, -19],
        'icon-rotation-alignment': 'viewport',
        'icon-pitch-alignment': 'viewport',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'icon-opacity': trafficOpacity,
      },
    })
  }

  for (const [id, source, color, stroke] of [
    [
      LAYER_AIRCRAFT_CLUSTERS,
      SOURCE_AIRCRAFT,
      paint.aircraftCluster,
      paint.aircraftClusterStroke,
    ],
    [
      LAYER_VESSEL_CLUSTERS,
      SOURCE_VESSELS,
      paint.vesselCluster,
      paint.vesselClusterStroke,
    ],
  ] as const) {
    ensureLayer(map, {
      id,
      type: 'circle',
      source,
      filter: ['has', 'point_count'],
      paint: {
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          16,
          10,
          20,
          50,
          24,
        ],
        'circle-color': color,
        'circle-opacity': 0.9,
        'circle-stroke-color': stroke,
        'circle-stroke-width': 2,
      },
    })
  }

  if (textFont) {
    for (const [id, source, prefix] of [
      [LAYER_AIRCRAFT_CLUSTER_COUNT, SOURCE_AIRCRAFT, 'AIR '],
      [LAYER_VESSEL_CLUSTER_COUNT, SOURCE_VESSELS, 'SEA '],
    ] as const) {
      ensureLayer(map, {
        id,
        type: 'symbol',
        source,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': [
            'concat',
            prefix,
            ['to-string', ['get', 'point_count_abbreviated']],
          ],
          'text-font': textFont,
          'text-size': 10,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': paint.clusterText,
          'text-halo-color': paint.clusterTextHalo,
          'text-halo-width': 1.2,
        },
      })
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'text-font', textFont)
      }
    }
  }

  if (map.getLayer(LAYER_SELECTED_TRAIL)) {
    map.setPaintProperty(
      LAYER_SELECTED_TRAIL,
      'line-color',
      paint.trail,
    )
    map.setPaintProperty(
      LAYER_SELECTED_TRAIL,
      'line-opacity',
      paint.trailOpacity,
    )
  }
  if (map.getLayer(LAYER_AIRCRAFT_HALO)) {
    map.setPaintProperty(
      LAYER_AIRCRAFT_HALO,
      'circle-color',
      paint.aircraftHalo,
    )
    map.setPaintProperty(
      LAYER_AIRCRAFT_HALO,
      'circle-stroke-color',
      paint.aircraftHalo,
    )
  }
  if (map.getLayer(LAYER_AIRCRAFT_ALTITUDE)) {
    map.setPaintProperty(
      LAYER_AIRCRAFT_ALTITUDE,
      'circle-color',
      altitudeColor,
    )
    map.setPaintProperty(
      LAYER_AIRCRAFT_ALTITUDE,
      'circle-stroke-color',
      altitudeColor,
    )
    map.setPaintProperty(
      LAYER_AIRCRAFT_ALTITUDE,
      'circle-stroke-opacity',
      trafficOpacity,
    )
  }
  if (map.getLayer(LAYER_VESSEL_HALO)) {
    map.setPaintProperty(
      LAYER_VESSEL_HALO,
      'circle-color',
      paint.vesselHalo,
    )
    map.setPaintProperty(
      LAYER_VESSEL_HALO,
      'circle-stroke-color',
      paint.vesselHalo,
    )
  }
  for (const [layerId, color, stroke] of [
    [
      LAYER_AIRCRAFT_CLUSTERS,
      paint.aircraftCluster,
      paint.aircraftClusterStroke,
    ],
    [
      LAYER_VESSEL_CLUSTERS,
      paint.vesselCluster,
      paint.vesselClusterStroke,
    ],
  ] as const) {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'circle-color', color)
      map.setPaintProperty(layerId, 'circle-stroke-color', stroke)
    }
  }
  for (const layerId of [
    LAYER_AIRCRAFT_CLUSTER_COUNT,
    LAYER_VESSEL_CLUSTER_COUNT,
  ]) {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'text-color', paint.clusterText)
      map.setPaintProperty(
        layerId,
        'text-halo-color',
        paint.clusterTextHalo,
      )
    }
  }
  for (const layerId of [LAYER_AIRCRAFT, LAYER_VESSELS]) {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'icon-opacity', trafficOpacity)
    }
  }
  for (const layerId of [LAYER_AIRCRAFT_BADGE, LAYER_VESSEL_BADGE]) {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'icon-opacity', trafficOpacity)
    }
  }

  for (const layerId of AIRCRAFT_TRAFFIC_LAYER_IDS) {
    setTrafficLayerVisibility(map, layerId, snapshot.aircraftVisible)
  }
  for (const layerId of VESSEL_TRAFFIC_LAYER_IDS) {
    setTrafficLayerVisibility(map, layerId, snapshot.vesselsVisible)
  }
}
