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
  Map as MapLibreMap,
  setWorkerUrl,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { Theme } from '../app/theme'
import type { AppCenter } from '../config/appConfig'
import type { Coordinates } from '../domain/center'
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
import {
  createMapSafely,
  type TrafficMapError,
} from './mapInitialization'
import {
  installTrafficStyle,
  LAYER_AIRCRAFT,
  LAYER_AIRCRAFT_HALO,
  LAYER_VESSEL_HALO,
  LAYER_VESSELS,
  setTrafficLayerVisibility,
  setTrafficSourceData,
  SOURCE_AIRCRAFT,
  SOURCE_RADIUS,
  SOURCE_TRAIL,
  SOURCE_VESSELS,
  type TrafficStyleImages,
} from './trafficStyle'

setWorkerUrl(maplibreWorkerUrl)

const emptyTrail = (): FeatureCollection<LineString> => ({
  type: 'FeatureCollection',
  features: [],
})

interface TrafficMapProps {
  center: AppCenter
  radiusKm: number
  mapStyleUrl: string
  theme: Theme
  aircraft: readonly DisplayAircraft[]
  vessels: readonly DisplayVessel[]
  trail: readonly TrailPoint[]
  selectedId: string | null
  aircraftVisible: boolean
  vesselsVisible: boolean
  interpolationDurationMs: number
  fitRequestId: number
  panSettleMs: number
  onSelect: (id: string | null) => void
  onQueryCenterChange: (center: Coordinates) => void
  onMapError: (error: TrafficMapError | null) => void
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

const fitPadding = () =>
  window.innerWidth < 720
    ? { top: 180, right: 28, bottom: 90, left: 28 }
    : { top: 70, right: 360, bottom: 70, left: 70 }

export function TrafficMap({
  center,
  radiusKm,
  mapStyleUrl,
  theme,
  aircraft,
  vessels,
  trail,
  selectedId,
  aircraftVisible,
  vesselsVisible,
  interpolationDurationMs,
  fitRequestId,
  panSettleMs,
  onSelect,
  onQueryCenterChange,
  onMapError,
}: TrafficMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const loadedRef = useRef(false)
  const frameRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  const aircraftMotionRef = useRef<MotionStates>(new Map())
  const vesselMotionRef = useRef<MotionStates>(new Map())
  const userPanRef = useRef(false)
  const panSettleTimerRef = useRef<number | null>(null)
  const lastFitRequestRef = useRef(fitRequestId)
  const fitRequestRef = useRef(fitRequestId)
  const styleGenerationRef = useRef(0)
  const initialStyleUrlRef = useRef(mapStyleUrl)
  const desiredStyleUrlRef = useRef(mapStyleUrl)
  const requestedStyleUrlRef = useRef(mapStyleUrl)
  const appliedStyleUrlRef = useRef(mapStyleUrl)
  const themeRef = useRef(theme)
  const appliedThemeRef = useRef(theme)
  const initialFitCompleteRef = useRef(false)
  const trafficImagesRef = useRef<TrafficStyleImages | null>(null)
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
  const queryCenterChangeRef = useRef(onQueryCenterChange)
  const errorRef = useRef(onMapError)

  useEffect(() => {
    desiredStyleUrlRef.current = mapStyleUrl
    themeRef.current = theme
    fitRequestRef.current = fitRequestId
  }, [fitRequestId, mapStyleUrl, theme])

  const renderSources = useCallback((now: number) => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return

    const state = renderStateRef.current
    setTrafficSourceData(
      map,
      SOURCE_AIRCRAFT,
      trafficFeatures(
        state.aircraft,
        aircraftMotionRef.current,
        now,
        state.selectedId,
      ),
    )
    setTrafficSourceData(
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

  const clearPendingPan = useCallback(() => {
    userPanRef.current = false
    if (panSettleTimerRef.current === null) return
    window.clearTimeout(panSettleTimerRef.current)
    panSettleTimerRef.current = null
  }, [])

  const fitCurrentView = useCallback(
    (map: MapLibreMap, duration: number) => {
      clearPendingPan()
      const currentView = viewStateRef.current
      map.fitBounds(
        radiusBounds(currentView.center, currentView.radiusKm),
        {
          padding: fitPadding(),
          duration,
        },
      )
    },
    [clearPendingPan],
  )

  const getTrafficImages = useCallback(() => {
    if (!trafficImagesRef.current) {
      trafficImagesRef.current = {
        aircraft: createAircraftIcon(),
        helicopter: createHelicopterIcon(),
        vessel: createVesselIcon(),
      }
    }
    return trafficImagesRef.current
  }, [])

  const installCurrentStyle = useCallback(
    (map: MapLibreMap) => {
      const now = performance.now()
      const renderState = renderStateRef.current
      const viewState = viewStateRef.current
      installTrafficStyle(
        map,
        {
          theme: themeRef.current,
          aircraft: trafficFeatures(
            renderState.aircraft,
            aircraftMotionRef.current,
            now,
            renderState.selectedId,
          ),
          vessels: trafficFeatures(
            renderState.vessels,
            vesselMotionRef.current,
            now,
            renderState.selectedId,
          ),
          trail: trailData(viewState.trail),
          radius: radiusData(viewState.center, viewState.radiusKm),
          aircraftVisible: viewState.aircraftVisible,
          vesselsVisible: viewState.vesselsVisible,
        },
        getTrafficImages(),
      )
      loadedRef.current = true
      errorRef.current(null)
      scheduleRender()

      if (!initialFitCompleteRef.current) {
        initialFitCompleteRef.current = true
        lastFitRequestRef.current = fitRequestRef.current
        fitCurrentView(map, 0)
      } else if (lastFitRequestRef.current !== fitRequestRef.current) {
        lastFitRequestRef.current = fitRequestRef.current
        fitCurrentView(map, 650)
      }
    },
    [fitCurrentView, getTrafficImages, scheduleRender],
  )

  const switchMapStyle = useCallback(
    (map: MapLibreMap, nextStyleUrl: string) => {
      const generation = ++styleGenerationRef.current
      loadedRef.current = false
      requestedStyleUrlRef.current = nextStyleUrl

      const handleStyleLoad = () => {
        if (generation !== styleGenerationRef.current) return
        appliedStyleUrlRef.current = nextStyleUrl
        appliedThemeRef.current = themeRef.current
        installCurrentStyle(map)
      }

      map.once('style.load', handleStyleLoad)
      try {
        map.setStyle(nextStyleUrl)
      } catch (error) {
        map.off('style.load', handleStyleLoad)
        requestedStyleUrlRef.current = appliedStyleUrlRef.current
        loadedRef.current = map.isStyleLoaded() === true
        errorRef.current({
          kind: 'runtime',
          message:
            error instanceof Error ? error.message : 'Map style change failed',
        })
      }
    },
    [installCurrentStyle],
  )

  useEffect(() => {
    selectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    queryCenterChangeRef.current = onQueryCenterChange
  }, [onQueryCenterChange])

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
    const initialView = viewStateRef.current

    const map = createMapSafely(
      () =>
        new MapLibreMap({
          container: containerRef.current!,
          style: initialStyleUrlRef.current,
          center: [initialView.center.longitude, initialView.center.latitude],
          zoom: 8,
          attributionControl: false,
          maxPitch: 60,
        }),
      (error) => errorRef.current(error),
    )
    if (!map) return

    mapRef.current = map

    map.on('dragstart', () => {
      clearPendingPan()
      userPanRef.current = true
    })

    map.on('moveend', () => {
      if (!userPanRef.current) return
      userPanRef.current = false
      if (panSettleTimerRef.current !== null) {
        window.clearTimeout(panSettleTimerRef.current)
      }
      panSettleTimerRef.current = window.setTimeout(() => {
        panSettleTimerRef.current = null
        const settledCenter = map.getCenter()
        queryCenterChangeRef.current({
          latitude: settledCenter.lat,
          longitude: settledCenter.lng,
        })
      }, panSettleMs)
    })

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

    map.on('click', (event) => {
      const layers = [LAYER_AIRCRAFT, LAYER_VESSELS].filter((layerId) =>
        Boolean(map.getLayer(layerId)),
      )
      if (layers.length === 0) return
      const features = map.queryRenderedFeatures(event.point, { layers })
      const id = features[0]?.properties?.id
      selectRef.current(typeof id === 'string' ? id : null)
    })

    map.on('mousemove', (event) => {
      const layers = [LAYER_AIRCRAFT, LAYER_VESSELS].filter((layerId) =>
        Boolean(map.getLayer(layerId)),
      )
      const features =
        layers.length > 0
          ? map.queryRenderedFeatures(event.point, { layers })
          : []
      map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : ''
    })

    map.on('load', () => {
      if (loadedRef.current) return
      if (
        desiredStyleUrlRef.current === requestedStyleUrlRef.current &&
        requestedStyleUrlRef.current !== initialStyleUrlRef.current
      ) {
        return
      }
      if (desiredStyleUrlRef.current !== initialStyleUrlRef.current) {
        switchMapStyle(map, desiredStyleUrlRef.current)
        return
      }

      appliedStyleUrlRef.current = initialStyleUrlRef.current
      appliedThemeRef.current = themeRef.current
      installCurrentStyle(map)
    })

    map.on('error', (event) => {
      if (event.error) {
        errorRef.current({
          kind: 'runtime',
          message: event.error.message,
        })
      }
    })

    return () => {
      styleGenerationRef.current += 1
      loadedRef.current = false
      clearPendingPan()
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      map.remove()
      mapRef.current = null
    }
  }, [
    clearPendingPan,
    fitCurrentView,
    installCurrentStyle,
    panSettleMs,
    switchMapStyle,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (mapStyleUrl !== requestedStyleUrlRef.current) {
      switchMapStyle(map, mapStyleUrl)
      return
    }

    if (!loadedRef.current) return

    if (theme !== appliedThemeRef.current) {
      appliedThemeRef.current = theme
      installCurrentStyle(map)
    }
  }, [installCurrentStyle, mapStyleUrl, switchMapStyle, theme])

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
    setTrafficLayerVisibility(map, LAYER_AIRCRAFT, aircraftVisible)
    setTrafficLayerVisibility(map, LAYER_AIRCRAFT_HALO, aircraftVisible)
  }, [aircraftVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    setTrafficLayerVisibility(map, LAYER_VESSELS, vesselsVisible)
    setTrafficLayerVisibility(map, LAYER_VESSEL_HALO, vesselsVisible)
  }, [vesselsVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    setTrafficSourceData(map, SOURCE_TRAIL, trailData(trail))
  }, [trail])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    setTrafficSourceData(map, SOURCE_RADIUS, radiusData(center, radiusKm))
  }, [center, radiusKm])

  useEffect(() => {
    if (lastFitRequestRef.current === fitRequestId) return
    const map = mapRef.current
    if (!map || !loadedRef.current) return

    lastFitRequestRef.current = fitRequestId
    fitCurrentView(map, 650)
  }, [fitCurrentView, fitRequestId])

  return (
    <div
      ref={containerRef}
      className="traffic-map"
      aria-label={`Live traffic map centered on ${center.label}`}
    />
  )
}
