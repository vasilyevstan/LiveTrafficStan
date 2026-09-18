import { useCallback, useEffect, useRef } from 'react'
import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
  Polygon,
} from 'geojson'
import {
  AttributionControl,
  type GeoJSONSource,
  Map as MapLibreMap,
  setWorkerUrl,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { AppCenter } from '../config/appConfig'
import { radiusBounds, radiusPolygonCoordinates } from '../domain/geo'
import type {
  DisplayAircraft,
  DisplayTrafficEntity,
  DisplayVessel,
  TrafficEntity,
  TrailPoint,
} from '../domain/traffic'
import {
  hasActiveMotion,
  reconcileMotionStates,
  sampleMotion,
  type MotionStates,
} from '../traffic/interpolation'
import {
  createAircraftIcon,
  createHelicopterIcon,
  createVesselIcon,
} from './icons'

setWorkerUrl(maplibreWorkerUrl)

const SOURCE_AIRCRAFT = 'traffic-aircraft'
const SOURCE_VESSELS = 'traffic-vessels'
const SOURCE_TRAIL = 'traffic-trail'
const SOURCE_RADIUS = 'traffic-radius'
const LAYER_AIRCRAFT = 'traffic-aircraft-symbols'
const LAYER_VESSELS = 'traffic-vessel-symbols'

const emptyPoints = (): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: [],
})

const emptyTrail = (): FeatureCollection<LineString> => ({
  type: 'FeatureCollection',
  features: [],
})

interface TrafficMapProps {
  center: AppCenter
  radiusKm: number
  mapStyleUrl: string
  aircraft: readonly DisplayAircraft[]
  vessels: readonly DisplayVessel[]
  trail: readonly TrailPoint[]
  selectedId: string | null
  aircraftVisible: boolean
  vesselsVisible: boolean
  interpolationDurationMs: number
  onSelect: (id: string | null) => void
  onMapError: (message: string | null) => void
}

interface RenderState {
  aircraft: readonly DisplayAircraft[]
  vessels: readonly DisplayVessel[]
  selectedId: string | null
}

interface ViewState {
  center: AppCenter
  radiusKm: number
  aircraftVisible: boolean
  vesselsVisible: boolean
  trail: readonly TrailPoint[]
}

const radiusData = (
  center: AppCenter,
  radiusKm: number,
): FeatureCollection<Polygon> => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [radiusPolygonCoordinates(center, radiusKm)],
      },
    },
  ],
})

const trafficFeatures = (
  entities: readonly DisplayTrafficEntity[],
  motion: MotionStates,
  now: number,
  selectedId: string | null,
): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: entities.map((entity) => {
    const sampled = motion.get(entity.id)
      ? sampleMotion(motion.get(entity.id)!, now)
      : entity.position

    return {
      type: 'Feature',
      id: entity.id,
      properties: {
        id: entity.id,
        heading:
          entity.courseDegrees ?? entity.headingDegrees ?? 0,
        markerIcon: entity.markerIcon,
        markerScale: entity.markerScale,
        selected: entity.id === selectedId,
        stale: entity.freshness === 'stale',
      },
      geometry: {
        type: 'Point',
        coordinates: [sampled.longitude, sampled.latitude],
      },
    }
  }),
})

const trailData = (
  points: readonly TrailPoint[],
): FeatureCollection<LineString> => {
  if (points.length < 2) return emptyTrail()

  const feature: Feature<LineString> = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: points.map((point) => [point.longitude, point.latitude]),
    },
  }

  return {
    type: 'FeatureCollection',
    features: [feature],
  }
}

const setSourceData = (
  map: MapLibreMap,
  sourceId: string,
  data:
    | FeatureCollection<Point>
    | FeatureCollection<LineString>
    | FeatureCollection<Polygon>,
) => {
  const source = map.getSource(sourceId)
  if (source) (source as GeoJSONSource).setData(data)
}

const setLayerVisibility = (
  map: MapLibreMap,
  layerId: string,
  visible: boolean,
) => {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
  }
}

export function TrafficMap({
  center,
  radiusKm,
  mapStyleUrl,
  aircraft,
  vessels,
  trail,
  selectedId,
  aircraftVisible,
  vesselsVisible,
  interpolationDurationMs,
  onSelect,
  onMapError,
}: TrafficMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const loadedRef = useRef(false)
  const frameRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  const aircraftMotionRef = useRef<MotionStates>(new Map())
  const vesselMotionRef = useRef<MotionStates>(new Map())
  const renderStateRef = useRef<RenderState>({
    aircraft,
    vessels,
    selectedId,
  })
  const viewStateRef = useRef<ViewState>({
    center,
    radiusKm,
    aircraftVisible,
    vesselsVisible,
    trail,
  })
  const selectRef = useRef(onSelect)
  const errorRef = useRef(onMapError)

  const renderSources = useCallback((now: number) => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return

    const state = renderStateRef.current
    setSourceData(
      map,
      SOURCE_AIRCRAFT,
      trafficFeatures(
        state.aircraft,
        aircraftMotionRef.current,
        now,
        state.selectedId,
      ),
    )
    setSourceData(
      map,
      SOURCE_VESSELS,
      trafficFeatures(
        state.vessels,
        vesselMotionRef.current,
        now,
        state.selectedId,
      ),
    )
  }, [])

  const scheduleRender = useCallback(() => {
    if (frameRef.current !== null) return

    const draw = (now: number) => {
      if (now - lastFrameRef.current < 50) {
        frameRef.current = window.requestAnimationFrame(draw)
        return
      }

      lastFrameRef.current = now
      renderSources(now)
      if (
        hasActiveMotion(aircraftMotionRef.current, now) ||
        hasActiveMotion(vesselMotionRef.current, now)
      ) {
        frameRef.current = window.requestAnimationFrame(draw)
      } else {
        frameRef.current = null
      }
    }

    frameRef.current = window.requestAnimationFrame(draw)
  }, [renderSources])

  useEffect(() => {
    selectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    errorRef.current = onMapError
  }, [onMapError])

  useEffect(() => {
    viewStateRef.current = {
      center,
      radiusKm,
      aircraftVisible,
      vesselsVisible,
      trail,
    }
  }, [aircraftVisible, center, radiusKm, trail, vesselsVisible])

  useEffect(() => {
    if (!containerRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: mapStyleUrl,
      center: [center.longitude, center.latitude],
      zoom: 8,
      attributionControl: false,
      maxPitch: 60,
    })
    mapRef.current = map

    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution: [
          'Map: <a href="https://openfreemap.org/" target="_blank">OpenFreeMap</a>',
          'Aircraft: <a href="https://www.adsb.lol/" target="_blank">ADSB.lol</a> (ODbL)',
          'Marine: <a href="https://www.digitraffic.fi/en/marine-traffic/" target="_blank">Fintraffic Digitraffic</a> (CC BY 4.0)',
        ],
      }),
      'bottom-right',
    )

    map.on('load', () => {
      loadedRef.current = true
      errorRef.current(null)
      const currentView = viewStateRef.current

      map.addImage('aircraft', createAircraftIcon(), { pixelRatio: 2 })
      map.addImage('helicopter', createHelicopterIcon(), { pixelRatio: 2 })
      map.addImage('vessel', createVesselIcon(), { pixelRatio: 2 })

      map.addSource(SOURCE_RADIUS, {
        type: 'geojson',
        data: radiusData(currentView.center, currentView.radiusKm),
      })
      map.addSource(SOURCE_TRAIL, {
        type: 'geojson',
        data: emptyTrail(),
      })
      map.addSource(SOURCE_AIRCRAFT, {
        type: 'geojson',
        data: emptyPoints(),
      })
      map.addSource(SOURCE_VESSELS, {
        type: 'geojson',
        data: emptyPoints(),
      })

      map.addLayer({
        id: 'traffic-radius-fill',
        type: 'fill',
        source: SOURCE_RADIUS,
        paint: {
          'fill-color': '#1ea7d4',
          'fill-opacity': 0.035,
        },
      })
      map.addLayer({
        id: 'traffic-radius-line',
        type: 'line',
        source: SOURCE_RADIUS,
        paint: {
          'line-color': '#1685aa',
          'line-opacity': 0.55,
          'line-width': 1.25,
          'line-dasharray': [3, 3],
        },
      })
      map.addLayer({
        id: 'traffic-selected-trail',
        type: 'line',
        source: SOURCE_TRAIL,
        paint: {
          'line-color': '#138daf',
          'line-opacity': 0.72,
          'line-width': 2.4,
          'line-dasharray': [1, 2],
        },
      })

      for (const [id, source, color] of [
        ['traffic-aircraft-halo', SOURCE_AIRCRAFT, '#35c8ef'],
        ['traffic-vessel-halo', SOURCE_VESSELS, '#f1a246'],
      ] as const) {
        map.addLayer({
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

      map.addLayer({
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
      map.addLayer({
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

      map.on('click', (event) => {
        const features = map.queryRenderedFeatures(event.point, {
          layers: [LAYER_AIRCRAFT, LAYER_VESSELS],
        })
        const id = features[0]?.properties?.id
        selectRef.current(typeof id === 'string' ? id : null)
      })
      map.on('mousemove', (event) => {
        const features = map.queryRenderedFeatures(event.point, {
          layers: [LAYER_AIRCRAFT, LAYER_VESSELS],
        })
        map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : ''
      })

      setLayerVisibility(map, LAYER_AIRCRAFT, currentView.aircraftVisible)
      setLayerVisibility(map, LAYER_VESSELS, currentView.vesselsVisible)
      setSourceData(map, SOURCE_TRAIL, trailData(currentView.trail))
      setSourceData(
        map,
        SOURCE_RADIUS,
        radiusData(currentView.center, currentView.radiusKm),
      )
      scheduleRender()
      map.fitBounds(radiusBounds(currentView.center, currentView.radiusKm), {
        padding:
          window.innerWidth < 720
            ? { top: 180, right: 28, bottom: 90, left: 28 }
            : { top: 70, right: 360, bottom: 70, left: 70 },
        duration: 0,
      })
    })

    map.on('error', (event) => {
      if (event.error) errorRef.current(event.error.message)
    })

    return () => {
      loadedRef.current = false
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      map.remove()
      mapRef.current = null
    }
  }, [center.latitude, center.longitude, mapStyleUrl, scheduleRender])

  useEffect(() => {
    renderStateRef.current = { aircraft, vessels, selectedId }
    const now = performance.now()
    aircraftMotionRef.current = reconcileMotionStates(
      aircraftMotionRef.current,
      aircraft as readonly TrafficEntity[],
      now,
      interpolationDurationMs,
    )
    vesselMotionRef.current = reconcileMotionStates(
      vesselMotionRef.current,
      vessels as readonly TrafficEntity[],
      now,
      interpolationDurationMs,
    )
    scheduleRender()
  }, [
    aircraft,
    vessels,
    selectedId,
    interpolationDurationMs,
    scheduleRender,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    setLayerVisibility(map, LAYER_AIRCRAFT, aircraftVisible)
    setLayerVisibility(map, 'traffic-aircraft-halo', aircraftVisible)
  }, [aircraftVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    setLayerVisibility(map, LAYER_VESSELS, vesselsVisible)
    setLayerVisibility(map, 'traffic-vessel-halo', vesselsVisible)
  }, [vesselsVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    setSourceData(map, SOURCE_TRAIL, trailData(trail))
  }, [trail])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    setSourceData(map, SOURCE_RADIUS, radiusData(center, radiusKm))
    map.fitBounds(radiusBounds(center, radiusKm), {
      padding:
        window.innerWidth < 720
          ? { top: 180, right: 28, bottom: 90, left: 28 }
          : { top: 70, right: 360, bottom: 70, left: 70 },
      duration: 650,
    })
  }, [center, radiusKm])

  return (
    <div
      ref={containerRef}
      className="traffic-map"
      aria-label={`Live traffic map centered on ${center.label}`}
    />
  )
}
