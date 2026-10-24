import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ObjectLookupController, type ObjectLookupState } from '../app/ObjectLookupController'
import { workspaceOwnsFullscreen } from '../app/fullscreen'
import { APP_CONFIG, type AppCenter } from '../config/appConfig'
import { DISCOVERY_CONFIG } from '../config/discoveryConfig'
import type { Airport, AirportSource } from '../domain/airports'
import { discoverAirports, discoverLoadedOrbits, discoverPorts, loadedOrbitalCatalog, type OrbitalCatalogEntry } from '../domain/catalogDiscovery'
import { formatAge } from '../domain/format'
import type { CachedMarineDiscovery, DiscoveryMatch, DiscoveryResponse } from '../domain/objectDiscovery'
import { qualifiedLastReport } from '../domain/objectDiscovery'
import { orbitalObjectTypeLabel, type OrbitalControllerState } from '../domain/orbital'
import { orbitalCatalogPage } from '../domain/orbitalDiscovery'
import type { Port, PortSource } from '../domain/ports'
import { SameOriginObjectLookupProvider } from '../providers/discovery/objectLookupProvider'
import { parseMarineMmsi } from '../providers/marine/marineSourceNormalization'
import { ObjectResultButton } from './ObjectResultButton'

export type FindKind = 'places' | 'aircraft' | 'ships' | 'orbits' | 'airports' | 'ports'
export type ShipLocateNavigation = (center: AppCenter, onFramingError: (message: string) => void) => boolean
type Scope = 'view' | 'received' | 'outside'

interface ObjectFindProps {
  kind: FindKind
  kindSelect: ReactNode
  currentView: ReactNode
  mobile: boolean
  active: boolean
  paused: boolean
  currentViewRequest: number
  now: number
  navigationDisabled: boolean
  onNavigate: (center: AppCenter) => void
  onBeginShipLocate: () => ShipLocateNavigation | null
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

interface ShipLocateResults {
  key: string | null
  state: ObjectLookupState
  message?: string
  disabled: boolean
  onLocate: (match: DiscoveryMatch) => void
}

export function IdentityResults({
  result, now, navigationDisabled, onNavigate, shipLocate,
}: {
  result: DiscoveryResponse
  now: number
  navigationDisabled: boolean
  onNavigate: (center: AppCenter) => void
  shipLocate?: ShipLocateResults
}) {
  const canNavigate = (match: DiscoveryMatch) => !navigationDisabled && qualifiedLastReport(match, result, now) !== null
  return (
    <>
      <p className="control-note" role="status">
        {result.matches.length === 0 ? 'No matches in this source.' :
          `${result.matches.length} ${result.matches.length === 1 ? 'match' : 'matches'}${result.truncated ? ' · partial, limit reached' : ''}.`}
        {result.rejectedRecords > 0 && ` ${result.rejectedRecords} invalid or unsupported records withheld.`}
      </p>
      <ul className="object-find-results" aria-label="Identity lookup results">
        {result.matches.map((match) => {
          const ownsLocate = shipLocate?.key === match.key
          const locating = ownsLocate && shipLocate.state.phase === 'loading'
          const located = ownsLocate && shipLocate.state.phase === 'results'
            ? shipLocate.state.result.matches.find((candidate) => candidate.identifiers.mmsi === match.identifiers.mmsi)
            : undefined
          const supportedMmsi = parseMarineMmsi(match.identifiers.mmsi) !== undefined
          return (
          <li key={match.key}>
            <strong>{match.name ?? match.identifiers.mmsi ?? match.identifiers.icao24}</strong>
            <span>{[
              match.identifiers.mmsi && `MMSI ${match.identifiers.mmsi}`,
              match.identifiers.icao24 && `ICAO24 ${match.identifiers.icao24}`,
              match.identifiers.registration,
              match.identifiers.callsign,
              match.identifiers.imo && `IMO ${match.identifiers.imo}`,
            ].filter(Boolean).join(' · ')}</span>
            {match.objectClass === 'ships' && shipLocate ? <>
              <ObjectResultButton prefix="object-find-result"
                aria-label={`Locate ${match.name ?? 'ship'}, MMSI ${match.identifiers.mmsi}`}
                disabled={navigationDisabled || shipLocate.disabled || !supportedMmsi}
                aria-disabled={locating || undefined} aria-busy={locating || undefined}
                onSelect={() => { if (!locating) shipLocate.onLocate(match) }}>{locating ? 'Locating…' : 'Locate'}</ObjectResultButton>
              {!supportedMmsi && <span>Position lookup requires a supported nine-digit MMSI.</span>}
              {ownsLocate && <span role="status">
                {locating ? 'Checking the last 24 hours.' :
                  shipLocate.state.phase === 'error' ? shipLocate.state.message :
                    shipLocate.message}
                {located?.location && ` Last report ${formatAge(located.location.reportedAt, now)}.`}
              </span>}
            </> : <span>{canNavigate(match) && match.location
              ? `Last position ${formatAge(match.location.reportedAt, now)}`
              : match.objectClass === 'ships'
                ? 'Identity only; no position lookup in Received.'
                : 'No qualified last-reported position available.'}</span>}
            {canNavigate(match) && match.location && (
              <ObjectResultButton prefix="object-find-result" onSelect={() => {
                if (!canNavigate(match) || !qualifiedLastReport(match, result, Date.now()) || !match.location) return
                onNavigate({
                  latitude: match.location.latitude, longitude: match.location.longitude,
                  label: `Last report: ${match.name ?? match.identifiers.icao24}`,
                })
              }}>Go to last report</ObjectResultButton>
            )}
            <details className="context-details">
              <summary>Source &amp; age</summary>
              <p>{match.source.name}: {match.source.credit}</p>
              <p>{match.metadataReportedAt
                ? `Metadata reported ${new Date(match.metadataReportedAt).toISOString()}. Not a position time.`
                : 'Metadata report time unavailable.'}</p>
              <p>Retrieved {new Date(result.retrievedAt).toISOString()}.</p>
              {match.location && <p>Position reported {new Date(match.location.reportedAt).toISOString()}.</p>}
              {located?.location && shipLocate?.state.phase === 'results' && <>
                <p>Position reported {new Date(located.location.reportedAt).toISOString()}; retrieved {new Date(shipLocate.state.result.retrievedAt).toISOString()}.</p>
                <p>{located.source.name} track: {located.source.credit}</p>
                <p>Last report, not live reception or a guarantee that the ship is still there.</p>
              </>}
            </details>
          </li>
          )
        })}
      </ul>
    </>
  )
}

export function ObjectFind(props: ObjectFindProps) {
  const { kind, mobile, now, active, paused, onNavigate, discoverMarineMetadata } = props
  const inputId = useId()
  const [scopes, setScopes] = useState<{ ships: Scope; aircraft: Scope }>({ ships: 'view', aircraft: 'view' })
  const [drafts, setDrafts] = useState({ ships: '', aircraft: '', received: '', airports: '', ports: '', orbits: '' })
  const [shipMethod, setShipMethod] = useState<'name' | 'mmsi'>('name')
  const [aircraftMethod, setAircraftMethod] = useState<'hex' | 'reg' | 'callsign'>('hex')
  const [page, setPage] = useState(0)
  const [catalogNavigationError, setCatalogNavigationError] = useState(false)
  const catalogListRef = useRef<HTMLUListElement>(null)
  const restorePageFocusRef = useRef(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)
  const previousMobileRef = useRef(mobile)
  const [lookupState, setLookupState] = useState<ObjectLookupState>({ phase: 'idle' })
  const [lookupProvider] = useState(() => new SameOriginObjectLookupProvider())
  const [controller] = useState(() => new ObjectLookupController({
    provider: lookupProvider, onState: setLookupState,
  }))
  const [locateState, setLocateState] = useState<ObjectLookupState>({ phase: 'idle' })
  const [locateKey, setLocateKey] = useState<string | null>(null)
  const [locateMessage, setLocateMessage] = useState<string>()
  const locateOwnerRef = useRef<{ key: string; navigate: ShipLocateNavigation } | null>(null)
  const locatingRef = useRef<string | null>(null)
  const [locator] = useState(() => new ObjectLookupController({
    provider: lookupProvider, onState: setLocateState,
  }))
  const isTraffic = kind === 'ships' || kind === 'aircraft'
  const scope = isTraffic ? scopes[kind] : 'received'
  const remoteActive = active && isTraffic && scope === 'outside' && !paused
  const navigationDisabled = props.navigationDisabled
  const method = kind === 'aircraft' ? aircraftMethod : shipMethod
  const locateAllowedRef = useRef(false)
  useLayoutEffect(() => {
    locateAllowedRef.current = remoteActive && kind === 'ships' && !navigationDisabled
    if (locateState.phase !== 'loading') locatingRef.current = null
  }, [remoteActive, kind, navigationDisabled, locateState])
  const cancelShipLocate = useCallback(() => {
    locateOwnerRef.current = null
    locatingRef.current = null
    locator.cancel()
    setLocateKey(null)
    setLocateMessage(undefined)
  }, [locator])

  useEffect(() => () => {
    locateOwnerRef.current = null
    locatingRef.current = null
    locator.stop()
    controller.stop()
  }, [controller, locator])
  useLayoutEffect(() => {
    if (previousMobileRef.current === mobile) return
    previousMobileRef.current = mobile
    const previous = lastFocusedRef.current
    const current = document.activeElement
    if (!previous || current !== document.body && current !== previous) return
    const body = contentRef.current?.closest('.control-panel__more-body')
    const target = [...(body?.querySelectorAll<HTMLElement>('input, select, button, summary') ?? [])]
      .find((element) => element.getClientRects().length && getComputedStyle(element).visibility === 'visible' &&
        !element.matches(':disabled') && !element.closest('[inert]'))
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    lastFocusedRef.current = null
  }, [mobile])
  useEffect(() => {
    const stopIfPaused = () => {
      if (remoteActive && !document.hidden && navigator.onLine) return
      controller.stop()
      locator.stop()
      locateOwnerRef.current = null
      locatingRef.current = null
      setLookupState((state) => state.phase === 'loading' ? { phase: 'idle' } : state)
      setLocateState((state) => state.phase === 'loading' ? { phase: 'idle' } : state)
    }
    stopIfPaused()
    document.addEventListener('visibilitychange', stopIfPaused)
    window.addEventListener('offline', stopIfPaused)
    return () => {
      document.removeEventListener('visibilitychange', stopIfPaused)
      window.removeEventListener('offline', stopIfPaused)
    }
  }, [controller, locator, remoteActive])
  useEffect(() => {
    controller.cancel()
    setPage(0)
    setCatalogNavigationError(false)
  }, [controller, kind, scope, method])
  useLayoutEffect(() => cancelShipLocate(), [cancelShipLocate, kind, scope, method])
  useEffect(() => {
    if (props.currentViewRequest > 0) setScopes((current) => ({ ...current, ships: 'view' }))
  }, [props.currentViewRequest])
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

  const orbitalCatalog = useMemo(() => kind === 'orbits' ? loadedOrbitalCatalog(
    props.curated, props.starlink, props.selectedOrbitalId, now, APP_CONFIG.orbital.expireAfterMs,
  ) : { entries: [], missing: [] }, [kind, props.curated, props.starlink, props.selectedOrbitalId, now])
  const cachedShips = useMemo(() => kind === 'ships' && scope === 'received'
    ? discoverMarineMetadata?.(drafts.received, now) : undefined,
  [kind, scope, drafts.received, now, discoverMarineMetadata])
  const updateDraft = (key: keyof typeof drafts, value: string) => {
    setDrafts((current) => ({ ...current, [key]: value }))
    setPage(0)
    setCatalogNavigationError(false)
    controller.cancel()
    cancelShipLocate()
  }
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
    controller.stop()
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
      latitude: point.latitude, longitude: point.longitude,
      label: `Last report: ${match.name ?? mmsi}`,
    }, (message) => {
      framingError = message
      if (locateOwnerRef.current === owner) setLocateMessage(message)
    })
    setLocateMessage(framingError ?? (navigated ? 'Centered on the reported position.' :
      'Report found; a newer action kept the map unchanged.'))
  }
  const input = (key: keyof typeof drafts, label: string) => (
    <>
      <label className="object-find-label" htmlFor={inputId}>{label}</label>
      <div className="object-find-input">
        <input id={inputId} type="search" value={drafts[key]} maxLength={DISCOVERY_CONFIG.maximumQueryLength}
          onChange={(event) => updateDraft(key, event.currentTarget.value)} autoComplete="off" />
        <button type="button" disabled={!drafts[key]} onClick={() => updateDraft(key, '')}>Clear</button>
      </div>
    </>
  )
  const catalog = () => {
    if (kind !== 'airports' && kind !== 'ports' && kind !== 'orbits') return null
    const ready = kind === 'airports' ? props.airportsReady : kind === 'ports' ? props.portsReady : orbitalCatalog.entries.length > 0
    const loading = kind === 'airports' ? props.airportsLoading : kind === 'ports' ? props.portsLoading :
      props.curated.phase === 'loading' || props.starlink.phase === 'loading'
    const error = kind === 'airports' ? props.airportsError : kind === 'ports' ? props.portsError :
      props.curated.message ?? props.starlink.message
    const load = kind === 'airports' ? props.onLoadAirports : kind === 'ports' ? props.onLoadPorts : props.onLoadOrbits
    const queryInput = input(kind, kind === 'airports' ? 'Airport name, city, ICAO or IATA' :
      kind === 'ports' ? 'Port name' : 'Satellite / orbital name, NORAD or COSPAR')
    if (!ready) return (
      <>
        {queryInput}
        <div className="control-note" role="status">
          <p>{loading ? 'Catalog loading.' : error ?? 'Catalog not loaded.'}</p>
          <button type="button" disabled={loading || paused} onClick={load}>
            {kind === 'orbits' ? props.orbitalVisible ? 'Retry catalogs' : 'Enable ORBITS' : `Load ${kind}`}
          </button>
        </div>
      </>
    )
    const airports = kind === 'airports' ? discoverAirports(props.airports, drafts.airports) : []
    const ports = kind === 'ports' ? discoverPorts(props.ports, drafts.ports) : []
    const orbits = kind === 'orbits' ? discoverLoadedOrbits(orbitalCatalog.entries, drafts.orbits) : []
    const rows = kind === 'airports' ? airports : kind === 'ports' ? ports : orbits
    const paging = orbitalCatalogPage<unknown>(rows, page, DISCOVERY_CONFIG.catalogResultLimit)
    const start = paging.page * DISCOVERY_CONFIG.catalogResultLimit
    return (
      <>
        {queryInput}
        {kind === 'orbits' && !props.orbitalVisible && (
          <button type="button" disabled={paused} onClick={load}>Enable ORBITS</button>
        )}
        <p className="control-note" role="status">{rows.length} {rows.length === 1 ? 'match' : 'matches'} in loaded catalog{rows.length === 0 ? '.' : ` · ${paging.rangeStart}–${paging.rangeEnd}.`}</p>
        {kind === 'orbits' && orbitalCatalog.missing.length > 0 && (
          <p className="control-note">{orbitalCatalog.missing.includes('curated') ? 'Curated catalog unavailable.' : 'Starlink sample unavailable.'}</p>
        )}
        <ul ref={catalogListRef} className="object-find-results" aria-label="Loaded catalog matches">
          {airports.slice(start, start + DISCOVERY_CONFIG.catalogResultLimit).map((airport) => (
            <li key={airport.id}>
              <strong>{airport.name}</strong><span>{[airport.ident, airport.iataCode, airport.municipality].filter(Boolean).join(' · ')}</span>
              <ObjectResultButton prefix="object-find-result" disabled={navigationDisabled}
                onSelect={(originId) => setCatalogNavigationError(!props.onAirportNavigate(airport.id, originId))}>Go to airport</ObjectResultButton>
            </li>
          ))}
          {ports.slice(start, start + DISCOVERY_CONFIG.catalogResultLimit).map((port) => (
            <li key={port.id}>
              <strong>{port.name}</strong><span>Generalized static location</span>
              <ObjectResultButton prefix="object-find-result" disabled={navigationDisabled}
                onSelect={(originId) => setCatalogNavigationError(!props.onPortNavigate(port.id, originId))}>Go to port</ObjectResultButton>
            </li>
          ))}
          {orbits.slice(start, start + DISCOVERY_CONFIG.catalogResultLimit).map((entry) => (
            <li key={entry.id}>
              <strong>{entry.record.name}</strong><span>NORAD {entry.record.noradCatalogId} · {orbitalObjectTypeLabel(entry.record.objectType)} ({entry.record.objectType})</span>
              <span>{orbitalPositionMessage(entry, entry.owner === 'starlink' ? props.starlink : props.curated, now, props.orbitalVisible)}</span>
              <ObjectResultButton prefix="object-find-result" disabled={navigationDisabled || !entry.position}
                onSelect={(originId) => setCatalogNavigationError(!props.onOrbitalNavigate(entry.id, originId))}>Go to satellite</ObjectResultButton>
              <details className="context-details"><summary>Times, source &amp; limits</summary>
                <p>Element epoch {entry.record.epoch}. Retrieved {entry.snapshot.retrievedAt}.</p>
                <p>Published {entry.snapshot.publishedAt}. {entry.owner === 'starlink' ? 'Bounded Starlink sample.' : 'Curated catalog.'}</p>
                <p>{entry.snapshot.sourceProvider === 'space-track' ? 'Space-Track orbital elements; CelesTrak catalog reference.' : 'CelesTrak orbital elements.'} Modeled, not live tracking or optical visibility.</p>
                <p>Not every satellite or the full Starlink constellation. Find does not change map filters.</p>
              </details>
            </li>
          ))}
        </ul>
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
        {kind !== 'orbits' && <details className="context-details"><summary>Catalog source &amp; limits</summary>
          {kind === 'airports' ? <p>OurAirports · {props.airportSource?.licenseName ?? 'Public domain'} · snapshot {props.airportSource?.publishedAt ?? 'date unavailable'}. Large and medium airports only; static, not airport operations.</p> :
            <p>Natural Earth · {props.portSource?.licenseName ?? 'Public domain'} · snapshot {props.portSource?.publishedAt ?? 'date unavailable'}. Generalized ports, not berth or navigation information.</p>}
        </details>}
      </>
    )
  }
  const scopedContent = (
    <div ref={contentRef} className="object-find" onFocusCapture={(event) => {
      if (event.target instanceof HTMLElement) lastFocusedRef.current = event.target
    }} onKeyDown={(event) => {
      if (event.key !== 'Escape' || workspaceOwnsFullscreen(event.currentTarget) ||
        lookupState.phase !== 'loading' && locateState.phase !== 'loading') return
      event.preventDefault()
      event.stopPropagation()
      if (lookupState.phase === 'loading') controller.cancel()
      cancelShipLocate()
    }}>
      <div className={isTraffic ? 'object-find-heading-row' : undefined}>
      {props.kindSelect}
      {isTraffic && <label className="object-find-scope"><span>Scope</span>
        <select aria-label="Find scope" value={scope} onChange={(event) => {
          cancelShipLocate()
          const next = event.currentTarget.value
          if (next === 'view' || next === 'received' || next === 'outside') setScopes((current) => ({ ...current, [kind]: next }))
        }}>
          <option value="view">In view</option>
          {kind === 'ships' && <option value="received">Received</option>}
          <option value="outside">Outside view</option>
        </select>
      </label>}
      </div>
      {isTraffic && scope === 'view' ? props.currentView :
        kind === 'ships' && scope === 'received' ? <>
          {input('received', 'Name, MMSI, IMO or callsign')}
          <p className="control-note">Digitraffic metadata · last 24 hours · names/IDs only · no new request.</p>
          {!cachedShips?.loaded ? <p className="control-note" role="status">No metadata received this session.</p> :
            [...drafts.received.trim()].length < 2 ? <p className="control-note">Enter at least two characters.</p> :
              <IdentityResults result={cachedShips.result} now={now} navigationDisabled onNavigate={onNavigate} />}
        </> : isTraffic && scope === 'outside' ? <>
          {kind === 'ships' && <p className="control-note">Select Locate to check one ship’s last report.</p>}
          <form onSubmit={(event) => {
            event.preventDefault()
            cancelShipLocate()
            if (!remoteActive || document.hidden || !navigator.onLine || (kind !== 'ships' && kind !== 'aircraft')) {
              setLookupState({ phase: 'error', message: 'Lookup paused. Return to LIVE and reconnect to submit.' })
              return
            }
            void controller.lookup(kind, method, drafts[kind])
          }}>
            <label className="object-find-scope"><span>By</span>
              <select aria-label="Outside-view lookup method" value={method} onChange={(event) => {
                cancelShipLocate()
                const value = event.currentTarget.value
                if (kind === 'ships' && (value === 'name' || value === 'mmsi')) setShipMethod(value)
                if (kind === 'aircraft' && (value === 'hex' || value === 'reg' || value === 'callsign')) setAircraftMethod(value)
              }}>
                {kind === 'ships' ? <><option value="name">Name prefix</option><option value="mmsi">Exact MMSI</option></> :
                  <><option value="hex">Exact ICAO24</option><option value="reg">Exact registration</option><option value="callsign">Exact callsign</option></>}
              </select>
            </label>
            {input(kind, kind === 'ships' ? shipMethod === 'name' ? 'Ship name prefix (2+ characters)' : 'Nine-digit MMSI' :
              aircraftMethod === 'hex' ? 'Six-character ICAO24' : aircraftMethod === 'reg' ? 'Registration, including hyphen' : 'Aircraft callsign')}
            <button className="object-find-submit" type="submit" disabled={!remoteActive || lookupState.phase === 'loading'}>
              {lookupState.phase === 'loading' ? 'Looking up…' : 'Look up'}
            </button>
          </form>
          <p className="control-note">Sent on submit to {kind === 'ships' ? 'Open Waters' : 'ADSB.lol'}; no Home or view coordinates.</p>
          {lookupState.phase === 'loading' && <p role="status" className="control-note">Looking up the submitted identifier.</p>}
          {lookupState.phase === 'error' && <p role="status" className="control-note">{lookupState.message}</p>}
          {lookupState.phase === 'results' && lookupState.request.objectClass === kind && <IdentityResults
            result={lookupState.result} now={now} navigationDisabled={navigationDisabled} onNavigate={onNavigate}
            shipLocate={kind === 'ships' ? {
              key: locateKey, state: locateState, message: locateMessage, disabled: !remoteActive,
              onLocate: (match) => { void locateShip(match) },
            } : undefined} />}
          <details className="context-details"><summary>Source, coverage &amp; limits</summary>
            {kind === 'ships' ? <>
              <p><a href="https://openwaters.io/api/ais/" target="_blank" rel="noreferrer">Open Waters AIS</a> · prefix search, at most 50 matches. Receiver-dependent identities, not a complete ship registry. Free exact IMO lookup is unavailable.</p>
              <p>Search returns identities, not timed positions. Locate separately checks one exact MMSI for its newest report in the last 24 hours. No report leaves the map unchanged.</p>
              <p>Report age and original track credits remain available with the result. Navigation does not create live traffic, override filters or change Home; ordinary reception may subsequently supply the ship.</p>
              <p>Open Waters aggregates other providers; their attribution and source-use caveats still apply. No data-rights waiver is implied.</p>
            </> : <>
              <p><a href="https://www.adsb.lol/docs/open-data/api/" target="_blank" rel="noreferrer">ADSB.lol · ODbL 1.0</a>. Exact identifier lookup, not an aircraft-name directory; receiver coverage is partial.</p>
              <p>Only original, qualified position times permit Go to last report. A last report is not a live selection or a guarantee of current reception.</p>
              <p>Lookup shares the existing aircraft relay admission. Busy/Retry-After may apply; no automatic retry.</p>
            </>}
          </details>
        </> : catalog()}
    </div>
  )
  return scopedContent
}
