import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { useAppPreferences } from './app/useAppPreferences'
import { useAppShell } from './app/useAppShell'
import { useFullscreen } from './app/useFullscreen'
import { useAircraftTraffic } from './app/useAircraftTraffic'
import { useAircraftMetadata } from './app/useAircraftMetadata'
import { useAircraftPhoto } from './app/useAircraftPhoto'
import { useVesselPhoto } from './app/useVesselPhoto'
import { useFlightRoute } from './app/useFlightRoute'
import { manuallyExploreJourney, resolveJourneyFit, type JourneyOverview } from './app/journeyOverview'
import { MarineJourneyCapture, marineJourneyIdentity } from './app/MarineJourneyCapture'
import { useAirports } from './app/useAirports'
import { LocationCameraIntent } from './app/locationCameraIntent'
import { useMarineTraffic } from './app/useMarineTraffic'
import { useNow } from './app/useNow'
import { useOnlineStatus } from './app/useOnlineStatus'
import { usePlaceSearch } from './app/usePlaceSearch'
import { usePorts } from './app/usePorts'
import { useSessionLocation } from './app/useSessionLocation'
import { useTheme } from './app/useTheme'
import { useTrafficHistory } from './app/useTrafficHistory'
import { useTrailHistory } from './app/useTrailHistory'
import { useWeatherObservations } from './app/useWeatherObservations'
import { useOrbitalObjects } from './app/useOrbitalObjects'
import { OrbitalEnrichmentImageLoader } from './app/OrbitalEnrichmentImageLoader'
import { useOrbitalEnrichmentImage } from './app/useOrbitalEnrichmentImage'
import { isCompactWorkspace, visualViewportCssValues } from './app/visualViewport'
import { preventCompactControlWheelZoom } from './app/controlZoom'
import { AirportDetails } from './components/AirportDetails'
import { HistoryModeNotice } from './components/HistoryModeNotice'
import { JourneyDetails } from './components/JourneyDetails'
import { LocalRulerPlacement } from './components/LocalRulerPlacement'
import { InViewPanel } from './components/InViewPanel'
import { LiveStatus } from './components/LiveStatus'
import { PortDetails } from './components/PortDetails'
import { TrafficControls } from './components/TrafficControls'
import {
  MobileInspectorContext,
  type MobileWorkspaceTask,
  type WorkspaceControlsHandle,
} from './components/mobileWorkspace'
import { TrafficDetails } from './components/TrafficDetails'
import { WeatherObservationDetails } from './components/WeatherObservationDetails'
import { OrbitalDetails } from './components/OrbitalDetails'
import { CapturedOrbitalDetails } from './components/CapturedOrbitalDetails'
import { formatOrbitalSummary } from './components/orbitalSummary'
import {
  APP_CONFIG,
  ZOOM_TRAFFIC_CONTEXT_CONFIG,
} from './config/appConfig'
import type { AppCenter } from './config/appConfig'
import { orderAircraftSearchResults } from './domain/aircraftSearch'
import { airportsInViewport } from './domain/airports'
import {
  aircraftInViewAvailability,
  deriveOrbitalInView,
  vesselInViewAvailability,
} from './domain/inView'
import {
  updateLayerPreference,
  type LayerPreferences,
} from './domain/layerPreferences'
import {
  isNorthResetUseful,
  type MapCameraState,
  type NorthResetRequest,
} from './domain/mapCamera'
import { captureAircraftJourney, type JourneySnapshot } from './domain/journey'
import {
  EMPTY_LOCAL_RULER,
  formatLocalRulerDistance,
  reduceLocalRuler,
  rulerAvailabilityMessage,
  type LocalRulerAction,
  type LocalRulerAvailability,
} from './domain/localRuler'
import type { Coordinates } from './domain/center'
import {
  createShareUrl,
  readBrowserShareState,
} from './domain/shareState'
import type { DisplayTrafficEntity, TrafficEntity } from './domain/traffic'
import {
  trailHistoryConfig,
} from './domain/trailPreferences'
import {
  filterVessels,
  orderVesselSearchResults,
} from './domain/vesselFilters'
import type { ViewportAssessment } from './domain/viewport'
import { INITIAL_BATHYMETRY_STATUS, type BathymetryStatus } from './domain/bathymetry'
import type { BasemapReliefStatus } from './map/basemapRelief'
import type { OrbitalViewport } from './domain/orbitalViewport'
import { orbitalFeatureOwner, type ModeledOrbitalPosition } from './domain/orbital'
import { orbitalViewUnavailableReason, type CapturedOrbitalView } from './domain/orbitalView'
import { orbitalEnrichmentForPosition } from './domain/orbitalEnrichment'
import {
  DEFAULT_ORBITAL_DISCOVERY_FILTERS,
  deriveOrbitalPopulationCounts,
  selectOrbitalDisplay,
  type OrbitalDiscoveryFilters,
} from './domain/orbitalDiscovery'
import { formatTimestamp } from './domain/format'
import {
  displayWeatherObservations,
  selectWeatherStationIds,
} from './domain/weatherObservations'
import {
  mapErrorPresentation,
  type TrafficMapError,
} from './map/mapInitialization'
import { TrafficMap } from './map/TrafficMap'
import type { LocalRulerHandle } from './map/localRulerInteraction'
import {
  trafficZoomContextEntities,
  trafficZoomContextViewport,
  type LastLocalTrafficView,
} from './map/trafficZoomContext'
import type { PlaceSearchResult } from './providers/geocoding/photonProvider'
import { StaticAircraftMetadataProvider } from './providers/aircraftMetadata/staticAircraftMetadataProvider'
import { PlanespottersPhotoProvider } from './providers/aircraftPhoto/planespottersPhotoProvider'
import { OpenWatersPhotoProvider } from './providers/vesselPhoto/openWatersPhotoProvider'
import { StaticAirportsProvider } from './providers/airports/staticAirportsProvider'
import { SameOriginAirportBoardProvider } from './providers/airportBoards/airportBoardProvider'
import { AdsbLolFlightRouteProvider } from './providers/flightRoute/adsbLolFlightRouteProvider'
import { OpenWatersJourneyProvider } from './providers/marine/marineJourneyProvider'
import { DigitrafficJourneyProvider } from './providers/marine/portnetJourneyProvider'
import { BundledMarineRouteProvider } from './providers/marine/marineRouteNetwork'
import { StaticPortsProvider } from './providers/ports/staticPortsProvider'
import { AwcMetarProvider } from './providers/weather/awcMetarProvider'
import { filterTrafficByViewport } from './traffic/filter'
import { displayTraffic } from './traffic/freshness'

interface ViewRequest {
  id: number
  center: AppCenter
  camera?: MapCameraState
  journey?: JourneySnapshot
  cancelled?: boolean
}

const EMPTY_VIEW_OUTPUT = [] as const

const canRestoreFocus = (element: HTMLElement | null) =>
  Boolean(
    element?.isConnected &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility === 'visible' &&
      !element.closest('[inert]') &&
      !element.matches(':disabled, [aria-disabled="true"]'),
  )

function App() {
  const appShellRef = useRef<HTMLElement>(null)
  const workspaceControlsRef = useRef<WorkspaceControlsHandle>(null)
  const rulerMapRef = useRef<LocalRulerHandle>(null)
  const rulerPanelRef = useRef<HTMLElement>(null)
  const rulerTaskOriginRef = useRef(false)
  const [localRuler, setLocalRuler] = useState(EMPTY_LOCAL_RULER)
  const localRulerRef = useRef(EMPTY_LOCAL_RULER)
  const [rulerAvailability, setRulerAvailability] = useState<LocalRulerAvailability>('unsupported')
  const dispatchLocalRuler = useCallback((action: LocalRulerAction) => {
    const previous = localRulerRef.current
    const next = reduceLocalRuler(previous, action)
    if (next === previous) return
    localRulerRef.current = next
    setLocalRuler(next)
  }, [])
  const readLocalRuler = useCallback(() => localRulerRef.current, [])
  const clearLocalRuler = useCallback(() => {
    rulerTaskOriginRef.current = false
    dispatchLocalRuler({ type: 'clear' })
  }, [dispatchLocalRuler])
  const cancelLocalRuler = useCallback(() => {
    if (localRulerRef.current.phase !== 'placing') return
    const restoreTask = rulerTaskOriginRef.current
    rulerTaskOriginRef.current = false
    const active = document.activeElement
    const ownedFocus = active === document.body || active?.matches('.maplibregl-canvas') ||
      Boolean(active && rulerPanelRef.current?.contains(active))
    dispatchLocalRuler({ type: 'cancel' })
    if (restoreTask && workspaceControlsRef.current?.resumeTask()) return
    if (ownedFocus) rulerMapRef.current?.focusMap()
  }, [dispatchLocalRuler])
  const finishLocalRuler = useCallback(() => {
    if (localRulerRef.current.phase !== 'placing' || localRulerRef.current.points.length !== 2) return
    const restoreTask = rulerTaskOriginRef.current
    rulerTaskOriginRef.current = false
    dispatchLocalRuler({ type: 'done' })
    if (restoreTask && workspaceControlsRef.current?.resumeTask()) return
    rulerMapRef.current?.focusMap()
  }, [dispatchLocalRuler])
  const handleRulerPoint = useCallback((point: Coordinates) => {
    dispatchLocalRuler({ type: 'place', point })
  }, [dispatchLocalRuler])
  const handleRulerAvailability = useCallback((availability: LocalRulerAvailability) => {
    setRulerAvailability(availability)
    if (availability === 'unsupported') dispatchLocalRuler({ type: 'unsupported' })
    if (availability === 'available') dispatchLocalRuler({ type: 'supported' })
  }, [dispatchLocalRuler])
  useEffect(() => () => {
    localRulerRef.current = reduceLocalRuler(localRulerRef.current, { type: 'clear' })
  }, [])
  const [mobileWorkspace, setMobileWorkspace] = useState(() =>
    typeof window !== 'undefined' && isCompactWorkspace(
      window.visualViewport ?? { width: window.innerWidth, height: window.innerHeight },
      window.matchMedia('(pointer: coarse)').matches,
    ),
  )
  const [activeWorkspaceTask, setActiveWorkspaceTask] = useState<MobileWorkspaceTask | null>(null)
  const [inspectorExpanded, setInspectorExpanded] = useState(true)
  const [detailsReturnToTask, setDetailsReturnToTask] = useState(false)
  const [sharedState] = useState(() =>
    readBrowserShareState(APP_CONFIG.navigation.coordinatePrecision),
  )
  const [locationCameraIntent] = useState(() => {
    const intent = new LocationCameraIntent()
    if (sharedState?.camera) {
      intent.beginExplicitViewIntent()
    }
    return intent
  })
  const {
    preferences,
    updatePreferences,
    resetPreferences,
    status: preferenceStatus,
  } = useAppPreferences(sharedState?.preferences)
  const {
    layers: layerPreferences,
    trail: trailPreferences,
    theme: themePreference,
    projection: projectionPreference,
    units,
  } = preferences
  const theme = useTheme(themePreference)
  const [aircraftQuery, setAircraftQuery] = useState('')
  const [vesselQuery, setVesselQuery] = useState('')
  const vesselFilters = useMemo(
    () => ({
      query: vesselQuery,
      ...preferences.vesselFilters,
    }),
    [preferences.vesselFilters, vesselQuery],
  )
  const {
    aircraftVisible,
    vesselsVisible,
    portsVisible,
    airportsVisible,
    clusteringEnabled,
    weatherVisible,
    depthsVisible,
    orbitalObjectsVisible,
  } = layerPreferences
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedOrbitalId, setSelectedOrbitalId] = useState<string | null>(
    null,
  )
  const [capturedOrbitalView, setCapturedOrbitalView] = useState<CapturedOrbitalView>()
  const capturedOrbitalViewRef = useRef<CapturedOrbitalView | undefined>(undefined)
  const capturedOrbitalRevisionRef = useRef(0)
  const [capturedOrbitalReady, setCapturedOrbitalReady] = useState(false)
  const [capturedOrbitalPlaying, setCapturedOrbitalPlaying] = useState(false)
  const [capturedOrbitalDisplayedPosition, setCapturedOrbitalDisplayedPosition] =
    useState<Readonly<ModeledOrbitalPosition>>()
  const [orbitalViewMessage, setOrbitalViewMessage] = useState<string>()
  const finishCapturedOrbitalView = useCallback((revision?: number, reason?: string) => {
    const view = capturedOrbitalViewRef.current
    if (!view || revision !== undefined && view.revision !== revision) return
    const active = document.activeElement
    const ownedFocus = active === document.body || active?.matches('.maplibregl-canvas') ||
      active?.closest('.details-panel--orbital-view')
    capturedOrbitalViewRef.current = undefined
    setCapturedOrbitalView(undefined)
    setCapturedOrbitalReady(false)
    setCapturedOrbitalPlaying(false)
    setCapturedOrbitalDisplayedPosition(undefined)
    setOrbitalViewMessage(reason)
    if (ownedFocus) globalThis.requestAnimationFrame(() => {
      if (!capturedOrbitalViewRef.current && document.activeElement === document.body) {
        rulerMapRef.current?.focusMap()
      }
    })
  }, [])
  const handleCapturedOrbitalReady = useCallback((revision: number, ready: boolean) => {
    if (capturedOrbitalViewRef.current?.revision === revision) setCapturedOrbitalReady(ready)
  }, [])
  const handleCapturedOrbitalNotice = useCallback((revision: number, message: string | undefined) => {
    if (capturedOrbitalViewRef.current?.revision === revision) setOrbitalViewMessage(message)
  }, [])
  const handleCapturedOrbitalPosition = useCallback((revision: number, position: Readonly<ModeledOrbitalPosition>) => {
    const view = capturedOrbitalViewRef.current
    if (view?.revision === revision && view.position.id === position.id) {
      setCapturedOrbitalDisplayedPosition(position)
    }
  }, [])
  const handleCapturedOrbitalPause = useCallback((revision: number) => {
    if (capturedOrbitalViewRef.current?.revision === revision) setCapturedOrbitalPlaying(false)
  }, [])
  const toggleCapturedOrbitalPlaying = useCallback((revision: number) => {
    if (capturedOrbitalViewRef.current?.revision === revision) setCapturedOrbitalPlaying(playing => !playing)
  }, [])
  const returnFromCapturedOrbitalView = useCallback(() => finishCapturedOrbitalView(), [finishCapturedOrbitalView])
  const [orbitalFilters, setOrbitalFilters] =
    useState<OrbitalDiscoveryFilters>(
      DEFAULT_ORBITAL_DISCOVERY_FILTERS,
    )
  const orbitalEnrichmentImageLoader = useMemo(
    () =>
      new OrbitalEnrichmentImageLoader(APP_CONFIG.orbital.timeoutMs),
    [],
  )
  const [loadedOrbitalImageUrls, setLoadedOrbitalImageUrls] = useState<
    ReadonlyMap<string, string>
  >(() => new Map())
  const [hoveredAircraftId, setHoveredAircraftId] = useState<string | null>(
    null,
  )
  const [hoveredVesselId, setHoveredVesselId] = useState<string | null>(null)
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null)
  const [catalogSelection, setCatalogSelection] = useState<{
    kind: 'airport' | 'port'
    id: string
    expandMobileDetails: boolean
  } | null>(null)
  const [selectedAirportId, setSelectedAirportId] = useState<string | null>(
    null,
  )
  const [selectedWeatherId, setSelectedWeatherId] = useState<string | null>(
    null,
  )
  const [mapError, setMapError] = useState<TrafficMapError | null>(null)
  const handleMapError = useCallback((error: TrafficMapError | null) => {
    if (error) {
      clearLocalRuler()
      const captured = capturedOrbitalViewRef.current
      if (captured) finishCapturedOrbitalView(captured.revision,
        error.kind === 'runtime' ? error.message : 'The basemap became unavailable. Returned to the previous map.')
    }
    setMapError(error)
  }, [clearLocalRuler, finishCapturedOrbitalView])
  const [bathymetryStatus, setBathymetryStatus] = useState<BathymetryStatus>(INITIAL_BATHYMETRY_STATUS)
  const [reliefVisible, setReliefVisible] = useState(false)
  const [reliefStatus, setReliefStatus] = useState<BasemapReliefStatus>('off')
  const [viewportReport, setViewportReport] = useState<{
    assessment: ViewportAssessment
    orbitalViewport: OrbitalViewport
    rawZoom?: number
    viewRequestId: number
  } | null>(null)
  const [lastLocalTrafficView, setLastLocalTrafficView] =
    useState<LastLocalTrafficView | null>(null)
  const [viewRequest, setViewRequest] = useState<ViewRequest>(() => {
    const camera = sharedState?.camera
    return {
      id: 0,
      center: camera
        ? {
            latitude: camera.latitude,
            longitude: camera.longitude,
            label: 'Shared view',
          }
        : APP_CONFIG.center,
      camera,
    }
  })
  const [viewReady, setViewReady] = useState(Boolean(sharedState?.camera))
  const [activeLocationLabel, setActiveLocationLabel] = useState(() =>
    sharedState?.camera
      ? 'Shared view'
      : `Home: ${APP_CONFIG.center.label}`,
  )
  const [mapCamera, setMapCamera] = useState<MapCameraState>()
  const [northResetRequest, setNorthResetRequest] = useState<NorthResetRequest>()
  const [journey, setJourney] = useState<JourneyOverview>()
  const [journeyMessage, setJourneyMessage] = useState<string>()
  const [journeyPreparing, setJourneyPreparing] = useState(false)
  const [marineJourneyCapture] = useState(() => new MarineJourneyCapture(
    new OpenWatersJourneyProvider(), new DigitrafficJourneyProvider(), new BundledMarineRouteProvider(),
  ))
  const journeyRevisionRef = useRef(0)
  const clearJourney = useCallback(() => {
    journeyRevisionRef.current += 1
    marineJourneyCapture.cancel()
    setJourneyPreparing(false)
    setJourney(undefined)
    setJourneyMessage(undefined)
    setViewRequest(current => current.journey
      ? { ...current, journey: undefined, cancelled: true }
      : current)
  }, [marineJourneyCapture])
  const cancelJourneyPreparation = useCallback(() => {
    if (!marineJourneyCapture.pending) return
    journeyRevisionRef.current += 1
    marineJourneyCapture.cancel()
    setJourneyPreparing(false)
    setJourneyMessage('Path preparation was cancelled. Select Show path to try again.')
  }, [marineJourneyCapture])
  const [shareFeedback, setShareFeedback] = useState<{
    message: string
    manualUrl?: string
  }>()
  const [historyResetRevision, setHistoryResetRevision] = useState(0)
  const returnToLiveRef = useRef<() => void>(() => undefined)
  const mapToolsSummaryRef = useRef<HTMLElement>(null)
  const settingsSummaryRef = useRef<HTMLElement>(null)
  const fullscreenEntryFocusRef = useRef<Element | null>(null)
  const fullscreenExitFocusRef = useRef<HTMLElement | null>(null)
  const restoreFullscreenFocus = useCallback((active: boolean) => {
    const origin = document.activeElement
    if (!active && origin instanceof HTMLElement && origin.id === 'exit-fullscreen-button') {
      fullscreenExitFocusRef.current = origin
    }
  }, [])
  const {
    state: fullscreenState,
    enter: requestFullscreen,
    exit: exitFullscreen,
  } = useFullscreen(appShellRef, restoreFullscreenFocus)
  const enterFullscreen = useCallback(() => {
    fullscreenEntryFocusRef.current = document.activeElement
    requestFullscreen()
  }, [requestFullscreen])
  useLayoutEffect(() => {
    const origin = fullscreenState.active
      ? fullscreenEntryFocusRef.current
      : fullscreenExitFocusRef.current
    fullscreenEntryFocusRef.current = null
    fullscreenExitFocusRef.current = null
    if (!origin || (
      document.activeElement !== origin &&
      document.activeElement !== document.body &&
      document.activeElement !== appShellRef.current
    )) return
    if (fullscreenState.active) {
      const exit = appShellRef.current?.querySelector<HTMLElement>('#exit-fullscreen-button')
      if (exit?.isConnected) exit.focus({ preventScroll: true })
      return
    }
    const summary = settingsSummaryRef.current
    const rect = summary?.getBoundingClientRect()
    const viewport = window.visualViewport
    const summaryVisible = canRestoreFocus(summary) && summary && rect &&
      getComputedStyle(summary).visibility === 'visible' &&
      rect.top >= (viewport?.offsetTop ?? 0) &&
      rect.bottom <= (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)
    const target = summaryVisible
      ? summary
      : appShellRef.current?.querySelector<HTMLElement>('.maplibregl-canvas')
    if (canRestoreFocus(target ?? null)) target?.focus({ preventScroll: true })
  }, [fullscreenState.active])
  const historyPlaybackControlRef = useRef<HTMLInputElement>(null)
  const detailFocusOriginIdRef = useRef<string | null>(null)
  const appliedLocationRevisionRef = useRef(0)
  const airportSelectionGraceUntilRef = useRef(0)
  const location = useSessionLocation(
    APP_CONFIG.center,
    APP_CONFIG.navigation,
  )
  const requestLocation = location.requestLocation
  const {
    state: placeSearchState,
    search: searchPlaces,
    cancel: cancelPlaceSearch,
  } = usePlaceSearch(
    APP_CONFIG.geocoder,
    APP_CONFIG.navigation.coordinatePrecision,
  )
  const now = useNow()
  const online = useOnlineStatus()
  useEffect(() => {
    const pause = () => {
      if (document.hidden || !navigator.onLine || !online) cancelJourneyPreparation()
    }
    pause()
    document.addEventListener('visibilitychange', pause)
    window.addEventListener('offline', pause)
    return () => {
      document.removeEventListener('visibilitychange', pause)
      window.removeEventListener('offline', pause)
    }
  }, [cancelJourneyPreparation, online])
  useEffect(() => () => marineJourneyCapture.cancel(), [marineJourneyCapture])
  const appShell = useAppShell()
  const setLayerPreference = useCallback(
    (key: keyof LayerPreferences, value: boolean) => {
      updatePreferences((current) => ({
        ...current,
        layers: updateLayerPreference(current.layers, key, value),
      }))
    },
    [updatePreferences],
  )
  const setAircraftVisible = useCallback(
    (visible: boolean) =>
      setLayerPreference('aircraftVisible', visible),
    [setLayerPreference],
  )
  const setVesselsVisible = useCallback(
    (visible: boolean) =>
      setLayerPreference('vesselsVisible', visible),
    [setLayerPreference],
  )
  const setPortsVisible = useCallback(
    (visible: boolean) => setLayerPreference('portsVisible', visible),
    [setLayerPreference],
  )
  const setAirportsVisible = useCallback(
    (visible: boolean) =>
      setLayerPreference('airportsVisible', visible),
    [setLayerPreference],
  )
  const setClusteringEnabled = useCallback(
    (enabled: boolean) =>
      setLayerPreference('clusteringEnabled', enabled),
    [setLayerPreference],
  )
  const setWeatherVisible = useCallback(
    (visible: boolean) => setLayerPreference('weatherVisible', visible),
    [setLayerPreference],
  )
  const setDepthsVisible = useCallback(
    (visible: boolean) => setLayerPreference('depthsVisible', visible),
    [setLayerPreference],
  )
  const setOrbitalObjectsVisible = useCallback(
    (visible: boolean) => {
      if (!visible) finishCapturedOrbitalView()
      if (!visible) setSelectedOrbitalId(null)
      setLayerPreference('orbitalObjectsVisible', visible)
    },
    [finishCapturedOrbitalView, setLayerPreference],
  )
  const setTrailPreferences = useCallback(
    (trail: typeof trailPreferences) => {
      updatePreferences((current) => ({ ...current, trail }))
    },
    [updatePreferences],
  )
  const setThemePreference = useCallback(
    (nextTheme: typeof themePreference) => {
      updatePreferences((current) => ({
        ...current,
        theme: nextTheme,
      }))
    },
    [updatePreferences],
  )
  const setUnits = useCallback(
    (nextUnits: typeof units) => {
      updatePreferences((current) => ({
        ...current,
        units: nextUnits,
      }))
    },
    [updatePreferences],
  )
  const setProjectionPreference = useCallback(
    (nextProjection: typeof projectionPreference) => {
      if (nextProjection !== 'auto') finishCapturedOrbitalView()
      updatePreferences((current) => ({
        ...current,
        projection: nextProjection,
      }))
    },
    [finishCapturedOrbitalView, updatePreferences],
  )
  const setVesselFilters = useCallback(
    (nextFilters: typeof vesselFilters) => {
      setVesselQuery(nextFilters.query)
      const {
        query: _query,
        ...nextStructuredFilters
      } = nextFilters
      const current = preferences.vesselFilters
      if (
        nextStructuredFilters.category === current.category &&
        nextStructuredFilters.navigation === current.navigation &&
        nextStructuredFilters.reportedSpeed === current.reportedSpeed &&
        nextStructuredFilters.minimumLengthMeters ===
          current.minimumLengthMeters &&
        nextStructuredFilters.maximumLengthMeters ===
          current.maximumLengthMeters &&
        nextStructuredFilters.includeUnknownLength ===
          current.includeUnknownLength
      ) {
        return
      }
      updatePreferences((currentPreferences) => ({
        ...currentPreferences,
        vesselFilters: nextStructuredFilters,
      }))
    },
    [preferences.vesselFilters, updatePreferences],
  )
  const aircraftMetadataProvider = useMemo(
    () => new StaticAircraftMetadataProvider(APP_CONFIG.aircraftMetadata),
    [],
  )
  const aircraftPhotoProvider = useMemo(
    () => new PlanespottersPhotoProvider(APP_CONFIG.aircraftPhoto),
    [],
  )
  const vesselPhotoProvider = useMemo(() => new OpenWatersPhotoProvider(), [])
  const flightRouteProvider = useMemo(
    () => new AdsbLolFlightRouteProvider(APP_CONFIG.flightRoute),
    [],
  )
  const portsProvider = useMemo(
    () => new StaticPortsProvider(APP_CONFIG.ports),
    [],
  )
  const [portsRequestedForFind, setPortsRequestedForFind] = useState(false)
  const [airportsRequestedForFind, setAirportsRequestedForFind] = useState(false)
  const portsResult = usePorts(portsVisible || portsRequestedForFind, portsProvider)
  const airportsProvider = useMemo(
    () => new StaticAirportsProvider(APP_CONFIG.airports),
    [],
  )
  const airportBoardProvider = useMemo(() => new SameOriginAirportBoardProvider(), [])
  const airportsResult = useAirports(
    airportsVisible || weatherVisible || airportsRequestedForFind,
    airportsProvider,
  )
  const handleLoadPorts = useCallback(() => {
    setPortsRequestedForFind(true)
    if (portsResult.state.phase === 'error') portsResult.retry()
  }, [portsResult.state.phase, portsResult.retry])
  const handleLoadAirports = useCallback(() => {
    setAirportsRequestedForFind(true)
    if (airportsResult.state.phase === 'error') airportsResult.retry()
  }, [airportsResult.state.phase, airportsResult.retry])
  const weatherProvider = useMemo(
    () => new AwcMetarProvider(APP_CONFIG.weather),
    [],
  )

  const commitNavigation = useCallback(
    (
      center: AppCenter,
      label: string,
      options: { explicit?: boolean; camera?: MapCameraState } = {},
    ) => {
      finishCapturedOrbitalView()
      setOrbitalViewMessage(undefined)
      clearLocalRuler()
      clearJourney()
      returnToLiveRef.current()
      cancelPlaceSearch()
      if (options.explicit !== false) {
        locationCameraIntent.beginExplicitViewIntent()
      }
      detailFocusOriginIdRef.current = null
      setSelectedId(null)
      setSelectedOrbitalId(null)
      setSelectedPortId(null)
      setSelectedAirportId(null)
      setCatalogSelection(null)
      setSelectedWeatherId(null)
      setHistoryResetRevision((current) => current + 1)
      setViewportReport(null)
      setLastLocalTrafficView(null)
      setViewReady(true)
      setActiveLocationLabel(label)
      setViewRequest((current) => ({
        id: current.id + 1,
        center: { ...center, label },
        camera: options.camera,
      }))
    },
    [cancelPlaceSearch, clearJourney, clearLocalRuler, finishCapturedOrbitalView, locationCameraIntent],
  )

  useEffect(() => {
    if (
      !location.initialReady ||
      location.revision <= appliedLocationRevisionRef.current
    ) {
      return
    }

    appliedLocationRevisionRef.current = location.revision
    setViewReady(true)
    const shouldNavigate = locationCameraIntent.consumeLocationResult()
    if (shouldNavigate) {
      commitNavigation(
        location.homeCenter,
        `Home: ${location.homeCenter.label}`,
        { explicit: false },
      )
    }
  }, [
    commitNavigation,
    location.initialReady,
    location.homeCenter,
    location.revision,
    locationCameraIntent,
  ])

  useEffect(() => {
    if (
      !location.locating &&
      location.phase === 'error'
    ) {
      locationCameraIntent.cancelRequestedLocationNavigation()
    }
  }, [location.locating, location.phase, locationCameraIntent])

  const currentAssessment =
    viewportReport?.viewRequestId === viewRequest.id
      ? viewportReport.assessment
      : null
  const currentOrbitalViewport =
    viewReady && viewportReport?.viewRequestId === viewRequest.id
      ? viewportReport.orbitalViewport
      : undefined
  const currentOrbitalRawZoom =
    viewReady && viewportReport?.viewRequestId === viewRequest.id
      ? viewportReport.rawZoom
      : undefined
  const activeViewport =
    viewReady && currentAssessment?.kind === 'eligible'
      ? currentAssessment.viewport
      : null
  const contextViewport =
    viewReady && currentAssessment
      ? currentAssessment.kind === 'eligible'
        ? currentAssessment.viewport
        : currentAssessment.viewport ?? null
      : null
  const trafficQuery = useMemo(
    () =>
      activeViewport
        ? {
            center: activeViewport.center,
            radiusKm: activeViewport.enclosingRadiusKm,
          }
        : null,
    [activeViewport],
  )
  const aircraftResult = useAircraftTraffic(trafficQuery, APP_CONFIG.aircraft, capturedOrbitalView !== undefined)
  const marineResult = useMarineTraffic(trafficQuery, APP_CONFIG.marine, capturedOrbitalView !== undefined)
  const liveViewportAircraft = useMemo(
    () =>
      activeViewport
        ? filterTrafficByViewport(aircraftResult.entities, activeViewport)
        : [],
    [activeViewport, aircraftResult.entities],
  )
  const liveViewportVessels = useMemo(
    () =>
      activeViewport
        ? filterTrafficByViewport(marineResult.entities, activeViewport)
        : [],
    [activeViewport, marineResult.entities],
  )
  const sourceEntities = useMemo<TrafficEntity[]>(
    () => [...liveViewportAircraft, ...liveViewportVessels],
    [liveViewportAircraft, liveViewportVessels],
  )
  const history = useTrafficHistory(
    sourceEntities,
    historyResetRevision,
    APP_CONFIG.history,
  )
  const {
    enterHistory,
    returnToLive,
  } = history
  useEffect(() => {
    returnToLiveRef.current = returnToLive
  }, [returnToLive])
  const historyActive = history.playback.mode !== 'live'
  const orbitalResult = useOrbitalObjects(
    orbitalObjectsVisible,
    historyActive,
    online,
    currentOrbitalViewport,
    selectedOrbitalId,
    orbitalFilters,
    APP_CONFIG.orbital,
    {
      enabled: orbitalObjectsVisible && !historyActive,
      config: APP_CONFIG.starlink,
    },
    capturedOrbitalView?.revision,
    capturedOrbitalPlaying ? capturedOrbitalView?.position.id : undefined,
  )
  const orbitalState = orbitalResult.state
  const starlinkState = orbitalResult.starlinkState
  const acceptedOrbitalPositionForCapture = orbitalResult.acceptedPositionForCapture
  const capturedOrbitalState = capturedOrbitalView && (
    orbitalFeatureOwner(capturedOrbitalView.position.id) === 'starlink' ? starlinkState : orbitalState
  )
  const capturedGenerationMatches = Boolean(capturedOrbitalView && capturedOrbitalState?.snapshot &&
    capturedOrbitalState.snapshot.sha256 === capturedOrbitalView.snapshot.sha256 &&
    capturedOrbitalState.snapshot.retrievedAt === capturedOrbitalView.snapshot.retrievedAt &&
    capturedOrbitalState.snapshot.catalogId === capturedOrbitalView.snapshot.catalogId)
  const capturedOrbitalAcknowledged = Boolean(capturedOrbitalView && capturedGenerationMatches &&
    capturedOrbitalState?.phase === 'paused-capture' &&
    (!capturedOrbitalPlaying || capturedOrbitalState.viewPosition?.id === capturedOrbitalView.position.id) &&
    orbitalState.capturePauseRevision === capturedOrbitalView.revision &&
    starlinkState.capturePauseRevision === capturedOrbitalView.revision)
  useEffect(() => {
    if (!capturedOrbitalView || !capturedOrbitalState ||
      capturedOrbitalState.capturePauseRevision !== capturedOrbitalView.revision) return
    if (capturedGenerationMatches && ['paused-capture', 'paused-hidden'].includes(capturedOrbitalState.phase)) return
    finishCapturedOrbitalView(capturedOrbitalView.revision,
      capturedGenerationMatches
        ? `${capturedOrbitalState.message ?? 'The captured model is no longer valid.'} Returned to the previous map.`
        : 'The captured catalog generation changed. Returned to the previous map.')
  }, [capturedGenerationMatches, capturedOrbitalState, capturedOrbitalView, finishCapturedOrbitalView])
  const selectedOrbitalOwner = orbitalFeatureOwner(selectedOrbitalId)
  const orbitalDiscovery = useMemo(() => {
    const display = selectOrbitalDisplay(
      orbitalState.positions,
      orbitalFilters,
      currentOrbitalRawZoom,
      selectedOrbitalOwner === 'curated'
        ? selectedOrbitalId
        : null,
      {
        ...APP_CONFIG.orbital.display,
        maximumRecords: APP_CONFIG.orbital.maximumRecords,
      },
    )
    return {
      display,
      counts: deriveOrbitalPopulationCounts(
        orbitalState,
        orbitalFilters,
        display,
        currentOrbitalViewport,
      ),
    }
  }, [
    currentOrbitalRawZoom,
    currentOrbitalViewport,
    orbitalFilters,
    orbitalState,
    selectedOrbitalId,
    selectedOrbitalOwner,
  ])
  const orbitalDisplay = orbitalDiscovery.display
  const orbitalCounts = orbitalDiscovery.counts
  const starlinkDiscovery = useMemo(() => {
    const display = selectOrbitalDisplay(
      starlinkState.positions,
      DEFAULT_ORBITAL_DISCOVERY_FILTERS,
      currentOrbitalRawZoom,
      selectedOrbitalOwner === 'starlink'
        ? selectedOrbitalId
        : null,
      {
        worldMaximumZoom: APP_CONFIG.orbital.display.worldMaximumZoom,
        midMaximumZoom: APP_CONFIG.orbital.display.midMaximumZoom,
        worldLimit: APP_CONFIG.orbital.display.worldLimit,
        midLimit: APP_CONFIG.orbital.display.midLimit,
        maximumRecords: APP_CONFIG.starlink.maximumRecords,
      },
    )
    return {
      display,
      counts: deriveOrbitalPopulationCounts(
        starlinkState,
        DEFAULT_ORBITAL_DISCOVERY_FILTERS,
        display,
        currentOrbitalViewport,
      ),
    }
  }, [
    currentOrbitalRawZoom,
    currentOrbitalViewport,
    selectedOrbitalId,
    selectedOrbitalOwner,
    starlinkState,
  ])
  const starlinkDisplay = starlinkDiscovery.display
  const starlinkCounts = starlinkDiscovery.counts
  const orbitsInView = useMemo(
    () =>
      deriveOrbitalInView({
        enabled: orbitalObjectsVisible,
        historyActive,
        curated: { state: orbitalState, display: orbitalDisplay },
        starlink: { state: starlinkState, display: starlinkDisplay },
        viewport: currentOrbitalViewport,
        selectedId: selectedOrbitalId,
      }),
    [
      orbitalObjectsVisible,
      historyActive,
      orbitalState,
      orbitalDisplay,
      starlinkState,
      starlinkDisplay,
      currentOrbitalViewport,
      selectedOrbitalId,
    ],
  )
  const historicalViewportEntities = useMemo(
    () =>
      activeViewport
        ? filterTrafficByViewport(
            history.historicalEntities,
            activeViewport,
          )
        : [],
    [activeViewport, history.historicalEntities],
  )
  const viewportAircraft = useMemo(
    () =>
      historyActive
        ? historicalViewportEntities.filter(
            (entity): entity is Extract<TrafficEntity, { kind: 'aircraft' }> =>
              entity.kind === 'aircraft',
          )
        : liveViewportAircraft,
    [historicalViewportEntities, historyActive, liveViewportAircraft],
  )
  const viewportVessels = useMemo(
    () =>
      historyActive
        ? historicalViewportEntities.filter(
            (entity): entity is Extract<TrafficEntity, { kind: 'vessel' }> =>
              entity.kind === 'vessel',
          )
        : liveViewportVessels,
    [historicalViewportEntities, historyActive, liveViewportVessels],
  )
  const displayNow =
    history.playback.mode === 'live' ? now : history.playback.cursor

  const aircraft = useMemo(
    () => displayTraffic(viewportAircraft, displayNow, APP_CONFIG.aircraft),
    [displayNow, viewportAircraft],
  )
  const aircraftResults = useMemo(
    () => orderAircraftSearchResults(aircraft, aircraftQuery),
    [aircraft, aircraftQuery],
  )
  const currentVessels = useMemo(
    () => displayTraffic(viewportVessels, displayNow, APP_CONFIG.marine),
    [displayNow, viewportVessels],
  )
  const vessels = useMemo(
    () =>
      filterVessels(currentVessels, vesselFilters, {
        displayTime: displayNow,
        expireAfterMs: APP_CONFIG.marine.expireAfterMs,
      }),
    [currentVessels, displayNow, vesselFilters],
  )
  const vesselResults = useMemo(
    () => orderVesselSearchResults(vessels, vesselFilters.query),
    [vesselFilters.query, vessels],
  )
  const zoomContextViewport = trafficZoomContextViewport(
    lastLocalTrafficView,
    currentAssessment,
    currentOrbitalRawZoom,
    viewRequest.id,
    viewReady && online && !historyActive,
  )
  const contextAircraft = useMemo(
    () =>
      trafficZoomContextEntities(
        aircraftResult.entities,
        zoomContextViewport,
        now,
        APP_CONFIG.aircraft,
      ),
    [aircraftResult.entities, now, zoomContextViewport],
  )
  const contextVessels = useMemo(
    () =>
      filterVessels(
        trafficZoomContextEntities(
          marineResult.entities,
          zoomContextViewport,
          now,
          APP_CONFIG.marine,
        ),
        vesselFilters,
        {
          displayTime: now,
          expireAfterMs: ZOOM_TRAFFIC_CONTEXT_CONFIG.maximumAgeMs,
        },
      ),
    [marineResult.entities, now, vesselFilters, zoomContextViewport],
  )
  const trafficContext = zoomContextViewport !== null
  const hasTrafficContext =
    trafficContext &&
    currentOrbitalRawZoom !== undefined &&
    currentOrbitalRawZoom > ZOOM_TRAFFIC_CONTEXT_CONFIG.minimumZoom &&
    ((aircraftVisible && contextAircraft.length > 0) ||
      (vesselsVisible && contextVessels.length > 0))
  const ports = useMemo(
    () =>
      portsResult.state.phase === 'ready'
        ? portsResult.state.dataset.ports
        : [],
    [portsResult.state],
  )
  const airports = useMemo(
    () =>
      airportsResult.state.phase === 'ready'
        ? airportsResult.state.dataset.airports
        : [],
    [airportsResult.state],
  )
  const visibleAirports = useMemo(
    () =>
      contextViewport
        ? airportsInViewport(airports, contextViewport)
        : [],
    [airports, contextViewport],
  )
  const weatherStations = useMemo(
    () =>
      activeViewport
        ? airportsInViewport(airports, activeViewport)
        : [],
    [activeViewport, airports],
  )
  const weatherStationSelection = useMemo(
    () =>
      selectWeatherStationIds(
        weatherStations,
        APP_CONFIG.weather.maximumStations,
      ),
    [weatherStations],
  )
  const weatherStationIds =
    weatherStationSelection.kind === 'ready'
      ? weatherStationSelection.stationIds
      : []
  const weatherStationKey = weatherStationIds.join(',')
  const weatherQueryEnabled =
    !historyActive &&
    weatherVisible &&
    Boolean(activeViewport) &&
    airportsResult.state.phase === 'ready' &&
    weatherStationSelection.kind === 'ready'
  const weatherResult = useWeatherObservations(
    weatherQueryEnabled,
    weatherStationIds,
    weatherProvider,
    now,
    APP_CONFIG.weather.requestCooldownMs,
  )
  const weatherDataset =
    weatherQueryEnabled &&
    weatherResult.state.phase === 'ready' &&
    weatherResult.state.stationKey === weatherStationKey
      ? weatherResult.state.dataset
      : undefined
  const weatherObservations = useMemo(
    () =>
      !historyActive && weatherDataset
        ? displayWeatherObservations(
            weatherDataset.observations,
            now,
            APP_CONFIG.weather.staleAfterMs,
            APP_CONFIG.weather.expireAfterMs,
          )
        : [],
    [
      historyActive,
      now,
      weatherDataset,
    ],
  )
  const displayEntities = useMemo<DisplayTrafficEntity[]>(
    () => [...aircraft, ...vessels],
    [aircraft, vessels],
  )
  const selectedEntity = useMemo(
    () => displayEntities.find((entity) => entity.id === selectedId),
    [displayEntities, selectedId],
  )
  const hoveredAircraft = useMemo(
    () => aircraft.find((entity) => entity.id === hoveredAircraftId),
    [aircraft, hoveredAircraftId],
  )
  const hoveredVessel = useMemo(
    () => vessels.find((entity) => entity.id === hoveredVesselId),
    [vessels, hoveredVesselId],
  )
  const selectedPort = useMemo(
    () => ports.find((port) => port.id === selectedPortId),
    [ports, selectedPortId],
  )
  const selectedAirport = useMemo(
    () => airports.find((airport) => airport.id === selectedAirportId),
    [airports, selectedAirportId],
  )
  const selectedWeather = useMemo(
    () =>
      weatherObservations.find(
        (observation) => observation.id === selectedWeatherId,
      ),
    [selectedWeatherId, weatherObservations],
  )
  const selectedOrbitalPosition = useMemo(
    () => {
      const positions =
        selectedOrbitalOwner === 'starlink'
          ? starlinkState.positions
          : orbitalState.positions
      return positions.find(
        (position) => position.id === selectedOrbitalId,
      )
    },
    [
      orbitalState.positions,
      selectedOrbitalId,
      selectedOrbitalOwner,
      starlinkState.positions,
    ],
  )
  const selectedOrbitalState =
    selectedOrbitalOwner === 'starlink'
      ? starlinkState
      : orbitalState
  const selectedOrbitalCounts =
    selectedOrbitalOwner === 'starlink'
      ? starlinkCounts
      : orbitalCounts
  const selectedOrbitalDisplay =
    selectedOrbitalOwner === 'starlink'
      ? starlinkDisplay
      : orbitalDisplay
  const selectedOrbitalCrossing = useMemo(
    () =>
      selectedOrbitalCounts.futureCrossingCount === undefined
        ? undefined
        : selectedOrbitalState.prediction.results.find(
            (crossing) => crossing.id === selectedOrbitalId,
          ),
    [
      selectedOrbitalCounts.futureCrossingCount,
      selectedOrbitalState.prediction.results,
      selectedOrbitalId,
    ],
  )
  const selectedOrbitalEnrichment = useMemo(
    () =>
      selectedOrbitalOwner === 'curated' && selectedOrbitalPosition
        ? orbitalEnrichmentForPosition(selectedOrbitalPosition)
        : undefined,
    [selectedOrbitalOwner, selectedOrbitalPosition],
  )
  const selectedOrbitalImageState = useOrbitalEnrichmentImage(
    selectedOrbitalEnrichment,
    orbitalEnrichmentImageLoader,
  )
  const aircraftMetadata = useAircraftMetadata(
    !capturedOrbitalView && !historyActive && selectedEntity?.kind === 'aircraft'
      ? selectedEntity
      : undefined,
    aircraftMetadataProvider,
    displayNow,
  )
  const aircraftPhotoFeatureEnabled =
    APP_CONFIG.aircraftPhoto.enabled && !historyActive && !capturedOrbitalView
  const aircraftPhotoEnabled =
    aircraftPhotoFeatureEnabled && selectedEntity?.kind === 'aircraft'
  const aircraftPhoto = useAircraftPhoto(
    aircraftPhotoEnabled ? selectedEntity : undefined,
    aircraftPhotoProvider,
    APP_CONFIG.aircraftPhoto,
    { automaticRequestDelayMs: 0 },
  )
  const hoveredAircraftPhoto = useAircraftPhoto(
    aircraftPhotoFeatureEnabled ? hoveredAircraft : undefined,
    aircraftPhotoProvider,
    APP_CONFIG.aircraftPhoto,
    {
      automaticRequestDelayMs: 0,
    },
  )
  const vesselPhoto = useVesselPhoto(
    !capturedOrbitalView && !historyActive && selectedEntity?.kind === 'vessel' ? selectedEntity : undefined,
    vesselPhotoProvider,
  )
  const hoveredVesselPhoto = useVesselPhoto(
    !capturedOrbitalView && !historyActive ? hoveredVessel : undefined,
    vesselPhotoProvider,
  )
  const flightRouteEnabled =
    APP_CONFIG.flightRoute.enabled &&
    !capturedOrbitalView &&
    !historyActive &&
    selectedEntity?.kind === 'aircraft'
  const flightRoute = useFlightRoute(
    flightRouteEnabled ? selectedEntity : undefined,
    flightRouteProvider,
    APP_CONFIG.flightRoute,
  )
  const trailDurationMinutes = trailPreferences.durationMinutes
  const activeTrailConfig = useMemo(
    () =>
      trailHistoryConfig(
        { durationMinutes: trailDurationMinutes },
        APP_CONFIG.trail,
      ),
    [trailDurationMinutes],
  )
  const liveTrail = useTrailHistory(
    sourceEntities,
    selectedId,
    now,
    activeTrailConfig,
    historyResetRevision,
  )
  const buildHistoricalTrailSegments = history.trailSegments
  const historicalTrailSegments = useMemo(
    () =>
      buildHistoricalTrailSegments(
        selectedId,
        activeTrailConfig.durationMs,
      ),
    [
      activeTrailConfig.durationMs,
      buildHistoricalTrailSegments,
      selectedId,
    ],
  )
  const trailSegments = useMemo(
    () => {
      if (!activeViewport || !trailPreferences.visible) return []
      if (historyActive) return historicalTrailSegments
      return liveTrail.length > 0 ? [liveTrail] : []
    },
    [
      activeViewport,
      historicalTrailSegments,
      historyActive,
      liveTrail,
      trailPreferences.visible,
    ],
  )

  useEffect(() => {
    if (!selectedId) return
    if (
      !selectedEntity ||
      (selectedEntity.kind === 'aircraft' && !aircraftVisible) ||
      (selectedEntity.kind === 'vessel' && !vesselsVisible)
    ) {
      setSelectedId(null)
    }
  }, [aircraftVisible, selectedEntity, selectedId, vesselsVisible])

  useEffect(() => {
    if (!portsVisible && selectedPortId &&
      !(catalogSelection?.kind === 'port' && catalogSelection.id === selectedPortId)) setSelectedPortId(null)
  }, [catalogSelection, portsVisible, selectedPortId])

  useEffect(() => {
    if (!airportsVisible && selectedAirportId &&
      !(catalogSelection?.kind === 'airport' && catalogSelection.id === selectedAirportId)) setSelectedAirportId(null)
  }, [airportsVisible, catalogSelection, selectedAirportId])

  useEffect(() => {
    if (!weatherVisible && selectedWeatherId) setSelectedWeatherId(null)
  }, [selectedWeatherId, weatherVisible])

  useEffect(() => {
    if (!selectedOrbitalId) return
    if (
      !orbitalObjectsVisible ||
      historyActive ||
      selectedOrbitalState.phase === 'unavailable' ||
      selectedOrbitalState.phase === 'clock-invalid' ||
      (!selectedOrbitalPosition &&
        selectedOrbitalState.phase !== 'paused-hidden' &&
        selectedOrbitalState.phase !== 'loading' &&
        selectedOrbitalState.phase !== 'refreshing')
    ) {
      setSelectedOrbitalId(null)
    }
  }, [
    historyActive,
    orbitalObjectsVisible,
    selectedOrbitalId,
    selectedOrbitalPosition,
    selectedOrbitalState.phase,
  ])

  useEffect(() => {
    if (selectedPortId && !selectedPort) setSelectedPortId(null)
  }, [selectedPort, selectedPortId])

  useEffect(() => {
    if (!selectedAirportId) return
    if (!selectedAirport) {
      setSelectedAirportId(null)
      return
    }
    if (catalogSelection?.kind === 'airport' &&
      catalogSelection.id === selectedAirportId &&
      viewportReport?.viewRequestId !== viewRequest.id) return
    if (
      contextViewport &&
      visibleAirports.some(({ id }) => id === selectedAirportId)
    ) {
      return
    }

    const delayMs = Math.max(
      0,
      airportSelectionGraceUntilRef.current - Date.now(),
    )
    if (delayMs === 0) {
      setSelectedAirportId(null)
      return
    }
    const timeout = window.setTimeout(() => {
      setSelectedAirportId((current) =>
        current === selectedAirportId ? null : current,
      )
    }, delayMs)
    return () => window.clearTimeout(timeout)
  }, [
    catalogSelection,
    contextViewport,
    selectedAirport,
    selectedAirportId,
    viewportReport?.viewRequestId,
    viewRequest.id,
    visibleAirports,
  ])

  useEffect(() => {
    if (selectedWeatherId && !selectedWeather) {
      setSelectedWeatherId(null)
    }
  }, [selectedWeather, selectedWeatherId])

  const handleViewportChange = useCallback(
    (
      assessment: ViewportAssessment,
      orbitalViewport: OrbitalViewport,
      rawZoom: number | undefined,
      reportViewRequestId: number,
    ) => {
      setViewportReport({
        assessment,
        orbitalViewport,
        rawZoom,
        viewRequestId: reportViewRequestId,
      })
      if (
        reportViewRequestId === viewRequest.id &&
        assessment.kind === 'eligible' &&
        rawZoom !== undefined &&
        Number.isFinite(rawZoom)
      ) {
        setLastLocalTrafficView({
          viewport: assessment.viewport,
          zoom: rawZoom,
          viewRequestId: reportViewRequestId,
        })
      }
    },
    [viewRequest.id],
  )

  const handleCenter = useCallback(() => {
    commitNavigation(
      location.homeCenter,
      `Home: ${location.homeCenter.label}`,
    )
  }, [commitNavigation, location.homeCenter])

  const handleResetNorth = useCallback(() => {
    locationCameraIntent.beginExplicitViewIntent()
    cancelJourneyPreparation()
    setJourney(manuallyExploreJourney)
    setViewRequest(current => current.journey
      ? { ...current, cancelled: true }
      : current)
    setNorthResetRequest(current => ({
      revision: (current?.revision ?? 0) + 1,
      viewRequestId: viewRequest.id,
    }))
  }, [cancelJourneyPreparation, locationCameraIntent, viewRequest.id])

  const handleResumeLiveTraffic = useCallback(() => {
    if (
      currentAssessment?.kind !== 'ineligible' ||
      !currentAssessment.viewport
    ) {
      return
    }
    commitNavigation(
      {
        ...currentAssessment.viewport.center,
        label: 'Current map area',
      },
      'Current map area',
    )
  }, [commitNavigation, currentAssessment])

  const handleUseLocation = useCallback(() => {
    finishCapturedOrbitalView()
    clearJourney()
    locationCameraIntent.requestLocationNavigation()
    cancelPlaceSearch()
    requestLocation()
  }, [cancelPlaceSearch, clearJourney, finishCapturedOrbitalView, locationCameraIntent, requestLocation])

  const handlePlaceSearch = useCallback(
    (query: string) => {
      clearJourney()
      locationCameraIntent.beginExplicitViewIntent()
      setViewReady(true)
      searchPlaces(query)
    },
    [clearJourney, locationCameraIntent, searchPlaces],
  )

  const handleLocationNavigate = useCallback(
    (center: AppCenter) => {
      commitNavigation(center, center.label)
    },
    [commitNavigation],
  )

  const handlePlaceResultSelect = useCallback(
    (result: PlaceSearchResult) => {
      commitNavigation(result.center, result.label)
    },
    [commitNavigation],
  )

  const handleManualViewChange = useCallback(() => {
    if (capturedOrbitalViewRef.current) return
    cancelJourneyPreparation()
    locationCameraIntent.beginExplicitViewIntent()
    cancelPlaceSearch()
    setViewReady(true)
    setActiveLocationLabel('Custom view')
    setJourney(manuallyExploreJourney)
    setViewRequest(current => current.journey
      ? { ...current, cancelled: true }
      : current)
  }, [cancelJourneyPreparation, cancelPlaceSearch, locationCameraIntent])

  const handleShare = useCallback(() => {
    if (!mapCamera) return
    const url = createShareUrl(
      window.location,
      mapCamera,
      preferences,
      APP_CONFIG.navigation.coordinatePrecision,
    )
    const clipboard = window.navigator.clipboard
    if (!clipboard?.writeText) {
      setShareFeedback({
        message: 'Clipboard access is unavailable. Copy the link below.',
        manualUrl: url,
      })
      return
    }
    void clipboard.writeText(url).then(
      () => {
        setShareFeedback({ message: 'Share link copied.' })
      },
      () => {
        setShareFeedback({
          message: 'The share link could not be copied. Copy it below.',
          manualUrl: url,
        })
      },
    )
  }, [mapCamera, preferences])

  const handleResetPreferences = useCallback(() => {
    finishCapturedOrbitalView()
    resetPreferences()
    setReliefVisible(false)
    setShareFeedback(undefined)
    const url = new URL(window.location.href)
    if (!url.hash) return
    url.hash = ''
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}`,
    )
  }, [finishCapturedOrbitalView, resetPreferences])

  const focusAfterRender = useCallback(
    (
      originId: string | null,
      fallback: 'map-tools' | 'settings' = 'map-tools',
    ) => {
      globalThis.requestAnimationFrame(() => {
        const origin = originId
          ? document.getElementById(originId)
          : null
        const inViewOrigin = originId?.startsWith('in-view-')
        const inViewSummary = inViewOrigin
          ? document.getElementById('in-view-summary')
          : null
        const fallbackTarget = canRestoreFocus(inViewSummary)
          ? inViewSummary
          : fallback === 'settings' || inViewOrigin
            ? settingsSummaryRef.current
            : mapToolsSummaryRef.current
        const target = canRestoreFocus(origin) ? origin : fallbackTarget
        if (canRestoreFocus(target)) target?.focus()
      })
    },
    [],
  )

  const selectTraffic = useCallback(
    (id: string | null, originId: string | null) => {
      finishCapturedOrbitalView()
      clearJourney()
      detailFocusOriginIdRef.current = id ? originId : null
      setSelectedOrbitalId(null)
      setSelectedPortId(null)
      setSelectedAirportId(null)
      setSelectedWeatherId(null)
      setSelectedId(id)
    },
    [clearJourney, finishCapturedOrbitalView],
  )

  const handleMapTrafficSelect = useCallback(
    (id: string | null) => selectTraffic(id, null),
    [selectTraffic],
  )
  const handleAircraftDiscoverySelect = useCallback(
    (id: string, originId: string) => selectTraffic(id, originId),
    [selectTraffic],
  )
  const handleVesselDiscoverySelect = useCallback(
    (id: string, originId: string) => selectTraffic(id, originId),
    [selectTraffic],
  )

  const handleMapPortSelect = useCallback((id: string | null) => {
    finishCapturedOrbitalView()
    clearJourney()
    detailFocusOriginIdRef.current = null
    setSelectedId(null)
    setSelectedOrbitalId(null)
    setSelectedAirportId(null)
    setSelectedWeatherId(null)
    setCatalogSelection(null)
    setSelectedPortId(id)
  }, [clearJourney, finishCapturedOrbitalView])

  const selectAirport = useCallback(
    (id: string | null, originId: string | null) => {
      finishCapturedOrbitalView()
      clearJourney()
      detailFocusOriginIdRef.current = id ? originId : null
      airportSelectionGraceUntilRef.current = id
        ? Date.now() + APP_CONFIG.navigation.viewportSettleMs + 100
        : 0
      setSelectedId(null)
      setSelectedOrbitalId(null)
      setSelectedPortId(null)
      setSelectedWeatherId(null)
      setCatalogSelection(null)
      setSelectedAirportId(id)
    },
    [clearJourney, finishCapturedOrbitalView],
  )
  const handleMapAirportSelect = useCallback(
    (id: string | null) => selectAirport(id, null),
    [selectAirport],
  )
  const handleAirportContextSelect = useCallback(
    (id: string, originId: string) => selectAirport(id, originId),
    [selectAirport],
  )
  const handleFindAirportNavigate = useCallback((id: string, originId: string) => {
    const airport = airports.find((candidate) => candidate.id === id)
    if (!airport) return false
    const label = `Airport: ${airport.name}`
    commitNavigation({ latitude: airport.latitude, longitude: airport.longitude, label }, label)
    selectAirport(id, originId)
    setCatalogSelection({ kind: 'airport', id, expandMobileDetails: mobileWorkspace })
    return true
  }, [airports, commitNavigation, mobileWorkspace, selectAirport])
  const handleFindPortNavigate = useCallback((id: string, originId: string) => {
    const port = ports.find((candidate) => candidate.id === id)
    if (!port) return false
    const label = `Port: ${port.name}`
    commitNavigation({ latitude: port.latitude, longitude: port.longitude, label }, label)
    handleMapPortSelect(id)
    detailFocusOriginIdRef.current = originId
    setCatalogSelection({ kind: 'port', id, expandMobileDetails: mobileWorkspace })
    return true
  }, [commitNavigation, handleMapPortSelect, mobileWorkspace, ports])

  const selectWeather = useCallback(
    (id: string | null, originId: string | null) => {
      finishCapturedOrbitalView()
      clearJourney()
      detailFocusOriginIdRef.current = id ? originId : null
      setSelectedId(null)
      setSelectedOrbitalId(null)
      setSelectedPortId(null)
      setSelectedAirportId(null)
      setSelectedWeatherId(id)
    },
    [clearJourney, finishCapturedOrbitalView],
  )
  const handleMapWeatherSelect = useCallback(
    (id: string | null) => selectWeather(id, null),
    [selectWeather],
  )
  const handleWeatherContextSelect = useCallback(
    (id: string, originId: string) => selectWeather(id, originId),
    [selectWeather],
  )

  const selectOrbital = useCallback(
    (id: string | null, originId: string | null) => {
      finishCapturedOrbitalView()
      clearJourney()
      detailFocusOriginIdRef.current = id ? originId : null
      setSelectedId(null)
      setSelectedPortId(null)
      setSelectedAirportId(null)
      setSelectedWeatherId(null)
      setSelectedOrbitalId(id)
    },
    [clearJourney, finishCapturedOrbitalView],
  )
  const handleMapOrbitalSelect = useCallback(
    (id: string | null) => selectOrbital(id, null),
    [selectOrbital],
  )
  const handleOrbitalImageLoaded = useCallback(
    (path: string, url: string) => {
      setLoadedOrbitalImageUrls((current) => {
        if (current.get(path) === url) return current
        const next = new Map(current)
        next.set(path, url)
        return next
      })
    },
    [],
  )
  const handleOrbitalImageFailed = useCallback(
    (path: string) => {
      const image = selectedOrbitalEnrichment?.image
      if (image?.asset.path === path) {
        orbitalEnrichmentImageLoader.invalidate(image)
      }
      setLoadedOrbitalImageUrls((current) => {
        if (!current.has(path)) return current
        const next = new Map(current)
        next.delete(path)
        return next
      })
    },
    [orbitalEnrichmentImageLoader, selectedOrbitalEnrichment],
  )

  useEffect(
    () => () => {
      orbitalEnrichmentImageLoader.dispose()
    },
    [orbitalEnrichmentImageLoader],
  )
  const handleOrbitalContextSelect = useCallback(
    (id: string, originId: string) => selectOrbital(id, originId),
    [selectOrbital],
  )

  const restoreDetailFocus = useCallback(() => {
    const originId = detailFocusOriginIdRef.current
    detailFocusOriginIdRef.current = null
    focusAfterRender(originId)
  }, [focusAfterRender])

  const handleCloseTraffic = useCallback(() => {
    clearJourney()
    setSelectedId(null)
    restoreDetailFocus()
  }, [clearJourney, restoreDetailFocus])

  const selectedMarineJourneyIdentity = selectedEntity?.kind === 'vessel'
    ? marineJourneyIdentity(selectedEntity) : undefined
  useEffect(() => {
    if (marineJourneyCapture.pendingIdentity !== selectedMarineJourneyIdentity) cancelJourneyPreparation()
  }, [cancelJourneyPreparation, marineJourneyCapture, selectedMarineJourneyIdentity])

  const handleShowJourney = useCallback(async () => {
    if (!selectedEntity || historyActive || !mapCamera || marineJourneyCapture.pending) return
    clearLocalRuler()
    locationCameraIntent.beginExplicitViewIntent()
    cancelPlaceSearch()
    const revision = ++journeyRevisionRef.current
    const capturedAt = Date.now()
    if (selectedEntity.kind === 'vessel') {
      setJourneyPreparing(true)
      setJourneyMessage('Loading up to 24 hours of received ship history...')
    }
    const capture = selectedEntity.kind === 'aircraft'
      ? captureAircraftJourney(selectedEntity, flightRoute.state, liveTrail, revision, capturedAt)
      : await marineJourneyCapture.request(selectedEntity, liveTrail, revision, capturedAt, online && navigator.onLine)
    if (!capture || revision !== journeyRevisionRef.current || document.hidden) return
    setJourneyPreparing(false)
    if (capture.kind === 'unavailable') {
      setJourneyMessage(capture.message)
      return
    }
    setJourney({
      snapshot: capture.snapshot, returnCamera: { ...mapCamera },
      returnLabel: activeLocationLabel, fitPending: true,
    })
    setJourneyMessage(undefined)
    setSelectedId(null)
    setHoveredAircraftId(null)
    setHoveredVesselId(null)
    setActiveLocationLabel('Captured route overview')
    setViewportReport(null)
    setViewRequest(current => ({
      id: current.id + 1, center: current.center, journey: capture.snapshot,
    }))
  }, [activeLocationLabel, cancelPlaceSearch, clearLocalRuler, flightRoute.state, historyActive, liveTrail, locationCameraIntent, mapCamera, marineJourneyCapture, online, selectedEntity])

  const handleJourneyFit = useCallback((revision: number, message: string) => {
    setJourney(current => resolveJourneyFit(current, revision, message))
  }, [])

  const handleReturnJourney = useCallback(() => {
    if (!journey) return
    const { returnCamera: camera, returnLabel: label } = journey
    restoreDetailFocus()
    commitNavigation({ latitude: camera.latitude, longitude: camera.longitude, label }, label, { camera })
  }, [commitNavigation, journey, restoreDetailFocus])

  const handleClosePort = useCallback(() => {
    setSelectedPortId(null)
    setCatalogSelection(null)
    restoreDetailFocus()
  }, [restoreDetailFocus])

  const handleCloseAirport = useCallback(() => {
    airportSelectionGraceUntilRef.current = 0
    setSelectedAirportId(null)
    setCatalogSelection(null)
    restoreDetailFocus()
  }, [restoreDetailFocus])

  const handleCloseWeather = useCallback(() => {
    setSelectedWeatherId(null)
    restoreDetailFocus()
  }, [restoreDetailFocus])

  const handleCloseOrbital = useCallback(() => {
    setSelectedOrbitalId(null)
    restoreDetailFocus()
  }, [restoreDetailFocus])

  const handleCaptureOrbitalView = useCallback(() => {
    if (!selectedOrbitalId || historyActive || mapError) return
    const source = acceptedOrbitalPositionForCapture(selectedOrbitalId)
    const reason = orbitalViewUnavailableReason(source?.position, projectionPreference)
    if (!source || reason) {
      setOrbitalViewMessage(reason ?? 'The accepted modeled position changed. Select the object again.')
      return
    }
    const view: CapturedOrbitalView = Object.freeze({
      ...source, revision: ++capturedOrbitalRevisionRef.current, viewRequestId: viewRequest.id,
    })
    locationCameraIntent.beginExplicitViewIntent()
    cancelPlaceSearch()
    clearLocalRuler()
    clearJourney()
    detailFocusOriginIdRef.current = null
    setSelectedId(null)
    setSelectedOrbitalId(null)
    setSelectedPortId(null)
    setSelectedAirportId(null)
    setSelectedWeatherId(null)
    setHoveredAircraftId(null)
    setHoveredVesselId(null)
    capturedOrbitalViewRef.current = view
    setCapturedOrbitalView(view)
    setCapturedOrbitalReady(false)
    setCapturedOrbitalDisplayedPosition(view.position)
    setCapturedOrbitalPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    setOrbitalViewMessage(undefined)
    setInspectorExpanded(false)
  }, [
    cancelPlaceSearch, clearJourney, clearLocalRuler, historyActive, locationCameraIntent,
    mapError, acceptedOrbitalPositionForCapture, projectionPreference, selectedOrbitalId,
    viewRequest.id,
  ])

  const handleEnterHistory = useCallback(() => {
    finishCapturedOrbitalView()
    clearLocalRuler()
    clearJourney()
    setSelectedOrbitalId(null)
    enterHistory()
    globalThis.requestAnimationFrame(() => {
      if (canRestoreFocus(historyPlaybackControlRef.current)) {
        historyPlaybackControlRef.current?.focus()
      }
    })
  }, [clearJourney, clearLocalRuler, enterHistory, finishCapturedOrbitalView])

  useEffect(() => {
    if (historyActive && journey) clearJourney()
    if (historyActive) clearLocalRuler()
  }, [clearJourney, clearLocalRuler, historyActive, journey])

  const handleReturnToLive = useCallback(() => {
    returnToLive()
    focusAfterRender('history-enter-button', 'settings')
  }, [focusAfterRender, returnToLive])

  const mapErrorContent = mapError ? mapErrorPresentation(mapError) : null
  const orbitalSummary = formatOrbitalSummary({
    visible: orbitalObjectsVisible,
    historyActive,
    horizonMs: APP_CONFIG.orbital.predictionHorizonMs,
    state: orbitalState,
    display: orbitalDisplay,
    counts: orbitalCounts,
    uniqueShownCount: orbitsInView.available
      ? orbitsInView.shownCount
      : undefined,
    starlink: {
      enabled: orbitalObjectsVisible,
      state: starlinkState,
      display: starlinkDisplay,
      counts: starlinkCounts,
    },
  })
  const mapSubtitle = capturedOrbitalView
    ? 'Captured orbital view'
    : historyActive
    ? 'Historical traffic area'
    : !viewReady
      ? 'Preparing map view'
      : currentAssessment?.kind === 'eligible'
        ? orbitalObjectsVisible
          ? 'Visible traffic and orbital area'
          : 'Visible traffic area'
        : currentAssessment
          ? 'Aircraft and ships paused'
          : 'Updating map view'
  const vesselEmptyMessage =
    historyActive
      ? 'No recorded ships are shown at this historical cursor.'
      : currentAssessment?.kind === 'ineligible'
      ? 'Aircraft and ships are paused for this view.'
      : marineResult.status.phase === 'error'
        ? 'The marine source is unavailable.'
        : marineResult.status.phase === 'idle' ||
            marineResult.status.phase === 'loading'
          ? 'The marine source is connecting.'
          : 'No current ships are shown in this view.'
  const aircraftEmptyMessage =
    historyActive
      ? 'No recorded aircraft are shown at this historical cursor.'
      : currentAssessment?.kind === 'ineligible'
      ? 'Aircraft and ships are paused for this view.'
      : aircraftResult.status.phase === 'error'
        ? 'The aircraft source is unavailable.'
        : aircraftResult.status.phase === 'idle' ||
            aircraftResult.status.phase === 'loading'
          ? 'The aircraft source is connecting.'
          : 'No current aircraft are shown in this view.'
  const airportsEmptyMessage =
    contextViewport
      ? 'No large or medium airports are shown in this view.'
      : 'Airport context is unavailable while the map view is updating.'
  const weatherStateMatches =
    weatherResult.state.phase !== 'idle' &&
    weatherResult.state.stationKey === weatherStationKey
  const weatherReady = weatherDataset !== undefined
  const weatherLoading =
    weatherVisible &&
    (airportsResult.state.phase === 'loading' ||
      (weatherStateMatches && weatherResult.state.phase === 'loading'))
  const weatherWaiting =
    weatherVisible &&
    weatherStateMatches &&
    weatherResult.state.phase === 'waiting'
  const weatherError =
    !weatherVisible || historyActive
      ? undefined
      : airportsResult.state.phase === 'error'
        ? `Airport station context unavailable: ${airportsResult.state.message}`
        : weatherStateMatches && weatherResult.state.phase === 'error'
          ? weatherResult.state.message
          : undefined
  const weatherStatusMessage =
    !weatherVisible
      ? undefined
      : historyActive
        ? 'Current METAR observations are hidden during historical playback.'
      : !activeViewport
        ? 'METAR observations are paused until the map shows an eligible live-traffic view.'
        : airportsResult.state.phase === 'loading'
          ? 'Loading the pinned airport dataset used to choose METAR stations.'
          : weatherStationSelection.kind === 'too-many'
            ? `${weatherStationSelection.count} qualifying ICAO stations are visible. Zoom in to stay within the ${APP_CONFIG.weather.maximumStations}-station request limit.`
            : weatherWaiting &&
                weatherResult.state.phase === 'waiting'
              ? `The next request is available at ${formatTimestamp(
                  weatherResult.state.nextRequestAt,
                )}.`
              : weatherDataset
                ? `Fetched ${formatTimestamp(weatherDataset.retrievedAt)}. Not a forecast.`
                : undefined
  const weatherEmptyMessage =
    weatherStationIds.length === 0
      ? 'No qualifying four-letter ICAO METAR stations are shown in this view.'
      : 'No current METAR or SPECI observations were returned for this view.'
  const handleRetryWeather =
    airportsResult.state.phase === 'error'
      ? airportsResult.retry
      : weatherResult.retry

  useEffect(() => {
    setInspectorExpanded(capturedOrbitalView === undefined)
    const openCatalogDetails = catalogSelection?.kind === 'airport'
      ? catalogSelection.id === selectedAirportId
      : catalogSelection?.kind === 'port' && catalogSelection.id === selectedPortId
    setDetailsReturnToTask(openCatalogDetails && catalogSelection?.expandMobileDetails
      ? workspaceControlsRef.current?.suspendTask() ?? false
      : false)
  }, [capturedOrbitalView, catalogSelection, selectedId, selectedOrbitalId, selectedPortId, selectedAirportId, selectedWeatherId, journey?.snapshot.revision])

  const expandInspector = useCallback(() => {
    if (localRulerRef.current.phase === 'placing') clearLocalRuler()
    setDetailsReturnToTask(workspaceControlsRef.current?.suspendTask() ?? false)
    setInspectorExpanded(true)
  }, [clearLocalRuler])
  const collapseInspector = useCallback(() => {
    const restored = detailsReturnToTask && workspaceControlsRef.current?.resumeTask()
    setDetailsReturnToTask(false)
    if (!restored) setInspectorExpanded(false)
  }, [detailsReturnToTask])
  const handleWorkspaceTaskChange = useCallback((task: MobileWorkspaceTask | null) => {
    if (task && localRulerRef.current.phase === 'placing') clearLocalRuler()
    setActiveWorkspaceTask(task)
    if (task) setDetailsReturnToTask(false)
  }, [clearLocalRuler])
  const startLocalRuler = useCallback(() => {
    if (capturedOrbitalViewRef.current || historyActive || mapError) return
    const availability = rulerMapRef.current?.refresh() ?? 'unsupported'
    setRulerAvailability(availability)
    if (availability !== 'available') return
    rulerTaskOriginRef.current = workspaceControlsRef.current?.suspendTask() ?? false
    dispatchLocalRuler({ type: 'start' })
    rulerMapRef.current?.focusMap()
  }, [dispatchLocalRuler, historyActive, mapError])
  const rulerBinding = useMemo(() => ({
    state: localRuler,
    read: readLocalRuler,
    disabled: capturedOrbitalView !== undefined || historyActive || mapError !== null,
    handleRef: rulerMapRef,
    onPoint: handleRulerPoint,
    onAvailability: handleRulerAvailability,
    onCancel: cancelLocalRuler,
  }), [cancelLocalRuler, capturedOrbitalView, handleRulerAvailability, handleRulerPoint, historyActive, localRuler, mapError, readLocalRuler])
  const rulerDistance = formatLocalRulerDistance(localRuler.points, units)
  const inspectorIdentity = capturedOrbitalView ? `captured-orbit:${capturedOrbitalView.revision}` : journey ? `journey:${journey.snapshot.revision}` :
    selectedId ?? selectedOrbitalId ?? selectedPortId ?? selectedAirportId ?? selectedWeatherId
  const inspectorPresentation = {
    mobile: mobileWorkspace,
    compact: localRuler.phase === 'placing' || !inspectorExpanded || activeWorkspaceTask !== null,
    forceCompact: localRuler.phase === 'placing',
    identity: inspectorIdentity,
    returnToTask: detailsReturnToTask,
    onExpand: expandInspector,
    onCollapse: collapseInspector,
  }
  useLayoutEffect(() => {
    rulerMapRef.current?.refresh()
  }, [activeWorkspaceTask, inspectorExpanded, inspectorIdentity, localRuler, mobileWorkspace])

  useEffect(() => {
    const appShell = appShellRef.current
    if (!appShell) return

    let previousVisualHeight: number | undefined
    let focusFrame: number | undefined
    const updateViewportVariables = () => {
      const viewport = window.visualViewport ?? {
        width: window.innerWidth,
        height: window.innerHeight,
        offsetLeft: 0,
        offsetTop: 0,
      }
      const values = visualViewportCssValues(
        viewport,
      )
      if (!values) return
      setMobileWorkspace(isCompactWorkspace(viewport, window.matchMedia('(pointer: coarse)').matches))
      appShell.style.setProperty(
        '--app-visual-viewport-width',
        values.width,
      )
      appShell.style.setProperty(
        '--app-visual-viewport-height',
        values.height,
      )
      appShell.style.setProperty(
        '--app-visual-viewport-left',
        values.left,
      )
      appShell.style.setProperty(
        '--app-visual-viewport-top',
        values.top,
      )
      appShell.style.setProperty(
        '--app-visual-viewport-58',
        values.controlBudget,
      )
      const active = document.activeElement
      if (previousVisualHeight !== undefined && viewport.height < previousVisualHeight &&
        active instanceof HTMLElement && active.matches('input, select, textarea') &&
        active.closest('.control-panel__more-body, .details-panel__body')) {
        if (focusFrame !== undefined) cancelAnimationFrame(focusFrame)
        focusFrame = requestAnimationFrame(() => {
          focusFrame = undefined
          const focused = document.activeElement
          if (focused instanceof HTMLElement && focused.matches('input, select, textarea') &&
            focused.closest('.control-panel__more-body, .details-panel__body')) {
            focused.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          }
        })
      }
      previousVisualHeight = viewport.height
      rulerMapRef.current?.refresh()
    }
    const visualViewport = window.visualViewport
    updateViewportVariables()
    appShell.addEventListener('wheel', preventCompactControlWheelZoom, {
      passive: false,
    })
    window.addEventListener('resize', updateViewportVariables)
    document.addEventListener('fullscreenchange', updateViewportVariables)
    visualViewport?.addEventListener('resize', updateViewportVariables)
    visualViewport?.addEventListener('scroll', updateViewportVariables)

    return () => {
      if (focusFrame !== undefined) cancelAnimationFrame(focusFrame)
      appShell.removeEventListener('wheel', preventCompactControlWheelZoom)
      window.removeEventListener('resize', updateViewportVariables)
      document.removeEventListener('fullscreenchange', updateViewportVariables)
      visualViewport?.removeEventListener(
        'resize',
        updateViewportVariables,
      )
      visualViewport?.removeEventListener(
        'scroll',
        updateViewportVariables,
      )
    }
  }, [])

  return (
    <main
      ref={appShellRef}
      className={`app-shell${historyActive ? ' app-shell--history' : ''}${mobileWorkspace ? ' app-shell--mobile-workspace' : ''}`}
      data-orbital-view={capturedOrbitalView ? capturedOrbitalReady ? 'captured' : 'preparing' : undefined}
    >
      <TrafficMap
        capturedOrbitalView={capturedOrbitalView}
        capturedOrbitalViewAcknowledged={capturedOrbitalAcknowledged}
        capturedOrbitalPlaying={capturedOrbitalPlaying}
        capturedOrbitalPosition={capturedOrbitalState?.viewPosition}
        onCapturedOrbitalViewEnd={finishCapturedOrbitalView}
        onCapturedOrbitalViewReady={handleCapturedOrbitalReady}
        onCapturedOrbitalViewNotice={handleCapturedOrbitalNotice}
        onCapturedOrbitalViewPosition={handleCapturedOrbitalPosition}
        onCapturedOrbitalViewPause={handleCapturedOrbitalPause}
        compactAttribution={mobileWorkspace}
        viewCenter={viewRequest.center}
        northResetRequest={northResetRequest}
        northResetDurationMs={APP_CONFIG.navigation.northResetDurationMs}
        viewCamera={viewRequest.camera}
        viewJourney={viewRequest.journey}
        viewRequestCancelled={viewRequest.cancelled}
        journeySnapshot={journey?.snapshot}
        onJourneyFit={handleJourneyFit}
        viewLabel={activeLocationLabel}
        viewRadiusKm={APP_CONFIG.map.homeViewRadiusKm}
        maximumViewportRadiusKm={APP_CONFIG.map.maximumViewportRadiusKm}
        touchHitTolerancePx={APP_CONFIG.map.touchHitTolerancePx}
        clusterRadiusPx={APP_CONFIG.map.clustering.radiusPx}
        clusterMinimumPoints={APP_CONFIG.map.clustering.minimumPoints}
        clusterMaximumZoom={APP_CONFIG.map.clustering.maximumZoom}
        coordinatePrecision={APP_CONFIG.navigation.coordinatePrecision}
        mapStyleUrl={
          theme === 'dark'
            ? APP_CONFIG.map.darkStyleUrl
            : APP_CONFIG.map.lightStyleUrl
        }
        online={online}
        theme={theme}
        projectionPreference={projectionPreference}
        units={units}
        ruler={rulerBinding}
        scaleSuppressed={
          capturedOrbitalView !== undefined || mapError !== null || historyActive || localRuler.phase === 'placing' ||
          (mobileWorkspace && (activeWorkspaceTask !== null || inspectorIdentity !== null))
        }
        aircraft={capturedOrbitalView ? EMPTY_VIEW_OUTPUT : trafficContext ? contextAircraft : aircraft}
        vessels={capturedOrbitalView ? EMPTY_VIEW_OUTPUT : trafficContext ? contextVessels : vessels}
        trafficContext={trafficContext}
        ports={ports}
        airports={airports}
        weatherObservations={weatherObservations}
        orbitalPositions={capturedOrbitalView ? EMPTY_VIEW_OUTPUT : orbitalState.positions}
        orbitalShownIds={orbitalDisplay.shownIds}
        orbitalTrackSegments={orbitalState.prediction.trackSegments}
        starlinkPositions={capturedOrbitalView ? EMPTY_VIEW_OUTPUT : starlinkState.positions}
        starlinkShownIds={starlinkDisplay.shownIds}
        starlinkTrackSegments={
          starlinkState.prediction.trackSegments
        }
        orbitalImageUrls={loadedOrbitalImageUrls}
        trailSegments={capturedOrbitalView ? EMPTY_VIEW_OUTPUT : trailSegments}
        selectedId={selectedId}
        selectedOrbitalId={selectedOrbitalId}
        selectedPortId={selectedPortId}
        selectedAirportId={selectedAirportId}
        selectedWeatherId={selectedWeatherId}
        aircraftVisible={aircraftVisible && !capturedOrbitalView}
        vesselsVisible={vesselsVisible && !capturedOrbitalView}
        portsVisible={portsVisible && !capturedOrbitalView}
        airportsVisible={airportsVisible && !capturedOrbitalView}
        weatherVisible={weatherVisible && !capturedOrbitalView}
        depthsVisible={depthsVisible}
        onBathymetryStatus={setBathymetryStatus}
        reliefVisible={reliefVisible}
        onReliefStatus={setReliefStatus}
        orbitalVisible={orbitalObjectsVisible && !historyActive && !capturedOrbitalView}
        starlinkVisible={orbitalObjectsVisible && !historyActive && !capturedOrbitalView}
        clusteringEnabled={clusteringEnabled && !trafficContext}
        interpolateTraffic={!capturedOrbitalView && !historyActive && !trafficContext}
        interpolationDurationMs={APP_CONFIG.interpolationDurationMs}
        aircraftPhotoEnabled={aircraftPhotoFeatureEnabled && !capturedOrbitalView}
        aircraftPhoto={hoveredAircraftPhoto.state}
        aircraftPhotoHoverDelayMs={
          APP_CONFIG.aircraftPhoto.hoverDelayMs
        }
        vesselPhotoEnabled={!historyActive && !capturedOrbitalView}
        vesselPhoto={hoveredVesselPhoto.state}
        viewRequestId={viewRequest.id}
        viewportSettleMs={APP_CONFIG.navigation.viewportSettleMs}
        onHoverAircraftChange={setHoveredAircraftId}
        onHoverVesselChange={setHoveredVesselId}
        onSelect={handleMapTrafficSelect}
        onSelectOrbital={handleMapOrbitalSelect}
        onSelectPort={handleMapPortSelect}
        onSelectAirport={handleMapAirportSelect}
        onSelectWeather={handleMapWeatherSelect}
        onViewportChange={handleViewportChange}
        onCameraChange={setMapCamera}
        onManualViewChange={handleManualViewChange}
        onActionShortcut={(action) => {
          const controls = workspaceControlsRef.current
          return (action === 'find' ? controls?.openFind() : controls?.center()) ?? false
        }}
        onMapError={handleMapError}
      />
      <div className="radar-shade" aria-hidden="true" />
      {localRuler.phase === 'placing' && (rulerAvailability === 'available' || rulerAvailability === 'moving') && (
        <svg className="ruler-reticle" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
          <path d="M12 4v6m0 4v6M4 12h6m4 0h6" />
        </svg>
      )}

      <MobileInspectorContext value={inspectorPresentation}>
      <div
        className="interface-layer"
        data-workspace-task={activeWorkspaceTask ?? undefined}
      >
        {localRuler.phase === 'placing' && (
          <LocalRulerPlacement state={localRuler} availability={rulerAvailability}
            distance={rulerDistance} panelRef={rulerPanelRef}
            onCenter={() => rulerMapRef.current?.setPointAtCenter()}
            onDone={finishLocalRuler} onCancel={cancelLocalRuler}
          />
        )}
        <TrafficControls
          mobileWorkspace={mobileWorkspace}
          workspaceHandleRef={workspaceControlsRef}
          onWorkspaceTaskChange={handleWorkspaceTaskChange}
          rulerAvailable={!capturedOrbitalView && !historyActive && mapError === null && rulerAvailability === 'available'}
          rulerMessage={capturedOrbitalView ? 'Distance ruler is unavailable in a captured view.'
            : historyActive ? 'Distance ruler is unavailable in HISTORY.'
            : mapError ? 'Distance ruler is unavailable while the map recovers.'
              : rulerAvailabilityMessage(rulerAvailability)}
          rulerDistance={localRuler.phase === 'retained' ? rulerDistance : undefined}
          onStartRuler={startLocalRuler}
          onClearRuler={clearLocalRuler}
          fullscreen={fullscreenState}
          onEnterFullscreen={enterFullscreen}
          onExitFullscreen={exitFullscreen}
          marineProviderName={marineResult.capabilities.name}
          discoveryPaused={capturedOrbitalView !== undefined || historyActive || !online}
          discoverMarineMetadata={marineResult.discoverMetadata}
          catalogAirports={airports}
          catalogPorts={ports}
          portsReady={portsResult.state.phase === 'ready'}
          airportSource={airportsResult.state.phase === 'ready' ? airportsResult.state.dataset.source : undefined}
          portSource={portsResult.state.phase === 'ready' ? portsResult.state.dataset.source : undefined}
          inView={
            <InViewPanel
              aircraft={aircraftResults}
              totalAircraft={aircraft.length}
              aircraftQuery={aircraftQuery}
              aircraftVisible={aircraftVisible}
              aircraftAvailability={aircraftInViewAvailability({
                historyActive,
                viewportReady: viewReady && currentAssessment !== null,
                viewportEligible: currentAssessment?.kind === 'eligible',
                online,
                status: aircraftResult.status,
                count: aircraft.length,
              })}
              selectedAircraftId={selectedId}
              onAircraftQueryChange={setAircraftQuery}
              onAircraftSelect={selectTraffic}
              vessels={vessels}
              vesselsVisible={vesselsVisible}
              vesselAvailability={vesselInViewAvailability({
                historyActive,
                viewportReady: viewReady && currentAssessment !== null,
                viewportEligible: currentAssessment?.kind === 'eligible',
                online,
                status: marineResult.status,
                count: vessels.length,
              })}
              selectedVesselId={selectedId}
              onVesselSelect={selectTraffic}
              onFindShips={() => workspaceControlsRef.current?.openShipFind()}
              orbits={orbitsInView}
              selectedOrbitalId={selectedOrbitalId}
              onOrbitalSelect={handleOrbitalContextSelect}
              pageSize={APP_CONFIG.orbital.discovery.pageSize}
              maximumOrbitalQueryLength={
                APP_CONFIG.orbital.discovery.maximumQueryLength
              }
            />
          }
          masthead={
            <>
              <div className="brand-panel__title">
                <div className="radar-mark" aria-hidden="true">
                  <span />
                </div>
                <div>
                  <h1>TrackStan</h1>
                  <p>{mapSubtitle}</p>
                </div>
              </div>
              {!capturedOrbitalView && <LiveStatus
                compact={mobileWorkspace}
                aircraftCount={aircraftVisible ? aircraft.length : 0}
                vesselCount={vesselsVisible ? vessels.length : 0}
                aircraftStatus={aircraftResult.status}
                marineStatus={marineResult.status}
                marineCapabilities={marineResult.capabilities}
                now={now}
                online={online}
                orbitalSummary={orbitalSummary}
                trafficContext={hasTrafficContext}
                historicalAt={
                  history.playback.mode === 'live'
                    ? undefined
                    : history.playback.cursor
                }
              />}
            </>
          }
          aircraftQuery={aircraftQuery}
          aircraftResults={aircraftResults}
          totalAircraft={aircraft.length}
          aircraftEmptyMessage={aircraftEmptyMessage}
          onAircraftQueryChange={setAircraftQuery}
          onAircraftSelect={handleAircraftDiscoverySelect}
          vesselFilters={vesselFilters}
          vesselResults={vesselResults}
          totalVessels={currentVessels.length}
          vesselEmptyMessage={vesselEmptyMessage}
          units={units}
          onVesselFiltersChange={setVesselFilters}
          onVesselSelect={handleVesselDiscoverySelect}
          aircraftVisible={aircraftVisible}
          onAircraftVisibleChange={setAircraftVisible}
          vesselsVisible={vesselsVisible}
          onVesselsVisibleChange={setVesselsVisible}
          portsVisible={portsVisible}
          portsLoading={
            portsResult.state.phase === 'loading'
          }
          portsError={
            portsResult.state.phase === 'error'
              ? portsResult.state.message
              : undefined
          }
          onPortsVisibleChange={setPortsVisible}
          onRetryPorts={portsResult.retry}
          onLoadPorts={handleLoadPorts}
          onPortNavigate={handleFindPortNavigate}
          airportsVisible={airportsVisible}
          airportsLoading={
            airportsResult.state.phase === 'loading'
          }
          airportsReady={airportsResult.state.phase === 'ready'}
          airportsError={
            airportsResult.state.phase === 'error'
              ? airportsResult.state.message
              : undefined
          }
          airportsInView={visibleAirports}
          selectedAirportId={selectedAirportId}
          airportsEmptyMessage={airportsEmptyMessage}
          onAirportsVisibleChange={setAirportsVisible}
          onAirportSelect={handleAirportContextSelect}
          onRetryAirports={airportsResult.retry}
          onLoadAirports={handleLoadAirports}
          onAirportNavigate={handleFindAirportNavigate}
          weatherVisible={weatherVisible}
          depthsVisible={depthsVisible}
          bathymetryStatus={bathymetryStatus}
          onDepthsVisibleChange={setDepthsVisible}
          reliefVisible={reliefVisible}
          reliefStatus={reliefStatus}
          onReliefVisibleChange={setReliefVisible}
          weatherLoading={weatherLoading}
          weatherWaiting={weatherWaiting}
          weatherReady={weatherReady}
          now={now}
          weatherError={weatherError}
          weatherStatusMessage={weatherStatusMessage}
          weatherObservations={weatherObservations}
          selectedWeatherId={selectedWeatherId}
          weatherEmptyMessage={weatherEmptyMessage}
          weatherCanRefresh={weatherResult.canRefresh}
          weatherRetryUsesAirports={
            airportsResult.state.phase === 'error'
          }
          onWeatherVisibleChange={setWeatherVisible}
          onWeatherSelect={handleWeatherContextSelect}
          onRetryWeather={handleRetryWeather}
          onRefreshWeather={weatherResult.refresh}
          orbitalVisible={orbitalObjectsVisible}
          orbitalState={orbitalState}
          selectedOrbitalId={selectedOrbitalId}
          orbitalFilters={orbitalFilters}
          orbitalDisplay={orbitalDisplay}
          orbitalCounts={orbitalCounts}
          orbitalPrimarySummary={orbitalSummary}
          orbitalPredictionHorizonMs={
            APP_CONFIG.orbital.predictionHorizonMs
          }
          orbitalMaximumQueryLength={
            APP_CONFIG.orbital.discovery.maximumQueryLength
          }
          orbitalPageSize={APP_CONFIG.orbital.discovery.pageSize}
          onOrbitalVisibleChange={setOrbitalObjectsVisible}
          onOrbitalFiltersChange={setOrbitalFilters}
          onOrbitalSelect={handleOrbitalContextSelect}
          onRetryOrbital={orbitalResult.retry}
          starlinkState={starlinkState}
          starlinkCounts={starlinkCounts}
          onRetryStarlink={orbitalResult.retryStarlink}
          clusteringEnabled={clusteringEnabled}
          onClusteringEnabledChange={setClusteringEnabled}
          trailPreferences={trailPreferences}
          onTrailPreferencesChange={setTrailPreferences}
          historySettings={history.settings}
          historyStatus={history.status}
          historyRange={history.range}
          historyRecordCount={history.observationCount}
          playback={history.playback}
          onHistoryEnabledChange={(enabled) => {
            void history.setPersistenceEnabled(enabled)
          }}
          onHistoryRetentionChange={(hours) => {
            void history.setRetentionHours(hours)
          }}
          onClearHistory={() => {
            void history.clearHistory()
          }}
          onRetryHistory={history.retryPersistence}
          onEnterHistory={handleEnterHistory}
          centerDisabled={
            !location.initialReady || mapError?.kind === 'initialization'
          }
          onCenter={handleCenter}
          northResetBearing={
            !capturedOrbitalView && isNorthResetUseful(
              mapCamera?.bearing,
              APP_CONFIG.navigation.northResetToleranceDegrees,
            ) ? mapCamera?.bearing : undefined
          }
          onResetNorth={handleResetNorth}
          locationAvailable={location.canRequest}
          locationLoading={location.locating}
          locationMessage={location.message}
          onUseLocation={handleUseLocation}
          themePreference={themePreference}
          onThemePreferenceChange={setThemePreference}
          projectionPreference={projectionPreference}
          onProjectionPreferenceChange={setProjectionPreference}
          onUnitsChange={setUnits}
          shareDisabled={capturedOrbitalView !== undefined || !mapCamera}
          onShare={handleShare}
          onResetPreferences={handleResetPreferences}
          preferenceStatus={
            shareFeedback?.message ?? preferenceStatus?.message
          }
          manualShareUrl={shareFeedback?.manualUrl}
          appShellStatus={appShell.message}
          appUpdateAvailable={appShell.updateAvailable}
          appUpdateActivating={appShell.phase === 'activating'}
          onRefreshApp={appShell.activateUpdate}
          locationNavigationDisabled={mapError?.kind === 'initialization'}
          activeLocationLabel={activeLocationLabel}
          coordinatePrecision={APP_CONFIG.navigation.coordinatePrecision}
          maximumLocationQueryLength={
            APP_CONFIG.geocoder.maximumQueryLength
          }
          placeSearchState={placeSearchState}
          onPlaceSearch={handlePlaceSearch}
          onLocationNavigate={handleLocationNavigate}
          onPlaceResultSelect={handlePlaceResultSelect}
          onPlaceSearchCancel={cancelPlaceSearch}
          mapToolsSummaryRef={mapToolsSummaryRef}
          settingsSummaryRef={settingsSummaryRef}
        />

        {!capturedOrbitalView && orbitalViewMessage && (
          <div className="viewport-notice" role="status">
            <span>{orbitalViewMessage}</span>
            <button type="button" onClick={() => setOrbitalViewMessage(undefined)}>Dismiss</button>
          </div>
        )}

        {!capturedOrbitalView && !orbitalViewMessage && !historyActive && !journey && currentAssessment?.kind === 'ineligible' && (
          <div className="viewport-notice" role="status">
            <strong>
              {hasTrafficContext
                ? 'Last local traffic sample'
                : 'Aircraft and ships paused'}
            </strong>
            <span>
              {hasTrafficContext &&
                'Last local sample; not wider live coverage. '}
              {currentAssessment.message}
            </span>
            {currentAssessment.viewport && (
              <button type="button" onClick={handleResumeLiveTraffic}>
                RESUME LIVE
              </button>
            )}
          </div>
        )}

        {history.playback.mode !== 'live' && (
          <HistoryModeNotice
            playback={history.playback}
            entityCount={displayEntities.length}
            playbackControlRef={historyPlaybackControlRef}
            onPlay={history.play}
            onPause={history.pause}
            onScrub={history.scrub}
            onSpeedChange={history.setSpeed}
            onReturnToLive={handleReturnToLive}
          />
        )}

        {journey && (
          <JourneyDetails
            key={journey.snapshot.revision}
            overview={journey}
            theme={theme}
            trafficPauseMessage={currentAssessment?.kind === 'ineligible' ? currentAssessment.message : undefined}
            onHide={handleCloseTraffic}
            onClose={handleCloseTraffic}
            onReturn={handleReturnJourney}
          />
        )}

        {capturedOrbitalView && (
          <CapturedOrbitalDetails
            key={capturedOrbitalView.revision}
            view={capturedOrbitalView}
            ready={capturedOrbitalReady}
            playing={capturedOrbitalPlaying}
            position={capturedOrbitalDisplayedPosition}
            notice={orbitalViewMessage}
            statusMessage={capturedOrbitalState?.message}
            online={online}
            units={units}
            onReturn={returnFromCapturedOrbitalView}
            onTogglePlaying={() => toggleCapturedOrbitalPlaying(capturedOrbitalView.revision)}
          />
        )}

        {selectedEntity && !journey && (
          <TrafficDetails
            entity={selectedEntity}
            aircraftMetadata={aircraftMetadata}
            aircraftPhotoEnabled={aircraftPhotoEnabled}
            aircraftPhoto={aircraftPhoto.state}
            vesselPhotoEnabled={!historyActive}
            vesselPhoto={vesselPhoto.state}
            onRequestVesselPhoto={vesselPhoto.request}
            aircraftPhotoTermsUrl={
              APP_CONFIG.aircraftPhoto.sourceTermsUrl
            }
            flightRouteEnabled={flightRouteEnabled}
            flightRoute={flightRoute.state}
            now={displayNow}
            units={units}
            historical={historyActive}
            onRequestAircraftPhoto={aircraftPhoto.request}
            onRequestFlightRoute={flightRoute.request}
            onShowJourney={!historyActive && mapCamera ? handleShowJourney : undefined}
            journeyMessage={journeyMessage}
            journeyPreparing={journeyPreparing}
            onClose={handleCloseTraffic}
          />
        )}

        {!historyActive &&
          orbitalObjectsVisible &&
          selectedOrbitalPosition &&
          selectedOrbitalState.snapshot && (
          <OrbitalDetails
            key={`${selectedOrbitalPosition.id}|${selectedOrbitalState.snapshot.sha256}`}
            position={selectedOrbitalPosition}
            crossing={selectedOrbitalCrossing}
            snapshot={selectedOrbitalState.snapshot}
            sourceName={APP_CONFIG.orbital.sourceName}
            sourceWebsiteUrl={APP_CONFIG.orbital.sourceWebsiteUrl}
            sourceUsagePolicyUrl={
              APP_CONFIG.orbital.sourceUsagePolicyUrl
            }
            now={now}
            online={online}
            units={units}
            imageState={selectedOrbitalImageState}
            mapDisplay={
              selectedOrbitalDisplay.available
                ? {
                    available: true,
                    selectedException:
                      selectedOrbitalDisplay.selectedException,
                  }
                : { available: false }
            }
            onImageLoaded={handleOrbitalImageLoaded}
            onImageFailed={handleOrbitalImageFailed}
            onClose={handleCloseOrbital}
            onViewFromHere={handleCaptureOrbitalView}
            viewFromHereUnavailable={mapError
              ? 'View from here needs the vector basemap.'
              : orbitalViewUnavailableReason(selectedOrbitalPosition, projectionPreference)}
          />
        )}

        {selectedPort && portsResult.state.phase === 'ready' && (
          <PortDetails
            port={selectedPort}
            source={portsResult.state.dataset.source}
            onClose={handleClosePort}
          />
        )}

        {selectedAirport && airportsResult.state.phase === 'ready' && (
          <AirportDetails
            airport={selectedAirport}
            source={airportsResult.state.dataset.source}
            coordinatePrecision={APP_CONFIG.navigation.coordinatePrecision}
            onClose={handleCloseAirport}
            board={APP_CONFIG.airportBoards.enabled ? {
              provider: airportBoardProvider, now, online, historical: historyActive,
            } : undefined}
          />
        )}

        {selectedWeather &&
          weatherResult.state.phase === 'ready' &&
          weatherResult.state.stationKey === weatherStationKey && (
            <WeatherObservationDetails
              observation={selectedWeather}
              source={weatherResult.state.dataset.source}
              retrievedAt={weatherResult.state.dataset.retrievedAt}
              now={now}
              units={units}
              onClose={handleCloseWeather}
            />
          )}

        {mapErrorContent && (
          <div className="map-error" role="status">
            <strong>{mapErrorContent.title}</strong>
            <span>{mapErrorContent.message}</span>
          </div>
        )}
      </div>
      </MobileInspectorContext>
    </main>
  )
}

export default App
