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
import type { ObjectShareStartup } from './app/objectShareStartup'
import { ObjectShareControl } from './components/ObjectShareControl'
import { SavedObjectControl } from './components/SavedObjectControl'
import { SharedObjectDetails } from './components/SharedObjectDetails'
import {
  shareOrbitalObject, shareTrafficObject, sharedOrbitalId, sharedOrbitalMatches, sharedTrafficMatches,
  type ObjectShareReceipt,
} from './domain/objectShare'
import { useMarineTraffic } from './app/useMarineTraffic'
import { useNow } from './app/useNow'
import { useOnlineStatus } from './app/useOnlineStatus'
import { usePlaceSearch } from './app/usePlaceSearch'
import { usePorts } from './app/usePorts'
import { useSessionLocation } from './app/useSessionLocation'
import { useTheme } from './app/useTheme'
import type { ThemePreference } from './app/theme'
import { useTrafficHistory } from './app/useTrafficHistory'
import { useSavedObjects } from './app/useSavedObjects'
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
import { CapturedAircraftDetails } from './components/CapturedAircraftDetails'
import { CapturedOrbitalDetails } from './components/CapturedOrbitalDetails'
import { formatOrbitalSummary } from './components/orbitalSummary'
import {
  AIRCRAFT_VIEW_CONFIG,
  APP_CONFIG,
  BASEMAP_DETAIL_CONFIG,
  ZOOM_TRAFFIC_CONTEXT_CONFIG,
  OBJECT_SHARE_CONFIG,
  FIND_VIEW_RADIUS_KM,
} from './config/appConfig'
import type { AppCenter } from './config/appConfig'
import { orderAircraftSearchResults } from './domain/aircraftSearch'
import { airportsInViewport } from './domain/airports'
import { loadedOrbitalCatalog } from './domain/catalogDiscovery'
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
import type { ShipLocateNavigation } from './components/ObjectFind'
import { DISCOVERY_CONFIG } from './config/discoveryConfig'
import {
  createShareUrl,
  readBrowserShareState,
} from './domain/shareState'
import type { DisplayTrafficEntity, TrafficEntity } from './domain/traffic'
import {
  createSavedAirportObject,
  createSavedOrbitalObject,
  createSavedPortObject,
  createSavedTrafficObject,
  savedObjectKey,
  type SavedObject,
} from './domain/savedObjects'
import {
  trailHistoryConfig,
} from './domain/trailPreferences'
import {
  filterVessels,
  orderVesselSearchResults,
} from './domain/vesselFilters'
import type { TrafficViewport, ViewportAssessment } from './domain/viewport'
import { INITIAL_BATHYMETRY_STATUS, type BathymetryStatus } from './domain/bathymetry'
import type { BasemapReliefStatus } from './map/basemapRelief'
import type { OrbitalViewport } from './domain/orbitalViewport'
import { orbitalFeatureOwner, type ModeledOrbitalPosition } from './domain/orbital'
import { orbitalViewUnavailableReason, type CapturedOrbitalView } from './domain/orbitalView'
import {
  aircraftViewPosition, aircraftViewUnavailableReason, type AircraftViewPosition, type CapturedAircraftView,
} from './domain/aircraftView'
import { orbitalEnrichmentForPosition } from './domain/orbitalEnrichment'
import {
  DEFAULT_ORBITAL_DISCOVERY_FILTERS,
  deriveOrbitalPopulationCounts,
  selectOrbitalDisplay,
  matchesOrbitalFilters,
  orbitalPositionInViewport,
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
  radiusKm?: number
  onFramingError?: (message: string) => void
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

function App({ objectShareStartup }: { objectShareStartup?: ObjectShareStartup } = {}) {
  const [sharedObject, setSharedObject] = useState<ObjectShareReceipt>()
  const [sharedObjectNotice, setSharedObjectNotice] = useState<string | undefined>(
    objectShareStartup ? 'Opening shared object...' : undefined,
  )
  const pendingSharedObjectRef = useRef<{ receipt: ObjectShareReceipt; deadline: number; filters: string } | undefined>(undefined)
  const sharedObjectDeadlineRef = useRef(0)
  const sharedOrbitalVisibilityRef = useRef<((id: string) => boolean) | null>(null)
  const sharedObjectMountRef = useRef(0)
  const findTrafficSelectionRef = useRef<{ entity: DisplayTrafficEntity; viewRequestId: number } | undefined>(undefined)
  const appShellRef = useRef<HTMLElement>(null)
  const workspaceControlsRef = useRef<WorkspaceControlsHandle>(null)
  const rulerMapRef = useRef<LocalRulerHandle>(null)
  const pointFramingRef = useRef<(() => boolean) | null>(null)
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
    objectShareStartup ? null : readBrowserShareState(APP_CONFIG.navigation.coordinatePrecision),
  )
  const [sharedTheme, setSharedTheme] = useState<ThemePreference | undefined>(sharedState?.preferences?.theme)
  const sharedThemeDismissedRef = useRef(false)
  const [locationCameraIntent] = useState(() => {
    const intent = new LocationCameraIntent()
    if (sharedState?.camera || objectShareStartup) {
      intent.beginExplicitViewIntent()
    }
    return intent
  })
  const {
    preferences,
    updatePreferences,
    resetPreferences,
    status: preferenceStatus,
  } = useAppPreferences(sharedState?.preferences ? { ...sharedState.preferences, theme: undefined } : undefined)
  const {
    layers: storedLayerPreferences,
    trail: trailPreferences,
    theme: savedThemePreference,
    projection: projectionPreference,
    units,
  } = preferences
  const savedObjects = useSavedObjects(APP_CONFIG.saved)
  const savedObjectKeys = useMemo(
    () => new Set(savedObjects.entries.map(savedObjectKey)),
    [savedObjects.entries],
  )
  const themePreference = sharedTheme ?? savedThemePreference
  const [sharedOrbitsEnabled, setSharedOrbitsEnabled] = useState(false)
  const orbitalVisibilityChangedRef = useRef(false)
  const layerPreferences = useMemo(
    () => sharedOrbitsEnabled
      ? updateLayerPreference(storedLayerPreferences, 'orbitalObjectsVisible', true)
      : storedLayerPreferences,
    [sharedOrbitsEnabled, storedLayerPreferences],
  )
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
  const capturedTrafficViewportRef = useRef<TrafficViewport | null>(null)
  const capturedOrbitalRevisionRef = useRef(0)
  const [capturedOrbitalReady, setCapturedOrbitalReady] = useState(false)
  const [capturedEarthFramed, setCapturedEarthFramed] = useState<boolean>()
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
    capturedTrafficViewportRef.current = null
    setCapturedOrbitalView(undefined)
    setCapturedOrbitalReady(false)
    setCapturedEarthFramed(undefined)
    setCapturedOrbitalPlaying(false)
    setCapturedOrbitalDisplayedPosition(undefined)
    setOrbitalViewMessage(reason)
    if (ownedFocus) globalThis.requestAnimationFrame(() => {
      if (!capturedOrbitalViewRef.current && document.activeElement === document.body) {
        rulerMapRef.current?.focusMap()
      }
    })
  }, [])
  const handleCapturedOrbitalReady = useCallback((revision: number, ready: boolean, earthFramed?: boolean) => {
    if (capturedOrbitalViewRef.current?.revision !== revision) return
    setCapturedOrbitalReady(ready)
    setCapturedEarthFramed(earthFramed)
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
  const [capturedAircraftView, setCapturedAircraftView] = useState<CapturedAircraftView>()
  const capturedAircraftViewRef = useRef<CapturedAircraftView | undefined>(undefined)
  const capturedAircraftRevisionRef = useRef(0)
  const [capturedAircraftReady, setCapturedAircraftReady] = useState(false)
  const [capturedAircraftPlaying, setCapturedAircraftPlaying] = useState(false)
  const [capturedAircraftLatest, setCapturedAircraftLatest] = useState<AircraftViewPosition>()
  const [capturedAircraftDisplayedPosition, setCapturedAircraftDisplayedPosition] =
    useState<AircraftViewPosition>()
  const [aircraftViewNotice, setAircraftViewNotice] = useState<string>()
  const finishCapturedAircraftView = useCallback((revision?: number, reason?: string) => {
    const view = capturedAircraftViewRef.current
    if (!view || revision !== undefined && view.revision !== revision) return
    const active = document.activeElement
    const ownedFocus = active === document.body || active?.matches('.maplibregl-canvas') ||
      active?.closest('.details-panel--orbital-view')
    capturedAircraftViewRef.current = undefined
    capturedTrafficViewportRef.current = null
    setCapturedAircraftView(undefined)
    setCapturedAircraftReady(false)
    setCapturedAircraftPlaying(false)
    setCapturedAircraftLatest(undefined)
    setCapturedAircraftDisplayedPosition(undefined)
    setAircraftViewNotice(undefined)
    setOrbitalViewMessage(reason)
    if (ownedFocus) globalThis.requestAnimationFrame(() => {
      const current = document.activeElement
      if (capturedAircraftViewRef.current ||
        current !== document.body && !current?.matches('.maplibregl-canvas')) return
      const entry = document.querySelector<HTMLButtonElement>(`[data-aircraft-view-entry="${CSS.escape(view.position.id)}"]`)
      if (entry && !entry.disabled) entry.focus()
      else rulerMapRef.current?.focusMap()
    })
  }, [])
  const capturedViewActive = Boolean(capturedOrbitalView || capturedAircraftView)
  const finishCapturedViews = useCallback(() => {
    finishCapturedOrbitalView()
    finishCapturedAircraftView()
  }, [finishCapturedAircraftView, finishCapturedOrbitalView])
  const handleCapturedAircraftReady = useCallback((revision: number, ready: boolean) => {
    if (capturedAircraftViewRef.current?.revision === revision) setCapturedAircraftReady(ready)
  }, [])
  const handleCapturedAircraftNotice = useCallback((revision: number, message: string | undefined) => {
    if (capturedAircraftViewRef.current?.revision === revision) setAircraftViewNotice(message)
  }, [])
  const handleCapturedAircraftPosition = useCallback((revision: number, position: AircraftViewPosition) => {
    const view = capturedAircraftViewRef.current
    if (view?.revision === revision && view.position.id === position.id) {
      setCapturedAircraftDisplayedPosition(position)
    }
  }, [])
  const handleCapturedAircraftPause = useCallback((revision: number) => {
    if (capturedAircraftViewRef.current?.revision === revision) setCapturedAircraftPlaying(false)
  }, [])
  const [orbitalFilters, setOrbitalFilters] =
    useState<OrbitalDiscoveryFilters>(
      DEFAULT_ORBITAL_DISCOVERY_FILTERS,
    )
  const handleOrbitalFiltersChange = useCallback((filters: OrbitalDiscoveryFilters) => {
    pendingSharedObjectRef.current = undefined
    setOrbitalFilters(filters)
  }, [])
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
    kind: 'airport' | 'port' | 'orbital'
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
      const reason = error.kind === 'runtime' ? error.message : 'The basemap became unavailable. Returned to the previous map.'
      if (captured) finishCapturedOrbitalView(captured.revision, reason)
      const capturedAircraft = capturedAircraftViewRef.current
      if (capturedAircraft) finishCapturedAircraftView(capturedAircraft.revision, reason)
    }
    setMapError(error)
  }, [clearLocalRuler, finishCapturedAircraftView, finishCapturedOrbitalView])
  const [bathymetryStatus, setBathymetryStatus] = useState<BathymetryStatus>(INITIAL_BATHYMETRY_STATUS)
  const [reliefVisible, setReliefVisible] = useState<boolean>(BASEMAP_DETAIL_CONFIG.reliefVisibleByDefault)
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
  const cancelSharedObject = useCallback(() => {
    objectShareStartup?.cancel()
    pendingSharedObjectRef.current = undefined
    setSharedObject(undefined)
    setSharedObjectNotice(undefined)
    setViewReady(true)
  }, [objectShareStartup])
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
    pause: pausePlaceSearch,
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
      pendingSharedObjectRef.current = undefined
      updatePreferences((current) => ({
        ...current,
        layers: updateLayerPreference(current.layers, key, value),
      }))
    },
    [updatePreferences],
  )
  const setAircraftVisible = useCallback(
    (visible: boolean) => {
      if (!visible) finishCapturedAircraftView(undefined, 'AIRCRAFT is off. Returned to the previous map.')
      setLayerPreference('aircraftVisible', visible)
    },
    [finishCapturedAircraftView, setLayerPreference],
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
      orbitalVisibilityChangedRef.current = true
      setSharedOrbitsEnabled(false)
      if (!visible) finishCapturedOrbitalView()
      if (!visible) setSelectedOrbitalId(null)
      setLayerPreference('orbitalObjectsVisible', visible)
      if (visible && sharedObject?.context.kind === 'orbital') {
        pendingSharedObjectRef.current = {
          receipt: sharedObject,
          deadline: Math.min(performance.now() + OBJECT_SHARE_CONFIG.selectionWaitMs, sharedObjectDeadlineRef.current),
          filters: JSON.stringify([
            updateLayerPreference(layerPreferences, 'orbitalObjectsVisible', true),
            vesselFilters, orbitalFilters,
          ]),
        }
      }
    },
    [finishCapturedOrbitalView, layerPreferences, orbitalFilters, setLayerPreference, sharedObject, vesselFilters],
  )
  const setTrailPreferences = useCallback(
    (trail: typeof trailPreferences) => {
      updatePreferences((current) => ({ ...current, trail }))
    },
    [updatePreferences],
  )
  const setThemePreference = useCallback(
    (nextTheme: typeof themePreference) => {
      sharedThemeDismissedRef.current = true
      setSharedTheme(undefined)
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
      if (nextProjection !== 'auto') finishCapturedViews()
      updatePreferences((current) => ({
        ...current,
        projection: nextProjection,
      }))
    },
    [finishCapturedViews, updatePreferences],
  )
  const setVesselFilters = useCallback(
    (nextFilters: typeof vesselFilters) => {
      pendingSharedObjectRef.current = undefined
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
      options: { explicit?: boolean; camera?: MapCameraState; radiusKm?: number; onFramingError?: (message: string) => void; preserveSharedObject?: boolean } = {},
    ) => {
      if (!options.preserveSharedObject) cancelSharedObject()
      finishCapturedViews()
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
        radiusKm: options.radiusKm,
        onFramingError: options.onFramingError,
      }))
    },
    [cancelPlaceSearch, cancelSharedObject, clearJourney, clearLocalRuler, finishCapturedViews, locationCameraIntent],
  )

  useEffect(() => {
    if (
      !location.initialReady ||
      location.revision <= appliedLocationRevisionRef.current
    ) {
      return
    }

    appliedLocationRevisionRef.current = location.revision
    if (!objectShareStartup?.pending) setViewReady(true)
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
    objectShareStartup,
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
  const trafficPauseNotice = currentAssessment?.kind === 'ineligible' ? currentAssessment
    : !currentAssessment && (viewRequest.radiusKm ?? 0) > APP_CONFIG.map.maximumViewportRadiusKm
      ? { message: 'Zoom in to see live traffic', viewport: undefined }
      : undefined
  const currentOrbitalViewport =
    viewReady && viewportReport?.viewRequestId === viewRequest.id
      ? viewportReport.orbitalViewport
      : undefined
  const currentOrbitalRawZoom =
    viewReady && viewportReport?.viewRequestId === viewRequest.id
      ? viewportReport.rawZoom
      : undefined
  const activeViewport =
    capturedViewActive
      ? capturedTrafficViewportRef.current
      : viewReady && currentAssessment?.kind === 'eligible'
      ? currentAssessment.viewport
      : null
  const capturedLocalTraffic = Boolean(capturedOrbitalView && activeViewport)
  const capturedGroundTraffic = capturedLocalTraffic && capturedOrbitalReady && capturedEarthFramed === false
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
  const aircraftResult = useAircraftTraffic(trafficQuery, APP_CONFIG.aircraft, Boolean(capturedOrbitalView && !capturedLocalTraffic))
  const marineResult = useMarineTraffic(trafficQuery, APP_CONFIG.marine, Boolean(capturedOrbitalView && !capturedLocalTraffic))
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
  const lastSavedObservationAt = useCallback(
    (entry: SavedObject) =>
      entry.kind === 'aircraft' || entry.kind === 'vessel'
        ? history.lastRetainedObservationAt(entry.kind, entry.id)
        : undefined,
    [history],
  )
  useEffect(() => {
    returnToLiveRef.current = returnToLive
  }, [returnToLive])
  const historyActive = history.playback.mode !== 'live'
  const shipLocateAllowedRef = useRef(false)
  useLayoutEffect(() => {
    shipLocateAllowedRef.current = !historyActive && !capturedViewActive && online && mapError?.kind !== 'initialization'
  }, [historyActive, capturedViewActive, online, mapError])
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
  const returnFromCapturedOrbitalView = useCallback((revision: number) => {
    const view = capturedOrbitalViewRef.current
    if (!view || view.revision !== revision || view.revision !== capturedOrbitalView?.revision ||
      view.viewRequestId !== viewRequest.id) return
    if (orbitalObjectsVisible && !historyActive && capturedGenerationMatches && (
      capturedOrbitalState?.phase === 'paused-capture' ||
      capturedOrbitalState?.phase === 'paused-hidden' ||
      acceptedOrbitalPositionForCapture(view.position.id)
    )) setSelectedOrbitalId(view.position.id)
    finishCapturedOrbitalView(view.revision)
  }, [acceptedOrbitalPositionForCapture, capturedGenerationMatches, capturedOrbitalState?.phase,
    capturedOrbitalView?.revision, finishCapturedOrbitalView, historyActive, orbitalObjectsVisible, viewRequest.id])
  useEffect(() => {
    if (!capturedOrbitalView || !capturedOrbitalState ||
      capturedOrbitalState.capturePauseRevision !== capturedOrbitalView.revision) return
    if (capturedGenerationMatches && ['paused-capture', 'paused-hidden'].includes(capturedOrbitalState.phase)) return
    finishCapturedOrbitalView(capturedOrbitalView.revision,
      capturedGenerationMatches
        ? `${capturedOrbitalState.message ?? 'The captured model is no longer valid.'} Returned to the previous map.`
        : 'The captured catalog generation changed. Returned to the previous map.')
  }, [capturedGenerationMatches, capturedOrbitalState, capturedOrbitalView, finishCapturedOrbitalView])
  const returnFromCapturedAircraftView = useCallback((revision: number) => {
    const view = capturedAircraftViewRef.current
    if (!view || view.revision !== revision) return
    const restoredSelection = view.viewRequestId === viewRequest.id && aircraftVisible && !historyActive &&
      liveViewportAircraft.some(entity => entity.id === view.position.id &&
        now - entity.position.observedAt <= APP_CONFIG.aircraft.staleAfterMs)
    finishCapturedAircraftView(view.revision)
    if (restoredSelection) setSelectedId(view.position.id)
  }, [aircraftVisible, finishCapturedAircraftView, historyActive, liveViewportAircraft, now, viewRequest.id])
  const capturedAircraftCurrent = capturedAircraftLatest ?? capturedAircraftView?.position
  useEffect(() => {
    const view = capturedAircraftView
    if (!view || !capturedAircraftCurrent) return
    const entity = aircraftResult.entities.find(candidate => candidate.id === view.position.id)
    if (entity && entity.position.observedAt > capturedAircraftCurrent.observedAt) {
      if (entity.altitudeMeters === 0 || entity.altitudeMeters !== undefined &&
        entity.altitudeMeters < AIRCRAFT_VIEW_CONFIG.minimumAltitudeMeters) {
        finishCapturedAircraftView(view.revision,
          `${view.position.name} reported an altitude below ${AIRCRAFT_VIEW_CONFIG.minimumAltitudeMeters} m. Returned to the previous map.`)
        return
      }
      const next = aircraftViewPosition({ ...entity, freshness: 'live' }, capturedAircraftCurrent.travelBearingDegrees)
      if (next) {
        setCapturedAircraftLatest(next)
        return
      }
    }
    if (now - capturedAircraftCurrent.observedAt > APP_CONFIG.aircraft.expireAfterMs) {
      finishCapturedAircraftView(view.revision,
        `No new report from ${view.position.name} for ${Math.round(APP_CONFIG.aircraft.expireAfterMs / 1_000)} s. Returned to the previous map.`)
    }
  }, [aircraftResult.entities, capturedAircraftCurrent, capturedAircraftView, finishCapturedAircraftView, now])
  const capturedAircraftHolding = Boolean(capturedAircraftCurrent &&
    now - capturedAircraftCurrent.observedAt > APP_CONFIG.aircraft.staleAfterMs)
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
  const aircraftAvailability = useMemo(
    () =>
      aircraftInViewAvailability({
        historyActive,
        viewportReady: viewReady && currentAssessment !== null,
        viewportEligible: currentAssessment?.kind === 'eligible',
        online,
        status: aircraftResult.status,
        count: aircraft.length,
      }),
    [
      aircraft.length,
      aircraftResult.status,
      currentAssessment,
      historyActive,
      online,
      viewReady,
    ],
  )
  const vesselAvailability = useMemo(
    () =>
      vesselInViewAvailability({
        historyActive,
        viewportReady: viewReady && currentAssessment !== null,
        viewportEligible: currentAssessment?.kind === 'eligible',
        online,
        status: marineResult.status,
        count: vessels.length,
      }),
    [
      currentAssessment,
      historyActive,
      marineResult.status,
      online,
      vessels.length,
      viewReady,
    ],
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
    () => {
      const current = displayEntities.find((entity) => entity.id === selectedId)
      if (current) return current
      const pending = findTrafficSelectionRef.current
      if (pending?.entity.id !== selectedId || pending.viewRequestId !== viewRequest.id ||
        viewportReport?.viewRequestId === viewRequest.id) return undefined
      return displayTraffic([pending.entity], displayNow,
        pending.entity.kind === 'aircraft' ? APP_CONFIG.aircraft : APP_CONFIG.marine)[0]
    },
    [displayEntities, displayNow, selectedId, viewRequest.id, viewportReport?.viewRequestId],
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
  const selectedTrafficSavedObject = useMemo(
    () =>
      selectedEntity && !historyActive
        ? createSavedTrafficObject(
            selectedEntity,
            now,
            APP_CONFIG.saved.maxLabelLength,
          )
        : undefined,
    [historyActive, now, selectedEntity],
  )
  const selectedOrbitalSavedObject = useMemo(
    () =>
      selectedOrbitalPosition
        ? createSavedOrbitalObject(
            selectedOrbitalPosition,
            now,
            APP_CONFIG.saved.maxLabelLength,
          )
        : undefined,
    [now, selectedOrbitalPosition],
  )
  const selectedAirportSavedObject = useMemo(
    () =>
      selectedAirport && airportsResult.state.phase === 'ready'
        ? createSavedAirportObject(
            selectedAirport,
            airportsResult.state.dataset.source,
            now,
            APP_CONFIG.saved.maxLabelLength,
          )
        : undefined,
    [airportsResult.state, now, selectedAirport],
  )
  const selectedPortSavedObject = useMemo(
    () =>
      selectedPort && portsResult.state.phase === 'ready'
        ? createSavedPortObject(
            selectedPort,
            portsResult.state.dataset.source,
            now,
            APP_CONFIG.saved.maxLabelLength,
          )
        : undefined,
    [now, portsResult.state, selectedPort],
  )
  const aircraftMetadata = useAircraftMetadata(
    !capturedViewActive && !historyActive && selectedEntity?.kind === 'aircraft'
      ? selectedEntity
      : undefined,
    aircraftMetadataProvider,
    displayNow,
  )
  const aircraftPhotoFeatureEnabled =
    APP_CONFIG.aircraftPhoto.enabled && !historyActive && !capturedViewActive
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
    !capturedViewActive && !historyActive && selectedEntity?.kind === 'vessel' ? selectedEntity : undefined,
    vesselPhotoProvider,
  )
  const hoveredVesselPhoto = useVesselPhoto(
    !capturedViewActive && !historyActive ? hoveredVessel : undefined,
    vesselPhotoProvider,
  )
  const flightRouteEnabled =
    APP_CONFIG.flightRoute.enabled &&
    !capturedViewActive &&
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
        selectedOrbitalState.phase !== 'paused-capture' &&
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
    cancelSharedObject()
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
  }, [cancelJourneyPreparation, cancelSharedObject, locationCameraIntent, viewRequest.id])

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
    cancelSharedObject()
    finishCapturedViews()
    clearJourney()
    locationCameraIntent.requestLocationNavigation()
    cancelPlaceSearch()
    requestLocation()
  }, [cancelPlaceSearch, cancelSharedObject, clearJourney, finishCapturedViews, locationCameraIntent, requestLocation])

  const handlePlaceSearch = useCallback(
    (query: string) => {
      cancelSharedObject()
      clearJourney()
      locationCameraIntent.beginExplicitViewIntent()
      setViewReady(true)
      searchPlaces(query)
    },
    [cancelSharedObject, clearJourney, locationCameraIntent, searchPlaces],
  )

  const handleLocationNavigate = useCallback(
    (center: AppCenter) => {
      commitNavigation(center, center.label)
    },
    [commitNavigation],
  )
  const handleFindReportNavigate = useCallback(
    (center: AppCenter, kind: 'aircraft' | 'vessel') => {
      commitNavigation(center, center.label, { radiusKm: FIND_VIEW_RADIUS_KM[kind] })
    },
    [commitNavigation],
  )
  const handleBeginShipLocate = useCallback((): ShipLocateNavigation | null => {
    if (!shipLocateAllowedRef.current || document.hidden || !navigator.onLine) return null
    const revision = locationCameraIntent.beginExplicitViewIntent()
    if (objectShareStartup?.pending) {
      cancelSharedObject()
      setViewReady(true)
    }
    return (center, onFramingError) => {
      if (!shipLocateAllowedRef.current || !locationCameraIntent.isCurrent(revision) ||
        document.hidden || !navigator.onLine) return false
      if (Math.abs(center.latitude) > DISCOVERY_CONFIG.shipPositionMaximumLatitude) {
        onFramingError('The report is outside safe local map framing. Your view was kept.')
        return false
      }
      if (!pointFramingRef.current?.()) {
        onFramingError('Close a menu or enlarge the view to frame this position. Your view was kept.')
        return false
      }
      commitNavigation(center, center.label, {
        radiusKm: FIND_VIEW_RADIUS_KM.vessel, onFramingError,
      })
      return true
    }
  }, [cancelSharedObject, commitNavigation, locationCameraIntent, objectShareStartup])

  const handlePlaceResultSelect = useCallback(
    (result: PlaceSearchResult) => {
      commitNavigation(result.center, result.label, { radiusKm: FIND_VIEW_RADIUS_KM.place })
    },
    [commitNavigation],
  )

  const handleManualViewChange = useCallback(() => {
    if (capturedOrbitalViewRef.current || capturedAircraftViewRef.current) return
    cancelSharedObject()
    cancelJourneyPreparation()
    locationCameraIntent.beginExplicitViewIntent()
    cancelPlaceSearch()
    setViewReady(true)
    setActiveLocationLabel('Custom view')
    setJourney(manuallyExploreJourney)
    setViewRequest(current => current.journey
      ? { ...current, cancelled: true }
      : current)
  }, [cancelJourneyPreparation, cancelPlaceSearch, cancelSharedObject, locationCameraIntent])

  const handleShare = useCallback(() => {
    if (!mapCamera) return
    const url = createShareUrl(
      window.location,
      mapCamera,
      { ...preferences, theme, layers: layerPreferences },
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
  }, [layerPreferences, mapCamera, preferences, theme])

  const handleResetPreferences = useCallback(() => {
    cancelSharedObject()
    finishCapturedViews()
    orbitalVisibilityChangedRef.current = true
    setSharedOrbitsEnabled(false)
    sharedThemeDismissedRef.current = true
    setSharedTheme(undefined)
    resetPreferences()
    setReliefVisible(BASEMAP_DETAIL_CONFIG.reliefVisibleByDefault)
    setShareFeedback(undefined)
    const url = new URL(window.location.href)
    if (!url.hash) return
    url.hash = ''
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}`,
    )
  }, [cancelSharedObject, finishCapturedViews, resetPreferences])

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
    (id: string | null, originId: string | null, fromSharedObject = false) => {
      if (!fromSharedObject) {
        locationCameraIntent.beginExplicitViewIntent()
        cancelSharedObject()
      }
      finishCapturedViews()
      clearJourney()
      detailFocusOriginIdRef.current = id ? originId : null
      setSelectedOrbitalId(null)
      setSelectedPortId(null)
      setSelectedAirportId(null)
      setSelectedWeatherId(null)
      setSelectedId(id)
    },
    [cancelSharedObject, clearJourney, finishCapturedViews, locationCameraIntent],
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
  const handleFindTrafficNavigate = useCallback((id: string, originId: string) => {
    const entity = aircraft.find(candidate => candidate.id === id) ?? currentVessels.find(candidate => candidate.id === id)
    if (!entity) return
    const label = entity.kind === 'aircraft'
      ? entity.callsign ?? entity.registration ?? entity.hex
      : entity.name ?? String(entity.mmsi)
    findTrafficSelectionRef.current = { entity, viewRequestId: viewRequest.id + 1 }
    commitNavigation({ ...entity.position, label }, label, { radiusKm: FIND_VIEW_RADIUS_KM[entity.kind] })
    selectTraffic(id, originId)
  }, [aircraft, commitNavigation, currentVessels, selectTraffic, viewRequest.id])

  const handleMapPortSelect = useCallback((id: string | null) => {
    locationCameraIntent.beginExplicitViewIntent()
    cancelSharedObject()
    finishCapturedViews()
    clearJourney()
    detailFocusOriginIdRef.current = null
    setSelectedId(null)
    setSelectedOrbitalId(null)
    setSelectedAirportId(null)
    setSelectedWeatherId(null)
    setCatalogSelection(null)
    setSelectedPortId(id)
  }, [cancelSharedObject, clearJourney, finishCapturedViews, locationCameraIntent])

  const selectAirport = useCallback(
    (id: string | null, originId: string | null) => {
      locationCameraIntent.beginExplicitViewIntent()
      cancelSharedObject()
      finishCapturedViews()
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
    [cancelSharedObject, clearJourney, finishCapturedViews, locationCameraIntent],
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
    commitNavigation({ latitude: airport.latitude, longitude: airport.longitude, label }, label,
      { radiusKm: FIND_VIEW_RADIUS_KM.airport })
    selectAirport(id, originId)
    setCatalogSelection({ kind: 'airport', id, expandMobileDetails: mobileWorkspace })
    return true
  }, [airports, commitNavigation, mobileWorkspace, selectAirport])
  const handleFindPortNavigate = useCallback((id: string, originId: string) => {
    const port = ports.find((candidate) => candidate.id === id)
    if (!port) return false
    const label = `Port: ${port.name}`
    commitNavigation({ latitude: port.latitude, longitude: port.longitude, label }, label,
      { radiusKm: FIND_VIEW_RADIUS_KM.port })
    handleMapPortSelect(id)
    detailFocusOriginIdRef.current = originId
    setCatalogSelection({ kind: 'port', id, expandMobileDetails: mobileWorkspace })
    return true
  }, [commitNavigation, handleMapPortSelect, mobileWorkspace, ports])

  const selectWeather = useCallback(
    (id: string | null, originId: string | null) => {
      locationCameraIntent.beginExplicitViewIntent()
      cancelSharedObject()
      finishCapturedViews()
      clearJourney()
      detailFocusOriginIdRef.current = id ? originId : null
      setSelectedId(null)
      setSelectedOrbitalId(null)
      setSelectedPortId(null)
      setSelectedAirportId(null)
      setSelectedWeatherId(id)
    },
    [cancelSharedObject, clearJourney, finishCapturedViews, locationCameraIntent],
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
    (id: string | null, originId: string | null, fromSharedObject = false) => {
      if (!fromSharedObject) {
        locationCameraIntent.beginExplicitViewIntent()
        cancelSharedObject()
      }
      finishCapturedViews()
      clearJourney()
      detailFocusOriginIdRef.current = id ? originId : null
      setSelectedId(null)
      setSelectedPortId(null)
      setSelectedAirportId(null)
      setSelectedWeatherId(null)
      setCatalogSelection(null)
      setSelectedOrbitalId(id)
    },
    [cancelSharedObject, clearJourney, finishCapturedViews, locationCameraIntent],
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
  const handleFindOrbitalNavigate = useCallback((id: string, originId: string) => {
    const entry = loadedOrbitalCatalog(
      orbitalState, starlinkState, id, Date.now(), APP_CONFIG.orbital.expireAfterMs,
    ).entries.find((candidate) => candidate.id === id)
    const source = acceptedOrbitalPositionForCapture(id)
    if (!entry?.position || !source || source.snapshot !== entry.snapshot) return false
    const label = `Modeled: ${entry.record.name}`
    commitNavigation({
      latitude: source.position.latitude, longitude: source.position.longitude, label,
    }, label, { radiusKm: FIND_VIEW_RADIUS_KM.orbital })
    selectOrbital(id, originId)
    setCatalogSelection({ kind: 'orbital', id, expandMobileDetails: mobileWorkspace })
    return true
  }, [acceptedOrbitalPositionForCapture, commitNavigation, mobileWorkspace, orbitalState, selectOrbital, starlinkState])

  const restoreDetailFocus = useCallback(() => {
    const originId = detailFocusOriginIdRef.current
    detailFocusOriginIdRef.current = null
    focusAfterRender(originId)
  }, [focusAfterRender])

  const handleCloseTraffic = useCallback(() => {
    cancelSharedObject()
    clearJourney()
    setSelectedId(null)
    restoreDetailFocus()
  }, [cancelSharedObject, clearJourney, restoreDetailFocus])

  const selectedMarineJourneyIdentity = selectedEntity?.kind === 'vessel'
    ? marineJourneyIdentity(selectedEntity) : undefined
  useEffect(() => {
    if (marineJourneyCapture.pendingIdentity !== selectedMarineJourneyIdentity) cancelJourneyPreparation()
  }, [cancelJourneyPreparation, marineJourneyCapture, selectedMarineJourneyIdentity])

  const handleShowJourney = useCallback(async () => {
    if (!selectedEntity || historyActive || !mapCamera || marineJourneyCapture.pending) return
    cancelSharedObject()
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
  }, [activeLocationLabel, cancelPlaceSearch, cancelSharedObject, clearLocalRuler, flightRoute.state, historyActive, liveTrail, locationCameraIntent, mapCamera, marineJourneyCapture, online, selectedEntity])

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
    cancelSharedObject()
    setSelectedOrbitalId(null)
    restoreDetailFocus()
  }, [cancelSharedObject, restoreDetailFocus])

  const handleCaptureOrbitalView = useCallback((id: string) => {
    if (historyActive || mapError || capturedAircraftViewRef.current) return
    const source = acceptedOrbitalPositionForCapture(id)
    const reason = orbitalViewUnavailableReason(source?.position, projectionPreference)
    if (!source || reason) {
      setOrbitalViewMessage(reason ?? 'The accepted modeled position changed. Select the object again.')
      return
    }
    cancelSharedObject()
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
    capturedTrafficViewportRef.current = activeViewport
    capturedOrbitalViewRef.current = view
    setCapturedOrbitalView(view)
    setCapturedOrbitalReady(false)
    setCapturedEarthFramed(undefined)
    setCapturedOrbitalDisplayedPosition(view.position)
    setCapturedOrbitalPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    setOrbitalViewMessage(undefined)
    setInspectorExpanded(false)
  }, [
    cancelPlaceSearch, cancelSharedObject, clearJourney, clearLocalRuler, historyActive, locationCameraIntent,
    mapError, acceptedOrbitalPositionForCapture, projectionPreference,
    viewRequest.id, activeViewport,
  ])

  const selectedAircraftViewUnavailable = selectedEntity?.kind === 'aircraft'
    ? historyActive ? 'View from here is unavailable in HISTORY.'
      : mapError ? 'View from here needs the basemap.'
        : !activeViewport ? 'View from here needs an eligible live map view.'
          : aircraftViewUnavailableReason(selectedEntity, projectionPreference)
    : undefined
  const handleCaptureAircraftView = useCallback(() => {
    if (capturedOrbitalViewRef.current || capturedAircraftViewRef.current || selectedEntity?.kind !== 'aircraft') return
    const position = selectedAircraftViewUnavailable ? undefined : aircraftViewPosition(selectedEntity)
    if (!position) return
    cancelSharedObject()
    const view: CapturedAircraftView = Object.freeze({
      position, revision: ++capturedAircraftRevisionRef.current, viewRequestId: viewRequest.id,
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
    capturedTrafficViewportRef.current = activeViewport
    capturedAircraftViewRef.current = view
    setCapturedAircraftView(view)
    setCapturedAircraftReady(false)
    setCapturedAircraftLatest(position)
    setCapturedAircraftDisplayedPosition(position)
    setCapturedAircraftPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    setAircraftViewNotice(undefined)
    setOrbitalViewMessage(undefined)
    setInspectorExpanded(false)
  }, [
    activeViewport, cancelPlaceSearch, cancelSharedObject, clearJourney, clearLocalRuler, locationCameraIntent,
    selectedAircraftViewUnavailable, selectedEntity, viewRequest.id,
  ])

  const handleEnterHistory = useCallback(() => {
    locationCameraIntent.beginExplicitViewIntent()
    cancelSharedObject()
    finishCapturedViews()
    clearLocalRuler()
    clearJourney()
    setSelectedOrbitalId(null)
    enterHistory()
    globalThis.requestAnimationFrame(() => {
      if (canRestoreFocus(historyPlaybackControlRef.current)) {
        historyPlaybackControlRef.current?.focus()
      }
    })
  }, [cancelSharedObject, clearJourney, clearLocalRuler, enterHistory, finishCapturedViews, locationCameraIntent])

  const sharedObjectFilters = JSON.stringify([layerPreferences, vesselFilters, orbitalFilters])
  useEffect(() => {
    if (!objectShareStartup) return
    const mount = ++sharedObjectMountRef.current
    const cancelAfterUnmount = () => {
      if (sharedObjectMountRef.current === mount) objectShareStartup.cancel()
    }
    let subscribed = true
    void objectShareStartup.result.then(result => {
      if (!subscribed || !objectShareStartup.consume()) return
      setViewReady(true)
      if ('error' in result) {
        setSharedObjectNotice(result.error)
        return
      }
      const { receipt, linkDeadline } = result
      sharedObjectDeadlineRef.current = linkDeadline
      const { context } = receipt
      if (!sharedThemeDismissedRef.current && context.theme) setSharedTheme(context.theme)
      const enableSharedOrbits = context.kind === 'orbital' && !orbitalVisibilityChangedRef.current
      if (enableSharedOrbits) setSharedOrbitsEnabled(true)
      if (context.position) {
        const label = `Shared object: ${context.label}`
        commitNavigation({ ...context.position, label }, label, {
          preserveSharedObject: true,
          radiusKm: OBJECT_SHARE_CONFIG.framingRadiusKm[context.kind],
        })
      }
      setSharedObjectNotice(undefined)
      setSharedObject(receipt)
      setInspectorExpanded(true)
      pendingSharedObjectRef.current = {
        receipt, deadline: Math.min(performance.now() + OBJECT_SHARE_CONFIG.selectionWaitMs, linkDeadline),
        filters: enableSharedOrbits
          ? JSON.stringify([
            updateLayerPreference(layerPreferences, 'orbitalObjectsVisible', true),
            vesselFilters, orbitalFilters,
          ])
          : sharedObjectFilters,
      }
    })
    return () => {
      subscribed = false
      queueMicrotask(cancelAfterUnmount)
    }
  }, [commitNavigation, layerPreferences, objectShareStartup, orbitalFilters, sharedObjectFilters, vesselFilters])

  useEffect(() => {
    const pending = pendingSharedObjectRef.current
    // An older render must not consume a newly resolved receipt.
    if (!pending || pending.receipt !== sharedObject) return
    if (historyActive || capturedOrbitalView || pending.filters !== sharedObjectFilters ||
      performance.now() >= pending.deadline) {
      pendingSharedObjectRef.current = undefined
      return
    }
    if (!currentAssessment) return
    const context = pending.receipt.context
    if (context.kind === 'orbital') {
      if (!orbitalObjectsVisible) {
        pendingSharedObjectRef.current = undefined
        return
      }
      const id = sharedOrbitalId(context)
      const current = id ? acceptedOrbitalPositionForCapture(id) : undefined
      if (!id || !current || !sharedOrbitalMatches(context, current.position, current.snapshot)) return
      if (context.view === 'from-here') {
        pendingSharedObjectRef.current = undefined
        handleCaptureOrbitalView(id)
        return
      }
      if (!currentOrbitalViewport ||
        !matchesOrbitalFilters(current.position, context.owner === 'starlink' ? DEFAULT_ORBITAL_DISCOVERY_FILTERS : orbitalFilters) ||
        !(currentOrbitalViewport.kind === 'invalid'
          ? sharedOrbitalVisibilityRef.current?.(id)
          : orbitalPositionInViewport(current.position, currentOrbitalViewport))) return
      pendingSharedObjectRef.current = undefined
      setSharedObject(undefined)
      selectOrbital(id, null, true)
    } else {
      const visible = context.kind === 'aircraft' ? aircraftVisible : vesselsVisible
      if (!visible) {
        pendingSharedObjectRef.current = undefined
        return
      }
      const current = displayEntities.find(entity => sharedTrafficMatches(context, entity))
      if (!current || currentAssessment.kind !== 'eligible') return
      pendingSharedObjectRef.current = undefined
      setSharedObject(undefined)
      selectTraffic(current.id, null, true)
    }
  }, [acceptedOrbitalPositionForCapture, aircraftVisible, capturedOrbitalView, currentAssessment,
    currentOrbitalViewport, displayEntities, handleCaptureOrbitalView, historyActive, now, orbitalFilters, orbitalObjectsVisible,
    selectOrbital, selectTraffic, sharedObject, sharedObjectFilters, vesselsVisible, orbitalState, starlinkState])

  const sharedOrbitalView = sharedObject?.context.kind === 'orbital' && sharedObject.context.view === 'from-here'
  const sharedObjectMessage = sharedOrbitalView
    ? orbitalViewMessage ?? (projectionPreference !== 'auto'
      ? 'View from here needs Auto projection. Flat is unchanged.'
      : !orbitalObjectsVisible ? 'ORBITS is off. View from here was not opened.'
        : pendingSharedObjectRef.current?.receipt === sharedObject &&
          performance.now() < pendingSharedObjectRef.current.deadline
          ? 'Opening current modeled view...'
          : 'Current modeled view unavailable. Showing the shared context.')
    : !sharedObject?.context.position
    ? 'No position was shared. Showing the ordinary map.'
    : sharedObject.context.kind === 'orbital'
      ? orbitalObjectsVisible
        ? (sharedObject.context.owner === 'starlink' ? starlinkState : orbitalState).phase === 'loading'
          ? 'Checking current orbital data. Showing the dated shared point.'
          : 'Current selection is not confirmed. Showing the dated modeled point.'
        : 'ORBITS is off. Showing the dated modeled point.'
      : (sharedObject.context.kind === 'aircraft' ? aircraftVisible : vesselsVisible)
        ? 'Not confirmed by received objects here. Showing the dated shared position.'
        : 'This object layer is off. Your layers and filters are unchanged.'

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
    ? capturedLocalTraffic ? 'Captured view · previous local area reports' : 'Captured orbital view'
    : capturedAircraftView
    ? 'Captured aircraft view'
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
    setInspectorExpanded(!capturedViewActive)
    const openCatalogDetails = catalogSelection?.kind === 'airport'
      ? catalogSelection.id === selectedAirportId
      : catalogSelection?.kind === 'port'
        ? catalogSelection.id === selectedPortId
        : catalogSelection?.kind === 'orbital' && catalogSelection.id === selectedOrbitalId
    setDetailsReturnToTask(openCatalogDetails && catalogSelection?.expandMobileDetails
      ? workspaceControlsRef.current?.suspendTask() ?? false
      : false)
  }, [capturedViewActive, catalogSelection, selectedId, selectedOrbitalId, selectedPortId, selectedAirportId, selectedWeatherId, journey?.snapshot.revision])

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
    if (capturedOrbitalViewRef.current || capturedAircraftViewRef.current || historyActive || mapError) return
    const availability = rulerMapRef.current?.refresh() ?? 'unsupported'
    setRulerAvailability(availability)
    if (availability !== 'available') return
    cancelSharedObject()
    rulerTaskOriginRef.current = workspaceControlsRef.current?.suspendTask() ?? false
    dispatchLocalRuler({ type: 'start' })
    rulerMapRef.current?.focusMap()
  }, [cancelSharedObject, dispatchLocalRuler, historyActive, mapError])
  const rulerBinding = useMemo(() => ({
    state: localRuler,
    read: readLocalRuler,
    disabled: capturedViewActive || historyActive || mapError !== null,
    handleRef: rulerMapRef,
    onPoint: handleRulerPoint,
    onAvailability: handleRulerAvailability,
    onCancel: cancelLocalRuler,
  }), [cancelLocalRuler, capturedViewActive, handleRulerAvailability, handleRulerPoint, historyActive, localRuler, mapError, readLocalRuler])
  const rulerDistance = formatLocalRulerDistance(localRuler.points, units)
  const inspectorIdentity = capturedOrbitalView ? `captured-orbit:${capturedOrbitalView.revision}`
    : capturedAircraftView ? `captured-aircraft:${capturedAircraftView.revision}` : journey ? `journey:${journey.snapshot.revision}` :
    selectedId ?? selectedOrbitalId ?? selectedPortId ?? selectedAirportId ?? selectedWeatherId ?? (sharedObject ? 'shared-object' : null)
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
      data-aircraft-view={capturedAircraftView ? capturedAircraftReady ? 'captured' : 'preparing' : undefined}
    >
      <TrafficMap
        orbitalVisibilityRef={sharedOrbitalVisibilityRef}
        capturedOrbitalView={capturedOrbitalView}
        capturedOrbitalViewAcknowledged={capturedOrbitalAcknowledged}
        capturedOrbitalPlaying={capturedOrbitalPlaying}
        capturedOrbitalPosition={capturedOrbitalState?.viewPosition}
        displayTime={capturedOrbitalView
          ? (capturedOrbitalDisplayedPosition ?? capturedOrbitalView.position).modeledFor
          : displayNow}
        onCapturedOrbitalViewEnd={finishCapturedOrbitalView}
        onCapturedOrbitalViewReturn={returnFromCapturedOrbitalView}
        onCapturedOrbitalViewReady={handleCapturedOrbitalReady}
        onCapturedOrbitalViewNotice={handleCapturedOrbitalNotice}
        onCapturedOrbitalViewPosition={handleCapturedOrbitalPosition}
        onCapturedOrbitalViewPause={handleCapturedOrbitalPause}
        capturedAircraftView={capturedAircraftView}
        capturedAircraftPlaying={capturedAircraftPlaying}
        capturedAircraftPosition={capturedAircraftCurrent}
        onCapturedAircraftViewEnd={finishCapturedAircraftView}
        onCapturedAircraftViewReturn={returnFromCapturedAircraftView}
        onCapturedAircraftViewReady={handleCapturedAircraftReady}
        onCapturedAircraftViewNotice={handleCapturedAircraftNotice}
        onCapturedAircraftViewPosition={handleCapturedAircraftPosition}
        onCapturedAircraftViewPause={handleCapturedAircraftPause}
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
        pointFrame={viewRequest.radiusKm ? { radiusKm: viewRequest.radiusKm, onError: viewRequest.onFramingError ?? setSharedObjectNotice } : undefined}
        pointFramingRef={pointFramingRef}
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
          capturedViewActive || mapError !== null || historyActive || localRuler.phase === 'placing' ||
          (mobileWorkspace && (activeWorkspaceTask !== null || inspectorIdentity !== null))
        }
        aircraft={capturedAircraftView || capturedOrbitalView && !capturedGroundTraffic ? EMPTY_VIEW_OUTPUT : trafficContext ? contextAircraft : aircraft}
        vessels={capturedAircraftView || capturedOrbitalView && !capturedGroundTraffic ? EMPTY_VIEW_OUTPUT : trafficContext ? contextVessels : vessels}
        trafficContext={trafficContext || capturedLocalTraffic}
        ports={ports}
        airports={airports}
        weatherObservations={weatherObservations}
        orbitalPositions={capturedViewActive ? EMPTY_VIEW_OUTPUT : orbitalState.positions}
        orbitalShownIds={orbitalDisplay.shownIds}
        orbitalTrackSegments={orbitalState.prediction.trackSegments}
        starlinkPositions={capturedViewActive ? EMPTY_VIEW_OUTPUT : starlinkState.positions}
        starlinkShownIds={starlinkDisplay.shownIds}
        starlinkTrackSegments={
          starlinkState.prediction.trackSegments
        }
        orbitalImageUrls={loadedOrbitalImageUrls}
        trailSegments={capturedViewActive ? EMPTY_VIEW_OUTPUT : trailSegments}
        selectedId={selectedId}
        selectedOrbitalId={selectedOrbitalId}
        selectedPortId={selectedPortId}
        selectedAirportId={selectedAirportId}
        selectedWeatherId={selectedWeatherId}
        aircraftVisible={aircraftVisible && !capturedAircraftView && (!capturedOrbitalView || capturedGroundTraffic)}
        vesselsVisible={vesselsVisible && !capturedAircraftView && (!capturedOrbitalView || capturedGroundTraffic)}
        portsVisible={portsVisible && !capturedViewActive}
        airportsVisible={airportsVisible && !capturedViewActive}
        weatherVisible={weatherVisible && !capturedViewActive}
        depthsVisible={depthsVisible}
        onBathymetryStatus={setBathymetryStatus}
        reliefVisible={reliefVisible}
        onReliefStatus={setReliefStatus}
        orbitalVisible={orbitalObjectsVisible && !historyActive && !capturedViewActive}
        starlinkVisible={orbitalObjectsVisible && !historyActive && !capturedViewActive}
        clusteringEnabled={clusteringEnabled && !trafficContext && !capturedViewActive}
        interpolateTraffic={!capturedViewActive && !historyActive && !trafficContext}
        interpolationDurationMs={APP_CONFIG.interpolationDurationMs}
        aircraftPhotoEnabled={aircraftPhotoFeatureEnabled && !capturedViewActive}
        aircraftPhoto={hoveredAircraftPhoto.state}
        aircraftPhotoHoverDelayMs={
          APP_CONFIG.aircraftPhoto.hoverDelayMs
        }
        vesselPhotoEnabled={!historyActive && !capturedViewActive}
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
          rulerAvailable={!capturedViewActive && !historyActive && mapError === null && rulerAvailability === 'available'}
          rulerMessage={capturedViewActive ? 'Distance ruler is unavailable in a captured view.'
            : historyActive ? 'Distance ruler is unavailable in HISTORY.'
            : mapError ? 'Distance ruler is unavailable while the map recovers.'
              : rulerAvailability === 'unsupported' && projectionPreference === 'flat'
                ? 'Zoom in or remove map tilt.'
              : rulerAvailabilityMessage(rulerAvailability)}
          rulerDistance={localRuler.phase === 'retained' ? rulerDistance : undefined}
          onStartRuler={startLocalRuler}
          onClearRuler={clearLocalRuler}
          fullscreen={fullscreenState}
          onEnterFullscreen={enterFullscreen}
          onExitFullscreen={exitFullscreen}
          marineProviderName={marineResult.capabilities.name}
          discoveryPaused={capturedViewActive || historyActive || !online}
          discoverMarineMetadata={marineResult.discoverMetadata}
          findAircraft={aircraft}
          findVessels={currentVessels}
          catalogAirports={airports}
          catalogPorts={ports}
          portsReady={portsResult.state.phase === 'ready'}
          airportSource={airportsResult.state.phase === 'ready' ? airportsResult.state.dataset.source : undefined}
          portSource={portsResult.state.phase === 'ready' ? portsResult.state.dataset.source : undefined}
          inView={
            <InViewPanel
              unavailableMessage={capturedOrbitalView
                ? 'In View is unavailable from a modeled view. Return to map to browse local reports.'
                : capturedAircraftView
                  ? 'In View is unavailable from an aircraft view. Return to map to browse local reports.'
                  : undefined}
              aircraft={aircraftResults}
              totalAircraft={aircraft.length}
              aircraftQuery={aircraftQuery}
              aircraftVisible={aircraftVisible}
              aircraftAvailability={aircraftAvailability}
              selectedAircraftId={selectedId}
              onAircraftQueryChange={setAircraftQuery}
              onAircraftSelect={selectTraffic}
              vessels={vessels}
              vesselsVisible={vesselsVisible}
              vesselAvailability={vesselAvailability}
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
              savedKeys={savedObjectKeys}
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
              {(!capturedOrbitalView || capturedLocalTraffic) && <LiveStatus
                compact={mobileWorkspace}
                scopeLabel={capturedLocalTraffic || capturedAircraftView ? 'Previous local area' : undefined}
                aircraftCount={aircraftVisible ? aircraft.length : 0}
                vesselCount={vesselsVisible ? vessels.length : 0}
                aircraftStatus={aircraftResult.status}
                marineStatus={marineResult.status}
                marineCapabilities={marineResult.capabilities}
                now={now}
                online={online}
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
          onFindTrafficNavigate={handleFindTrafficNavigate}
          onFindReportNavigate={handleFindReportNavigate}
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
          onOrbitalNavigate={handleFindOrbitalNavigate}
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
          onOrbitalFiltersChange={handleOrbitalFiltersChange}
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
            !capturedViewActive && isNorthResetUseful(
              mapCamera?.bearing,
              APP_CONFIG.navigation.northResetToleranceDegrees,
            ) ? mapCamera?.bearing : undefined
          }
          onResetNorth={handleResetNorth}
          locationAvailable={location.canRequest}
          locationLoading={location.locating}
          locationMessage={location.phase === 'error' ? location.message : undefined}
          onUseLocation={handleUseLocation}
          themePreference={themePreference}
          onThemePreferenceChange={setThemePreference}
          projectionPreference={projectionPreference}
          onProjectionPreferenceChange={setProjectionPreference}
          onUnitsChange={setUnits}
          shareDisabled={capturedViewActive || !mapCamera}
          onShare={handleShare}
          onResetPreferences={handleResetPreferences}
          preferenceStatus={
            shareFeedback?.message ?? (preferenceStatus?.kind === 'error' ? preferenceStatus.message : undefined)
          }
          manualShareUrl={shareFeedback?.manualUrl}
          appShellStatus={['error', 'unsupported', 'retiring'].includes(appShell.phase) ? appShell.message : undefined}
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
          onBeginShipLocate={handleBeginShipLocate}
          onPlaceResultSelect={handlePlaceResultSelect}
          onPlaceSearchCancel={cancelPlaceSearch}
          onPlaceSearchPause={pausePlaceSearch}
          savedEntries={savedObjects.entries}
          savedStatus={savedObjects.status}
          aircraftAvailability={aircraftAvailability}
          vesselAvailability={vesselAvailability}
          lastSavedObservationAt={lastSavedObservationAt}
          onRemoveSaved={savedObjects.remove}
          onClearSaved={savedObjects.clear}
          onRestoreSaved={savedObjects.restore}
          mapToolsSummaryRef={mapToolsSummaryRef}
          settingsSummaryRef={settingsSummaryRef}
        />

        {sharedObjectNotice && (
          <div className="viewport-notice" role="status">
            <span>{sharedObjectNotice}</span>
            <button type="button" onClick={() => { cancelSharedObject(); setViewReady(true) }}>Dismiss</button>
          </div>
        )}

        {!sharedObjectNotice && !sharedOrbitalView && !capturedViewActive && orbitalViewMessage && (
          <div className="viewport-notice" role="status">
            <span>{orbitalViewMessage}</span>
            <button type="button" onClick={() => setOrbitalViewMessage(undefined)}>Dismiss</button>
          </div>
        )}

        {!sharedObjectNotice && !sharedObject && !capturedViewActive && !orbitalViewMessage && !historyActive && !journey && trafficPauseNotice && (
          <div className="viewport-notice" role="status">
            <strong>
              {hasTrafficContext
                ? 'Last local traffic sample'
                : 'Aircraft and ships paused'}
            </strong>
            <span>
              {hasTrafficContext &&
                'Last local sample; not wider live coverage. '}
              {trafficPauseNotice.message}
            </span>
            {trafficPauseNotice.viewport && (
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

        {sharedObject && !historyActive && (
          <SharedObjectDetails receipt={sharedObject} message={sharedObjectMessage}
            onClose={() => { cancelSharedObject(); rulerMapRef.current?.focusMap() }} />
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
            localTrafficAvailable={capturedLocalTraffic}
            groundTrafficSuppressed={capturedEarthFramed === true}
            playing={capturedOrbitalPlaying}
            position={capturedOrbitalDisplayedPosition}
            notice={orbitalViewMessage}
            statusMessage={capturedOrbitalState?.message}
            online={online}
            units={units}
            shareObject={<>
              <SavedObjectControl
                entry={createSavedOrbitalObject(
                  capturedOrbitalDisplayedPosition ?? capturedOrbitalView.position,
                  now,
                  APP_CONFIG.saved.maxLabelLength,
                )}
                saved={savedObjects.isSaved(createSavedOrbitalObject(
                  capturedOrbitalDisplayedPosition ?? capturedOrbitalView.position,
                  now,
                  APP_CONFIG.saved.maxLabelLength,
                ))}
                onSave={savedObjects.save}
                onRemove={savedObjects.remove}
              />
              {APP_CONFIG.objectSharing.enabled && <ObjectShareControl
                theme={theme}
                identityKey={`from-here:${capturedOrbitalView.revision}`}
                viewFromHere
                disabled={!capturedOrbitalReady}
                capture={() => shareOrbitalObject(
                  capturedOrbitalDisplayedPosition ?? capturedOrbitalView.position,
                  capturedOrbitalView.snapshot, 'from-here',
                )} now={now} />}
            </>}
            onReturn={() => returnFromCapturedOrbitalView(capturedOrbitalView.revision)}
            onTogglePlaying={() => toggleCapturedOrbitalPlaying(capturedOrbitalView.revision)}
          />
        )}

        {capturedAircraftView && capturedAircraftCurrent && (
          <CapturedAircraftDetails
            key={capturedAircraftView.revision}
            view={capturedAircraftView}
            ready={capturedAircraftReady}
            playing={capturedAircraftPlaying}
            position={capturedAircraftDisplayedPosition}
            latestObservedAt={capturedAircraftCurrent.observedAt}
            holding={capturedAircraftHolding}
            notice={aircraftViewNotice}
            online={online}
            units={units}
            onReturn={() => returnFromCapturedAircraftView(capturedAircraftView.revision)}
            onTogglePlaying={() => setCapturedAircraftPlaying(playing => !playing)}
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
            onViewFromHere={handleCaptureAircraftView}
            viewFromHereUnavailable={selectedAircraftViewUnavailable}
            journeyPreparing={journeyPreparing}
            shareObject={selectedTrafficSavedObject ? <>
              <SavedObjectControl
                entry={selectedTrafficSavedObject}
                saved={savedObjects.isSaved(selectedTrafficSavedObject)}
                onSave={savedObjects.save}
                onRemove={savedObjects.remove}
              />
              {APP_CONFIG.objectSharing.enabled && <ObjectShareControl
                theme={theme}
                identityKey={JSON.stringify([selectedEntity.id, selectedEntity.kind === 'aircraft' ? selectedEntity.registration : selectedEntity.imo])}
                capture={() => shareTrafficObject(selectedEntity)} now={now} />}
            </> : undefined}
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
            onViewFromHere={() => handleCaptureOrbitalView(selectedOrbitalPosition.id)}
            viewFromHereUnavailable={mapError
              ? 'View from here needs the vector basemap.'
              : orbitalViewUnavailableReason(selectedOrbitalPosition, projectionPreference)}
            shareObject={selectedOrbitalSavedObject ? <>
              <SavedObjectControl
                entry={selectedOrbitalSavedObject}
                saved={savedObjects.isSaved(selectedOrbitalSavedObject)}
                onSave={savedObjects.save}
                onRemove={savedObjects.remove}
              />
              {APP_CONFIG.objectSharing.enabled && <ObjectShareControl
                theme={theme}
                identityKey={`${selectedOrbitalPosition.id}|${selectedOrbitalState.snapshot.sha256}`}
                capture={() => {
                  const snapshot = selectedOrbitalState.snapshot
                  if (!snapshot) throw new Error('The orbital catalog is no longer available.')
                  return shareOrbitalObject(selectedOrbitalPosition, snapshot)
                }} now={now} />}
            </> : undefined}
          />
        )}

        {selectedPort && portsResult.state.phase === 'ready' && (
          <PortDetails
            port={selectedPort}
            source={portsResult.state.dataset.source}
            headerAction={selectedPortSavedObject && <SavedObjectControl
              entry={selectedPortSavedObject}
              saved={savedObjects.isSaved(selectedPortSavedObject)}
              onSave={savedObjects.save}
              onRemove={savedObjects.remove}
            />}
            onClose={handleClosePort}
          />
        )}

        {selectedAirport && airportsResult.state.phase === 'ready' && (
          <AirportDetails
            airport={selectedAirport}
            source={airportsResult.state.dataset.source}
            coordinatePrecision={APP_CONFIG.navigation.coordinatePrecision}
            headerAction={selectedAirportSavedObject && <SavedObjectControl
              entry={selectedAirportSavedObject}
              saved={savedObjects.isSaved(selectedAirportSavedObject)}
              onSave={savedObjects.save}
              onRemove={savedObjects.remove}
            />}
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
