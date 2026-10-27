import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ObjectLookupController, type ObjectLookupState } from '../app/ObjectLookupController'
import type { PlaceSearchState } from '../app/PlaceSearchController'
import { workspaceOwnsFullscreen } from '../app/fullscreen'
import { APP_CONFIG, type AppCenter } from '../config/appConfig'
import { DISCOVERY_CONFIG } from '../config/discoveryConfig'
import type { Airport, AirportSource } from '../domain/airports'
import { aircraftResultContext, aircraftResultLabel, orderAircraftSearchResults } from '../domain/aircraftSearch'
import { discoverAirports, discoverLoadedOrbits, discoverPorts, loadedOrbitalCatalog, type OrbitalCatalogEntry } from '../domain/catalogDiscovery'
import { countryForAircraftHex, flagStateForMmsi, type CountryAllocation } from '../domain/countryAllocations'
import { formatAge } from '../domain/format'
import type { CachedMarineDiscovery, DiscoveryMatch, DiscoveryResponse } from '../domain/objectDiscovery'
import { qualifiedLastReport } from '../domain/objectDiscovery'
import { orbitalObjectTypeLabel, type OrbitalControllerState } from '../domain/orbital'
import { orbitalCatalogPage } from '../domain/orbitalDiscovery'
import type { Port, PortSource } from '../domain/ports'
import type { DisplayAircraft, DisplayVessel } from '../domain/traffic'
import { findLookupRequests, rankFindResults } from '../domain/unifiedFind'
import type { InViewAvailability } from '../domain/inView'
import {
  emptySavedObjectsDocument,
  savedObjectKey,
  type SavedObject,
  type SavedObjectsLoadResult,
  type SavedObjectsMutationResult,
} from '../domain/savedObjects'
import { matchesVesselIdentitySearch, normalizeVesselSearchQuery, orderVesselSearchResults, vesselResultContext, vesselResultLabel } from '../domain/vesselFilters'
import { SameOriginObjectLookupProvider } from '../providers/discovery/objectLookupProvider'
import { parseMarineMmsi } from '../providers/marine/marineSourceNormalization'
import { LocationSearchInput } from './LocationSearch'
import { ObjectResultButton } from './ObjectResultButton'
import { SavedObjects } from './SavedObjects'
import type { LocationSearchModel } from './useLocationSearchModel'

export type ShipLocateNavigation = (center: AppCenter, onFramingError: (message: string) => void) => boolean

interface ObjectFindProps {
  model: LocationSearchModel
  inputRef: RefObject<HTMLInputElement | null>
  maximumQueryLength: number
  placeSearchState: PlaceSearchState
  mobile: boolean
  active: boolean
  paused: boolean
  now: number
  navigationDisabled: boolean
  onNavigate: (center: AppCenter, kind: 'aircraft' | 'vessel') => void
  onBeginShipLocate: () => ShipLocateNavigation | null
  aircraft: readonly DisplayAircraft[]
  vessels: readonly DisplayVessel[]
  aircraftVisible: boolean
  vesselsVisible: boolean
  selectableVesselIds: ReadonlySet<string>
  onAircraftSelect: (id: string, originId: string) => void
  onVesselSelect: (id: string, originId: string) => void
  airports: readonly Airport[]
  airportsReady: boolean
  airportsLoading: boolean
  airportsError?: string
  airportSource?: AirportSource
  onLoadAirports: () => void
  onAirportNavigate: (id: string, originId: string) => boolean
  ports: readonly Port[]
  portsReady: boolean
  portsLoading: boolean
  portsError?: string
  portSource?: PortSource
  onLoadPorts: () => void
  onPortNavigate: (id: string, originId: string) => boolean
  curated: OrbitalControllerState
  starlink: OrbitalControllerState
  selectedOrbitalId: string | null
  orbitalVisible: boolean
  onLoadOrbits: () => void
  onOrbitalNavigate: (id: string, originId: string) => boolean
  discoverMarineMetadata?: (query: string, now: number) => CachedMarineDiscovery
  savedEntries?: readonly SavedObject[]
  savedStatus?: SavedObjectsLoadResult
  aircraftAvailability?: InViewAvailability
  vesselAvailability?: InViewAvailability
  lastObservedAt?: (entry: SavedObject) => number | undefined
  onRemoveSaved?: (key: string) => SavedObjectsMutationResult
  onClearSaved?: () => SavedObjectsMutationResult
  onRestoreSaved?: (
    entry: SavedObject,
    expectedClearEpoch: number,
  ) => SavedObjectsMutationResult
}

function orbitalPositionMessage(entry: OrbitalCatalogEntry, state: OrbitalControllerState, now: number, visible: boolean) {
  if (entry.position) return `Modeled ${formatAge(entry.position.modeledFor, now)}`
  if (!visible) return 'Enable ORBITS to locate this satellite.'
  const epoch = Date.parse(entry.record.epoch)
  const day = 24 * 60 * 60_000
  if (now - epoch > APP_CONFIG.orbital.maximumElementAgeMs) {
    return `Cannot locate: elements are ${Math.floor((now - epoch) / day)} days old (${APP_CONFIG.orbital.maximumElementAgeMs / day}-day limit).`
  }
  if (epoch > now + APP_CONFIG.orbital.maximumFutureElementMs) return 'Cannot locate: orbital elements are dated in the future.'
  if (state.phase === 'paused-history') return 'Return to LIVE to locate this satellite.'
  if (state.phase === 'paused-capture') return 'Return to the map to locate another satellite.'
  if (state.phase === 'paused-hidden') return 'Positions are paused while this tab is hidden.'
  if (state.phase === 'offline') return 'Reconnect to update the satellite position.'
  return 'No safe current modeled position is available.'
}

export function FindResultRow({
  label, context, country, countryBasis, action, status, meta,
}: {
  label: string
  context: string
  country?: CountryAllocation
  countryBasis?: string
  action?: ReactNode
  status?: ReactNode
  meta?: ReactNode
}) {
  const flag = country && String.fromCodePoint(...[...country.iso2.toUpperCase()].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65))
  return (
    <li className="object-find-result">
      <div className="object-find-result__identity">
        <span className="object-find-result__name">
          {country && <span className="object-find-flag" role="img"
            aria-label={`${countryBasis ?? 'Country'}: ${country.name}`}
            title={`${countryBasis ?? 'Country'}: ${country.name}`}>{flag}</span>}
          <strong>{label}</strong>
        </span>
        <span className="object-find-result__context">{context}</span>
      </div>
      {action && <div className="object-find-result__action">{action}</div>}
      {meta && <small className="object-find-result__meta">{meta}</small>}
      {status && <span className="object-find-result__status" role="status">{status}</span>}
    </li>
  )
}

interface ShipLocateResults {
  key: string | null
  state: ObjectLookupState
  message?: string
  disabled: boolean
  onLocate: (match: DiscoveryMatch) => void
}

function IdentityRow({
  match, result, now, navigationDisabled, onNavigate, shipLocate,
}: {
  match: DiscoveryMatch
  result: DiscoveryResponse
  now: number
  navigationDisabled: boolean
  onNavigate: (center: AppCenter, kind: 'aircraft' | 'vessel') => void
  shipLocate?: ShipLocateResults
}) {
  const canNavigate = !navigationDisabled && qualifiedLastReport(match, result, now) !== null
  const ownsLocate = shipLocate?.key === match.key
  const locating = ownsLocate && shipLocate.state.phase === 'loading'
  const located = ownsLocate && shipLocate.state.phase === 'results'
    ? shipLocate.state.result.matches.find((candidate) => candidate.identifiers.mmsi === match.identifiers.mmsi)
    : undefined
  const supportedMmsi = parseMarineMmsi(match.identifiers.mmsi) !== undefined
  const ship = match.objectClass === 'ships'
  const label = match.name ?? match.identifiers.registration ?? match.identifiers.mmsi ?? match.identifiers.icao24 ?? 'Reported object'
  const identifiers = [
    ship ? 'Ship' : 'Aircraft',
    match.identifiers.mmsi && `MMSI ${match.identifiers.mmsi}`,
    match.identifiers.icao24 && `ICAO24 ${match.identifiers.icao24.toUpperCase()}`,
    match.identifiers.registration,
    match.identifiers.callsign,
    match.identifiers.imo && `IMO ${match.identifiers.imo}`,
  ].filter(Boolean).join(' · ')
  const location = located?.location ?? match.location
  const source = located?.location ? located.source : match.source
  const provenance = [
    match.source.credit,
    match.metadataReportedAt !== null && `Metadata reported ${new Date(match.metadataReportedAt).toISOString()}`,
    `Identity retrieved ${new Date(result.retrievedAt).toISOString()}`,
    located?.location && located.source.credit,
    location && `Position reported ${new Date(location.reportedAt).toISOString()} · ${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`,
    located?.location && shipLocate?.state.phase === 'results' && `Position retrieved ${new Date(shipLocate.state.result.retrievedAt).toISOString()}`,
  ].filter(Boolean).join(' · ')
  return (
    <FindResultRow label={label} context={identifiers}
      country={ship ? flagStateForMmsi(Number(match.identifiers.mmsi)) : countryForAircraftHex(match.identifiers.icao24 ?? '')}
      countryBasis={ship ? 'MMSI flag state' : 'ICAO24 allocation'}
      action={ship && shipLocate ? (
        <ObjectResultButton prefix="object-find-result"
          aria-label={`Locate ${match.name ?? 'ship'}, MMSI ${match.identifiers.mmsi}`}
          disabled={navigationDisabled || shipLocate.disabled || !supportedMmsi}
          aria-disabled={locating || undefined} aria-busy={locating || undefined}
          onSelect={() => { if (!locating) shipLocate.onLocate(match) }}>{locating ? 'Locating…' : 'Locate'}</ObjectResultButton>
      ) : canNavigate && match.location ? (
        <ObjectResultButton prefix="object-find-result" aria-label={`Go to last report for ${label}`} onSelect={() => {
          if (!qualifiedLastReport(match, result, Date.now()) || !match.location) return
          onNavigate({ latitude: match.location.latitude, longitude: match.location.longitude, label: `Last report: ${label}` },
            ship ? 'vessel' : 'aircraft')
        }}>Locate</ObjectResultButton>
      ) : undefined}
      meta={<span title={provenance}>{source.name} · {location
        ? <time dateTime={new Date(location.reportedAt).toISOString()} role={located?.location ? 'status' : undefined}>Last report {formatAge(location.reportedAt, now)}</time>
        : 'Identity only'}</span>}
      status={ship && !supportedMmsi ? 'Position lookup requires a supported nine-digit MMSI.' :
        ownsLocate && !locating ? shipLocate.state.phase === 'error' ? shipLocate.state.message : shipLocate.message : undefined} />
  )
}

export function IdentityResults(props: {
  result: DiscoveryResponse
  now: number
  navigationDisabled: boolean
  onNavigate: (center: AppCenter, kind: 'aircraft' | 'vessel') => void
  shipLocate?: ShipLocateResults
}) {
  return <>
    <p className="control-note" role="status">{props.result.matches.length} {props.result.matches.length === 1 ? 'match' : 'matches'}{props.result.truncated && ' · partial, limit reached'}.</p>
    <ul className="object-find-results" aria-label="Identity lookup results">
      {props.result.matches.map((match) => <IdentityRow key={match.key} {...props} match={match} />)}
    </ul>
  </>
}

interface Result {
  key: string
  label: string
  identities: readonly string[]
  content: ReactNode
}

export function ObjectFind(props: ObjectFindProps) {
  const { mobile, now, active, paused, onNavigate, discoverMarineMetadata, model, placeSearchState } = props
  const query = model.value.trim()
  const [page, setPage] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [catalogNavigationError, setCatalogNavigationError] = useState(false)
  const catalogListRef = useRef<HTMLUListElement>(null)
  const restorePageFocusRef = useRef(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)
  const previousMobileRef = useRef(mobile)
  const requestedCatalogsRef = useRef(false)
  const submittingRef = useRef(false)
  const [shipState, setShipState] = useState<ObjectLookupState>({ phase: 'idle' })
  const [aircraftState, setAircraftState] = useState<ObjectLookupState>({ phase: 'idle' })
  const [lookupProvider] = useState(() => new SameOriginObjectLookupProvider())
  const [shipController] = useState(() => new ObjectLookupController({ provider: lookupProvider, onState: setShipState }))
  const [aircraftController] = useState(() => new ObjectLookupController({ provider: lookupProvider, onState: setAircraftState }))
  const [locateState, setLocateState] = useState<ObjectLookupState>({ phase: 'idle' })
  const [locateKey, setLocateKey] = useState<string | null>(null)
  const [locateMessage, setLocateMessage] = useState<string>()
  const locateOwnerRef = useRef<{ key: string; navigate: ShipLocateNavigation } | null>(null)
  const locatingRef = useRef<string | null>(null)
  const [locator] = useState(() => new ObjectLookupController({ provider: lookupProvider, onState: setLocateState }))
  const remoteActive = active && !paused
  const navigationDisabled = props.navigationDisabled
  const savedEntries = props.savedEntries ?? []
  const savedStatus = props.savedStatus ?? {
    phase: 'ready' as const,
    document: emptySavedObjectsDocument(),
  }
  const unchangedSaved = {
    ok: false,
    document: savedStatus.document,
    message: 'Saved objects are unavailable.',
  }
  const locateAllowedRef = useRef(false)
  useLayoutEffect(() => {
    locateAllowedRef.current = remoteActive && !navigationDisabled
    if (locateState.phase !== 'loading') locatingRef.current = null
  }, [remoteActive, navigationDisabled, locateState])
  const cancelShipLocate = useCallback(() => {
    locateOwnerRef.current = null
    locatingRef.current = null
    locator.cancel()
    setLocateKey(null)
    setLocateMessage(undefined)
  }, [locator])
  const cancelLookups = useCallback(() => {
    submittingRef.current = false
    model.cancel()
    shipController.cancel()
    aircraftController.cancel()
    cancelShipLocate()
  }, [shipController, aircraftController, cancelShipLocate, model.cancel])
  useEffect(() => () => {
    locateOwnerRef.current = null
    locatingRef.current = null
    locator.stop()
    model.pause()
    shipController.stop()
    aircraftController.stop()
  }, [shipController, aircraftController, locator, model.pause])
  useLayoutEffect(() => {
    cancelLookups()
    setPage(0)
    setSubmitted(false)
    setCatalogNavigationError(false)
  }, [query, cancelLookups])
  useLayoutEffect(() => {
    if (previousMobileRef.current === mobile) return
    previousMobileRef.current = mobile
    const previous = lastFocusedRef.current
    const current = document.activeElement
    if (!previous || current !== document.body && current !== previous) return
    const body = contentRef.current?.closest('.control-panel__more-body')
    const target = [...(body?.querySelectorAll<HTMLElement>('input, button, summary') ?? [])]
      .find((element) => element.getClientRects().length && getComputedStyle(element).visibility === 'visible' &&
        !element.matches(':disabled') && !element.closest('[inert]'))
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    lastFocusedRef.current = null
  }, [mobile])
  useEffect(() => {
    const stopIfPaused = () => {
      if (remoteActive && !document.hidden && navigator.onLine) return
      shipController.stop()
      aircraftController.stop()
      locator.stop()
      model.pause()
      locateOwnerRef.current = null
      locatingRef.current = null
      setShipState((state) => state.phase === 'loading' ? { phase: 'idle' } : state)
      setAircraftState((state) => state.phase === 'loading' ? { phase: 'idle' } : state)
      setLocateState((state) => state.phase === 'loading' ? { phase: 'idle' } : state)
    }
    stopIfPaused()
    document.addEventListener('visibilitychange', stopIfPaused)
    window.addEventListener('offline', stopIfPaused)
    return () => {
      document.removeEventListener('visibilitychange', stopIfPaused)
      window.removeEventListener('offline', stopIfPaused)
    }
  }, [shipController, aircraftController, locator, remoteActive, model.pause])
  useEffect(() => {
    if (!restorePageFocusRef.current) return
    restorePageFocusRef.current = false
    const frame = requestAnimationFrame(() => {
      const target = catalogListRef.current?.querySelector<HTMLElement>('button:not(:disabled), summary')
      if (!target?.getClientRects().length) return
      target.focus({ preventScroll: true })
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [page])

  const orbitalCatalog = useMemo(() => loadedOrbitalCatalog(
    props.curated, props.starlink, props.selectedOrbitalId, now, APP_CONFIG.orbital.expireAfterMs,
  ), [props.curated, props.starlink, props.selectedOrbitalId, now])
  const cachedShips = useMemo(() => [...query].length >= 2 ? discoverMarineMetadata?.(query, now) : undefined,
    [query, now, discoverMarineMetadata])
  const locateShip = async (match: DiscoveryMatch) => {
    const mmsi = match.identifiers.mmsi
    if (!locateAllowedRef.current || document.hidden || !navigator.onLine ||
      parseMarineMmsi(mmsi) === undefined || !mmsi || locatingRef.current === match.key) return
    locateOwnerRef.current = null
    locatingRef.current = null
    locator.cancel()
    const navigate = props.onBeginShipLocate()
    setLocateKey(match.key)
    setLocateMessage(undefined)
    if (!navigate) {
      setLocateMessage('Navigation is unavailable. Return to LIVE and reconnect.')
      return
    }
    shipController.stop()
    setShipState((state) => state.phase === 'loading' ? { phase: 'idle' } : state)
    const owner = { key: match.key, navigate }
    locateOwnerRef.current = owner
    locatingRef.current = match.key
    const result = await locator.lookup('ships', 'position', mmsi)
    if (!result || locateOwnerRef.current !== owner || !locateAllowedRef.current ||
      document.hidden || !navigator.onLine || !contentRef.current?.getClientRects().length) return
    if (result.matches.length === 0) {
      setLocateMessage('Position unavailable: no reports in the last 24 hours.')
      return
    }
    const point = qualifiedLastReport(result.matches[0], result, Date.now())
    if (!point) {
      setLocateMessage('The dated report is no longer usable. Locate again.')
      return
    }
    let framingError: string | undefined
    const navigated = owner.navigate({
      latitude: point.latitude, longitude: point.longitude, label: `Last report: ${match.name ?? mmsi}`,
    }, (message) => {
      framingError = message
      if (locateOwnerRef.current === owner) setLocateMessage(message)
    })
    setLocateMessage(framingError ?? (navigated ? undefined :
      'Report found; a newer action kept the map unchanged.'))
  }
  const shipLocate: ShipLocateResults = {
    key: locateKey, state: locateState, message: locateMessage, disabled: !remoteActive,
    onLocate: (match) => { void locateShip(match) },
  }
  const rows: Result[] = []
  const savedMatches = savedEntries.filter((entry) => {
    if (!query) return true
    const search = query.toLocaleLowerCase('en-US')
    return [
      entry.savedLabel,
      entry.id,
      entry.kind === 'aircraft' ? entry.registration : undefined,
      entry.kind === 'vessel' ? entry.imo : undefined,
      entry.kind === 'orbital' ? entry.internationalDesignator : undefined,
      entry.kind === 'airport' ? entry.ident : undefined,
    ].some((value) => value?.toLocaleLowerCase('en-US').includes(search))
  })
  const savedKeys = new Set(savedMatches.map(savedObjectKey))
  const receivedIds = new Set<string>()
  const receivedCredits = new Set<string>()
  if (query) {
    for (const aircraft of orderAircraftSearchResults(props.aircraft, query)) {
      if (savedKeys.has(`aircraft:${aircraft.hex.toLowerCase()}`)) continue
      receivedIds.add(`aircraft:${aircraft.hex.toLowerCase()}`)
      const label = aircraftResultLabel(aircraft)
      rows.push({
        key: aircraft.id, label, identities: [aircraft.hex, aircraft.registration ?? '', aircraft.callsign ?? ''],
        content: <FindResultRow label={label} context={`Aircraft · ${aircraftResultContext(aircraft)}`}
          country={countryForAircraftHex(aircraft.hex)} countryBasis="ICAO24 allocation"
          action={<ObjectResultButton prefix="object-find-result" aria-label={`View aircraft ${label}`}
            disabled={navigationDisabled || !props.aircraftVisible}
            onSelect={(originId) => props.onAircraftSelect(aircraft.id, originId)}>View</ObjectResultButton>}
          meta={<span>{aircraft.provider} · <time dateTime={new Date(aircraft.position.observedAt).toISOString()}
            title={`Position reported ${new Date(aircraft.position.observedAt).toISOString()}`}>Report {formatAge(aircraft.position.observedAt, now)}</time></span>}
          status={!props.aircraftVisible ? 'AIRCRAFT is off.' : undefined} />,
      })
    }
    const vessels = props.vessels.filter((vessel) => matchesVesselIdentitySearch(vessel, normalizeVesselSearchQuery(query)))
    for (const vessel of orderVesselSearchResults(vessels, query)) {
      if (savedKeys.has(`vessel:${vessel.mmsi}`)) continue
      receivedIds.add(`ships:${vessel.mmsi}`)
      if (vessel.attribution) receivedCredits.add(vessel.attribution)
      const label = vesselResultLabel(vessel)
      const selectable = props.vesselsVisible && props.selectableVesselIds.has(vessel.id)
      rows.push({
        key: vessel.id, label, identities: [String(vessel.mmsi), vessel.imo ? String(vessel.imo) : '', vessel.callSign ?? ''],
        content: <FindResultRow label={label} context={`Ship · ${vesselResultContext(vessel)}`}
          country={flagStateForMmsi(vessel.mmsi)} countryBasis="MMSI flag state"
          action={<ObjectResultButton prefix="object-find-result" aria-label={`View ship ${label}`}
            disabled={navigationDisabled || !selectable}
            onSelect={(originId) => props.onVesselSelect(vessel.id, originId)}>View</ObjectResultButton>}
          meta={<span title={vessel.attribution}>{vessel.provider} · <time dateTime={new Date(vessel.position.observedAt).toISOString()}
            title={`Position reported ${new Date(vessel.position.observedAt).toISOString()}`}>Report {formatAge(vessel.position.observedAt, now)}</time></span>}
          status={!selectable ? 'Hidden by SHIPS or map filters.' : undefined} />,
      })
    }
    for (const result of [
      ...(shipState.phase === 'results' ? [shipState.result] : []),
      ...(aircraftState.phase === 'results' ? [aircraftState.result] : []),
      ...(cachedShips?.loaded ? [cachedShips.result] : []),
    ]) {
      for (const match of result.matches) {
        const identity = `${match.objectClass}:${match.identifiers.mmsi ?? match.identifiers.icao24?.toLowerCase()}`
        const savedIdentity = match.objectClass === 'ships'
          ? `vessel:${match.identifiers.mmsi}`
          : `aircraft:${match.identifiers.icao24?.toLowerCase()}`
        if (savedKeys.has(savedIdentity)) continue
        if (receivedIds.has(identity)) continue
        receivedIds.add(identity)
        const label = match.name ?? match.identifiers.registration ?? match.identifiers.mmsi ?? match.identifiers.icao24 ?? 'Reported object'
        rows.push({
          key: identity, label, identities: Object.values(match.identifiers).filter((value): value is string => Boolean(value)),
          content: <IdentityRow match={match} result={result} now={now} navigationDisabled={navigationDisabled}
            onNavigate={onNavigate} shipLocate={match.objectClass === 'ships' ? shipLocate : undefined} />,
        })
      }
    }
    for (const airport of discoverAirports(props.airports, query)) {
      if (savedKeys.has(`airport:${airport.id}`)) continue
      rows.push({
        key: airport.id, label: airport.name, identities: [airport.ident, airport.icaoCode ?? '', airport.iataCode ?? ''],
        content: <FindResultRow label={airport.name}
          context={['Airport', airport.ident, airport.iataCode, airport.municipality, airport.isoCountry].filter(Boolean).join(' · ')}
          action={<ObjectResultButton prefix="object-find-result" aria-label={`Go to airport ${airport.name}`} disabled={navigationDisabled}
            onSelect={(originId) => setCatalogNavigationError(!props.onAirportNavigate(airport.id, originId))}>Go</ObjectResultButton>}
          meta={<span title={`${props.airportSource?.licenseName ?? 'Public domain'} · Snapshot ${props.airportSource?.publishedAt ?? 'date unavailable'}`}>OurAirports · static</span>} />,
      })
    }
    for (const port of discoverPorts(props.ports, query)) {
      if (savedKeys.has(`port:${port.id}`)) continue
      rows.push({
        key: port.id, label: port.name, identities: [],
        content: <FindResultRow label={port.name} context="Port · generalized static location"
          action={<ObjectResultButton prefix="object-find-result" aria-label={`Go to port ${port.name}`} disabled={navigationDisabled}
            onSelect={(originId) => setCatalogNavigationError(!props.onPortNavigate(port.id, originId))}>Go</ObjectResultButton>}
          meta={<span title={`${props.portSource?.licenseName ?? 'Public domain'} · Snapshot ${props.portSource?.publishedAt ?? 'date unavailable'}`}>Natural Earth · static</span>} />,
      })
    }
    for (const entry of discoverLoadedOrbits(orbitalCatalog.entries, query)) {
      if (savedKeys.has(`orbital:${entry.record.noradCatalogId}`)) continue
      rows.push({
        key: entry.id, label: entry.record.name, identities: [entry.record.noradCatalogId, entry.record.internationalDesignator ?? ''],
        content: <FindResultRow label={entry.record.name}
          context={`Satellite · NORAD ${entry.record.noradCatalogId} · ${orbitalObjectTypeLabel(entry.record.objectType)} (${entry.record.objectType})`}
          action={<ObjectResultButton prefix="object-find-result" aria-label={`Go to satellite ${entry.record.name}`}
            disabled={navigationDisabled || !entry.position}
            onSelect={(originId) => setCatalogNavigationError(!props.onOrbitalNavigate(entry.id, originId))}>Go</ObjectResultButton>}
          meta={<span title={`Element epoch ${entry.record.epoch} · Retrieved ${entry.snapshot.retrievedAt} · Published ${entry.snapshot.publishedAt} · ${entry.owner === 'starlink' ? 'Bounded Starlink sample' : 'Curated catalog'}`}>
            {entry.snapshot.sourceProvider === 'space-track' ? 'Space-Track / CelesTrak' : 'CelesTrak'}
            {entry.position && <> · <time dateTime={new Date(entry.position.modeledFor).toISOString()}>Modeled {formatAge(entry.position.modeledFor, now)}</time></>}
          </span>}
          status={!entry.position ? orbitalPositionMessage(entry, entry.owner === 'starlink' ? props.starlink : props.curated, now, props.orbitalVisible) : undefined} />,
      })
    }
    if (placeSearchState.phase === 'results') {
      for (const place of placeSearchState.results) {
        rows.push({
          key: `place:${place.id}`, label: place.label, identities: [],
          content: <FindResultRow label={place.label} context="Place · Photon / OpenStreetMap"
            action={<ObjectResultButton prefix="object-find-result" disabled={navigationDisabled}
              onSelect={() => model.selectResult(place)}>Go</ObjectResultButton>} />,
        })
      }
    }
  }
  const sorted = rankFindResults(rows, query)
  const totalMatches = rows.length + savedMatches.length
  const paging = orbitalCatalogPage(sorted, page, DISCOVERY_CONFIG.catalogResultLimit)
  const start = paging.page * DISCOVERY_CONFIG.catalogResultLimit
  const searching = shipState.phase === 'loading' || aircraftState.phase === 'loading' || placeSearchState.phase === 'loading'
  useLayoutEffect(() => {
    submittingRef.current = searching
  })
  const catalogLoading = props.airportsLoading || props.portsLoading
  const sourceErrors = [
    shipState.phase === 'error' ? `Ships: ${shipState.message}` : undefined,
    aircraftState.phase === 'error' ? `Aircraft: ${aircraftState.message}` : undefined,
    placeSearchState.phase === 'error' ? `Places: ${placeSearchState.message}` : undefined,
    query && props.airportsError ? `Airports: ${props.airportsError}` : undefined,
    query && props.portsError ? `Ports: ${props.portsError}` : undefined,
  ].filter(Boolean)
  const partial = shipState.phase === 'results' && shipState.result.truncated ||
    aircraftState.phase === 'results' && aircraftState.result.truncated || Boolean(cachedShips?.result.truncated)
  const lookupCredits = [...new Set([
    ...receivedCredits,
    ...[
      ...(shipState.phase === 'results' ? shipState.result.matches : []),
      ...(aircraftState.phase === 'results' ? aircraftState.result.matches : []),
      ...(cachedShips?.loaded ? cachedShips.result.matches : []),
      ...(locateState.phase === 'results' ? locateState.result.matches : []),
    ].map((match) => match.source.credit),
  ])]
  return (
    <div ref={contentRef} className="object-find" onFocusCapture={(event) => {
      if (event.target instanceof HTMLElement) lastFocusedRef.current = event.target
    }} onKeyDown={(event) => {
      if (event.key !== 'Escape' || workspaceOwnsFullscreen(event.currentTarget) ||
        !searching && locateState.phase !== 'loading') return
      event.preventDefault()
      event.stopPropagation()
      cancelLookups()
      model.handleKeyDown(event)
    }}>
      <LocationSearchInput model={{
        ...model,
        handleChange: (event) => { cancelLookups(); model.handleChange(event) },
        clear: () => { cancelLookups(); model.clear() },
        handleKeyDown: (event) => {
          if (searching || locateState.phase === 'loading') {
            if (event.key === 'Escape' && !workspaceOwnsFullscreen(event.currentTarget)) cancelLookups()
            model.handleKeyDown(event)
          }
        },
        handleSubmit: (event) => {
          if (submittingRef.current) {
            event.preventDefault()
            return
          }
          cancelShipLocate()
          const parsed = model.handleSubmit(event)
          if (parsed?.kind !== 'query') {
            cancelLookups()
            return parsed
          }
          if (!remoteActive || document.hidden || !navigator.onLine) {
            setShipState({ phase: 'error', message: 'Lookup paused. Return to LIVE and reconnect to submit.' })
            return parsed
          }
          submittingRef.current = true
          setSubmitted(true)
          for (const request of findLookupRequests(parsed.query)) {
            void (request.objectClass === 'ships' ? shipController : aircraftController)
              .lookup(request.objectClass, request.by, request.query)
          }
          if (!requestedCatalogsRef.current) {
            requestedCatalogsRef.current = true
            if (!props.airportsReady && !props.airportsLoading) props.onLoadAirports()
            if (!props.portsReady && !props.portsLoading) props.onLoadPorts()
          }
          return parsed
        },
      }} inputRef={props.inputRef} maximumQueryLength={props.maximumQueryLength}
        searchState={placeSearchState} disabled={navigationDisabled} unified busy={searching} />
      <p id="location-search-help" className="control-note object-find-privacy">
        Text sent in <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon URL</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
      </p>
      <SavedObjects
        entries={savedEntries}
        status={savedStatus}
        query={query}
        aircraft={props.aircraft}
        vessels={props.vessels}
        aircraftVisible={props.aircraftVisible}
        vesselsVisible={props.vesselsVisible}
        selectableVesselIds={props.selectableVesselIds}
        aircraftAvailability={props.aircraftAvailability ?? { available: true }}
        vesselAvailability={props.vesselAvailability ?? { available: true }}
        lastObservedAt={props.lastObservedAt ?? (() => undefined)}
        airports={props.airports}
        airportsReady={props.airportsReady}
        airportSource={props.airportSource}
        ports={props.ports}
        portsReady={props.portsReady}
        portSource={props.portSource}
        orbitalCatalog={orbitalCatalog.entries}
        curated={props.curated}
        starlink={props.starlink}
        navigationDisabled={navigationDisabled}
        onAircraftSelect={props.onAircraftSelect}
        onVesselSelect={props.onVesselSelect}
        onAirportNavigate={props.onAirportNavigate}
        onPortNavigate={props.onPortNavigate}
        onOrbitalNavigate={props.onOrbitalNavigate}
        onPrefillFind={model.setValue ?? (() => undefined)}
        onLoadAirports={props.onLoadAirports}
        onLoadPorts={props.onLoadPorts}
        onLoadOrbits={props.onLoadOrbits}
        loadsDisabled={paused}
        onRemove={props.onRemoveSaved ?? (() => unchangedSaved)}
        onClear={props.onClearSaved ?? (() => unchangedSaved)}
        onRestore={props.onRestoreSaved ?? (() => unchangedSaved)}
      />
      {model.inputError && <p id="location-search-status" className="control-note" role="alert">{model.inputError}</p>}
      {query && !model.inputError && <p id="location-search-status" className="control-note object-find-count" role="status">
        {searching ? 'Searching online… ' : ''}
        {totalMatches ? `${totalMatches} ${totalMatches === 1 ? 'match' : 'matches'}${partial ? ' · partial, source limit reached' : ''}${
          paging.pageCount > 1
            ? savedMatches.length
              ? ` · other results ${paging.rangeStart}–${paging.rangeEnd} of ${rows.length}`
              : ` · ${paging.rangeStart}–${paging.rangeEnd}`
            : ''
        }.` :
          searching || catalogLoading ? 'Loading available results.' :
            submitted ? sourceErrors.length ? 'No matches in available data; some sources unavailable.' : 'No matches in searched sources.' :
              'Press Search to include online results and static catalogs.'}
      </p>}
      {sourceErrors.length > 0 && <p className="control-note" role="status">{sourceErrors.join(' ')}</p>}
      {rows.length > 0 && <ul ref={catalogListRef} className="object-find-results" aria-label="Find matches">
        {sorted.slice(start, start + DISCOVERY_CONFIG.catalogResultLimit).map((row) => <Fragment key={row.key}>{row.content}</Fragment>)}
      </ul>}
      {catalogNavigationError && <p className="control-note" role="alert">That catalog result is no longer available. Search again.</p>}
      {paging.pageCount > 1 && <div className="control-options control-options--two">
        <button type="button" disabled={paging.page === 0} onClick={() => {
          restorePageFocusRef.current = true
          setPage(paging.page - 1)
        }}>Previous</button>
        <button type="button" disabled={paging.page + 1 === paging.pageCount} onClick={() => {
          restorePageFocusRef.current = true
          setPage(paging.page + 1)
        }}>Next</button>
      </div>}
      <details className="context-details object-find-sources"><summary>Sources</summary>
        <p><a href="https://www.adsb.lol/docs/open-data/api/" target="_blank" rel="noreferrer">ADSB.lol · ODbL 1.0</a> · <a href="https://openwaters.io/api/ais/" target="_blank" rel="noreferrer">Open Waters AIS</a> · OurAirports / Natural Earth (public domain).</p>
        {lookupCredits.length > 0 && <p>{lookupCredits.join(' · ')}</p>}
        <p>Satellites: Space-Track / CelesTrak. Modeled, not live or optical.</p>
        {query && (!props.airportsReady || !props.portsReady) && <p>Some static catalogs are not yet available.{catalogLoading && ' Loading.'}</p>}
        {orbitalCatalog.missing.length > 0 && <p>Some satellite catalogs are not loaded or usable.</p>}
        {(!props.orbitalVisible || orbitalCatalog.entries.length === 0) && <button type="button" disabled={paused} onClick={props.onLoadOrbits}>
          {props.orbitalVisible ? 'Retry satellite catalogs' : 'Enable ORBITS'}
        </button>}
        {(props.airportsError || props.portsError) && <button type="button" disabled={paused} onClick={() => {
          if (props.airportsError) props.onLoadAirports()
          if (props.portsError) props.onLoadPorts()
        }}>Retry static catalogs</button>}
        <p><a href="https://github.com/vasilyevstan/LiveTrafficStan/blob/main/docs/configuration.md#scoped-object-discovery" target="_blank" rel="noreferrer">Coverage, search limits and privacy</a></p>
      </details>
    </div>
  )
}
