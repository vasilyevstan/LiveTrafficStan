import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FocusEvent,
  type MutableRefObject,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
} from 'react'
import type { ThemePreference } from '../app/theme'
import {
  FULLSCREEN_UNAVAILABLE_MESSAGE,
  workspaceOwnsFullscreen,
  type FullscreenState,
} from '../app/fullscreen'
import type { PlaceSearchState } from '../app/PlaceSearchController'
import type { AppCenter } from '../config/appConfig'
import { normalizeMapBearing } from '../domain/mapCamera'
import { APP_CONFIG } from '../config/appConfig'
import { depthSourceDescription, type BathymetryStatus } from '../domain/bathymetry'
import type { BasemapReliefStatus } from '../map/basemapRelief'
import type { Airport, AirportSource } from '../domain/airports'
import type { Port, PortSource } from '../domain/ports'
import type { CachedMarineDiscovery } from '../domain/objectDiscovery'
import type { MapProjectionPreference } from '../domain/preferences'
import type { DisplayAircraft, DisplayVessel } from '../domain/traffic'
import type { TrailPreferences } from '../domain/trailPreferences'
import type { UnitSystem } from '../domain/units'
import type { VesselFilterState } from '../domain/vesselFilters'
import type { DisplayWeatherObservation } from '../domain/weatherObservations'
import type { OrbitalControllerState } from '../domain/orbital'
import type { InViewAvailability } from '../domain/inView'
import type {
  SavedObject,
  SavedObjectsLoadResult,
  SavedObjectsMutationResult,
} from '../domain/savedObjects'
import { emptySavedObjectsDocument } from '../domain/savedObjects'
import type {
  OrbitalDiscoveryFilters,
  OrbitalDisplaySelection,
  OrbitalPopulationCounts,
} from '../domain/orbitalDiscovery'
import type {
  PlaybackRange,
  PlaybackState,
} from '../history/playback'
import type {
  HistoryPersistenceSettings,
  HistoryPersistenceStatus,
  HistoryRetentionHours,
} from '../history/settings'
import type { PlaceSearchResult } from '../providers/geocoding/photonProvider'
import { AircraftDiscovery } from './AircraftDiscovery'
import { AirportContext } from './AirportContext'
import { HistoryControls } from './HistoryControls'
import { useLocationSearchModel } from './useLocationSearchModel'
import { VesselDiscovery } from './VesselDiscovery'
import { WeatherContext } from './WeatherContext'
import { OrbitalContext } from './OrbitalContext'
import { StarlinkContext } from './StarlinkContext'
import type { MobileWorkspaceTask, WorkspaceControlsHandle } from './mobileWorkspace'
import { ObjectFind } from './ObjectFind'

interface TrafficControlsProps {
  discoveryPaused?: boolean
  catalogAirports?: readonly Airport[]
  catalogPorts?: readonly Port[]
  airportSource?: AirportSource
  portSource?: PortSource
  portsReady?: boolean
  discoverMarineMetadata?: (query: string, now: number) => CachedMarineDiscovery
  mobileWorkspace?: boolean
  workspaceHandleRef?: Ref<WorkspaceControlsHandle>
  onWorkspaceTaskChange?: (task: MobileWorkspaceTask | null) => void
  rulerAvailable?: boolean
  rulerMessage?: string
  rulerDistance?: string
  onStartRuler?: () => void
  onClearRuler?: () => void
  fullscreen: FullscreenState
  onEnterFullscreen: () => void
  onExitFullscreen: () => void
  masthead?: ReactNode
  inView: ReactNode
  aircraftQuery: string
  aircraftResults: readonly DisplayAircraft[]
  findAircraft?: readonly DisplayAircraft[]
  totalAircraft: number
  aircraftEmptyMessage: string
  onAircraftQueryChange: (query: string) => void
  onAircraftSelect: (id: string, originId: string) => void
  onFindTrafficNavigate: (id: string, originId: string) => void
  onFindReportNavigate: Parameters<typeof ObjectFind>[0]['onNavigate']
  vesselFilters: VesselFilterState
  vesselResults: readonly DisplayVessel[]
  findVessels?: readonly DisplayVessel[]
  totalVessels: number
  vesselEmptyMessage: string
  marineProviderName?: string
  units: UnitSystem
  onVesselFiltersChange: (filters: VesselFilterState) => void
  onVesselSelect: (id: string, originId: string) => void
  aircraftVisible: boolean
  onAircraftVisibleChange: (visible: boolean) => void
  vesselsVisible: boolean
  onVesselsVisibleChange: (visible: boolean) => void
  portsVisible: boolean
  portsLoading: boolean
  portsError?: string
  onPortsVisibleChange: (visible: boolean) => void
  onRetryPorts: () => void
  onLoadPorts: () => void
  onPortNavigate: (id: string, originId: string) => boolean
  airportsVisible: boolean
  airportsLoading: boolean
  airportsReady: boolean
  airportsError?: string
  airportsInView: readonly Airport[]
  selectedAirportId: string | null
  airportsEmptyMessage: string
  onAirportsVisibleChange: (visible: boolean) => void
  onAirportSelect: (id: string, originId: string) => void
  onRetryAirports: () => void
  onLoadAirports: () => void
  onAirportNavigate: (id: string, originId: string) => boolean
  weatherVisible: boolean
  depthsVisible: boolean
  bathymetryStatus: BathymetryStatus
  onDepthsVisibleChange: (visible: boolean) => void
  reliefVisible: boolean
  reliefStatus: BasemapReliefStatus
  onReliefVisibleChange: (visible: boolean) => void
  weatherLoading: boolean
  weatherWaiting: boolean
  weatherReady: boolean
  now: number
  weatherError?: string
  weatherStatusMessage?: string
  weatherObservations: readonly DisplayWeatherObservation[]
  selectedWeatherId: string | null
  weatherEmptyMessage: string
  weatherCanRefresh: boolean
  weatherRetryUsesAirports: boolean
  onWeatherVisibleChange: (visible: boolean) => void
  onWeatherSelect: (id: string, originId: string) => void
  onRetryWeather: () => void
  onRefreshWeather: () => void
  orbitalVisible: boolean
  orbitalState: OrbitalControllerState
  selectedOrbitalId: string | null
  orbitalFilters: OrbitalDiscoveryFilters
  orbitalDisplay: OrbitalDisplaySelection
  orbitalCounts: OrbitalPopulationCounts
  orbitalPrimarySummary?: string
  orbitalPredictionHorizonMs: number
  orbitalMaximumQueryLength: number
  orbitalPageSize: number
  onOrbitalVisibleChange: (visible: boolean) => void
  onOrbitalFiltersChange: (filters: OrbitalDiscoveryFilters) => void
  onOrbitalSelect: (id: string, originId: string) => void
  onOrbitalNavigate: (id: string, originId: string) => boolean
  onRetryOrbital: () => void
  starlinkState: OrbitalControllerState
  starlinkCounts: OrbitalPopulationCounts
  onRetryStarlink: () => void
  clusteringEnabled: boolean
  onClusteringEnabledChange: (enabled: boolean) => void
  trailPreferences: TrailPreferences
  onTrailPreferencesChange: (preferences: TrailPreferences) => void
  historySettings: HistoryPersistenceSettings
  historyStatus: HistoryPersistenceStatus
  historyRange?: PlaybackRange
  historyRecordCount: number
  playback: PlaybackState
  onHistoryEnabledChange: (enabled: boolean) => void
  onHistoryRetentionChange: (hours: HistoryRetentionHours) => void
  onClearHistory: () => void
  onRetryHistory: () => void
  onEnterHistory: () => void
  centerDisabled: boolean
  onCenter: () => void
  northResetBearing?: number
  onResetNorth: () => void
  locationAvailable: boolean
  locationLoading: boolean
  locationMessage?: string
  onUseLocation: () => void
  themePreference: ThemePreference
  onThemePreferenceChange: (preference: ThemePreference) => void
  projectionPreference: MapProjectionPreference
  onProjectionPreferenceChange: (preference: MapProjectionPreference) => void
  onUnitsChange: (units: UnitSystem) => void
  shareDisabled: boolean
  onShare: () => void
  onResetPreferences: () => void
  preferenceStatus?: string
  manualShareUrl?: string
  appShellStatus?: string
  appUpdateAvailable: boolean
  appUpdateActivating: boolean
  onRefreshApp: () => void
  locationNavigationDisabled: boolean
  activeLocationLabel: string
  coordinatePrecision: number
  maximumLocationQueryLength: number
  placeSearchState: PlaceSearchState
  onPlaceSearch: (query: string) => void
  onLocationNavigate: (center: AppCenter) => void
  onBeginShipLocate: Parameters<typeof ObjectFind>[0]['onBeginShipLocate']
  onPlaceResultSelect: (result: PlaceSearchResult) => void
  onPlaceSearchCancel: () => void
  onPlaceSearchPause?: () => void
  savedEntries?: readonly SavedObject[]
  savedStatus?: SavedObjectsLoadResult
  aircraftAvailability?: InViewAvailability
  vesselAvailability?: InViewAvailability
  lastSavedObservationAt?: (entry: SavedObject) => number | undefined
  onRemoveSaved?: (key: string) => SavedObjectsMutationResult
  onClearSaved?: () => SavedObjectsMutationResult
  onRestoreSaved?: (
    entry: SavedObject,
    expectedClearEpoch: number,
  ) => SavedObjectsMutationResult
  mapToolsSummaryRef?: Ref<HTMLElement>
  settingsSummaryRef?: Ref<HTMLElement>
}

type PromotedActionKind =
  | 'app-update'
  | 'history'
  | 'weather'
  | 'airports'
  | 'ports'

interface PromotedAction {
  kind: PromotedActionKind
  label: string
  message: string
  buttonLabel: string
  disabled?: boolean
  run: () => void
}

const MAP_TOOL_TASKS = [
  ['find', 'FIND'],
  ['layers', 'LAYERS'],
  ['context', 'CONTEXT'],
  ['orbits', 'ORBITS'],
  ['sources', 'SOURCES'],
] as const

type MapToolTask = (typeof MAP_TOOL_TASKS)[number][0]

const operationIcons = {
  center: 'M12 3v3m0 12v3M3 12h3m12 0h3M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
  aircraft: 'm12 3 2 7 6 4v2l-6-2v4l2 2v1l-4-1-4 1v-1l2-2v-4l-6 2v-2l6-4 2-7Z',
  ships: 'M5 12V7h14v5M9 7V4h6v3M3 13l9-3 9 3-3 5H6l-3-5Zm0 8 3-1 3 1 3-1 3 1 3-1 3 1',
  orbits: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5m0-7 4 4m-2-6 4 4m-4 0-2 2',
  explore: 'm12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
  find: 'M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm6-2 6 6',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
  inView: 'M4 5h4v4H4V5Zm7 2h9M4 15h4v4H4v-4Zm7 2h9',
  close: 'm6 6 12 12M18 6 6 18',
  fullscreenEnter: 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6',
  fullscreenExit: 'M3 9h6V3m6 0v6h6M9 21v-6H3m18 0h-6v6',
} as const

function OperationIcon({ name }: { name: keyof typeof operationIcons }) {
  return (
    <svg className="operation-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={operationIcons[name]} />
    </svg>
  )
}

const handleDisclosureFocus = (
  event: FocusEvent<HTMLDetailsElement>,
  focusedWithinRef: MutableRefObject<boolean>,
) => {
  const summary = event.currentTarget.firstElementChild
  focusedWithinRef.current = event.target !== summary
}

const handleDisclosureBlur = (
  event: FocusEvent<HTMLDetailsElement>,
  focusedWithinRef: MutableRefObject<boolean>,
) => {
  const next = event.relatedTarget
  if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
    focusedWithinRef.current = false
  }
}

const handleDisclosureToggle = (
  event: SyntheticEvent<HTMLDetailsElement>,
  focusedWithinRef: MutableRefObject<boolean>,
) => {
  const details = event.currentTarget
  if (details.open) return

  const summary = details.firstElementChild
  if (
    summary instanceof HTMLElement &&
    (focusedWithinRef.current ||
      (document.activeElement instanceof Node &&
        details.contains(document.activeElement) &&
        document.activeElement !== summary))
  ) {
    globalThis.requestAnimationFrame(() => {
      if (details.open ||
        details.closest('.workspace-dock')?.querySelector('details[name="traffic-control-panels"][open]')) return
      const active = document.activeElement
      if (active && active !== document.body && !details.contains(active)) return
      summary.focus({ preventScroll: true })
    })
  }
  focusedWithinRef.current = false
}

export function TrafficControls({
  discoveryPaused = false,
  catalogAirports = [],
  catalogPorts = [],
  airportSource,
  portSource,
  portsReady = false,
  discoverMarineMetadata,
  mobileWorkspace = false,
  workspaceHandleRef,
  onWorkspaceTaskChange,
  rulerAvailable = false,
  rulerMessage,
  rulerDistance,
  onStartRuler,
  onClearRuler,
  fullscreen,
  onEnterFullscreen,
  onExitFullscreen,
  marineProviderName = 'Digitraffic',
  masthead,
  inView,
  aircraftQuery,
  aircraftResults,
  findAircraft = aircraftResults,
  totalAircraft,
  aircraftEmptyMessage,
  onAircraftQueryChange,
  onAircraftSelect,
  onFindTrafficNavigate,
  onFindReportNavigate,
  vesselFilters,
  vesselResults,
  findVessels = vesselResults,
  totalVessels,
  vesselEmptyMessage,
  units,
  onVesselFiltersChange,
  onVesselSelect,
  aircraftVisible,
  onAircraftVisibleChange,
  vesselsVisible,
  onVesselsVisibleChange,
  portsVisible,
  portsLoading,
  portsError,
  onPortsVisibleChange,
  onRetryPorts,
  onLoadPorts,
  onPortNavigate,
  airportsVisible,
  airportsLoading,
  airportsReady,
  airportsError,
  airportsInView,
  selectedAirportId,
  airportsEmptyMessage,
  onAirportsVisibleChange,
  onAirportSelect,
  onRetryAirports,
  onLoadAirports,
  onAirportNavigate,
  weatherVisible,
  depthsVisible,
  bathymetryStatus,
  onDepthsVisibleChange,
  reliefVisible,
  reliefStatus,
  onReliefVisibleChange,
  weatherLoading,
  weatherWaiting,
  weatherReady,
  now,
  weatherError,
  weatherStatusMessage,
  weatherObservations,
  selectedWeatherId,
  weatherEmptyMessage,
  weatherCanRefresh,
  weatherRetryUsesAirports,
  onWeatherVisibleChange,
  onWeatherSelect,
  onRetryWeather,
  onRefreshWeather,
  orbitalVisible,
  orbitalState,
  selectedOrbitalId,
  orbitalFilters,
  orbitalDisplay,
  orbitalCounts,
  orbitalPrimarySummary,
  orbitalPredictionHorizonMs,
  orbitalMaximumQueryLength,
  orbitalPageSize,
  onOrbitalVisibleChange,
  onOrbitalFiltersChange,
  onOrbitalSelect,
  onOrbitalNavigate,
  onRetryOrbital,
  starlinkState,
  starlinkCounts,
  onRetryStarlink,
  clusteringEnabled,
  onClusteringEnabledChange,
  trailPreferences,
  onTrailPreferencesChange,
  historySettings,
  historyStatus,
  historyRange,
  historyRecordCount,
  playback,
  onHistoryEnabledChange,
  onHistoryRetentionChange,
  onClearHistory,
  onRetryHistory,
  onEnterHistory,
  centerDisabled,
  onCenter,
  northResetBearing,
  onResetNorth,
  locationAvailable,
  locationLoading,
  locationMessage,
  onUseLocation,
  themePreference,
  onThemePreferenceChange,
  projectionPreference,
  onProjectionPreferenceChange,
  onUnitsChange,
  shareDisabled,
  onShare,
  onResetPreferences,
  preferenceStatus,
  manualShareUrl,
  appShellStatus,
  appUpdateAvailable,
  appUpdateActivating,
  onRefreshApp,
  locationNavigationDisabled,
  activeLocationLabel,
  coordinatePrecision,
  maximumLocationQueryLength,
  placeSearchState,
  onPlaceSearch,
  onLocationNavigate,
  onBeginShipLocate,
  onPlaceResultSelect,
  onPlaceSearchCancel,
  onPlaceSearchPause,
  savedEntries = [],
  savedStatus = {
    phase: 'ready',
    document: emptySavedObjectsDocument(),
  },
  aircraftAvailability = { available: true },
  vesselAvailability = { available: true },
  lastSavedObservationAt = () => undefined,
  onRemoveSaved = () => ({
    ok: false,
    document: emptySavedObjectsDocument(),
    message: 'Saved objects are unavailable.',
  }),
  onClearSaved = () => ({
    ok: false,
    document: emptySavedObjectsDocument(),
    message: 'Saved objects are unavailable.',
  }),
  onRestoreSaved = () => ({
    ok: false,
    document: emptySavedObjectsDocument(),
    message: 'Saved objects are unavailable.',
  }),
  mapToolsSummaryRef,
  settingsSummaryRef,
}: TrafficControlsProps) {
  const centerButtonRef = useRef<HTMLButtonElement>(null)
  const [savedClearArmed, setSavedClearArmed] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string>()
  const findFocusFrameRef = useRef<number | null>(null)
  const mapToolsDetailsRef = useRef<HTMLDetailsElement>(null)
  const mapToolsBodyRef = useRef<HTMLDivElement>(null)
  const settingsDetailsRef = useRef<HTMLDetailsElement>(null)
  const settingsBodyRef = useRef<HTMLDivElement>(null)
  const inViewDetailsRef = useRef<HTMLDetailsElement>(null)
  const inViewBodyRef = useRef<HTMLDivElement>(null)
  const inViewEntryRef = useRef<HTMLButtonElement>(null)
  const inViewOpenedFromSettingsRef = useRef(false)
  const orbitalToggleRef = useRef<HTMLButtonElement>(null)
  const [openWorkspaceTask, setOpenWorkspaceTask] = useState<MobileWorkspaceTask | null>(null)
  const suspendedTaskRef = useRef<{
    details: HTMLDetailsElement
    body: HTMLDivElement | null
    scrollTop: number
    focus: Element | null
  } | null>(null)
  const [mapToolTask, setMapToolTask] =
    useState<MapToolTask>(mobileWorkspace ? 'layers' : 'find')
  const focusedWithinMapToolsRef = useRef(false)
  const focusedWithinSettingsRef = useRef(false)
  const lastTaskFocusRef = useRef(new WeakMap<HTMLDetailsElement, HTMLElement>())
  const captureTaskFocus = (event: FocusEvent<HTMLDetailsElement>) => {
    const body = event.currentTarget.querySelector('.control-panel__more-body')
    if (event.target instanceof HTMLElement && body?.contains(event.target)) {
      lastTaskFocusRef.current.set(event.currentTarget, event.target)
    }
  }
  const closeOtherTasks = (target: HTMLDetailsElement | null) => {
    for (const peer of [mapToolsDetailsRef.current, settingsDetailsRef.current, inViewDetailsRef.current]) {
      if (peer && peer !== target) peer.open = false
    }
  }
  const openTask = (target: HTMLDetailsElement | null) => {
    if (!target) return
    closeOtherTasks(target)
    target.open = true
  }
  const reconcileTask = useCallback(() => {
    const task = mapToolsDetailsRef.current?.open ? mapToolTask :
      settingsDetailsRef.current?.open ? 'settings' :
        inViewDetailsRef.current?.open ? 'in-view' : null
    setOpenWorkspaceTask(task)
    onWorkspaceTaskChange?.(task)
  }, [mapToolTask, onWorkspaceTaskChange])
  useEffect(reconcileTask, [reconcileTask])
  useEffect(() => {
    if (!mobileWorkspace || playback.mode === 'live') return
    for (const peer of [mapToolsDetailsRef.current, settingsDetailsRef.current, inViewDetailsRef.current]) {
      if (peer) peer.open = false
    }
    suspendedTaskRef.current = null
    reconcileTask()
  }, [mobileWorkspace, playback.mode, reconcileTask])
  useEffect(() => () => {
    if (findFocusFrameRef.current !== null) {
      globalThis.cancelAnimationFrame(findFocusFrameRef.current)
    }
  }, [])
  const visibleControl = (element: HTMLElement | null | undefined): element is HTMLElement =>
    Boolean(element?.isConnected && element.getClientRects().length &&
      !element.closest('[hidden], [inert], details:not([open])') &&
      getComputedStyle(element).visibility === 'visible')
  const mapShortcutsAvailable = () =>
    !(mobileWorkspace && playback.mode !== 'live') &&
    visibleControl(centerButtonRef.current)
  useImperativeHandle(workspaceHandleRef, () => ({
    suspendTask: () => {
      const details = [mapToolsDetailsRef.current, settingsDetailsRef.current, inViewDetailsRef.current]
        .find((peer) => peer?.open)
      if (!details) {
        suspendedTaskRef.current = null
        return false
      }
      const body = details === mapToolsDetailsRef.current ? mapToolsBodyRef.current :
        details === settingsDetailsRef.current ? settingsBodyRef.current : inViewBodyRef.current
      suspendedTaskRef.current = {
        details, body, scrollTop: body?.scrollTop ?? 0,
        focus: body?.contains(document.activeElement) ? document.activeElement :
          lastTaskFocusRef.current.get(details) ?? null,
      }
      details.open = false
      onWorkspaceTaskChange?.(null)
      return true
    },
    resumeTask: () => {
      const previous = suspendedTaskRef.current
      suspendedTaskRef.current = null
      if (!previous?.details.isConnected) return false
      if ([mapToolsDetailsRef.current, settingsDetailsRef.current, inViewDetailsRef.current]
        .some(peer => peer?.open && peer !== previous.details)) return false
      const summary = previous.details.querySelector<HTMLElement>('summary')
      if (!summary?.getClientRects().length || getComputedStyle(summary).visibility !== 'visible' ||
          summary.closest('[hidden], [inert]')) return false
      openTask(previous.details)
      reconcileTask()
      const focusOrigin = document.activeElement
      globalThis.requestAnimationFrame(() => {
        if (!previous.details.isConnected || !previous.details.open ||
            document.activeElement !== focusOrigin && document.activeElement !== document.body) return
        if (previous.body) previous.body.scrollTop = previous.scrollTop
        const focus = previous.focus
        const bodyRect = previous.body?.getBoundingClientRect()
        const focusRect = focus instanceof HTMLElement ? focus.getBoundingClientRect() : undefined
        const withinBody = bodyRect && focusRect && focusRect.top >= bodyRect.top &&
          focusRect.bottom <= bodyRect.bottom && focusRect.left >= bodyRect.left && focusRect.right <= bodyRect.right
        const target = focus instanceof HTMLElement && visibleControl(focus) &&
          withinBody && !focus.matches(':disabled, [aria-disabled="true"]') && previous.body?.contains(focus)
          ? focus : summary
        if (visibleControl(target)) target.focus({ preventScroll: true })
      })
      return true
    },
    openFind: () => {
      if (!mapShortcutsAvailable()) return false
      openFind()
      return true
    },
    center: () => {
      if (centerDisabled || !mapShortcutsAvailable()) return false
      onCenter()
      return true
    },
    openShipFind: () => {
      openFind()
    },
  }))
  const historyNeedsRecovery = [
    'blocked',
    'stale-tab',
    'error',
    'deletion-failed',
  ].includes(historyStatus.phase)
  const settingsPromotedAction: PromotedAction | undefined =
    appUpdateAvailable || appUpdateActivating
      ? {
          kind: 'app-update',
          label: 'App update',
          message:
            appShellStatus ??
            (appUpdateActivating
              ? 'Applying the application update.'
              : 'An application update is ready.'),
          buttonLabel: appUpdateActivating
            ? 'REFRESHING...'
            : 'REFRESH APP',
          disabled: appUpdateActivating,
          run: onRefreshApp,
        }
      : historyNeedsRecovery
        ? {
            kind: 'history',
            label: 'History unavailable',
            message:
              historyStatus.message ??
              'Private local history needs attention.',
            buttonLabel: 'RETRY HISTORY',
            run: onRetryHistory,
          }
        : undefined
  const operationalPromotedAction: PromotedAction | undefined =
    weatherVisible && weatherError
      ? {
          kind: 'weather',
          label: 'METAR unavailable',
          message: weatherError,
          buttonLabel: weatherRetryUsesAirports
            ? 'RETRY AIRPORTS'
            : 'RETRY METAR',
          run: onRetryWeather,
        }
      : airportsVisible && airportsError
        ? {
            kind: 'airports',
            label: 'Airports unavailable',
            message: airportsError,
            buttonLabel: 'RETRY AIRPORTS',
            run: onRetryAirports,
          }
        : portsVisible && portsError
          ? {
              kind: 'ports',
              label: 'Ports unavailable',
              message: portsError,
              buttonLabel: 'RETRY PORTS',
              run: onRetryPorts,
            }
          : undefined
  const [locationSearch, locationSearchInputRef] = useLocationSearchModel({
    coordinatePrecision,
    maximumQueryLength: maximumLocationQueryLength,
    searchState: placeSearchState,
    onSearch: onPlaceSearch,
    onNavigate: onLocationNavigate,
    onSelectResult: onPlaceResultSelect,
    onCancel: onPlaceSearchCancel,
    onPause: onPlaceSearchPause,
    queryPaused: discoveryPaused || openWorkspaceTask !== 'find',
    onRevealDetails: () => openTask(mapToolsDetailsRef.current),
  })
  const orbitalLoading =
    orbitalState.phase === 'loading' ||
    orbitalState.phase === 'refreshing'
  const orbitalRetryAvailable =
    orbitalState.phase === 'unavailable' ||
    orbitalState.phase === 'clock-invalid'
  const reliefStatusMessage = !reliefVisible ? undefined
    : reliefStatus === 'unavailable' ? 'Relief unavailable. Toggle off/on to retry.'
      : reliefStatus === 'unsupported' ? 'Relief unavailable with this map style.'
        : undefined
  const orbitalStatusMessage = (() => {
    switch (orbitalState.phase) {
      case 'disabled':
        return undefined
      case 'loading':
        return 'Loading orbital catalog.'
      case 'refreshing':
        return orbitalState.positions.length > 0
          ? 'Refreshing catalog; positions retained.'
          : 'Refreshing catalog; positions temporarily unavailable.'
      case 'stale':
        return (
          orbitalState.message ??
          'Orbital catalog stale; positions remain labeled.'
        )
      case 'unavailable':
      case 'clock-invalid':
      case 'offline':
      case 'paused-hidden':
      case 'paused-history':
      case 'paused-capture':
        return orbitalState.message
      case 'empty':
        return (
          orbitalState.message ??
          'Catalog loaded; positions unavailable.'
        )
      case 'ready':
        return orbitalState.message
    }
  })()
  const revealOrbitalObjects = () => {
    const details = mapToolsDetailsRef.current
    if (!details) return
    setMapToolTask('orbits')
    openTask(details)
    globalThis.requestAnimationFrame(() => {
      mapToolsBodyRef.current?.scrollTo({ top: 0 })
      const target =
        details.querySelector<HTMLElement>(
          '.orbital-results button',
        ) ?? orbitalToggleRef.current
      target?.focus()
    })
  }
  const selectMapToolTask = (task: MapToolTask) => {
    if (task === 'find') {
      openFind()
      return
    }
    setMapToolTask(task)
    globalThis.requestAnimationFrame(() => {
      mapToolsBodyRef.current?.scrollTo({ top: 0 })
    })
  }
  function openFind() {
    const focusOrigin = document.activeElement
    setMapToolTask('find')
    openTask(mapToolsDetailsRef.current)
    onWorkspaceTaskChange?.('find')
    if (findFocusFrameRef.current !== null) {
      globalThis.cancelAnimationFrame(findFocusFrameRef.current)
    }
    findFocusFrameRef.current = globalThis.requestAnimationFrame(() => {
      findFocusFrameRef.current = null
      const details = mapToolsDetailsRef.current
      if (!details?.isConnected || !details.open) return
      if (document.activeElement !== focusOrigin && document.activeElement !== document.body) return
      const target = locationSearchInputRef.current
      if (visibleControl(target)) target.focus()
    })
  }
  const mobileTaskHeading = (label: string, onClose: () => void) => mobileWorkspace && (
    <div className="mobile-task-heading">
      {(label === 'Context' || label === 'Orbits' || label === 'Sources') && (
        <button type="button" aria-label="Back to Layers" onClick={() => selectMapToolTask('layers')}>
          <svg className="operation-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m14 6-6 6 6 6" />
          </svg>
        </button>
      )}
      <strong>{label}</strong>
      <button type="button" aria-label={`Close ${label}`} onClick={onClose}>
        <OperationIcon name="close" />
      </button>
    </div>
  )
  const closeInView = () => {
    const details = inViewDetailsRef.current
    if (!details) return
    details.open = false
    const summary = details.querySelector<HTMLElement>('summary')
    const returnToSettings =
      inViewOpenedFromSettingsRef.current &&
      !summary?.getClientRects().length
    if (returnToSettings && settingsDetailsRef.current) {
      settingsDetailsRef.current.open = true
    }
    globalThis.requestAnimationFrame(() => {
      const target = returnToSettings
        ? inViewEntryRef.current
        : summary?.getClientRects().length
          ? summary
          : settingsDetailsRef.current?.querySelector<HTMLElement>('summary')
      target?.focus()
    })
  }
  const revealInView = () => {
    const details = inViewDetailsRef.current
    if (!details) return
    inViewOpenedFromSettingsRef.current = true
    openTask(details)
    details.querySelector<HTMLElement>('.in-view__tabs button')?.focus()
  }

  return (
    <>
    <span id="map-action-shortcuts" hidden>Map focused: F Find, C Center.</span>
    <header className="brand-panel">
      {masthead}
    </header>
    <div className="control-stack" aria-label="Map controls">
      <div className="workspace-dock">
      <div className="workspace-orientation">
      <button
        ref={centerButtonRef}
        id="center-map-button"
        className="workspace-center"
        type="button"
        disabled={centerDisabled}
        onClick={onCenter}
        title="Center on session Home"
        aria-keyshortcuts="c"
        aria-describedby="map-action-shortcuts"
      >
        <OperationIcon name="center" />
        CENTER
      </button>
      {northResetBearing !== undefined && (
        <button
          id="reset-north-button"
          className="workspace-north"
          type="button"
          aria-label="Reset north"
          title="Reset north without changing location or tilt"
          onClick={onResetNorth}
        >
          <span aria-hidden="true">N</span>
          <svg
            className="operation-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            style={{ transform: `rotate(${-normalizeMapBearing(northResetBearing)}deg)` }}
          >
            <path d="m12 3 5 17-5-3-5 3 5-17Z" />
          </svg>
        </button>
      )}
      {fullscreen.active && (
        <>
          <button
            id="exit-fullscreen-button"
            className="workspace-fullscreen-exit"
            type="button"
            aria-label="Exit workspace fullscreen"
            title="Exit fullscreen"
            aria-busy={fullscreen.pending === 'exit'}
            aria-disabled={fullscreen.pending !== null}
            aria-describedby={fullscreen.message ? 'fullscreen-exit-status' : undefined}
            onClick={onExitFullscreen}
          >
            <OperationIcon name="fullscreenExit" />
          </button>
          {fullscreen.message && (
            <p id="fullscreen-exit-status" className="workspace-fullscreen-status" role="status">
              {fullscreen.message}
            </p>
          )}
        </>
      )}
      </div>
      <aside
        className={`control-panel control-panel--operations${
          operationalPromotedAction ? ' control-panel--urgent' : ''
        }`}
        aria-label="Operations"
      >
      <div
        className="control-options control-panel__primary"
        hidden={mobileWorkspace}
        role="group"
        aria-label="Map operations"
      >
        <button
          type="button"
          className={aircraftVisible ? 'is-active' : undefined}
          aria-pressed={aircraftVisible}
          onClick={() => onAircraftVisibleChange(!aircraftVisible)}
        >
          <OperationIcon name="aircraft" />
          AIRCRAFT
        </button>
        <button
          type="button"
          className={vesselsVisible ? 'is-active' : undefined}
          aria-pressed={vesselsVisible}
          onClick={() => onVesselsVisibleChange(!vesselsVisible)}
        >
          <OperationIcon name="ships" />
          SHIPS
        </button>
        <button
          ref={orbitalToggleRef}
          id="orbital-layer-toggle"
          type="button"
          className={orbitalVisible ? 'is-active' : undefined}
          aria-pressed={orbitalVisible}
          aria-busy={orbitalVisible && orbitalLoading}
          onClick={() => onOrbitalVisibleChange(!orbitalVisible)}
        >
          <OperationIcon name="orbits" />
          {orbitalVisible && orbitalLoading ? 'ORBITS...' : 'ORBITS'}
        </button>
      </div>

      {orbitalPrimarySummary && (
        <div className="control-panel__urgent control-panel__orbital-summary">
          <span title={orbitalPrimarySummary}>
            {orbitalPrimarySummary}
          </span>
          <button
            type="button"
            aria-label="View modeled orbital objects"
            aria-controls="traffic-controls-map-tools"
            onClick={revealOrbitalObjects}
          >
            VIEW
          </button>
        </div>
      )}

      <div
        className="control-panel__urgent"
        hidden={!operationalPromotedAction}
        role={operationalPromotedAction ? 'status' : undefined}
        aria-live={operationalPromotedAction ? 'polite' : undefined}
        aria-atomic={operationalPromotedAction ? 'true' : undefined}
      >
        {operationalPromotedAction && (
          <>
            <span>
              {operationalPromotedAction.label}:{' '}
              {operationalPromotedAction.message}
            </span>
            <button
              type="button"
              disabled={operationalPromotedAction.disabled}
              onClick={operationalPromotedAction.run}
            >
              {operationalPromotedAction.buttonLabel}
            </button>
          </>
        )}
      </div>

      <details
        ref={mapToolsDetailsRef}
        id="traffic-controls-map-tools"
        name="traffic-control-panels"
        className="control-panel__more"
        onFocusCapture={(event) => {
          captureTaskFocus(event)
          handleDisclosureFocus(event, focusedWithinMapToolsRef)
        }}
        onBlurCapture={(event) =>
          handleDisclosureBlur(event, focusedWithinMapToolsRef)
        }
        onToggle={(event) => {
          handleDisclosureToggle(event, focusedWithinMapToolsRef)
          reconcileTask()
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !event.currentTarget.open ||
            workspaceOwnsFullscreen(event.currentTarget)) return
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.open = false
        }}
      >
        <summary
          id="traffic-controls-map-tools-summary"
          ref={mapToolsSummaryRef}
          title={mobileWorkspace ? 'Layers and map context' : 'Explore map: layers, discovery, context and sources'}
          onClick={(event) => {
            closeOtherTasks(mapToolsDetailsRef.current)
            if (!mobileWorkspace) {
              if (!mapToolsDetailsRef.current?.open) {
                event.preventDefault()
                openFind()
                mapToolsBodyRef.current?.scrollTo({ top: 0 })
              }
              return
            }
            if (mapToolsDetailsRef.current?.open && mapToolTask !== 'layers') {
              event.preventDefault()
              selectMapToolTask('layers')
            } else {
              setMapToolTask('layers')
            }
          }}
        >
          <OperationIcon name="explore" />
          <span>{mobileWorkspace ? 'Layers' : 'More'}</span>
        </summary>
        {mobileTaskHeading(
          mapToolTask === 'find' ? 'Find' : mapToolTask === 'orbits' ? 'Orbits' :
            mapToolTask === 'context' ? 'Context' : mapToolTask === 'sources' ? 'Sources' : 'Layers',
          () => { if (mapToolsDetailsRef.current) mapToolsDetailsRef.current.open = false },
        )}
        <div
          ref={mapToolsBodyRef}
          className="control-panel__more-body"
          role="region"
          aria-label="Map tools"
          tabIndex={0}
        >
          {mobileWorkspace && (
            <div className="mobile-layers-tools" hidden={mapToolTask !== 'layers'}>
              <div className="control-options control-options--three mobile-traffic-layers" role="group" aria-label="Traffic layers">
                <button type="button" className={aircraftVisible ? 'is-active' : undefined} aria-pressed={aircraftVisible} onClick={() => onAircraftVisibleChange(!aircraftVisible)}>
                  <OperationIcon name="aircraft" /> AIRCRAFT
                </button>
                <button type="button" className={vesselsVisible ? 'is-active' : undefined} aria-pressed={vesselsVisible} onClick={() => onVesselsVisibleChange(!vesselsVisible)}>
                  <OperationIcon name="ships" /> SHIPS
                </button>
                <button id="mobile-orbital-layer-toggle" type="button" className={orbitalVisible ? 'is-active' : undefined} aria-pressed={orbitalVisible} aria-busy={orbitalVisible && orbitalLoading} onClick={() => onOrbitalVisibleChange(!orbitalVisible)}>
                  <OperationIcon name="orbits" /> {orbitalVisible && orbitalLoading ? 'ORBITS...' : 'ORBITS'}
                </button>
              </div>
              <div className="control-options control-options--three mobile-context-actions">
                <button type="button" onClick={() => selectMapToolTask('context')}>Context</button>
                <button type="button" onClick={() => selectMapToolTask('orbits')}>Orbits</button>
                <button type="button" onClick={() => selectMapToolTask('sources')}>Sources</button>
              </div>
            </div>
          )}
          <div
            className="control-panel__tasks"
            role="group"
            aria-label="Map tools view"
          >
            {MAP_TOOL_TASKS.map(([task, label]) => (
              <button
                key={task}
                id={`map-tools-task-${task}`}
                type="button"
                className={mapToolTask === task ? 'is-active' : undefined}
                aria-pressed={mapToolTask === task}
                aria-controls={`map-tools-panel-${task}`}
                aria-keyshortcuts={task === 'find' ? 'f' : undefined}
                aria-describedby={task === 'find' ? 'map-action-shortcuts' : undefined}
                onClick={() => selectMapToolTask(task)}
              >
                {label}
              </button>
            ))}
          </div>

          <section
            id="map-tools-panel-layers"
            className="control-panel__task"
            aria-labelledby="map-tools-task-layers"
            hidden={mapToolTask !== 'layers'}
          >
            <fieldset className="control-group" aria-label="Layers">
              <div className="control-options control-options--two">
                <button
                  type="button"
                  className={portsVisible ? 'is-active' : undefined}
                  aria-pressed={portsVisible}
                  aria-busy={portsVisible && portsLoading}
                  onClick={() => onPortsVisibleChange(!portsVisible)}
                >
                  {portsVisible && portsLoading ? 'PORTS...' : 'PORTS'}
                </button>
                <button
                  id="airports-layer-toggle"
                  type="button"
                  className={airportsVisible ? 'is-active' : undefined}
                  aria-pressed={airportsVisible}
                  aria-busy={airportsVisible && airportsLoading}
                  onClick={() => onAirportsVisibleChange(!airportsVisible)}
                >
                  {airportsVisible && airportsLoading
                    ? 'AIRPORTS...'
                    : 'AIRPORTS'}
                </button>
                <button
                  type="button"
                  className={clusteringEnabled ? 'is-active' : undefined}
                  aria-pressed={clusteringEnabled}
                  onClick={() =>
                    onClusteringEnabledChange(!clusteringEnabled)
                  }
                >
                  CLUSTERS
                </button>
                <button
                  id="weather-layer-toggle"
                  type="button"
                  className={weatherVisible ? 'is-active' : undefined}
                  aria-pressed={weatherVisible}
                  aria-busy={
                    weatherVisible && (weatherLoading || weatherWaiting)
                  }
                  onClick={() => onWeatherVisibleChange(!weatherVisible)}
                >
                  {weatherVisible && weatherLoading ? 'METAR...' : 'METAR'}
                </button>
                <button
                  id="depths-layer-toggle"
                  type="button"
                  className={depthsVisible ? 'is-active' : undefined}
                  aria-pressed={depthsVisible}
                  aria-busy={depthsVisible && bathymetryStatus.imagery === 'loading'}
                  aria-describedby={depthsVisible ? 'depths-layer-status' : undefined}
                  onClick={() => onDepthsVisibleChange(!depthsVisible)}
                >
                  DEPTHS
                </button>
                <button
                  id="relief-layer-toggle"
                  type="button"
                  className={reliefVisible ? 'is-active' : undefined}
                  aria-pressed={reliefVisible}
                  aria-describedby={reliefStatusMessage ? 'relief-layer-status' : undefined}
                  onClick={() => onReliefVisibleChange(!reliefVisible)}
                >
                  RELIEF
                </button>
              </div>
              <div id="relief-layer-status" role="status">
                {reliefStatusMessage && <p className="control-note">{reliefStatusMessage}</p>}
              </div>
              <div id="depths-layer-status" className={depthsVisible ? 'control-note' : undefined} role="status">
                {depthsVisible ? (
                  <>
                    <p>
                      Modeled depths; not for navigation.
                    </p>
                    <p>
                      {bathymetryStatus.values.source === 'emodnet'
                        ? 'EMODnet · m below LAT'
                        : bathymetryStatus.values.source === 'gebco'
                          ? 'GEBCO · m below nominal MSL'
                          : 'Depth labels'}
                      {' · '}
                      {bathymetryStatus.values.phase === 'zoom-in'
                        ? 'zoom in.'
                        : bathymetryStatus.values.phase === 'loading'
                          ? 'loading.'
                          : bathymetryStatus.values.phase === 'empty'
                            ? 'no values.'
                            : bathymetryStatus.values.phase === 'unavailable'
                              ? 'unavailable.'
                              : bathymetryStatus.values.phase === 'paused'
                                ? 'paused.'
                                : `${bathymetryStatus.values.samples.length} values${bathymetryStatus.values.phase === 'partial' ? ' · partial' : ''}.`}
                    </p>
                    {bathymetryStatus.imagery !== 'ready' && bathymetryStatus.imageryMessage && (
                      <p>{bathymetryStatus.imageryMessage}</p>
                    )}
                    {['partial', 'unavailable'].includes(bathymetryStatus.values.phase) && (
                      <p>{bathymetryStatus.values.message}</p>
                    )}
                  </>
                ) : null}
              </div>
              {portsVisible &&
                portsError &&
                operationalPromotedAction?.kind !== 'ports' && (
                <div className="control-note ports-status" role="status">
                  <span>Ports unavailable: {portsError}</span>
                  <button type="button" onClick={onRetryPorts}>
                    RETRY PORTS
                  </button>
                </div>
              )}
              {airportsVisible &&
                airportsError &&
                operationalPromotedAction?.kind !== 'airports' &&
                !(
                  operationalPromotedAction?.kind === 'weather' &&
                  weatherRetryUsesAirports
                ) && (
                <div className="control-note ports-status" role="status">
                  <span>Airports unavailable: {airportsError}</span>
                  <button type="button" onClick={onRetryAirports}>
                    RETRY AIRPORTS
                  </button>
                </div>
              )}
              {weatherVisible &&
                weatherError &&
                operationalPromotedAction?.kind !== 'weather' && (
                <div className="control-note ports-status" role="status">
                  <span>METAR unavailable: {weatherError}</span>
                  <button type="button" onClick={onRetryWeather}>
                    RETRY METAR
                  </button>
                </div>
              )}
              {weatherVisible && !weatherError && weatherStatusMessage && (
                <div className="control-note ports-status" role="status">
                  <span>{weatherStatusMessage}</span>
                  {weatherReady && (
                    <button
                      type="button"
                      disabled={!weatherCanRefresh}
                      onClick={onRefreshWeather}
                    >
                      REFRESH METAR
                    </button>
                  )}
                </div>
              )}
            </fieldset>
            <details className="context-details map-filter-options">
              <summary>Map filters</summary>
              <AircraftDiscovery
                query={aircraftQuery}
                aircraft={aircraftResults}
                totalAircraft={totalAircraft}
                aircraftVisible={aircraftVisible}
                emptyMessage={aircraftEmptyMessage}
                onQueryChange={onAircraftQueryChange}
                onSelect={onAircraftSelect}
              />
              <VesselDiscovery
                filters={vesselFilters}
                vessels={vesselResults}
                totalVessels={totalVessels}
                vesselsVisible={vesselsVisible}
                emptyMessage={vesselEmptyMessage}
                units={units}
                onFiltersChange={onVesselFiltersChange}
                onSelect={onVesselSelect}
              />
            </details>
          </section>

          <section
            id="map-tools-panel-find"
            className="control-panel__task"
            aria-labelledby="map-tools-task-find"
            hidden={mapToolTask !== 'find'}
          >
            <ObjectFind
              model={locationSearch}
              inputRef={locationSearchInputRef}
              maximumQueryLength={maximumLocationQueryLength}
              placeSearchState={placeSearchState}
              mobile={mobileWorkspace}
              active={openWorkspaceTask === 'find'}
              paused={discoveryPaused}
              now={now}
              navigationDisabled={locationNavigationDisabled}
              onNavigate={onFindReportNavigate}
              onBeginShipLocate={onBeginShipLocate}
              aircraft={findAircraft}
              vessels={findVessels}
              aircraftVisible={aircraftVisible}
              vesselsVisible={vesselsVisible}
              selectableVesselIds={new Set(vesselResults.map((vessel) => vessel.id))}
              onAircraftSelect={onFindTrafficNavigate}
              onVesselSelect={onFindTrafficNavigate}
              airports={catalogAirports}
              airportsReady={airportsReady}
              airportsLoading={airportsLoading}
              airportsError={airportsError}
              airportSource={airportSource}
              onLoadAirports={onLoadAirports}
              onAirportNavigate={onAirportNavigate}
              ports={catalogPorts}
              portsReady={portsReady}
              portsLoading={portsLoading}
              portsError={portsError}
              portSource={portSource}
              onLoadPorts={onLoadPorts}
              onPortNavigate={onPortNavigate}
              curated={orbitalState}
              starlink={starlinkState}
              selectedOrbitalId={selectedOrbitalId}
              orbitalVisible={orbitalVisible}
              onOrbitalNavigate={onOrbitalNavigate}
              onLoadOrbits={() => {
                if (!orbitalVisible) onOrbitalVisibleChange(true)
                else onRetryOrbital()
              }}
              discoverMarineMetadata={discoverMarineMetadata}
              savedEntries={savedEntries}
              savedStatus={savedStatus}
              aircraftAvailability={aircraftAvailability}
              vesselAvailability={vesselAvailability}
              lastObservedAt={lastSavedObservationAt}
              onRemoveSaved={onRemoveSaved}
              onClearSaved={onClearSaved}
              onRestoreSaved={onRestoreSaved}
            />
          </section>

          <section
            id="map-tools-panel-context"
            className="control-panel__task"
            aria-labelledby="map-tools-task-context"
            hidden={mapToolTask !== 'context'}
          >
            {airportsVisible && airportsReady && (
              <AirportContext
                airports={airportsInView}
                selectedAirportId={selectedAirportId}
                emptyMessage={airportsEmptyMessage}
                onSelect={onAirportSelect}
              />
            )}

            {weatherVisible && weatherReady && (
              <WeatherContext
                observations={weatherObservations}
                selectedObservationId={selectedWeatherId}
                emptyMessage={weatherEmptyMessage}
                now={now}
                onSelect={onWeatherSelect}
              />
            )}

            {!airportsVisible && !weatherVisible && (
              <p className="control-note">
                Enable AIRPORTS or METAR in Layers.
              </p>
            )}
            {airportsVisible && !airportsReady && !airportsError && (
              <p className="control-note" role="status">
                {airportsLoading ? 'Loading airports.' : 'Waiting for airports.'}
              </p>
            )}
            {airportsVisible && airportsError && operationalPromotedAction?.kind !== 'airports' &&
              !(operationalPromotedAction?.kind === 'weather' && weatherRetryUsesAirports) && (
              <div className="control-note ports-status" role="status">
                <span>Airports unavailable: {airportsError}</span>
                <button type="button" onClick={onRetryAirports}>RETRY AIRPORTS</button>
              </div>
            )}
            {weatherVisible && !weatherReady && !weatherError && (
              <p className="control-note" role="status">
                {weatherStatusMessage ?? (weatherLoading ? 'Loading weather reports.' : 'Waiting for weather reports.')}
              </p>
            )}
          </section>

          <section
            id="map-tools-panel-orbits"
            className="control-panel__task"
            aria-labelledby="map-tools-task-orbits"
            hidden={mapToolTask !== 'orbits'}
          >
            {orbitalVisible && orbitalStatusMessage && (
              <div className="control-note ports-status" role="status">
                <span>{orbitalStatusMessage}</span>
                {orbitalRetryAvailable && (
                  <button
                    type="button"
                    onClick={onRetryOrbital}
                  >
                    RECHECK ORBITS
                  </button>
                )}
              </div>
            )}

            {!orbitalVisible && (
              <p className="control-note">Turn on ORBITS in Layers.</p>
            )}

            <StarlinkContext
              parentVisible={orbitalVisible}
              live={playback.mode === 'live'}
              state={starlinkState}
              selectedId={selectedOrbitalId}
              counts={starlinkCounts}
              horizonMs={orbitalPredictionHorizonMs}
              pageSize={orbitalPageSize}
              onSelect={onOrbitalSelect}
              onRetry={onRetryStarlink}
            />

            {orbitalVisible &&
              playback.mode === 'live' &&
              orbitalState.snapshot &&
              ![
                'loading',
                'unavailable',
                'clock-invalid',
                'paused-hidden',
                'paused-history',
                'paused-capture',
              ].includes(orbitalState.phase) && (
                <OrbitalContext
                  state={orbitalState}
                  selectedId={selectedOrbitalId}
                  filters={orbitalFilters}
                  display={orbitalDisplay}
                  counts={orbitalCounts}
                  horizonMs={orbitalPredictionHorizonMs}
                  now={now}
                  maximumQueryLength={orbitalMaximumQueryLength}
                  pageSize={orbitalPageSize}
                  onFiltersChange={onOrbitalFiltersChange}
                  onSelect={onOrbitalSelect}
                />
              )}
          </section>

          <section
            id="map-tools-panel-sources"
            className="control-panel__task"
            aria-labelledby="map-tools-task-sources"
            hidden={mapToolTask !== 'sources'}
          >
            <fieldset className="control-group" aria-label="Sources">
              <ul className="control-source-list">
                <li>
                  Relief:{' '}
                  <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">
                    Mapzen terrain contributors
                  </a>.
                </li>
                <li>
                  Depths: <a href="https://emodnet.ec.europa.eu/en/bathymetry">EMODnet</a>
                  {' / '}<a href="https://www.gebco.net/">GEBCO</a>.
                </li>
                <li>
                  Aircraft: <a href="https://www.adsb.lol/">ADSB.lol</a>.
                </li>
                <li>
                  Marine: {marineProviderName}.
                </li>
                <li>
                  Photos: <a href="https://www.planespotters.net/photo/api">Planespotters</a>
                  {' · '}<a href="https://openwaters.io/ais/">Open Waters</a>
                  {' / '}<a href="https://commons.wikimedia.org/">Wikimedia Commons</a>
                </li>
                <li>
                  Ports:{' '}
                  <a href="https://www.naturalearthdata.com/downloads/10m-cultural-vectors/ports/">
                    Natural Earth
                  </a>{' '}
                  · public domain · generalized.
                </li>
                <li>
                  Airports:{' '}
                  <a href="https://ourairports.com/data/">OurAirports</a>{' '}
                  · public domain · static.
                </li>
                {APP_CONFIG.airportBoards.enabled && (
                  <li>
                    Airport boards:{' '}
                    <a href={APP_CONFIG.airportBoards.sourceUrl} target="_blank" rel="noopener" referrerPolicy="origin">
                      AeroDataBox
                    </a>
                  </li>
                )}
                <li>
                  METAR:{' '}
                  <a href="https://aviationweather.gov/data/api/">
                    NOAA/NWS AWC
                  </a>{' '}
                  · observations, not forecasts.
                </li>
                <li>
                  Orbits: <a href="https://celestrak.org/">CelesTrak</a>
                  {' · '}<a href="https://www.space-track.org/">Space-Track.org / USSPACECOM</a>{' '}
                  · SGP4 modeled, not live/optical.
                </li>
                <li>
                  Site statistics: <a href="https://www.cloudflare.com/web-analytics/">Cloudflare</a>.
                </li>
              </ul>
              <p className="control-note control-note--muted">
                Relief and depth requests reveal the viewed area to Mapzen/AWS, EMODnet and GEBCO.
              </p>
              <details className="context-details">
                <summary>Data use &amp; model limits</summary>
                <p className="control-note">Building heights are estimates.</p>
                <p className="control-note">
                  Depth shading: EMODnet 2018 / GEBCO 2019. Numbers use newer grids.
                </p>
                <p className="control-note">
                  {depthSourceDescription('emodnet')}.
                  {' '}{depthSourceDescription('gebco')}.
                </p>
                <p className="control-note">
                  METAR: U.S. public domain unless marked otherwise.
                </p>
              <p className="control-note control-note--muted">
                Browser location is rounded and not saved. METAR requests send visible station IDs.
                {' '}<a href="https://github.com/vasilyevstan/LiveTrafficStan/blob/main/docs/data-sources-and-licensing.md">Full data credits &amp; privacy</a>.
              </p>
              </details>
              <details className="context-details">
                <summary>Visitor analytics &amp; privacy</summary>
                <p className="control-note">
                  Cloudflare receives page-load and performance data on trackstan.xyz:
                  referrers, country, browser and device.
                </p>
                <p className="control-note">
                  No cookies, persistent visitor IDs or custom interaction events.
                  {' '}<a href="https://github.com/vasilyevstan/LiveTrafficStan/blob/main/docs/data-sources-and-licensing.md#visitor-analytics">Collection details</a>.
                </p>
              </details>
            </fieldset>
          </section>
        </div>
      </details>
      </aside>
      {mobileWorkspace && (
        <button
          id="mobile-find-button"
          className="workspace-find"
          type="button"
          aria-controls="traffic-controls-map-tools"
          aria-expanded={openWorkspaceTask === 'find'}
          aria-keyshortcuts="f"
          aria-describedby="map-action-shortcuts"
          onClick={() => {
            if (openWorkspaceTask === 'find') {
              if (mapToolsDetailsRef.current) mapToolsDetailsRef.current.open = false
              if (settingsDetailsRef.current) settingsDetailsRef.current.open = false
              reconcileTask()
            } else openFind()
          }}
        >
          <OperationIcon name="find" />
          Find
        </button>
      )}

      <aside
        className={`control-panel control-panel--settings${
          settingsPromotedAction ? ' control-panel--urgent' : ''
        }`}
        aria-label="Location and settings"
      >
        <div
          className="control-panel__urgent"
          hidden={!settingsPromotedAction}
          role={settingsPromotedAction ? 'status' : undefined}
          aria-live={settingsPromotedAction ? 'polite' : undefined}
          aria-atomic={settingsPromotedAction ? 'true' : undefined}
        >
          {settingsPromotedAction && (
              <>
               {settingsPromotedAction.kind !== 'app-update' && <span>
                  {settingsPromotedAction.label}:{' '}
                  {settingsPromotedAction.message}
               </span>}
              <button
                type="button"
                disabled={settingsPromotedAction.disabled}
                onClick={settingsPromotedAction.run}
              >
                {settingsPromotedAction.buttonLabel}
              </button>
            </>
          )}
        </div>

        <details
          ref={settingsDetailsRef}
          id="traffic-controls-settings"
          name="traffic-control-panels"
          className="control-panel__more"
          onFocusCapture={(event) => {
            captureTaskFocus(event)
            handleDisclosureFocus(event, focusedWithinSettingsRef)
          }}
          onBlurCapture={(event) =>
            handleDisclosureBlur(event, focusedWithinSettingsRef)
          }
          onToggle={(event) => {
            handleDisclosureToggle(event, focusedWithinSettingsRef)
            reconcileTask()
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || !event.currentTarget.open ||
              workspaceOwnsFullscreen(event.currentTarget)) return
            event.preventDefault()
            event.stopPropagation()
            event.currentTarget.open = false
          }}
        >
          <summary
            id="traffic-controls-settings-summary"
            ref={settingsSummaryRef}
            title="View and settings: appearance, location and history"
            onClick={() => {
              closeOtherTasks(settingsDetailsRef.current)
            }}
          >
            <OperationIcon name="settings" />
            <span>Settings</span>
          </summary>
          {mobileTaskHeading('Settings', () => {
            if (settingsDetailsRef.current) settingsDetailsRef.current.open = false
          })}
          <div
            ref={settingsBodyRef}
            className="control-panel__more-body"
            role="region"
            aria-label="Location and settings"
            tabIndex={0}
          >
            <button
              ref={inViewEntryRef}
              id="in-view-settings-entry"
              className="in-view-mobile-entry"
              type="button"
              aria-controls="traffic-controls-in-view"
              onClick={revealInView}
            >
              <OperationIcon name="inView" />
              Aircraft, ships &amp; orbits in view
            </button>
            <div className="workspace-location">
            <div className="workspace-navigation" role="group" aria-label="Map navigation">
              <button type="button" onClick={openFind} aria-controls="map-tools-panel-find">
                <OperationIcon name="find" /> Find objects or places
              </button>
              {activeLocationLabel !== 'Custom view' && <p className="control-note">{activeLocationLabel}</p>}
            </div>
            </div>

            <fieldset className="control-group">
              <legend>Appearance</legend>
              <div
                className="control-options control-options--four"
                role="group"
                aria-label="Theme and trails"
              >
                {(['auto', 'light', 'dark'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={
                      themePreference === option ? 'is-active' : undefined
                    }
                    aria-pressed={themePreference === option}
                    onClick={() => onThemePreferenceChange(option)}
                  >
                    {option.toUpperCase()}
                  </button>
                ))}
                <button
                  type="button"
                  className={trailPreferences.visible ? 'is-active' : undefined}
                  aria-pressed={trailPreferences.visible}
                  onClick={() =>
                    onTrailPreferencesChange({
                      ...trailPreferences,
                      visible: !trailPreferences.visible,
                    })
                  }
                >
                  TRAILS
                </button>
              </div>
              <div
                className="control-options control-options--two control-options--projection"
                role="group"
                aria-label="Map projection"
              >
                {(['auto', 'flat'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={
                      projectionPreference === option ? 'is-active' : undefined
                    }
                    aria-pressed={projectionPreference === option}
                    onClick={() => onProjectionPreferenceChange(option)}
                  >
                    {option === 'auto' ? 'AUTO GLOBE' : 'FLAT'}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="control-group" aria-label="View">
              <div className="control-options control-options--one">
                {!fullscreen.active && (
                  <button
                    id="enter-fullscreen-button"
                    type="button"
                    disabled={!fullscreen.available}
                    aria-label="Enter workspace fullscreen"
                    aria-busy={fullscreen.pending === 'enter'}
                    aria-disabled={fullscreen.pending !== null}
                    aria-describedby={
                      fullscreen.message || !fullscreen.available
                        ? 'fullscreen-entry-status'
                        : undefined
                    }
                    onClick={onEnterFullscreen}
                  >
                    <OperationIcon name="fullscreenEnter" />
                    {fullscreen.pending === 'enter' ? 'ENTERING FULLSCREEN...' : 'ENTER FULLSCREEN'}
                  </button>
                )}
                <button
                  type="button"
                  disabled={!locationAvailable || locationLoading}
                  aria-busy={locationLoading}
                  aria-describedby={
                    locationMessage ? 'location-status' : undefined
                  }
                  onClick={onUseLocation}
                >
                  {locationLoading ? 'LOCATING...' : 'USE LOCATION'}
                </button>
              </div>
              {onStartRuler && (
                <>
                  <div className="control-options control-options--one">
                    <button id="measure-distance-button" type="button"
                      disabled={!rulerAvailable}
                      aria-describedby={rulerDistance || rulerMessage ? 'ruler-view-status' : undefined}
                      onClick={onStartRuler}
                    >MEASURE DISTANCE</button>
                  </div>
                  {(rulerDistance || rulerMessage) && <p id="ruler-view-status" className="control-note">
                    {rulerDistance ? <>Approximate surface distance: <output>{rulerDistance}</output></>
                      : rulerMessage}
                  </p>}
                  {rulerDistance && (
                    <div className="control-options control-options--one">
                      <button id="clear-distance-button" type="button" onClick={onClearRuler}>CLEAR MEASUREMENT</button>
                    </div>
                  )}
                </>
              )}
              {!fullscreen.active && (fullscreen.message || !fullscreen.available) && (
                <p id="fullscreen-entry-status" className="control-note" role="status">
                  {fullscreen.message ?? FULLSCREEN_UNAVAILABLE_MESSAGE}
                </p>
              )}
              {locationMessage && (
                <p
                  id="location-status"
                  className="control-note"
                  role="status"
                >
                  {locationMessage}
                </p>
              )}
            </fieldset>

            <HistoryControls
              trailPreferences={trailPreferences}
              onTrailPreferencesChange={onTrailPreferencesChange}
              historySettings={historySettings}
              historyStatus={historyStatus}
              historyRange={historyRange}
              historyRecordCount={historyRecordCount}
              playback={playback}
              onHistoryEnabledChange={onHistoryEnabledChange}
              onHistoryRetentionChange={onHistoryRetentionChange}
              onClearHistory={onClearHistory}
              onRetryHistory={onRetryHistory}
              onEnterHistory={onEnterHistory}
              retryPromoted={settingsPromotedAction?.kind === 'history'}
              trailVisibilityPromoted
            />

            <fieldset className="control-group">
              <legend>Saved objects</legend>
              <p className="control-note">
                {savedEntries.length} saved on this browser profile. Anyone using
                this profile can see the list. Saved membership performs no
                background lookup and is not included in share links.
              </p>
              {savedStatus.phase !== 'ready' && (
                <p className="control-note" role="alert">{savedStatus.message}</p>
              )}
              {savedMessage && (
                <p className="control-note" role="status">{savedMessage}</p>
              )}
              <div className="control-options control-options--one">
                <button
                  type="button"
                  disabled={savedEntries.length === 0 && savedStatus.phase === 'ready'}
                  onBlur={() => setSavedClearArmed(false)}
                  onClick={() => {
                    if (!savedClearArmed) {
                      setSavedClearArmed(true)
                      setSavedMessage('Activate again to clear saved identities from this browser profile.')
                      return
                    }
                    const result = onClearSaved()
                    setSavedClearArmed(false)
                    setSavedMessage(result.message)
                  }}
                >
                  {savedClearArmed ? 'CONFIRM CLEAR SAVED' : 'CLEAR SAVED'}
                </button>
              </div>
              <p className="control-note control-note--muted">
                Clearing Saved does not clear local history or preferences.
                Removing the installed app may not remove browser site data.
              </p>
            </fieldset>

            <fieldset className="control-group">
              <legend>Preferences</legend>
              <div className="control-options control-options--two">
                <button
                  type="button"
                  className={units === 'metric' ? 'is-active' : undefined}
                  aria-pressed={units === 'metric'}
                  onClick={() => onUnitsChange('metric')}
                >
                  METRIC
                </button>
                <button
                  type="button"
                  className={
                    units === 'aviation-nautical'
                      ? 'is-active'
                      : undefined
                  }
                  aria-pressed={units === 'aviation-nautical'}
                  onClick={() => onUnitsChange('aviation-nautical')}
                >
                  AVIATION / NAUTICAL
                </button>
                <button
                  type="button"
                  disabled={shareDisabled}
                  onClick={onShare}
                >
                  SHARE VIEW
                </button>
                <button type="button" onClick={onResetPreferences}>
                  RESET PREFERENCES
                </button>
                {appUpdateAvailable &&
                  settingsPromotedAction?.kind !== 'app-update' && (
                    <button
                      type="button"
                      disabled={appUpdateActivating}
                      onClick={onRefreshApp}
                    >
                      {appUpdateActivating
                        ? 'REFRESHING APP...'
                        : 'REFRESH APP'}
                    </button>
                  )}
              </div>
              {preferenceStatus && (
                <p className="control-note" role="status">
                  {preferenceStatus}
                </p>
              )}
              {manualShareUrl && (
                <label className="preference-share-link">
                  <span>Copy this share link</span>
                  <input
                    type="text"
                    readOnly
                    value={manualShareUrl}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
              )}
              {appShellStatus &&
                settingsPromotedAction?.kind !== 'app-update' && (
                <p className="control-note" role="status">
                  {appShellStatus}
                </p>
              )}
            </fieldset>
          </div>
        </details>
      </aside>
      <aside className="control-panel control-panel--in-view" aria-label="In view">
        <details
          ref={inViewDetailsRef}
          className="control-panel__more control-panel__in-view"
          name="traffic-control-panels"
          onFocusCapture={captureTaskFocus}
          onToggle={reconcileTask}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || workspaceOwnsFullscreen(event.currentTarget)) return
            event.preventDefault()
            event.stopPropagation()
            closeInView()
          }}
        >
          <summary
            id="in-view-summary"
            aria-controls="traffic-controls-in-view"
            onClick={() => {
              closeOtherTasks(inViewDetailsRef.current)
              inViewOpenedFromSettingsRef.current = false
            }}
          >
            <OperationIcon name="inView" />
            IN VIEW
          </summary>
          {mobileTaskHeading('In view', closeInView)}
          <div
            ref={inViewBodyRef}
            id="traffic-controls-in-view"
            className="control-panel__more-body in-view-body"
            role="region"
            aria-label="Aircraft, ships and orbits in view"
          >
            <button
              className="close-button in-view__close"
              type="button"
              aria-label="Close In view"
              onClick={closeInView}
            >
              <OperationIcon name="close" />
            </button>
            {inView}
            <div className="control-options control-options--one in-view__more">
              <button type="button" onClick={revealOrbitalObjects}>
                More: orbital discovery &amp; passes
              </button>
            </div>
          </div>
        </details>
      </aside>
      </div>
    </div>
    </>
  )
}
