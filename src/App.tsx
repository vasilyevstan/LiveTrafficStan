import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { useAppPreferences } from './app/useAppPreferences'
import { useAppShell } from './app/useAppShell'
import { useAircraftTraffic } from './app/useAircraftTraffic'
import { useAircraftMetadata } from './app/useAircraftMetadata'
import { useFlightRoute } from './app/useFlightRoute'
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
import { AirportDetails } from './components/AirportDetails'
import { HistoryModeNotice } from './components/HistoryModeNotice'
import { LiveStatus } from './components/LiveStatus'
import { PortDetails } from './components/PortDetails'
import { TrafficControls } from './components/TrafficControls'
import { TrafficDetails } from './components/TrafficDetails'
import { WeatherObservationDetails } from './components/WeatherObservationDetails'
import { APP_CONFIG } from './config/appConfig'
import type { AppCenter } from './config/appConfig'
import { orderAircraftSearchResults } from './domain/aircraftSearch'
import { airportsInViewport } from './domain/airports'
import {
  updateLayerPreference,
  type LayerPreferences,
} from './domain/layerPreferences'
import type { MapCameraState } from './domain/mapCamera'
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
import type { PlaceSearchResult } from './providers/geocoding/photonProvider'
import { StaticAircraftMetadataProvider } from './providers/aircraftMetadata/staticAircraftMetadataProvider'
import { StaticAirportsProvider } from './providers/airports/staticAirportsProvider'
import { AviationstackFlightRouteProvider } from './providers/flightRoute/aviationstackFlightRouteProvider'
import { StaticPortsProvider } from './providers/ports/staticPortsProvider'
import { AwcMetarProvider } from './providers/weather/awcMetarProvider'
import { filterTrafficByViewport } from './traffic/filter'
import { displayTraffic } from './traffic/freshness'

interface ViewRequest {
  id: number
  center: AppCenter
  camera?: MapCameraState
}

const canRestoreFocus = (element: HTMLElement | null) =>
  Boolean(
    element?.isConnected &&
      element.getClientRects().length > 0 &&
      !element.matches(':disabled, [aria-disabled="true"]'),
  )

function App() {
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
  } = layerPreferences
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null)
  const [selectedAirportId, setSelectedAirportId] = useState<string | null>(
    null,
  )
  const [selectedWeatherId, setSelectedWeatherId] = useState<string | null>(
    null,
  )
  const [mapError, setMapError] = useState<TrafficMapError | null>(null)
  const [viewportReport, setViewportReport] = useState<{
    assessment: ViewportAssessment
    viewRequestId: number
  } | null>(null)
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
  const [shareFeedback, setShareFeedback] = useState<{
    message: string
    manualUrl?: string
  }>()
  const [historyResetRevision, setHistoryResetRevision] = useState(0)
  const returnToLiveRef = useRef<() => void>(() => undefined)
  const mapToolsSummaryRef = useRef<HTMLElement>(null)
  const settingsSummaryRef = useRef<HTMLElement>(null)
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
  const flightRouteProvider = useMemo(
    () => new AviationstackFlightRouteProvider(APP_CONFIG.flightRoute),
    [],
  )
  const portsProvider = useMemo(
    () => new StaticPortsProvider(APP_CONFIG.ports),
    [],
  )
  const portsResult = usePorts(portsVisible, portsProvider)
  const airportsProvider = useMemo(
    () => new StaticAirportsProvider(APP_CONFIG.airports),
    [],
  )
  const airportsResult = useAirports(
    airportsVisible || weatherVisible,
    airportsProvider,
  )
  const weatherProvider = useMemo(
    () => new AwcMetarProvider(APP_CONFIG.weather),
    [],
  )

  const commitNavigation = useCallback(
    (
      center: AppCenter,
      label: string,
      options: { explicit?: boolean } = {},
    ) => {
      returnToLiveRef.current()
      cancelPlaceSearch()
      if (options.explicit !== false) {
        locationCameraIntent.beginExplicitViewIntent()
      }
      detailFocusOriginIdRef.current = null
      setSelectedId(null)
      setSelectedPortId(null)
      setSelectedAirportId(null)
      setSelectedWeatherId(null)
      setHistoryResetRevision((current) => current + 1)
      setViewportReport(null)
      setViewReady(true)
      setActiveLocationLabel(label)
      setViewRequest((current) => ({
        id: current.id + 1,
        center: { ...center, label },
      }))
    },
    [cancelPlaceSearch, locationCameraIntent],
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
  const aircraftResult = useAircraftTraffic(trafficQuery, APP_CONFIG.aircraft)
  const marineResult = useMarineTraffic(trafficQuery, APP_CONFIG.marine)
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
    () => filterVessels(currentVessels, vesselFilters),
    [currentVessels, vesselFilters],
  )
  const vesselResults = useMemo(
    () => orderVesselSearchResults(vessels, vesselFilters.query),
    [vesselFilters.query, vessels],
  )
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
  const aircraftMetadata = useAircraftMetadata(
    !historyActive && selectedEntity?.kind === 'aircraft'
      ? selectedEntity
      : undefined,
    aircraftMetadataProvider,
    displayNow,
  )
  const flightRouteEnabled =
    APP_CONFIG.flightRoute.enabled &&
    !historyActive &&
    selectedEntity?.kind === 'aircraft'
  const flightRoute = useFlightRoute(
    flightRouteEnabled ? selectedEntity : undefined,
    flightRouteProvider,
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
    if (!portsVisible && selectedPortId) setSelectedPortId(null)
  }, [portsVisible, selectedPortId])

  useEffect(() => {
    if (!airportsVisible && selectedAirportId) setSelectedAirportId(null)
  }, [airportsVisible, selectedAirportId])

  useEffect(() => {
    if (!weatherVisible && selectedWeatherId) setSelectedWeatherId(null)
  }, [selectedWeatherId, weatherVisible])

  useEffect(() => {
    if (selectedPortId && !selectedPort) setSelectedPortId(null)
  }, [selectedPort, selectedPortId])

  useEffect(() => {
    if (!selectedAirportId) return
    if (!selectedAirport) {
      setSelectedAirportId(null)
      return
    }
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
    contextViewport,
    selectedAirport,
    selectedAirportId,
    visibleAirports,
  ])

  useEffect(() => {
    if (selectedWeatherId && !selectedWeather) {
      setSelectedWeatherId(null)
    }
  }, [selectedWeather, selectedWeatherId])

  const handleViewportChange = useCallback(
    (assessment: ViewportAssessment, reportViewRequestId: number) => {
      setViewportReport({
        assessment,
        viewRequestId: reportViewRequestId,
      })
    },
    [],
  )

  const handleCenter = useCallback(() => {
    commitNavigation(
      location.homeCenter,
      `Home: ${location.homeCenter.label}`,
    )
  }, [commitNavigation, location.homeCenter])

  const handleUseLocation = useCallback(() => {
    locationCameraIntent.requestLocationNavigation()
    cancelPlaceSearch()
    requestLocation()
  }, [cancelPlaceSearch, locationCameraIntent, requestLocation])

  const handlePlaceSearch = useCallback(
    (query: string) => {
      locationCameraIntent.beginExplicitViewIntent()
      setViewReady(true)
      searchPlaces(query)
    },
    [locationCameraIntent, searchPlaces],
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
    locationCameraIntent.beginExplicitViewIntent()
    cancelPlaceSearch()
    setViewReady(true)
    setActiveLocationLabel('Custom view')
  }, [cancelPlaceSearch, locationCameraIntent])

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
    resetPreferences()
    setShareFeedback(undefined)
    const url = new URL(window.location.href)
    if (!url.hash) return
    url.hash = ''
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}`,
    )
  }, [resetPreferences])

  const focusAfterRender = useCallback(
    (
      originId: string | null,
      fallback: 'map-tools' | 'settings' = 'map-tools',
    ) => {
      globalThis.requestAnimationFrame(() => {
        const origin = originId
          ? document.getElementById(originId)
          : null
        const fallbackTarget =
          fallback === 'settings'
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
      detailFocusOriginIdRef.current = id ? originId : null
      setSelectedPortId(null)
      setSelectedAirportId(null)
      setSelectedWeatherId(null)
      setSelectedId(id)
    },
    [],
  )

  const handleMapTrafficSelect = useCallback(
    (id: string | null) => selectTraffic(id, null),
    [selectTraffic],
  )
  const handleAircraftDiscoverySelect = useCallback(
    (id: string) =>
      selectTraffic(id, `aircraft-discovery-result-${id}`),
    [selectTraffic],
  )
  const handleVesselDiscoverySelect = useCallback(
    (id: string) =>
      selectTraffic(id, `vessel-discovery-result-${id}`),
    [selectTraffic],
  )

  const handleMapPortSelect = useCallback((id: string | null) => {
    detailFocusOriginIdRef.current = null
    setSelectedId(null)
    setSelectedAirportId(null)
    setSelectedWeatherId(null)
    setSelectedPortId(id)
  }, [])

  const selectAirport = useCallback(
    (id: string | null, originId: string | null) => {
      detailFocusOriginIdRef.current = id ? originId : null
      airportSelectionGraceUntilRef.current = id
        ? Date.now() + APP_CONFIG.navigation.viewportSettleMs + 100
        : 0
      setSelectedId(null)
      setSelectedPortId(null)
      setSelectedWeatherId(null)
      setSelectedAirportId(id)
    },
    [],
  )
  const handleMapAirportSelect = useCallback(
    (id: string | null) => selectAirport(id, null),
    [selectAirport],
  )
  const handleAirportContextSelect = useCallback(
    (id: string) =>
      selectAirport(id, `airport-context-result-${id}`),
    [selectAirport],
  )

  const selectWeather = useCallback(
    (id: string | null, originId: string | null) => {
      detailFocusOriginIdRef.current = id ? originId : null
      setSelectedId(null)
      setSelectedPortId(null)
      setSelectedAirportId(null)
      setSelectedWeatherId(id)
    },
    [],
  )
  const handleMapWeatherSelect = useCallback(
    (id: string | null) => selectWeather(id, null),
    [selectWeather],
  )
  const handleWeatherContextSelect = useCallback(
    (id: string) =>
      selectWeather(id, `weather-context-result-${id}`),
    [selectWeather],
  )

  const restoreDetailFocus = useCallback(() => {
    const originId = detailFocusOriginIdRef.current
    detailFocusOriginIdRef.current = null
    focusAfterRender(originId)
  }, [focusAfterRender])

  const handleCloseTraffic = useCallback(() => {
    setSelectedId(null)
    restoreDetailFocus()
  }, [restoreDetailFocus])

  const handleClosePort = useCallback(() => {
    setSelectedPortId(null)
    restoreDetailFocus()
  }, [restoreDetailFocus])

  const handleCloseAirport = useCallback(() => {
    airportSelectionGraceUntilRef.current = 0
    setSelectedAirportId(null)
    restoreDetailFocus()
  }, [restoreDetailFocus])

  const handleCloseWeather = useCallback(() => {
    setSelectedWeatherId(null)
    restoreDetailFocus()
  }, [restoreDetailFocus])

  const handleEnterHistory = useCallback(() => {
    enterHistory()
    globalThis.requestAnimationFrame(() => {
      if (canRestoreFocus(historyPlaybackControlRef.current)) {
        historyPlaybackControlRef.current?.focus()
      }
    })
  }, [enterHistory])

  const handleReturnToLive = useCallback(() => {
    returnToLive()
    focusAfterRender('history-enter-button', 'settings')
  }, [focusAfterRender, returnToLive])

  const mapErrorContent = mapError ? mapErrorPresentation(mapError) : null
  const mapSubtitle = historyActive
    ? 'Historical traffic area'
    : !viewReady
      ? 'Preparing map view'
      : currentAssessment?.kind === 'eligible'
        ? 'Visible traffic area'
        : currentAssessment
          ? 'Traffic paused'
          : 'Updating map view'
  const vesselEmptyMessage =
    historyActive
      ? 'No recorded ships are shown at this historical cursor.'
      : currentAssessment?.kind === 'ineligible'
      ? 'Live traffic is paused for this view.'
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
      ? 'Live traffic is paused for this view.'
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
                ? `Retrieved ${formatTimestamp(weatherDataset.retrievedAt)}. Observations are not forecasts.`
                : undefined
  const weatherEmptyMessage =
    weatherStationIds.length === 0
      ? 'No qualifying four-letter ICAO METAR stations are shown in this view.'
      : 'No current METAR or SPECI observations were returned for this view.'
  const handleRetryWeather =
    airportsResult.state.phase === 'error'
      ? airportsResult.retry
      : weatherResult.retry

  return (
    <main
      className={`app-shell${historyActive ? ' app-shell--history' : ''}`}
    >
      <TrafficMap
        viewCenter={viewRequest.center}
        viewCamera={viewRequest.camera}
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
        aircraft={aircraft}
        vessels={vessels}
        ports={ports}
        airports={airports}
        weatherObservations={weatherObservations}
        trailSegments={trailSegments}
        selectedId={selectedId}
        selectedPortId={selectedPortId}
        selectedAirportId={selectedAirportId}
        selectedWeatherId={selectedWeatherId}
        aircraftVisible={aircraftVisible}
        vesselsVisible={vesselsVisible}
        portsVisible={portsVisible}
        airportsVisible={airportsVisible}
        weatherVisible={weatherVisible}
        clusteringEnabled={clusteringEnabled}
        interpolateTraffic={!historyActive}
        interpolationDurationMs={APP_CONFIG.interpolationDurationMs}
        viewRequestId={viewRequest.id}
        viewportSettleMs={APP_CONFIG.navigation.viewportSettleMs}
        onSelect={handleMapTrafficSelect}
        onSelectPort={handleMapPortSelect}
        onSelectAirport={handleMapAirportSelect}
        onSelectWeather={handleMapWeatherSelect}
        onViewportChange={handleViewportChange}
        onCameraChange={setMapCamera}
        onManualViewChange={handleManualViewChange}
        onMapError={setMapError}
      />
      <div className="radar-shade" aria-hidden="true" />

      <div className="interface-layer">
        <header className="brand-panel">
          <div className="brand-panel__title">
            <div className="radar-mark" aria-hidden="true">
              <span />
            </div>
            <div>
              <h1>LiveTrafficStan</h1>
              <p>{mapSubtitle}</p>
            </div>
          </div>
          <LiveStatus
            aircraftCount={aircraftVisible ? aircraft.length : 0}
            vesselCount={vesselsVisible ? vessels.length : 0}
            aircraftStatus={aircraftResult.status}
            marineStatus={marineResult.status}
            marineCapabilities={marineResult.capabilities}
            now={now}
            online={online}
            historicalAt={
              history.playback.mode === 'live'
                ? undefined
                : history.playback.cursor
            }
          />
        </header>

        <TrafficControls
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
            portsVisible && portsResult.state.phase === 'loading'
          }
          portsError={
            portsVisible && portsResult.state.phase === 'error'
              ? portsResult.state.message
              : undefined
          }
          onPortsVisibleChange={setPortsVisible}
          onRetryPorts={portsResult.retry}
          airportsVisible={airportsVisible}
          airportsLoading={
            airportsVisible && airportsResult.state.phase === 'loading'
          }
          airportsReady={airportsResult.state.phase === 'ready'}
          airportsError={
            airportsVisible && airportsResult.state.phase === 'error'
              ? airportsResult.state.message
              : undefined
          }
          airportsInView={visibleAirports}
          selectedAirportId={selectedAirportId}
          airportsEmptyMessage={airportsEmptyMessage}
          onAirportsVisibleChange={setAirportsVisible}
          onAirportSelect={handleAirportContextSelect}
          onRetryAirports={airportsResult.retry}
          weatherVisible={weatherVisible}
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
          locationAvailable={location.canRequest}
          locationLoading={location.locating}
          locationMessage={location.message}
          onUseLocation={handleUseLocation}
          themePreference={themePreference}
          onThemePreferenceChange={setThemePreference}
          onUnitsChange={setUnits}
          shareDisabled={!mapCamera}
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

        {!historyActive && currentAssessment?.kind === 'ineligible' && (
          <div className="viewport-notice" role="status">
            <strong>Live traffic paused</strong>
            <span>{currentAssessment.message}</span>
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

        {selectedEntity && (
          <TrafficDetails
            entity={selectedEntity}
            aircraftMetadata={aircraftMetadata}
            flightRouteEnabled={flightRouteEnabled}
            flightRoute={flightRoute.state}
            now={displayNow}
            units={units}
            historical={historyActive}
            onRequestFlightRoute={flightRoute.request}
            onClose={handleCloseTraffic}
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
    </main>
  )
}

export default App
