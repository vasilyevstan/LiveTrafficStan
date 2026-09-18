import type {
  FeatureCollection,
  LineString,
  Point,
  Polygon,
} from 'geojson'
import {
  type GeoJSONSource,
  type LayerSpecification,
  type Map as MapLibreMap,
} from 'maplibre-gl'
import type { Theme } from '../app/theme'

export const SOURCE_AIRCRAFT = 'traffic-aircraft'
export const SOURCE_VESSELS = 'traffic-vessels'
export const SOURCE_TRAIL = 'traffic-trail'
export const SOURCE_RADIUS = 'traffic-radius'
export const LAYER_AIRCRAFT = 'traffic-aircraft-symbols'
export const LAYER_VESSELS = 'traffic-vessel-symbols'
export const LAYER_AIRCRAFT_HALO = 'traffic-aircraft-halo'
export const LAYER_VESSEL_HALO = 'traffic-vessel-halo'

type TrafficGeoJson =
  | FeatureCollection<Point>
  | FeatureCollection<LineString>
  | FeatureCollection<Polygon>

export interface TrafficStyleImages {
  aircraft: ImageData
  helicopter: ImageData
  vessel: ImageData
}

export interface TrafficStyleSnapshot {
  theme: Theme
  aircraft: FeatureCollection<Point>
  vessels: FeatureCollection<Point>
  trail: FeatureCollection<LineString>
  radius: FeatureCollection<Polygon>
  aircraftVisible: boolean
  vesselsVisible: boolean
}

const themePaint = (theme: Theme) =>
  theme === 'dark'
    ? {
        radiusFill: '#42d7ff',
        radiusFillOpacity: 0.055,
        radiusLine: '#67ddff',
        radiusLineOpacity: 0.72,
        trail: '#7ce5ff',
        trailOpacity: 0.82,
        aircraftHalo: '#5ce2ff',
        vesselHalo: '#ffc06d',
      }
    : {
        radiusFill: '#1ea7d4',
        radiusFillOpacity: 0.035,
        radiusLine: '#1685aa',
        radiusLineOpacity: 0.55,
        trail: '#138daf',
        trailOpacity: 0.72,
        aircraftHalo: '#35c8ef',
        vesselHalo: '#f1a246',
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
  id: keyof TrafficStyleImages,
  image: ImageData,
) => {
  if (!map.hasImage(id)) map.addImage(id, image, { pixelRatio: 2 })
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

const ensureLayer = (map: MapLibreMap, layer: LayerSpecification) => {
  if (!map.getLayer(layer.id)) map.addLayer(layer)
}

export const installTrafficStyle = (
  map: MapLibreMap,
  snapshot: TrafficStyleSnapshot,
  images: TrafficStyleImages,
) => {
  const paint = themePaint(snapshot.theme)

  ensureImage(map, 'aircraft', images.aircraft)
  ensureImage(map, 'helicopter', images.helicopter)
  ensureImage(map, 'vessel', images.vessel)

  ensureSource(map, SOURCE_RADIUS, snapshot.radius)
  ensureSource(map, SOURCE_TRAIL, snapshot.trail)
  ensureSource(map, SOURCE_AIRCRAFT, snapshot.aircraft)
  ensureSource(map, SOURCE_VESSELS, snapshot.vessels)

  ensureLayer(map, {
    id: 'traffic-radius-fill',
    type: 'fill',
    source: SOURCE_RADIUS,
    paint: {
      'fill-color': paint.radiusFill,
      'fill-opacity': paint.radiusFillOpacity,
    },
  })
  ensureLayer(map, {
    id: 'traffic-radius-line',
    type: 'line',
    source: SOURCE_RADIUS,
    paint: {
      'line-color': paint.radiusLine,
      'line-opacity': paint.radiusLineOpacity,
      'line-width': 1.25,
      'line-dasharray': [3, 3],
    },
  })
  ensureLayer(map, {
    id: 'traffic-selected-trail',
    type: 'line',
    source: SOURCE_TRAIL,
    paint: {
      'line-color': paint.trail,
      'line-opacity': paint.trailOpacity,
      'line-width': 2.4,
      'line-dasharray': [1, 2],
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
      filter: ['==', ['get', 'selected'], true],
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
      'icon-opacity': ['case', ['get', 'stale'], 0.42, 0.96],
    },
  })
  ensureLayer(map, {
    id: LAYER_VESSELS,
    type: 'symbol',
    source: SOURCE_VESSELS,
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
      'icon-opacity': ['case', ['get', 'stale'], 0.42, 0.96],
    },
  })

  if (map.getLayer('traffic-radius-fill')) {
    map.setPaintProperty(
      'traffic-radius-fill',
      'fill-color',
      paint.radiusFill,
    )
    map.setPaintProperty(
      'traffic-radius-fill',
      'fill-opacity',
      paint.radiusFillOpacity,
    )
  }
  if (map.getLayer('traffic-radius-line')) {
    map.setPaintProperty(
      'traffic-radius-line',
      'line-color',
      paint.radiusLine,
    )
    map.setPaintProperty(
      'traffic-radius-line',
      'line-opacity',
      paint.radiusLineOpacity,
    )
  }
  if (map.getLayer('traffic-selected-trail')) {
    map.setPaintProperty(
      'traffic-selected-trail',
      'line-color',
      paint.trail,
    )
    map.setPaintProperty(
      'traffic-selected-trail',
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

  setTrafficLayerVisibility(map, LAYER_AIRCRAFT, snapshot.aircraftVisible)
  setTrafficLayerVisibility(
    map,
    LAYER_AIRCRAFT_HALO,
    snapshot.aircraftVisible,
  )
  setTrafficLayerVisibility(map, LAYER_VESSELS, snapshot.vesselsVisible)
  setTrafficLayerVisibility(
    map,
    LAYER_VESSEL_HALO,
    snapshot.vesselsVisible,
  )
}
