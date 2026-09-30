import { useCallback, useEffect, useRef } from 'react'
import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
} from 'geojson'
import {
  AttributionControl,
  type GeoJSONSource,
  Map as MapLibreMap,
  Popup,
  setWorkerUrl,
  type StyleSpecification,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { Theme } from '../app/theme'
import type { AppCenter } from '../config/appConfig'
import type { AircraftPhotoViewState } from '../domain/aircraftPhoto'
import type { Airport } from '../domain/airports'
import { boundsAroundCenter } from '../domain/geo'
import {
  roundMapCameraState,
  type MapCameraState,
} from '../domain/mapCamera'
import type { Port } from '../domain/ports'
import type {
  ModeledOrbitalPosition,
  OrbitalTrackSegment,
} from '../domain/orbital'
import {
  assessOrbitalViewport,
  orbitalViewportSignature,
  type OrbitalViewport,
} from '../domain/orbitalViewport'
import type {
  DisplayAircraft,
  DisplayVessel,
  TrafficEntity,
  TrailPoint,
} from '../domain/traffic'
import type { UnitSystem } from '../domain/units'
import { vesselReferencePhotoForSelection } from '../domain/vesselPhoto'
import type { DisplayWeatherObservation } from '../domain/weatherObservations'
import {
  assessTrafficViewport,
  type ViewportAssessment,
} from '../domain/viewport'
import {
  hasActiveMotion,
  reconcileMotionStates,
  type MotionStates,
} from '../traffic/interpolation'
import { createTrafficIcons } from './icons'
import {
  createMapSafely,
  type TrafficMapError,
} from './mapInitialization'
import {
  BASEMAP_FALLBACK_MESSAGE,
  fallbackMapStyle,
  fallbackMapStyleKey,
  isFallbackMapStyleKey,
  reconnectedWhileStylePending,
  shouldRetryAfterFallbackLoad,
} from './fallbackMapStyle'
import { pickContextFeature } from './contextPicking'
import {
  clusterExpansionZoom,
  firstTrafficClusterTarget,
  pointSourceDiff,
  setTrafficClustering,
  shouldAnimateTrafficSources,
  trafficSourceDiff,
} from './clustering'
import {
  exactEligibleFeatureId,
  expandedHitBox,
  TouchInteractionTracker,
  uniqueEligibleFeatureId,
} from './touchPicking'
import {
  AIRPORT_LAYER_IDS,
  airportFeatures,
  installAirportsStyle,
  setAirportsVisibility,
} from './airportsStyle'
import {
  PORT_LAYER_IDS,
  installPortsStyle,
  portFeatures,
  setPortsVisibility,
} from './portsStyle'
import {
  WEATHER_LAYER_IDS,
  installWeatherStyle,
  setWeatherVisibility,
  weatherFeatures,
} from './weatherStyle'
import {
  installOrbitalStyle,
  LAYER_ORBITAL_HIGHLIGHT,
  LAYER_ORBITAL_POINTS,
  orbitalHighlightFeatures,
  orbitalPositionFeatures,
  orbitalTrackFeatures,
  setOrbitalPointFilter,
  setOrbitalSourceData,
  setOrbitalVisibility,
  SOURCE_ORBITAL_HIGHLIGHT,
  SOURCE_ORBITAL_POINTS,
  SOURCE_ORBITAL_TRACK,
} from './orbitalStyle'
import {
  createOrbitalIcons,
  type OrbitalStyleImages,
} from './orbitalIcons'
import {
  installTrafficStyle,
  AIRCRAFT_TRAFFIC_LAYER_IDS,
  LAYER_AIRCRAFT,
  LAYER_AIRCRAFT_CLUSTERS,
  LAYER_VESSEL_CLUSTERS,
  LAYER_VESSELS,
  setTrafficLayerVisibility,
  setTrafficSourceData,
  SOURCE_AIRCRAFT,
  SOURCE_TRAIL,
  SOURCE_VESSELS,
  type TrafficStyleImages,
  VESSEL_TRAFFIC_LAYER_IDS,
} from './trafficStyle'
import { trafficFeatures } from './trafficFeatures'
import {
  createTrafficTooltipElement,
} from './trafficTooltip'
import { createOrbitalTooltipElement } from './orbitalTooltip'

setWorkerUrl(maplibreWorkerUrl)

const emptyTrail = (): FeatureCollection<LineString> => ({
  type: 'FeatureCollection',
  features: [],
})

interface TrafficMapProps {
  viewCenter: AppCenter
  viewCamera?: MapCameraState
  viewLabel: string
  viewRadiusKm: number
  maximumViewportRadiusKm: number
  touchHitTolerancePx: number
  clusterRadiusPx: number
  clusterMinimumPoints: number
  clusterMaximumZoom: number
  coordinatePrecision: number
  mapStyleUrl: string
  online: boolean
  theme: Theme
  units: UnitSystem
  aircraft: readonly DisplayAircraft[]
  vessels: readonly DisplayVessel[]
  ports: readonly Port[]
  airports: readonly Airport[]
  weatherObservations: readonly DisplayWeatherObservation[]
  orbitalPositions: readonly ModeledOrbitalPosition[]
  orbitalShownIds: readonly string[]
  orbitalTrackSegments: readonly OrbitalTrackSegment[]
  orbitalImageUrls: ReadonlyMap<string, string>
  trailSegments: readonly (readonly TrailPoint[])[]
  selectedId: string | null
  selectedOrbitalId: string | null
  selectedPortId: string | null
  selectedAirportId: string | null
  selectedWeatherId: string | null
  aircraftVisible: boolean
  vesselsVisible: boolean
  portsVisible: boolean
  airportsVisible: boolean
  weatherVisible: boolean
  orbitalVisible: boolean
  clusteringEnabled: boolean
  interpolateTraffic: boolean
  interpolationDurationMs: number
  aircraftPhotoEnabled: boolean
  aircraftPhoto: AircraftPhotoViewState
  aircraftPhotoHoverDelayMs: number
  vesselPhotoEnabled: boolean
  viewRequestId: number
  viewportSettleMs: number
  onHoverAircraftChange: (id: string | null) => void
  onSelect: (id: string | null) => void
  onSelectOrbital: (id: string | null) => void
  onSelectPort: (id: string | null) => void
  onSelectAirport: (id: string | null) => void
  onSelectWeather: (id: string | null) => void
  onViewportChange: (
    assessment: ViewportAssessment,
    orbitalViewport: OrbitalViewport,
    rawZoom: number | undefined,
    viewRequestId: number,
  ) => void
  onCameraChange: (camera: MapCameraState) => void
  onManualViewChange: () => void
  onMapError: (error: TrafficMapError | null) => void
}

interface RenderState {
  aircraft: readonly DisplayAircraft[]
  vessels: readonly DisplayVessel[]
  selectedId: string | null
}

interface PortRenderState {
  ports: readonly Port[]
  selectedPortId: string | null
}

interface AirportRenderState {
  airports: readonly Airport[]
  selectedAirportId: string | null
}

interface WeatherRenderState {
  observations: readonly DisplayWeatherObservation[]
  selectedWeatherId: string | null
}

interface OrbitalRenderState {
  positions: readonly ModeledOrbitalPosition[]
  shownIds: readonly string[]
  trackSegments: readonly OrbitalTrackSegment[]
  selectedOrbitalId: string | null
}

interface ViewState {
  aircraftVisible: boolean
  vesselsVisible: boolean
  portsVisible: boolean
  airportsVisible: boolean
  weatherVisible: boolean
  orbitalVisible: boolean
  trailSegments: readonly (readonly TrailPoint[])[]
}

const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const supportsMouseHover = () => {
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches
  } catch {
    return true
  }
}

const trafficTooltipIdentity = (entity: TrafficEntity) =>
  entity.kind === 'aircraft'
    ? `${entity.id}|${entity.hex.trim().toUpperCase()}`
    : `${entity.id}|${entity.imo ?? ''}`

const orbitalTooltipIdentity = (position: ModeledOrbitalPosition) =>
  `${position.id}|${position.noradCatalogId}|${position.snapshotSha256}`

const trailData = (
  segments: readonly (readonly TrailPoint[])[],
): FeatureCollection<LineString> => {
  const features: Feature<LineString>[] = segments.flatMap((points) =>
    points.length < 2
      ? []
      : [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: points.map((point) => [
                point.longitude,
                point.latitude,
              ]),
            },
          },
        ],
  )
  return features.length === 0
    ? emptyTrail()
    : { type: 'FeatureCollection', features }
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
  let viewport
  if (assessment.kind === 'eligible') {
    viewport = assessment.viewport
  } else {
    if (!assessment.viewport) {
      return `${assessment.kind}:${assessment.reason}:${assessment.message}`
    }
    viewport = assessment.viewport
  }

  const { center, enclosingRadiusKm, polygon } = viewport
  return [
    assessment.kind,
    assessment.kind === 'ineligible' ? assessment.reason : '',
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
  viewCamera,
  viewLabel,
  viewRadiusKm,
  maximumViewportRadiusKm,
  touchHitTolerancePx,
  clusterRadiusPx,
  clusterMinimumPoints,
  clusterMaximumZoom,
  coordinatePrecision,
  mapStyleUrl,
  online,
  theme,
  units,
  aircraft,
  vessels,
  ports,
  airports,
  weatherObservations,
  orbitalPositions,
  orbitalShownIds,
  orbitalTrackSegments,
  orbitalImageUrls,
  trailSegments,
  selectedId,
  selectedOrbitalId,
  selectedPortId,
  selectedAirportId,
  selectedWeatherId,
  aircraftVisible,
  vesselsVisible,
  portsVisible,
  airportsVisible,
  weatherVisible,
  orbitalVisible,
  clusteringEnabled,
  interpolateTraffic,
  interpolationDurationMs,
  aircraftPhotoEnabled,
  aircraftPhoto,
  aircraftPhotoHoverDelayMs,
  vesselPhotoEnabled,
  viewRequestId,
  viewportSettleMs,
  onHoverAircraftChange,
  onSelect,
  onSelectOrbital,
  onSelectPort,
  onSelectAirport,
  onSelectWeather,
  onViewportChange,
  onCameraChange,
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
  const initialViewRequestIdRef = useRef(viewRequestId)
  const viewRequestRef = useRef(viewRequestId)
  const viewCenterRef = useRef(viewCenter)
  const initialCameraRef = useRef(viewCamera)
  const viewportLimitsRef = useRef({
    coordinatePrecision,
    maximumRadiusKm: maximumViewportRadiusKm,
  })
  const viewportSettleMsRef = useRef(viewportSettleMs)
  const clusteringEnabledRef = useRef(clusteringEnabled)
  const interpolateTrafficRef = useRef(interpolateTraffic)
  const clusterConfigRef = useRef({
    radiusPx: clusterRadiusPx,
    minimumPoints: clusterMinimumPoints,
    maximumZoom: clusterMaximumZoom,
  })
  const styleGenerationRef = useRef(0)
  const sourceDataGenerationRef = useRef(0)
  const clusterOptionsGenerationRef = useRef(0)
  const interactionGenerationRef = useRef(0)
  const clusterExpansionGenerationRef = useRef(0)
  const clusterUpdateChainRef = useRef<Promise<void>>(Promise.resolve())
  const lastTrafficFeaturesRef = useRef<{
    aircraft?: readonly Feature<Point>[]
    vessels?: readonly Feature<Point>[]
  }>({})
  const lastOrbitalFeaturesRef = useRef<readonly Feature<Point>[]>([])
  const orbitalUpdateGenerationRef = useRef(0)
  const trafficUpdateGenerationRef = useRef({
    aircraft: 0,
    vessels: 0,
  })
  const initialStyleUrlRef = useRef(mapStyleUrl)
  const desiredStyleUrlRef = useRef(mapStyleUrl)
  const requestedStyleUrlRef = useRef(mapStyleUrl)
  const appliedStyleUrlRef = useRef(mapStyleUrl)
  const fallbackActiveRef = useRef(false)
  const fallbackReasonRef = useRef<string | undefined>(undefined)
  const retryExternalAfterFallbackRef = useRef(false)
  const onlineRef = useRef(online)
  const previousOnlineRef = useRef(online)
  const themeRef = useRef(theme)
  const appliedThemeRef = useRef(theme)
  const initialFitCompleteRef = useRef(false)
  const trafficImagesRef = useRef<
    Partial<Record<Theme, TrafficStyleImages>>
  >({})
  const orbitalImagesRef = useRef<
    Partial<Record<Theme, OrbitalStyleImages>>
  >({})
  const renderStateRef = useRef<RenderState>({
    aircraft,
    vessels,
    selectedId,
  })
  const portRenderStateRef = useRef<PortRenderState>({
    ports,
    selectedPortId,
  })
  const airportRenderStateRef = useRef<AirportRenderState>({
    airports,
    selectedAirportId,
  })
  const weatherRenderStateRef = useRef<WeatherRenderState>({
    observations: weatherObservations,
    selectedWeatherId,
  })
  const orbitalRenderStateRef = useRef<OrbitalRenderState>({
    positions: orbitalPositions,
    shownIds: orbitalShownIds,
    trackSegments: orbitalTrackSegments,
    selectedOrbitalId,
  })
  const viewStateRef = useRef<ViewState>({
    aircraftVisible,
    vesselsVisible,
    portsVisible,
    airportsVisible,
    weatherVisible,
    orbitalVisible,
    trailSegments,
  })
  const selectRef = useRef(onSelect)
  const selectOrbitalRef = useRef(onSelectOrbital)
  const selectPortRef = useRef(onSelectPort)
  const selectAirportRef = useRef(onSelectAirport)
  const selectWeatherRef = useRef(onSelectWeather)
  const viewportChangeRef = useRef(onViewportChange)
  const cameraChangeRef = useRef(onCameraChange)
  const manualViewChangeRef = useRef(onManualViewChange)
  const errorRef = useRef(onMapError)
  const unitsRef = useRef(units)
  const aircraftPhotoEnabledRef = useRef(aircraftPhotoEnabled)
  const previousAircraftPhotoEnabledRef = useRef(
    aircraftPhotoEnabled,
  )
  const aircraftPhotoRef = useRef(aircraftPhoto)
  const vesselPhotoEnabledRef = useRef(vesselPhotoEnabled)
  const orbitalImageUrlsRef = useRef(orbitalImageUrls)
  const previousVesselPhotoEnabledRef = useRef(vesselPhotoEnabled)
  const hoverAircraftChangeRef = useRef(onHoverAircraftChange)
  const hoveredTrafficIdRef = useRef<string | null>(null)
  const hoveredTrafficIdentityRef = useRef<string | null>(null)
  const hoveredOrbitalIdRef = useRef<string | null>(null)
  const hoveredOrbitalIdentityRef = useRef<string | null>(null)
  const hideTrafficTooltipRef = useRef<() => void>(() => undefined)
  const refreshTrafficTooltipRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    desiredStyleUrlRef.current = mapStyleUrl
    onlineRef.current = online
    themeRef.current = theme
    viewRequestRef.current = viewRequestId
    viewCenterRef.current = viewCenter
    viewportLimitsRef.current = {
      coordinatePrecision,
      maximumRadiusKm: maximumViewportRadiusKm,
    }
    viewportSettleMsRef.current = viewportSettleMs
    clusteringEnabledRef.current = clusteringEnabled
    interpolateTrafficRef.current = interpolateTraffic
    clusterConfigRef.current = {
      radiusPx: clusterRadiusPx,
      minimumPoints: clusterMinimumPoints,
      maximumZoom: clusterMaximumZoom,
    }
  }, [
    clusterMaximumZoom,
    clusterMinimumPoints,
    clusterRadiusPx,
    clusteringEnabled,
    coordinatePrecision,
    viewCenter,
    viewRequestId,
    mapStyleUrl,
    maximumViewportRadiusKm,
    interpolateTraffic,
    online,
    theme,
    viewportSettleMs,
  ])

  const renderSources = useCallback((now: number, force = false) => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return

    const state = renderStateRef.current
    const clustered = clusteringEnabledRef.current
    let updated = false

    for (const [kind, sourceId, entities, motion] of [
      [
        'aircraft',
        SOURCE_AIRCRAFT,
        state.aircraft,
        aircraftMotionRef.current,
      ],
      [
        'vessels',
        SOURCE_VESSELS,
        state.vessels,
        vesselMotionRef.current,
      ],
    ] as const) {
      const data = trafficFeatures(
        entities,
        motion,
        now,
        state.selectedId,
        interpolateTrafficRef.current && !clustered,
      )
      const source = map.getSource(sourceId) as GeoJSONSource | undefined
      const previous = lastTrafficFeaturesRef.current[kind]
      if (!force && source && previous) {
        const diff = trafficSourceDiff(previous, data.features)
        if (Object.keys(diff).length > 0) {
          const styleGeneration = styleGenerationRef.current
          const updateGeneration =
            ++trafficUpdateGenerationRef.current[kind]
          void source.updateData(diff).catch((error: unknown) => {
            if (
              styleGeneration !== styleGenerationRef.current ||
              updateGeneration !==
                trafficUpdateGenerationRef.current[kind]
            ) {
              return
            }
            errorRef.current({
              kind: 'runtime',
              message:
                error instanceof Error
                  ? error.message
                  : 'Traffic source update failed',
            })
          })
          updated = true
        }
      } else {
        trafficUpdateGenerationRef.current[kind] += 1
        setTrafficSourceData(map, sourceId, data)
        updated = true
      }
      lastTrafficFeaturesRef.current[kind] = data.features
    }

    if (updated) sourceDataGenerationRef.current += 1
  }, [])

  const renderOrbitalSources = useCallback(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    const state = orbitalRenderStateRef.current
    const points = orbitalPositionFeatures(state.positions)
    const source = map.getSource(SOURCE_ORBITAL_POINTS) as
      | GeoJSONSource
      | undefined
    const previous = lastOrbitalFeaturesRef.current
    if (source && previous.length > 0) {
      const styleGeneration = styleGenerationRef.current
      const updateGeneration = ++orbitalUpdateGenerationRef.current
      const diff = pointSourceDiff(previous, points.features)
      void source.updateData(diff).catch((error: unknown) => {
        if (
          styleGeneration !== styleGenerationRef.current ||
          updateGeneration !== orbitalUpdateGenerationRef.current
        ) {
          return
        }
        errorRef.current({
          kind: 'runtime',
          message:
            error instanceof Error
              ? error.message
              : 'Orbital source update failed',
        })
      })
    } else {
      orbitalUpdateGenerationRef.current += 1
      setOrbitalSourceData(map, SOURCE_ORBITAL_POINTS, points)
    }
    lastOrbitalFeaturesRef.current = points.features
    setOrbitalSourceData(
      map,
      SOURCE_ORBITAL_HIGHLIGHT,
      orbitalHighlightFeatures(
        state.positions,
        state.selectedOrbitalId,
      ),
    )
    setOrbitalSourceData(
      map,
      SOURCE_ORBITAL_TRACK,
      orbitalTrackFeatures(state.trackSegments),
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
        shouldAnimateTrafficSources(
          clusteringEnabledRef.current,
          hasActiveMotion(aircraftMotionRef.current, now) ||
            hasActiveMotion(vesselMotionRef.current, now),
        )
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
    let orbitalViewport: OrbitalViewport
    let rawZoom: number | undefined
    try {
      const canvas = map.getCanvas()
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const center = map.getCenter()
      const currentZoom = map.getZoom()
      rawZoom = Number.isFinite(currentZoom) ? currentZoom : undefined
      cameraChangeRef.current(
        roundMapCameraState(
          {
            latitude: center.lat,
            longitude: center.lng,
            zoom: currentZoom,
            bearing: map.getBearing(),
            pitch: map.getPitch(),
          },
          viewportLimitsRef.current.coordinatePrecision,
        ),
      )
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
      const bounds = map.getBounds()
      orbitalViewport = assessOrbitalViewport(
        {
          center: {
            latitude: center.lat,
            longitude: center.lng,
          },
          perimeter,
          longitudeSpanDegrees: Math.abs(
            bounds.getEast() - bounds.getWest(),
          ),
        },
        viewportLimitsRef.current.coordinatePrecision,
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
      orbitalViewport = assessOrbitalViewport(
        {
          center: {
            latitude: Number.NaN,
            longitude: Number.NaN,
          },
          perimeter: [],
          longitudeSpanDegrees: Number.NaN,
        },
        viewportLimitsRef.current.coordinatePrecision,
      )
    }

    const signature = `${viewportSignature(assessment)}|${orbitalViewportSignature(
      orbitalViewport,
    )}|${rawZoom ?? 'unavailable'}`
    if (signature === lastViewportSignatureRef.current) return
    lastViewportSignatureRef.current = signature
    viewportChangeRef.current(
      assessment,
      orbitalViewport,
      rawZoom,
      viewRequestRef.current,
    )
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

  const getOrbitalImages = useCallback((activeTheme: Theme) => {
    const cachedImages = orbitalImagesRef.current[activeTheme]
    if (cachedImages) return cachedImages

    const images = createOrbitalIcons(activeTheme)
    orbitalImagesRef.current[activeTheme] = images
    return images
  }, [])

  const installCurrentStyle = useCallback(
    (map: MapLibreMap) => {
      const now = performance.now()
      const renderState = renderStateRef.current
      const viewState = viewStateRef.current
      const activeTheme = themeRef.current
      const aircraftFeatures = trafficFeatures(
        renderState.aircraft,
        aircraftMotionRef.current,
        now,
        renderState.selectedId,
        interpolateTrafficRef.current &&
          !clusteringEnabledRef.current,
      )
      const vesselFeatures = trafficFeatures(
        renderState.vessels,
        vesselMotionRef.current,
        now,
        renderState.selectedId,
        interpolateTrafficRef.current &&
          !clusteringEnabledRef.current,
      )
      installTrafficStyle(
        map,
        {
          theme: activeTheme,
          aircraft: aircraftFeatures,
          vessels: vesselFeatures,
          trail: trailData(viewState.trailSegments),
          aircraftVisible: viewState.aircraftVisible,
          vesselsVisible: viewState.vesselsVisible,
          clusteringEnabled: clusteringEnabledRef.current,
          clusterRadiusPx: clusterConfigRef.current.radiusPx,
          clusterMinimumPoints: clusterConfigRef.current.minimumPoints,
          clusterMaximumZoom: clusterConfigRef.current.maximumZoom,
        },
        getTrafficImages(activeTheme),
      )
      lastTrafficFeaturesRef.current = {
        aircraft: aircraftFeatures.features,
        vessels: vesselFeatures.features,
      }
      sourceDataGenerationRef.current += 1
      const portState = portRenderStateRef.current
      if (portState.ports.length > 0) {
        installPortsStyle(
          map,
          portFeatures(portState.ports, portState.selectedPortId),
          activeTheme,
          viewState.portsVisible,
        )
      }
      const airportState = airportRenderStateRef.current
      if (airportState.airports.length > 0) {
        installAirportsStyle(
          map,
          airportFeatures(
            airportState.airports,
            airportState.selectedAirportId,
          ),
          activeTheme,
          viewState.airportsVisible,
        )
      }
      const weatherState = weatherRenderStateRef.current
      if (
        viewState.weatherVisible ||
        weatherState.observations.length > 0
      ) {
        installWeatherStyle(
          map,
          weatherFeatures(
            weatherState.observations,
            weatherState.selectedWeatherId,
          ),
          activeTheme,
          viewState.weatherVisible,
        )
      }
      const orbitalState = orbitalRenderStateRef.current
      if (
        viewState.orbitalVisible ||
        orbitalState.positions.length > 0 ||
        orbitalState.trackSegments.length > 0
      ) {
        const points = orbitalPositionFeatures(orbitalState.positions)
        installOrbitalStyle(
          map,
          points,
          orbitalHighlightFeatures(
            orbitalState.positions,
            orbitalState.selectedOrbitalId,
          ),
          orbitalTrackFeatures(orbitalState.trackSegments),
          activeTheme,
          viewState.orbitalVisible,
          getOrbitalImages(activeTheme),
          orbitalState.shownIds,
        )
        lastOrbitalFeaturesRef.current = points.features
      }
      loadedRef.current = true
      errorRef.current(
        fallbackActiveRef.current
          ? {
              kind: 'basemap',
              message:
                fallbackReasonRef.current ?? BASEMAP_FALLBACK_MESSAGE,
            }
          : null,
      )
      scheduleRender()

      if (!initialFitCompleteRef.current) {
        initialFitCompleteRef.current = true
        lastViewRequestRef.current = viewRequestRef.current
        if (
          initialCameraRef.current &&
          viewRequestRef.current === initialViewRequestIdRef.current
        ) {
          lastViewportSignatureRef.current = null
          scheduleViewportReport(map, 0)
        } else {
          fitCurrentView(map, 0)
        }
      } else if (lastViewRequestRef.current !== viewRequestRef.current) {
        lastViewRequestRef.current = viewRequestRef.current
        fitCurrentView(map, 650)
      }
    },
    [
      fitCurrentView,
      getOrbitalImages,
      getTrafficImages,
      scheduleRender,
      scheduleViewportReport,
    ],
  )

  const switchMapStyle = useCallback(
    (
      map: MapLibreMap,
      nextStyle: string | StyleSpecification,
      nextStyleKey: string,
      fallbackReason?: string,
    ) => {
      const applyStyle = (
        style: string | StyleSpecification,
        styleKey: string,
        reason?: string,
      ) => {
        const generation = ++styleGenerationRef.current
        sourceDataGenerationRef.current += 1
        clusterOptionsGenerationRef.current += 1
        clusterExpansionGenerationRef.current += 1
        loadedRef.current = false
        requestedStyleUrlRef.current = styleKey
        fallbackReasonRef.current = reason

        const handleStyleLoad = () => {
          if (generation !== styleGenerationRef.current) return
          appliedStyleUrlRef.current = styleKey
          fallbackActiveRef.current = reason !== undefined
          appliedThemeRef.current = themeRef.current
          if (
            shouldRetryAfterFallbackLoad(
              retryExternalAfterFallbackRef.current,
              onlineRef.current,
              reason,
            )
          ) {
            retryExternalAfterFallbackRef.current = false
            applyStyle(
              desiredStyleUrlRef.current,
              desiredStyleUrlRef.current,
            )
            return
          }
          if (reason === undefined) {
            retryExternalAfterFallbackRef.current = false
          }
          installCurrentStyle(map)
        }

        map.once('style.load', handleStyleLoad)
        try {
          map.setStyle(style)
        } catch (error) {
          map.off('style.load', handleStyleLoad)
          if (reason === undefined) {
            applyStyle(
              fallbackMapStyle(themeRef.current),
              fallbackMapStyleKey(themeRef.current),
              BASEMAP_FALLBACK_MESSAGE,
            )
            return
          }
          requestedStyleUrlRef.current = appliedStyleUrlRef.current
          loadedRef.current = map.isStyleLoaded() === true
          errorRef.current({
            kind: 'runtime',
            message:
              error instanceof Error
                ? error.message
                : 'Map fallback style failed',
          })
        }
      }
      applyStyle(nextStyle, nextStyleKey, fallbackReason)
    },
    [installCurrentStyle],
  )

  useEffect(() => {
    selectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    selectOrbitalRef.current = onSelectOrbital
  }, [onSelectOrbital])

  useEffect(() => {
    selectPortRef.current = onSelectPort
  }, [onSelectPort])

  useEffect(() => {
    selectAirportRef.current = onSelectAirport
  }, [onSelectAirport])

  useEffect(() => {
    selectWeatherRef.current = onSelectWeather
  }, [onSelectWeather])

  useEffect(() => {
    viewportChangeRef.current = onViewportChange
  }, [onViewportChange])

  useEffect(() => {
    cameraChangeRef.current = onCameraChange
  }, [onCameraChange])

  useEffect(() => {
    manualViewChangeRef.current = onManualViewChange
  }, [onManualViewChange])

  useEffect(() => {
    errorRef.current = onMapError
  }, [onMapError])

  useEffect(() => {
    hoverAircraftChangeRef.current = onHoverAircraftChange
  }, [onHoverAircraftChange])

  useEffect(() => {
    unitsRef.current = units
    refreshTrafficTooltipRef.current()
  }, [units])

  useEffect(() => {
    orbitalImageUrlsRef.current = orbitalImageUrls
    refreshTrafficTooltipRef.current()
  }, [orbitalImageUrls])

  useEffect(() => {
    const wasEnabled = previousAircraftPhotoEnabledRef.current
    const wasVesselPhotoEnabled =
      previousVesselPhotoEnabledRef.current
    previousAircraftPhotoEnabledRef.current = aircraftPhotoEnabled
    previousVesselPhotoEnabledRef.current = vesselPhotoEnabled
    aircraftPhotoEnabledRef.current = aircraftPhotoEnabled
    aircraftPhotoRef.current = aircraftPhoto
    vesselPhotoEnabledRef.current = vesselPhotoEnabled
    if (
      (wasEnabled && !aircraftPhotoEnabled) ||
      (wasVesselPhotoEnabled && !vesselPhotoEnabled)
    ) {
      hideTrafficTooltipRef.current()
      return
    }
    if (aircraftPhotoEnabled || vesselPhotoEnabled) {
      refreshTrafficTooltipRef.current()
    }
  }, [aircraftPhoto, aircraftPhotoEnabled, vesselPhotoEnabled])

  useEffect(() => {
    viewStateRef.current = {
      aircraftVisible,
      vesselsVisible,
      portsVisible,
      airportsVisible,
      weatherVisible,
      orbitalVisible,
      trailSegments,
    }
  }, [
    aircraftVisible,
    airportsVisible,
    weatherVisible,
    orbitalVisible,
    portsVisible,
    trailSegments,
    vesselsVisible,
  ])

  useEffect(() => {
    if (!containerRef.current) return
    const initialView = viewCenterRef.current
    const initialCamera = initialCameraRef.current

    const map = createMapSafely(
      () =>
        new MapLibreMap({
          container: containerRef.current!,
          style: initialStyleUrlRef.current,
          center: initialCamera
            ? [initialCamera.longitude, initialCamera.latitude]
            : [initialView.longitude, initialView.latitude],
          zoom: initialCamera?.zoom ?? 8,
          bearing: initialCamera?.bearing ?? 0,
          pitch: initialCamera?.pitch ?? 0,
          attributionControl: false,
          maxPitch: 60,
        }),
      (error) => errorRef.current(error),
    )
    if (!map) return

    mapRef.current = map
    const touchTracker = new TouchInteractionTracker()
    const canvas = map.getCanvas()
    const hoverPopup = new Popup({
      closeButton: false,
      closeOnClick: false,
      focusAfterOpen: false,
      className: 'traffic-hover-popup',
      maxWidth: '280px',
      offset: 14,
    })
    const hoverEnabled = supportsMouseHover()
    let tooltipPointerInside = false
    let tooltipFocusInside = false
    let tooltipHideTimer: number | undefined
    let hoverPopupElement: HTMLElement | null = null
    let trafficPhotoDwellTimer: number | undefined
    let pendingTrafficPhotoId: string | null = null
    let activeTrafficPhotoId: string | null = null
    let activeAircraftPhotoId: string | null = null
    let lastHoverPoint: [number, number] | null = null
    const cancelTrafficTooltipHide = () => {
      if (tooltipHideTimer === undefined) return
      window.clearTimeout(tooltipHideTimer)
      tooltipHideTimer = undefined
    }
    const cancelTrafficPhotoDwell = () => {
      if (trafficPhotoDwellTimer !== undefined) {
        window.clearTimeout(trafficPhotoDwellTimer)
        trafficPhotoDwellTimer = undefined
      }
      pendingTrafficPhotoId = null
    }
    const clearTrafficPhotoHover = () => {
      cancelTrafficPhotoDwell()
      activeTrafficPhotoId = null
      if (activeAircraftPhotoId !== null) {
        activeAircraftPhotoId = null
        hoverAircraftChangeRef.current(null)
      }
    }
    const trafficPhotoEligible = (entity: TrafficEntity) =>
      entity.kind === 'aircraft'
        ? aircraftPhotoEnabledRef.current
        : vesselPhotoEnabledRef.current &&
          vesselReferencePhotoForSelection(entity) !== undefined
    const scheduleTrafficPhotoHover = (
      entity: TrafficEntity,
      point: { x: number; y: number },
    ) => {
      lastHoverPoint = [point.x, point.y]
      if (!trafficPhotoEligible(entity)) {
        clearTrafficPhotoHover()
        return
      }
      if (
        activeTrafficPhotoId === entity.id ||
        pendingTrafficPhotoId === entity.id
      ) {
        return
      }

      clearTrafficPhotoHover()
      pendingTrafficPhotoId = entity.id
      trafficPhotoDwellTimer = window.setTimeout(() => {
        trafficPhotoDwellTimer = undefined
        pendingTrafficPhotoId = null
        if (
          hoveredTrafficIdRef.current !== entity.id ||
          !lastHoverPoint
        ) {
          return
        }
        const layers = activeTrafficLayers()
        const hoveredId =
          layers.length > 0
            ? exactEligibleFeatureId(
                map.queryRenderedFeatures(lastHoverPoint, {
                  layers,
                }),
                selectableTrafficIds(),
              )
            : null
        if (hoveredId !== entity.id) return
        const currentEntity = trafficEntity(entity.id)
        if (!currentEntity || !trafficPhotoEligible(currentEntity)) return
        activeTrafficPhotoId = entity.id
        if (currentEntity.kind === 'aircraft') {
          activeAircraftPhotoId = entity.id
          hoverAircraftChangeRef.current(entity.id)
        } else {
          refreshTrafficTooltipRef.current()
        }
      }, aircraftPhotoHoverDelayMs)
    }
    const hideTrafficTooltip = () => {
      cancelTrafficTooltipHide()
      clearTrafficPhotoHover()
      hoveredTrafficIdRef.current = null
      hoveredTrafficIdentityRef.current = null
      hoveredOrbitalIdRef.current = null
      hoveredOrbitalIdentityRef.current = null
      lastHoverPoint = null
      tooltipPointerInside = false
      tooltipFocusInside = false
      hoverPopup.remove()
    }
    const scheduleTrafficTooltipHide = () => {
      cancelTrafficPhotoDwell()
      cancelTrafficTooltipHide()
      tooltipHideTimer = window.setTimeout(() => {
        tooltipHideTimer = undefined
        if (!tooltipPointerInside && !tooltipFocusInside) {
          hideTrafficTooltip()
        }
      }, 120)
    }
    const bindHoverPopupInteractions = () => {
      const element = hoverPopup.getElement()
      if (element === hoverPopupElement) return
      hoverPopupElement = element
      element.addEventListener('pointerenter', () => {
        tooltipPointerInside = true
        cancelTrafficTooltipHide()
      })
      element.addEventListener('pointerleave', () => {
        tooltipPointerInside = false
        scheduleTrafficTooltipHide()
      })
      element.addEventListener('focusin', () => {
        tooltipFocusInside = true
        cancelTrafficTooltipHide()
      })
      element.addEventListener('focusout', (event) => {
        if (
          event.relatedTarget instanceof Node &&
          element.contains(event.relatedTarget)
        ) {
          return
        }
        tooltipFocusInside = false
        scheduleTrafficTooltipHide()
      })
      element.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        hideTrafficTooltip()
        canvas.focus()
      })
      for (const eventName of ['click', 'dblclick', 'pointerdown'] as const) {
        element.addEventListener(eventName, (event) => event.stopPropagation())
      }
    }
    hideTrafficTooltipRef.current = hideTrafficTooltip
    const pointerOrigins = new Map<number, { x: number; y: number }>()
    let manualPointerMovement = false
    const handlePointerDown = (event: PointerEvent) => {
      hideTrafficTooltip()
      interactionGenerationRef.current += 1
      clusterExpansionGenerationRef.current += 1
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
    const handleWheel = () => {
      hideTrafficTooltip()
      interactionGenerationRef.current += 1
      clusterExpansionGenerationRef.current += 1
      manualViewChangeRef.current()
    }
    const handleDoubleClick = () => {
      hideTrafficTooltip()
      interactionGenerationRef.current += 1
      clusterExpansionGenerationRef.current += 1
      manualViewChangeRef.current()
    }
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
        hideTrafficTooltip()
        interactionGenerationRef.current += 1
        clusterExpansionGenerationRef.current += 1
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
    canvas.addEventListener('mouseleave', scheduleTrafficTooltipHide)

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

    const activeClusterLayers = () => {
      if (!clusteringEnabledRef.current) return []
      const layers: string[] = []
      const viewState = viewStateRef.current
      if (
        viewState.aircraftVisible &&
        map.getLayer(LAYER_AIRCRAFT_CLUSTERS)
      ) {
        layers.push(LAYER_AIRCRAFT_CLUSTERS)
      }
      if (
        viewState.vesselsVisible &&
        map.getLayer(LAYER_VESSEL_CLUSTERS)
      ) {
        layers.push(LAYER_VESSEL_CLUSTERS)
      }
      return layers
    }

    const activePortLayers = () =>
      viewStateRef.current.portsVisible
        ? PORT_LAYER_IDS.filter((layerId) => map.getLayer(layerId))
        : []

    const activeAirportLayers = () =>
      viewStateRef.current.airportsVisible
        ? AIRPORT_LAYER_IDS.filter((layerId) => map.getLayer(layerId))
        : []

    const activeWeatherLayers = () =>
      viewStateRef.current.weatherVisible
        ? WEATHER_LAYER_IDS.filter((layerId) => map.getLayer(layerId))
        : []

    const activeOrbitalLayers = () =>
      viewStateRef.current.orbitalVisible
        ? [
            LAYER_ORBITAL_HIGHLIGHT,
            LAYER_ORBITAL_POINTS,
          ].filter((layerId) => map.getLayer(layerId))
        : []

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

    const trafficEntity = (id: string) => {
      const renderState = renderStateRef.current
      return (
        renderState.aircraft.find((entity) => entity.id === id) ??
        renderState.vessels.find((entity) => entity.id === id)
      )
    }

    const orbitalPosition = (id: string) =>
      orbitalRenderStateRef.current.positions.find(
        (position) => position.id === id,
      )

    const renderTrafficTooltip = (entity: TrafficEntity) => {
      hoveredTrafficIdentityRef.current = trafficTooltipIdentity(entity)
      const element = createTrafficTooltipElement(entity, document, {
        aircraftPhotoEnabled: aircraftPhotoEnabledRef.current,
        aircraftPhoto: aircraftPhotoRef.current,
        units: unitsRef.current,
        vesselPhoto:
          entity.kind === 'vessel' &&
          vesselPhotoEnabledRef.current &&
          activeTrafficPhotoId === entity.id
            ? vesselReferencePhotoForSelection(entity)
            : undefined,
      })
      hoverPopup.setDOMContent(element)
    }
    const renderOrbitalTooltip = (position: ModeledOrbitalPosition) => {
      hoveredOrbitalIdentityRef.current =
        orbitalTooltipIdentity(position)
      hoverPopup.setDOMContent(
        createOrbitalTooltipElement(
          position,
          document,
          orbitalImageUrlsRef.current,
        ),
      )
    }
    refreshTrafficTooltipRef.current = () => {
      if (!hoverPopup.isOpen()) return
      const hoveredTrafficId = hoveredTrafficIdRef.current
      if (hoveredTrafficId) {
        const entity = trafficEntity(hoveredTrafficId)
        if (!entity) {
          hideTrafficTooltip()
          return
        }
        renderTrafficTooltip(entity)
        return
      }
      const hoveredOrbitalId = hoveredOrbitalIdRef.current
      if (!hoveredOrbitalId) return
      const position = orbitalPosition(hoveredOrbitalId)
      if (!position) {
        hideTrafficTooltip()
        return
      }
      renderOrbitalTooltip(position)
    }
    const revalidateTrafficTooltip = () => {
      if (
        !hoverPopup.isOpen() ||
        tooltipPointerInside ||
        tooltipFocusInside ||
        !lastHoverPoint
      ) {
        return
      }
      const hoveredTrafficId = hoveredTrafficIdRef.current
      if (hoveredTrafficId) {
        const layers = activeTrafficLayers()
        const renderedId =
          layers.length > 0
            ? exactEligibleFeatureId(
                map.queryRenderedFeatures(lastHoverPoint, {
                  layers,
                }),
                selectableTrafficIds(),
              )
            : null
        if (renderedId !== hoveredTrafficId) hideTrafficTooltip()
        return
      }
      const hoveredOrbitalId = hoveredOrbitalIdRef.current
      if (!hoveredOrbitalId) return
      const layers = activeOrbitalLayers()
      const renderedId =
        layers.length > 0
          ? exactEligibleFeatureId(
              map.queryRenderedFeatures(lastHoverPoint, {
                layers,
              }),
              selectableOrbitalIds(),
            )
          : null
      if (renderedId !== hoveredOrbitalId) hideTrafficTooltip()
    }

    const selectablePortIds = () =>
      new Set(portRenderStateRef.current.ports.map(({ id }) => id))

    const selectableAirportIds = () =>
      new Set(airportRenderStateRef.current.airports.map(({ id }) => id))

    const selectableWeatherIds = () =>
      new Set(
        weatherRenderStateRef.current.observations.map(({ id }) => id),
      )

    const selectableOrbitalIds = () =>
      new Set(orbitalRenderStateRef.current.shownIds)

    const expandCluster = (
      target: NonNullable<ReturnType<typeof firstTrafficClusterTarget>>,
    ) => {
      manualViewChangeRef.current()
      const expansionGeneration = ++clusterExpansionGenerationRef.current
      const styleGeneration = styleGenerationRef.current
      const sourceDataGeneration = sourceDataGenerationRef.current
      const clusterOptionsGeneration = clusterOptionsGenerationRef.current
      const interactionGeneration = interactionGenerationRef.current
      const requestedView = viewRequestRef.current
      const source = map.getSource(target.sourceId)
      if (!source) return

      void (source as GeoJSONSource)
        .getClusterExpansionZoom(target.clusterId)
        .then((requestedZoom) => {
          const viewState = viewStateRef.current
          const layerVisible =
            target.kind === 'aircraft'
              ? viewState.aircraftVisible
              : viewState.vesselsVisible
          if (
            mapRef.current !== map ||
            !loadedRef.current ||
            !clusteringEnabledRef.current ||
            !layerVisible ||
            expansionGeneration !== clusterExpansionGenerationRef.current ||
            styleGeneration !== styleGenerationRef.current ||
            sourceDataGeneration !== sourceDataGenerationRef.current ||
            clusterOptionsGeneration !==
              clusterOptionsGenerationRef.current ||
            interactionGeneration !== interactionGenerationRef.current ||
            requestedView !== viewRequestRef.current ||
            !map.getSource(target.sourceId)
          ) {
            return
          }

          map.easeTo({
            center: target.center,
            zoom: clusterExpansionZoom(
              map.getZoom(),
              requestedZoom,
              map.getMaxZoom(),
            ),
            duration: prefersReducedMotion() ? 0 : 450,
          })
        })
        .catch((error: unknown) => {
          const viewState = viewStateRef.current
          const layerVisible =
            target.kind === 'aircraft'
              ? viewState.aircraftVisible
              : viewState.vesselsVisible
          if (
            expansionGeneration !== clusterExpansionGenerationRef.current ||
            mapRef.current !== map ||
            !loadedRef.current ||
            !clusteringEnabledRef.current ||
            !layerVisible ||
            styleGeneration !== styleGenerationRef.current ||
            sourceDataGeneration !== sourceDataGenerationRef.current ||
            clusterOptionsGeneration !==
              clusterOptionsGenerationRef.current ||
            interactionGeneration !== interactionGenerationRef.current ||
            requestedView !== viewRequestRef.current
          ) {
            return
          }
          errorRef.current({
            kind: 'runtime',
            message:
              error instanceof Error
                ? error.message
                : 'Traffic cluster expansion failed',
          })
        })
    }

    map.on('movestart', hideTrafficTooltip)
    map.on('style.load', hideTrafficTooltip)
    map.on('render', revalidateTrafficTooltip)

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
          'Air <a href="https://www.adsb.lol/" target="_blank" rel="noreferrer">ADSB.lol</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL 1.0</a>',
          'Sea <a href="https://www.digitraffic.fi/en/marine-traffic/" target="_blank" rel="noreferrer">Digitraffic</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · filtered/normalized',
          'Ports <a href="https://www.naturalearthdata.com/downloads/10m-cultural-vectors/ports/" target="_blank" rel="noreferrer">Natural Earth</a> · <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">public domain</a> · generalized',
          'Airports <a href="https://ourairports.com/data/" target="_blank" rel="noreferrer">OurAirports</a> · <a href="https://ourairports.com/data/" target="_blank" rel="noreferrer">public domain</a> · context only',
        ],
      }),
      'bottom-right',
    )

    map.on('click', (event) => {
      hideTrafficTooltip()
      const touchFallbackAllowed = touchTracker.consumeClick(
        event.originalEvent,
      )
      const trafficLayers = activeTrafficLayers()
      const trafficIds = selectableTrafficIds()
      if (trafficLayers.length > 0) {
        const exactTraffic = exactEligibleFeatureId(
          map.queryRenderedFeatures(event.point, {
            layers: trafficLayers,
          }),
          trafficIds,
        )
        if (exactTraffic) {
          selectOrbitalRef.current(null)
          selectPortRef.current(null)
          selectAirportRef.current(null)
          selectWeatherRef.current(null)
          selectRef.current(exactTraffic)
          return
        }
      }

      const clusterLayers = activeClusterLayers()
      if (clusterLayers.length > 0) {
        const cluster = firstTrafficClusterTarget(
          map.queryRenderedFeatures(event.point, {
            layers: clusterLayers,
          }),
        )
        if (cluster) {
          expandCluster(cluster)
          return
        }
      }

      if (touchFallbackAllowed && trafficLayers.length > 0) {
        const nearbyTraffic = uniqueEligibleFeatureId(
          map.queryRenderedFeatures(
            expandedHitBox(event.point, touchHitTolerancePx),
            { layers: trafficLayers },
          ),
          trafficIds,
        )
        if (nearbyTraffic) {
          selectOrbitalRef.current(null)
          selectPortRef.current(null)
          selectAirportRef.current(null)
          selectWeatherRef.current(null)
          selectRef.current(nearbyTraffic)
          return
        }
      }

      const orbitalLayers = activeOrbitalLayers()
      const orbitalIds = selectableOrbitalIds()
      if (orbitalLayers.length > 0) {
        const exactOrbital = exactEligibleFeatureId(
          map.queryRenderedFeatures(event.point, {
            layers: orbitalLayers,
          }),
          orbitalIds,
        )
        if (exactOrbital) {
          selectRef.current(null)
          selectPortRef.current(null)
          selectAirportRef.current(null)
          selectWeatherRef.current(null)
          selectOrbitalRef.current(exactOrbital)
          return
        }
      }
      if (touchFallbackAllowed && orbitalLayers.length > 0) {
        const nearbyOrbital = uniqueEligibleFeatureId(
          map.queryRenderedFeatures(
            expandedHitBox(event.point, touchHitTolerancePx),
            { layers: orbitalLayers },
          ),
          orbitalIds,
        )
        if (nearbyOrbital) {
          selectRef.current(null)
          selectPortRef.current(null)
          selectAirportRef.current(null)
          selectWeatherRef.current(null)
          selectOrbitalRef.current(nearbyOrbital)
          return
        }
      }

      const weatherLayers = activeWeatherLayers()
      const weatherIds = selectableWeatherIds()
      const airportLayers = activeAirportLayers()
      const airportIds = selectableAirportIds()
      const portLayers = activePortLayers()
      const portIds = selectablePortIds()
      const contextPick = pickContextFeature(
        {
          exactWeather: () =>
            weatherLayers.length > 0
              ? exactEligibleFeatureId(
                  map.queryRenderedFeatures(event.point, {
                    layers: weatherLayers,
                  }),
                  weatherIds,
                )
              : undefined,
          exactAirport: () =>
            airportLayers.length > 0
              ? exactEligibleFeatureId(
                  map.queryRenderedFeatures(event.point, {
                    layers: airportLayers,
                  }),
                  airportIds,
                )
              : undefined,
          exactPort: () =>
            portLayers.length > 0
              ? exactEligibleFeatureId(
                  map.queryRenderedFeatures(event.point, {
                    layers: portLayers,
                  }),
                  portIds,
                )
              : undefined,
          nearbyWeather: () =>
            weatherLayers.length > 0
              ? uniqueEligibleFeatureId(
                  map.queryRenderedFeatures(
                    expandedHitBox(event.point, touchHitTolerancePx),
                    { layers: weatherLayers },
                  ),
                  weatherIds,
                )
              : undefined,
          nearbyAirport: () =>
            airportLayers.length > 0
              ? uniqueEligibleFeatureId(
                  map.queryRenderedFeatures(
                    expandedHitBox(event.point, touchHitTolerancePx),
                    { layers: airportLayers },
                  ),
                  airportIds,
                )
              : undefined,
          nearbyPort: () =>
            portLayers.length > 0
              ? uniqueEligibleFeatureId(
                  map.queryRenderedFeatures(
                    expandedHitBox(event.point, touchHitTolerancePx),
                    { layers: portLayers },
                  ),
                  portIds,
                )
              : undefined,
        },
        touchFallbackAllowed,
      )
      if (contextPick?.kind === 'weather') {
        selectRef.current(null)
        selectOrbitalRef.current(null)
        selectPortRef.current(null)
        selectAirportRef.current(null)
        selectWeatherRef.current(contextPick.id)
        return
      }
      if (contextPick?.kind === 'airport') {
        selectRef.current(null)
        selectOrbitalRef.current(null)
        selectPortRef.current(null)
        selectWeatherRef.current(null)
        selectAirportRef.current(contextPick.id)
        return
      }
      if (contextPick?.kind === 'port') {
        selectRef.current(null)
        selectOrbitalRef.current(null)
        selectAirportRef.current(null)
        selectWeatherRef.current(null)
        selectPortRef.current(contextPick.id)
        return
      }

      selectRef.current(null)
      selectOrbitalRef.current(null)
      selectPortRef.current(null)
      selectAirportRef.current(null)
      selectWeatherRef.current(null)
    })

    map.on('mousemove', (event) => {
      const trafficLayers = activeTrafficLayers()
      const layers = [
        ...trafficLayers,
        ...activeClusterLayers(),
        ...activeOrbitalLayers(),
        ...activeWeatherLayers(),
        ...activeAirportLayers(),
        ...activePortLayers(),
      ]
      const features =
        layers.length > 0
          ? map.queryRenderedFeatures(event.point, { layers })
          : []
      map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : ''

      const hoveredId =
        hoverEnabled &&
        pointerOrigins.size === 0 &&
        trafficLayers.length > 0
          ? exactEligibleFeatureId(features, selectableTrafficIds())
          : null
      if (hoveredId) {
        const entity = trafficEntity(hoveredId)
        if (!entity) {
          scheduleTrafficTooltipHide()
          return
        }

        cancelTrafficTooltipHide()
        hoveredOrbitalIdRef.current = null
        hoveredOrbitalIdentityRef.current = null
        if (hoveredTrafficIdRef.current !== hoveredId) {
          hoveredTrafficIdRef.current = hoveredId
          renderTrafficTooltip(entity)
        }
        scheduleTrafficPhotoHover(entity, event.point)
        hoverPopup.setLngLat(event.lngLat)
        if (!hoverPopup.isOpen()) {
          hoverPopup.addTo(map)
          bindHoverPopupInteractions()
        }
        return
      }

      const orbitalLayers = activeOrbitalLayers()
      const hoveredOrbitalId =
        hoverEnabled &&
        pointerOrigins.size === 0 &&
        orbitalLayers.length > 0
          ? exactEligibleFeatureId(features, selectableOrbitalIds())
          : null
      if (!hoveredOrbitalId) {
        scheduleTrafficTooltipHide()
        return
      }
      const position = orbitalPosition(hoveredOrbitalId)
      if (!position) {
        scheduleTrafficTooltipHide()
        return
      }

      cancelTrafficTooltipHide()
      clearTrafficPhotoHover()
      lastHoverPoint = [event.point.x, event.point.y]
      hoveredTrafficIdRef.current = null
      hoveredTrafficIdentityRef.current = null
      if (hoveredOrbitalIdRef.current !== hoveredOrbitalId) {
        hoveredOrbitalIdRef.current = hoveredOrbitalId
        renderOrbitalTooltip(position)
      }
      hoverPopup.setLngLat(event.lngLat)
      if (!hoverPopup.isOpen()) {
        hoverPopup.addTo(map)
        bindHoverPopupInteractions()
      }
    })

    map.on('load', () => {
      if (loadedRef.current) return
      if (requestedStyleUrlRef.current !== initialStyleUrlRef.current) {
        return
      }
      if (desiredStyleUrlRef.current !== initialStyleUrlRef.current) {
        switchMapStyle(
          map,
          desiredStyleUrlRef.current,
          desiredStyleUrlRef.current,
        )
        return
      }

      appliedStyleUrlRef.current = initialStyleUrlRef.current
      appliedThemeRef.current = themeRef.current
      installCurrentStyle(map)
    })

    map.on('error', (event) => {
      if (event.error) {
        if (
          !loadedRef.current &&
          !isFallbackMapStyleKey(requestedStyleUrlRef.current)
        ) {
          switchMapStyle(
            map,
            fallbackMapStyle(themeRef.current),
            fallbackMapStyleKey(themeRef.current),
            BASEMAP_FALLBACK_MESSAGE,
          )
          return
        }
        errorRef.current({
          kind: 'runtime',
          message: event.error.message,
        })
      }
    })

    return () => {
      styleGenerationRef.current += 1
      clusterOptionsGenerationRef.current += 1
      interactionGenerationRef.current += 1
      clusterExpansionGenerationRef.current += 1
      loadedRef.current = false
      clearPendingViewport()
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointercancel', handlePointerCancel)
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('dblclick', handleDoubleClick)
      canvas.removeEventListener('keydown', handleKeyDown)
      canvas.removeEventListener(
        'mouseleave',
        scheduleTrafficTooltipHide,
      )
      hideTrafficTooltip()
      hideTrafficTooltipRef.current = () => undefined
      refreshTrafficTooltipRef.current = () => undefined
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      map.remove()
      mapRef.current = null
    }
  }, [
    aircraftPhotoHoverDelayMs,
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
    const retryAfterDelayedFailure = reconnectedWhileStylePending(
      online,
      previousOnlineRef.current,
      loadedRef.current,
    )
    previousOnlineRef.current = online
    if (!online) retryExternalAfterFallbackRef.current = false

    if (
      isFallbackMapStyleKey(requestedStyleUrlRef.current) ||
      fallbackActiveRef.current
    ) {
      if (online) {
        retryExternalAfterFallbackRef.current = false
        switchMapStyle(map, mapStyleUrl, mapStyleUrl)
      } else {
        const nextFallbackKey = fallbackMapStyleKey(theme)
        if (nextFallbackKey !== requestedStyleUrlRef.current) {
          switchMapStyle(
            map,
            fallbackMapStyle(theme),
            nextFallbackKey,
            BASEMAP_FALLBACK_MESSAGE,
          )
        }
      }
      return
    }

    if (mapStyleUrl !== requestedStyleUrlRef.current) {
      retryExternalAfterFallbackRef.current = false
      switchMapStyle(map, mapStyleUrl, mapStyleUrl)
      return
    }

    if (retryAfterDelayedFailure) {
      retryExternalAfterFallbackRef.current = true
    }
    if (!loadedRef.current) return

    if (theme !== appliedThemeRef.current) {
      appliedThemeRef.current = theme
      installCurrentStyle(map)
    }
  }, [
    installCurrentStyle,
    mapStyleUrl,
    online,
    switchMapStyle,
    theme,
  ])

  useEffect(() => {
    hideTrafficTooltipRef.current()
    const generation = ++clusterOptionsGenerationRef.current
    const styleGeneration = styleGenerationRef.current
    clusterExpansionGenerationRef.current += 1

    clusterUpdateChainRef.current = clusterUpdateChainRef.current
      .catch(() => undefined)
      .then(async () => {
        const map = mapRef.current
        if (
          !map ||
          !loadedRef.current ||
          generation !== clusterOptionsGenerationRef.current ||
          styleGeneration !== styleGenerationRef.current
        ) {
          return
        }

        if (clusteringEnabled) {
          renderSources(performance.now(), true)
        }
        await setTrafficClustering(map, clusteringEnabled)
        if (
          mapRef.current !== map ||
          !loadedRef.current ||
          generation !== clusterOptionsGenerationRef.current ||
          styleGeneration !== styleGenerationRef.current
        ) {
          return
        }

        sourceDataGenerationRef.current += 1
        if (!clusteringEnabled) {
          renderSources(performance.now(), true)
          scheduleRender()
        }
      })
      .catch((error: unknown) => {
        if (generation !== clusterOptionsGenerationRef.current) return
        errorRef.current({
          kind: 'runtime',
          message:
            error instanceof Error
              ? error.message
              : 'Traffic clustering change failed',
        })
      })
  }, [
    clusteringEnabled,
    renderSources,
    scheduleRender,
  ])

  useEffect(() => {
    renderStateRef.current = { aircraft, vessels, selectedId }
    const hoveredTrafficId = hoveredTrafficIdRef.current
    if (hoveredTrafficId) {
      const hoveredEntity =
        aircraft.find((entity) => entity.id === hoveredTrafficId) ??
        vessels.find((entity) => entity.id === hoveredTrafficId)
      if (
        !hoveredEntity ||
        hoveredTrafficIdentityRef.current !==
          trafficTooltipIdentity(hoveredEntity)
      ) {
        hideTrafficTooltipRef.current()
      }
    }
    const now = performance.now()
    aircraftMotionRef.current = reconcileMotionStates(
      aircraftMotionRef.current,
      aircraft as readonly TrafficEntity[],
      now,
      interpolateTraffic ? interpolationDurationMs : 0,
    )
    vesselMotionRef.current = reconcileMotionStates(
      vesselMotionRef.current,
      vessels as readonly TrafficEntity[],
      now,
      interpolateTraffic ? interpolationDurationMs : 0,
    )
    scheduleRender()
  }, [
    aircraft,
    vessels,
    selectedId,
    interpolateTraffic,
    interpolationDurationMs,
    scheduleRender,
  ])

  useEffect(() => {
    const hoveredTrafficId = hoveredTrafficIdRef.current
    if (!hoveredTrafficId) return
    const hoveredAircraft = aircraft.some(
      (entity) => entity.id === hoveredTrafficId,
    )
    const hoveredVessel = vessels.some(
      (entity) => entity.id === hoveredTrafficId,
    )
    if (
      (hoveredAircraft && !aircraftVisible) ||
      (hoveredVessel && !vesselsVisible)
    ) {
      hideTrafficTooltipRef.current()
    }
  }, [aircraft, aircraftVisible, vessels, vesselsVisible])

  useEffect(() => {
    portRenderStateRef.current = { ports, selectedPortId }
    const map = mapRef.current
    if (!map || !loadedRef.current || ports.length === 0) return
    installPortsStyle(
      map,
      portFeatures(ports, selectedPortId),
      themeRef.current,
      viewStateRef.current.portsVisible,
    )
  }, [ports, selectedPortId])

  useEffect(() => {
    airportRenderStateRef.current = { airports, selectedAirportId }
    const map = mapRef.current
    if (!map || !loadedRef.current || airports.length === 0) return
    installAirportsStyle(
      map,
      airportFeatures(airports, selectedAirportId),
      themeRef.current,
      viewStateRef.current.airportsVisible,
    )
  }, [airports, selectedAirportId])

  useEffect(() => {
    weatherRenderStateRef.current = {
      observations: weatherObservations,
      selectedWeatherId,
    }
    const map = mapRef.current
    if (
      !map ||
      !loadedRef.current ||
      (!weatherVisible && weatherObservations.length === 0)
    ) {
      return
    }
    installWeatherStyle(
      map,
      weatherFeatures(weatherObservations, selectedWeatherId),
      themeRef.current,
      viewStateRef.current.weatherVisible,
    )
  }, [
    selectedWeatherId,
    weatherObservations,
    weatherVisible,
  ])

  useEffect(() => {
    orbitalRenderStateRef.current = {
      positions: orbitalPositions,
      shownIds: orbitalShownIds,
      trackSegments: orbitalTrackSegments,
      selectedOrbitalId,
    }
    const hoveredOrbitalId = hoveredOrbitalIdRef.current
    if (hoveredOrbitalId) {
      const hoveredPosition = orbitalPositions.find(
        (position) => position.id === hoveredOrbitalId,
      )
      if (
        !orbitalVisible ||
        !hoveredPosition ||
        !orbitalShownIds.includes(hoveredOrbitalId) ||
        hoveredOrbitalIdentityRef.current !==
          orbitalTooltipIdentity(hoveredPosition)
      ) {
        hideTrafficTooltipRef.current()
      }
    }
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    if (!map.getSource(SOURCE_ORBITAL_POINTS)) {
      if (!orbitalVisible) return
      const points = orbitalPositionFeatures(orbitalPositions)
      installOrbitalStyle(
        map,
        points,
        orbitalHighlightFeatures(orbitalPositions, selectedOrbitalId),
        orbitalTrackFeatures(orbitalTrackSegments),
        themeRef.current,
        true,
        getOrbitalImages(themeRef.current),
        orbitalShownIds,
      )
      lastOrbitalFeaturesRef.current = points.features
      return
    }
    renderOrbitalSources()
    setOrbitalPointFilter(map, orbitalShownIds)
  }, [
    orbitalPositions,
    orbitalShownIds,
    orbitalTrackSegments,
    orbitalVisible,
    getOrbitalImages,
    renderOrbitalSources,
    selectedOrbitalId,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    for (const layerId of AIRCRAFT_TRAFFIC_LAYER_IDS) {
      setTrafficLayerVisibility(map, layerId, aircraftVisible)
    }
  }, [aircraftVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    for (const layerId of VESSEL_TRAFFIC_LAYER_IDS) {
      setTrafficLayerVisibility(map, layerId, vesselsVisible)
    }
  }, [vesselsVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    setPortsVisibility(map, portsVisible)
  }, [portsVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    setAirportsVisibility(map, airportsVisible)
  }, [airportsVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    setWeatherVisibility(map, weatherVisible)
  }, [weatherVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    if (!map.getSource(SOURCE_ORBITAL_POINTS) && orbitalVisible) {
      const state = orbitalRenderStateRef.current
      const points = orbitalPositionFeatures(state.positions)
      installOrbitalStyle(
        map,
        points,
        orbitalHighlightFeatures(
          state.positions,
          state.selectedOrbitalId,
        ),
        orbitalTrackFeatures(state.trackSegments),
        themeRef.current,
        true,
        getOrbitalImages(themeRef.current),
        state.shownIds,
      )
      lastOrbitalFeaturesRef.current = points.features
      return
    }
    setOrbitalVisibility(map, orbitalVisible)
  }, [getOrbitalImages, orbitalVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    setTrafficSourceData(map, SOURCE_TRAIL, trailData(trailSegments))
  }, [trailSegments])

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
      aria-label={`${
        interpolateTraffic ? 'Live' : 'Historical'
      } traffic map: ${viewLabel}`}
    />
  )
}
