import { useCallback, useEffect, useRef } from 'react'
import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
} from 'geojson'
import {
  AttributionControl,
  Map as MapLibreMap,
  setWorkerUrl,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { Theme } from '../app/theme'
import type { AppCenter } from '../config/appConfig'
import { boundsAroundCenter } from '../domain/geo'
import type {
  DisplayAircraft,
  DisplayTrafficEntity,
  DisplayVessel,
  TrafficEntity,
  TrailPoint,
} from '../domain/traffic'
import {
  assessTrafficViewport,
  type ViewportAssessment,
} from '../domain/viewport'
import {
  hasActiveMotion,
  reconcileMotionStates,
  sampleMotion,
  type MotionStates,
} from '../traffic/interpolation'
import {
  createTrafficIcons,
} from './icons'
import {
  createMapSafely,
  type TrafficMapError,
} from './mapInitialization'
import {
  exactEligibleFeatureId,
  expandedHitBox,
  TouchInteractionTracker,
  uniqueEligibleFeatureId,
} from './touchPicking'
import {
  installTrafficStyle,
  LAYER_AIRCRAFT,
  LAYER_AIRCRAFT_HALO,
  LAYER_VESSEL_HALO,
  LAYER_VESSELS,
  setTrafficLayerVisibility,
  setTrafficSourceData,
  SOURCE_AIRCRAFT,
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
  viewCenter: AppCenter
  viewLabel: string
  viewRadiusKm: number
  maximumViewportRadiusKm: number
  touchHitTolerancePx: number
  coordinatePrecision: number
  mapStyleUrl: string
  theme: Theme
  aircraft: readonly DisplayAircraft[]
  vessels: readonly DisplayVessel[]
  trail: readonly TrailPoint[]
  selectedId: string | null
  aircraftVisible: boolean
  vesselsVisible: boolean
  interpolationDurationMs: number
  viewRequestId: number
  viewportSettleMs: number
  onSelect: (id: string | null) => void
  onViewportChange: (
    assessment: ViewportAssessment,
    viewRequestId: number,
  ) => void
  onManualViewChange: () => void
  onMapError: (error: TrafficMapError | null) => void
}

interface RenderState {
  aircraft: readonly DisplayAircraft[]
  vessels: readonly DisplayVessel[]
  selectedId: string | null
}

interface ViewState {
  aircraftVisible: boolean
  vesselsVisible: boolean
  trail: readonly TrailPoint[]
}

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

const canvasPerimeter = (width: number, height: number, segments = 8) => {
  const points: [number, number][] = []
  for (let index = 0; index < segments; index += 1) {
    points.push([width * (index / segments), 0])
  }
  for (let index = 0; index < segments; index += 1) {
    points.push([width, height * (index / segments)])
  }
  for (let index = 0; index < segments; index += 1) {
    points.push([width * (1 - index / segments), height])
  }
  for (let index = 0; index < segments; index += 1) {
    points.push([0, height * (1 - index / segments)])
  }
  return points
}

const viewportSignature = (assessment: ViewportAssessment) => {
  if (assessment.kind === 'ineligible') {
    return `${assessment.kind}:${assessment.reason}:${assessment.message}`
  }

  const { center, enclosingRadiusKm, polygon } = assessment.viewport
  return [
    assessment.kind,
    center.latitude,
    center.longitude,
    enclosingRadiusKm,
    ...polygon.flatMap((coordinate) => [
      coordinate.latitude.toFixed(5),
      coordinate.longitude.toFixed(5),
    ]),
  ].join(':')
}

export function TrafficMap({
  viewCenter,
  viewLabel,
  viewRadiusKm,
  maximumViewportRadiusKm,
  touchHitTolerancePx,
  coordinatePrecision,
  mapStyleUrl,
  theme,
  aircraft,
  vessels,
  trail,
  selectedId,
  aircraftVisible,
  vesselsVisible,
  interpolationDurationMs,
  viewRequestId,
  viewportSettleMs,
  onSelect,
  onViewportChange,
  onManualViewChange,
  onMapError,
}: TrafficMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const loadedRef = useRef(false)
  const frameRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  const aircraftMotionRef = useRef<MotionStates>(new Map())
  const vesselMotionRef = useRef<MotionStates>(new Map())
  const viewportSettleTimerRef = useRef<number | null>(null)
  const lastViewportSignatureRef = useRef<string | null>(null)
  const lastViewRequestRef = useRef(viewRequestId)
  const viewRequestRef = useRef(viewRequestId)
  const viewCenterRef = useRef(viewCenter)
  const viewportLimitsRef = useRef({
    coordinatePrecision,
    maximumRadiusKm: maximumViewportRadiusKm,
  })
  const viewportSettleMsRef = useRef(viewportSettleMs)
  const styleGenerationRef = useRef(0)
  const initialStyleUrlRef = useRef(mapStyleUrl)
  const desiredStyleUrlRef = useRef(mapStyleUrl)
  const requestedStyleUrlRef = useRef(mapStyleUrl)
  const appliedStyleUrlRef = useRef(mapStyleUrl)
  const themeRef = useRef(theme)
  const appliedThemeRef = useRef(theme)
  const initialFitCompleteRef = useRef(false)
  const trafficImagesRef = useRef<
    Partial<Record<Theme, TrafficStyleImages>>
  >({})
  const renderStateRef = useRef<RenderState>({
    aircraft,
    vessels,
    selectedId,
  })
  const viewStateRef = useRef<ViewState>({
    aircraftVisible,
    vesselsVisible,
    trail,
  })
  const selectRef = useRef(onSelect)
  const viewportChangeRef = useRef(onViewportChange)
  const manualViewChangeRef = useRef(onManualViewChange)
  const errorRef = useRef(onMapError)

  useEffect(() => {
    desiredStyleUrlRef.current = mapStyleUrl
    themeRef.current = theme
    viewRequestRef.current = viewRequestId
    viewCenterRef.current = viewCenter
    viewportLimitsRef.current = {
      coordinatePrecision,
      maximumRadiusKm: maximumViewportRadiusKm,
    }
    viewportSettleMsRef.current = viewportSettleMs
  }, [
    coordinatePrecision,
    viewCenter,
    viewRequestId,
    mapStyleUrl,
    maximumViewportRadiusKm,
    theme,
    viewportSettleMs,
  ])

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

  const clearPendingViewport = useCallback(() => {
    if (viewportSettleTimerRef.current === null) return
    window.clearTimeout(viewportSettleTimerRef.current)
    viewportSettleTimerRef.current = null
  }, [])

  const reportViewport = useCallback((map: MapLibreMap) => {
    if (!loadedRef.current) return

    let assessment: ViewportAssessment
    try {
      const canvas = map.getCanvas()
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const center = map.getCenter()
      const perimeter = canvasPerimeter(width, height).map(([x, y]) => {
        const coordinate = map.unproject([x, y])
        return {
          latitude: coordinate.lat,
          longitude: coordinate.lng,
        }
      })
      assessment = assessTrafficViewport(
        {
          center: {
            latitude: center.lat,
            longitude: center.lng,
          },
          perimeter,
          pitchDegrees: map.getPitch(),
        },
        viewportLimitsRef.current,
      )
    } catch {
      assessment = assessTrafficViewport(
        {
          center: {
            latitude: Number.NaN,
            longitude: Number.NaN,
          },
          perimeter: [],
          pitchDegrees: map.getPitch(),
        },
        viewportLimitsRef.current,
      )
    }

    const signature = viewportSignature(assessment)
    if (signature === lastViewportSignatureRef.current) return
    lastViewportSignatureRef.current = signature
    viewportChangeRef.current(assessment, viewRequestRef.current)
  }, [])

  const scheduleViewportReport = useCallback(
    (map: MapLibreMap, delayMs = viewportSettleMsRef.current) => {
      clearPendingViewport()
      viewportSettleTimerRef.current = window.setTimeout(() => {
        viewportSettleTimerRef.current = null
        reportViewport(map)
      }, delayMs)
    },
    [clearPendingViewport, reportViewport],
  )

  const fitCurrentView = useCallback(
    (map: MapLibreMap, duration: number) => {
      clearPendingViewport()
      lastViewportSignatureRef.current = null
      const currentView = viewCenterRef.current
      map.fitBounds(
        boundsAroundCenter(currentView, viewRadiusKm),
        {
          padding: fitPadding(),
          duration,
        },
      )
      scheduleViewportReport(
        map,
        duration + viewportSettleMsRef.current,
      )
    },
    [clearPendingViewport, scheduleViewportReport, viewRadiusKm],
  )

  const getTrafficImages = useCallback((activeTheme: Theme) => {
    const cachedImages = trafficImagesRef.current[activeTheme]
    if (cachedImages) return cachedImages

    const images = createTrafficIcons(activeTheme)
    trafficImagesRef.current[activeTheme] = images
    return images
  }, [])

  const installCurrentStyle = useCallback(
    (map: MapLibreMap) => {
      const now = performance.now()
      const renderState = renderStateRef.current
      const viewState = viewStateRef.current
      const activeTheme = themeRef.current
      installTrafficStyle(
        map,
        {
          theme: activeTheme,
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
          aircraftVisible: viewState.aircraftVisible,
          vesselsVisible: viewState.vesselsVisible,
        },
        getTrafficImages(activeTheme),
      )
      loadedRef.current = true
      errorRef.current(null)
      scheduleRender()

      if (!initialFitCompleteRef.current) {
        initialFitCompleteRef.current = true
        lastViewRequestRef.current = viewRequestRef.current
        fitCurrentView(map, 0)
      } else if (lastViewRequestRef.current !== viewRequestRef.current) {
        lastViewRequestRef.current = viewRequestRef.current
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
    viewportChangeRef.current = onViewportChange
  }, [onViewportChange])

  useEffect(() => {
    manualViewChangeRef.current = onManualViewChange
  }, [onManualViewChange])

  useEffect(() => {
    errorRef.current = onMapError
  }, [onMapError])

  useEffect(() => {
    viewStateRef.current = {
      aircraftVisible,
      vesselsVisible,
      trail,
    }
  }, [aircraftVisible, trail, vesselsVisible])

  useEffect(() => {
    if (!containerRef.current) return
    const initialView = viewCenterRef.current

    const map = createMapSafely(
      () =>
        new MapLibreMap({
          container: containerRef.current!,
          style: initialStyleUrlRef.current,
          center: [initialView.longitude, initialView.latitude],
          zoom: 8,
          attributionControl: false,
          maxPitch: 60,
        }),
      (error) => errorRef.current(error),
    )
    if (!map) return

    mapRef.current = map
    const touchTracker = new TouchInteractionTracker()
    const canvas = map.getCanvas()
    const pointerOrigins = new Map<number, { x: number; y: number }>()
    let manualPointerMovement = false
    const handlePointerDown = (event: PointerEvent) => {
      touchTracker.pointerDown(event)
      pointerOrigins.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      })
    }
    const handlePointerMove = (event: PointerEvent) => {
      touchTracker.pointerMove(event)
      const origin = pointerOrigins.get(event.pointerId)
      if (
        !manualPointerMovement &&
        origin &&
        Math.hypot(
          event.clientX - origin.x,
          event.clientY - origin.y,
        ) >= 3
      ) {
        manualPointerMovement = true
        manualViewChangeRef.current()
      }
    }
    const handlePointerUp = (event: PointerEvent) => {
      touchTracker.pointerUp(event)
      pointerOrigins.delete(event.pointerId)
      if (pointerOrigins.size === 0) manualPointerMovement = false
    }
    const handlePointerCancel = (event: PointerEvent) => {
      touchTracker.pointerCancel(event)
      pointerOrigins.delete(event.pointerId)
      if (pointerOrigins.size === 0) manualPointerMovement = false
    }
    const handleWheel = () => manualViewChangeRef.current()
    const handleDoubleClick = () => manualViewChangeRef.current()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        [
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          '+',
          '-',
          '=',
        ].includes(event.key)
      ) {
        manualViewChangeRef.current()
      }
    }
    canvas.addEventListener('pointerdown', handlePointerDown, { passive: true })
    canvas.addEventListener('pointermove', handlePointerMove, { passive: true })
    canvas.addEventListener('pointerup', handlePointerUp, { passive: true })
    canvas.addEventListener('pointercancel', handlePointerCancel, {
      passive: true,
    })
    canvas.addEventListener('wheel', handleWheel, { passive: true })
    canvas.addEventListener('dblclick', handleDoubleClick, { passive: true })
    canvas.addEventListener('keydown', handleKeyDown)

    const activeTrafficLayers = () => {
      const layers: string[] = []
      const viewState = viewStateRef.current
      if (viewState.aircraftVisible && map.getLayer(LAYER_AIRCRAFT)) {
        layers.push(LAYER_AIRCRAFT)
      }
      if (viewState.vesselsVisible && map.getLayer(LAYER_VESSELS)) {
        layers.push(LAYER_VESSELS)
      }
      return layers
    }

    const selectableTrafficIds = () => {
      const ids = new Set<string>()
      const renderState = renderStateRef.current
      const viewState = viewStateRef.current
      if (viewState.aircraftVisible) {
        for (const entity of renderState.aircraft) ids.add(entity.id)
      }
      if (viewState.vesselsVisible) {
        for (const entity of renderState.vessels) ids.add(entity.id)
      }
      return ids
    }

    map.on('moveend', () => {
      scheduleViewportReport(map)
    })

    map.on('resize', () => {
      scheduleViewportReport(map)
    })

    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution: [
          'Map: <a href="https://openfreemap.org/" target="_blank">OpenFreeMap</a>',
          'Aircraft: <a href="https://www.adsb.lol/" target="_blank" rel="noreferrer">ADSB.lol</a> (<a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL 1.0</a>)',
          'Marine: <a href="https://www.digitraffic.fi/en/marine-traffic/" target="_blank" rel="noreferrer">Fintraffic Digitraffic</a> (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>; filtered and normalized)',
        ],
      }),
      'bottom-right',
    )

    map.on('click', (event) => {
      const touchFallbackAllowed = touchTracker.consumeClick(
        event.originalEvent,
      )
      const layers = activeTrafficLayers()
      if (layers.length === 0) return
      const eligibleIds = selectableTrafficIds()
      const exactFeatures = map.queryRenderedFeatures(event.point, { layers })
      const exactId = exactEligibleFeatureId(exactFeatures, eligibleIds)
      if (exactId) {
        selectRef.current(exactId)
        return
      }
      if (!touchFallbackAllowed) {
        selectRef.current(null)
        return
      }

      const nearbyFeatures = map.queryRenderedFeatures(
        expandedHitBox(event.point, touchHitTolerancePx),
        { layers },
      )
      selectRef.current(uniqueEligibleFeatureId(nearbyFeatures, eligibleIds))
    })

    map.on('mousemove', (event) => {
      const layers = activeTrafficLayers()
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
      clearPendingViewport()
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointercancel', handlePointerCancel)
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('dblclick', handleDoubleClick)
      canvas.removeEventListener('keydown', handleKeyDown)
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      map.remove()
      mapRef.current = null
    }
  }, [
    clearPendingViewport,
    fitCurrentView,
    installCurrentStyle,
    scheduleViewportReport,
    switchMapStyle,
    touchHitTolerancePx,
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
    if (lastViewRequestRef.current === viewRequestId) return
    const map = mapRef.current
    if (!map || !loadedRef.current) return

    lastViewRequestRef.current = viewRequestId
    fitCurrentView(map, 650)
  }, [fitCurrentView, viewRequestId])

  return (
    <div
      ref={containerRef}
      className="traffic-map"
      aria-label={`Live traffic map: ${viewLabel}`}
    />
  )
}
