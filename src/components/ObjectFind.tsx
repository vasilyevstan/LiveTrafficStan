import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ObjectLookupController, type ObjectLookupState } from '../app/ObjectLookupController'
import { workspaceOwnsFullscreen } from '../app/fullscreen'
import { APP_CONFIG, type AppCenter } from '../config/appConfig'
import { DISCOVERY_CONFIG } from '../config/discoveryConfig'
import type { Airport, AirportSource } from '../domain/airports'
import { discoverAirports, discoverLoadedOrbits, discoverPorts, loadedOrbitalCatalog } from '../domain/catalogDiscovery'
import { formatAge } from '../domain/format'
import type { CachedMarineDiscovery, DiscoveryMatch, DiscoveryResponse } from '../domain/objectDiscovery'
import { qualifiedLastReport } from '../domain/objectDiscovery'
import { orbitalObjectTypeLabel, type OrbitalControllerState } from '../domain/orbital'
import { orbitalCatalogPage } from '../domain/orbitalDiscovery'
import type { Port, PortSource } from '../domain/ports'
import { SameOriginObjectLookupProvider } from '../providers/discovery/objectLookupProvider'
import { ObjectResultButton } from './ObjectResultButton'

export type FindKind = 'places' | 'aircraft' | 'ships' | 'orbits' | 'airports' | 'ports'
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
  airports: readonly Airport[]
  airportsReady: boolean
  airportsLoading: boolean
  airportsError?: string
  airportSource?: AirportSource
  onLoadAirports: () => void
  ports: readonly Port[]
  portsReady: boolean
  portsLoading: boolean
  portsError?: string
  portSource?: PortSource
  onLoadPorts: () => void
  curated: OrbitalControllerState
  starlink: OrbitalControllerState
  selectedOrbitalId: string | null
  orbitalVisible: boolean
  onLoadOrbits: () => void
  discoverMarineMetadata?: (query: string, now: number) => CachedMarineDiscovery
}

function IdentityResults({
  result, now, navigationDisabled, onNavigate,
}: {
  result: DiscoveryResponse
  now: number
  navigationDisabled: boolean
  onNavigate: (center: AppCenter) => void
}) {
  const canNavigate = (match: DiscoveryMatch) => !navigationDisabled && qualifiedLastReport(match, result, now) !== null
  return (
    <>
      <p className="control-note" role="status">
        {result.matches.length === 0 ? 'No matches in this source.' :
          `${result.matches.length} matches${result.truncated ? ' · partial, limit reached' : ''}.`}
        {result.rejectedRecords > 0 && ` ${result.rejectedRecords} invalid or unsupported records withheld.`}
      </p>
      <ul className="object-find-results" aria-label="Identity lookup results">
        {result.matches.map((match) => (
          <li key={match.key}>
            <strong>{match.name ?? match.identifiers.mmsi ?? match.identifiers.icao24}</strong>
            <span>{[
              match.identifiers.mmsi && `MMSI ${match.identifiers.mmsi}`,
              match.identifiers.icao24 && `ICAO24 ${match.identifiers.icao24}`,
              match.identifiers.registration,
              match.identifiers.callsign,
              match.identifiers.imo && `IMO ${match.identifiers.imo}`,
            ].filter(Boolean).join(' · ')}</span>
            <span>{canNavigate(match) && match.location
              ? `Last position ${formatAge(match.location.reportedAt, now)}`
              : 'Position unavailable'}</span>
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
            </details>
          </li>
        ))}
      </ul>
    </>
  )
}

export function ObjectFind(props: ObjectFindProps) {
  const { kind, mobile, now, active, paused, onNavigate, discoverMarineMetadata } = props
  const inputId = useId()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [scopes, setScopes] = useState<{ ships: Scope; aircraft: Scope }>({ ships: 'view', aircraft: 'view' })
  const [drafts, setDrafts] = useState({ ships: '', aircraft: '', received: '', airports: '', ports: '', orbits: '' })
  const [shipMethod, setShipMethod] = useState<'name' | 'mmsi'>('name')
  const [aircraftMethod, setAircraftMethod] = useState<'hex' | 'reg' | 'callsign'>('hex')
  const [page, setPage] = useState(0)
  const catalogListRef = useRef<HTMLUListElement>(null)
  const restorePageFocusRef = useRef(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)
  const previousMobileRef = useRef(mobile)
  const [lookupState, setLookupState] = useState<ObjectLookupState>({ phase: 'idle' })
  const [controller] = useState(() => new ObjectLookupController({
    provider: new SameOriginObjectLookupProvider(), onState: setLookupState,
  }))
  const isTraffic = kind === 'ships' || kind === 'aircraft'
  const scope = isTraffic ? !mobile && scopes[kind] === 'view' ? 'outside' : scopes[kind] : 'received'
  const remoteActive = active && (mobile || advancedOpen) && isTraffic && scope === 'outside' && !paused
  const navigationDisabled = props.navigationDisabled
  const method = kind === 'aircraft' ? aircraftMethod : shipMethod

  useEffect(() => () => controller.stop(), [controller])
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
      setLookupState((state) => state.phase === 'loading' ? { phase: 'idle' } : state)
    }
    stopIfPaused()
    document.addEventListener('visibilitychange', stopIfPaused)
    window.addEventListener('offline', stopIfPaused)
    return () => {
      document.removeEventListener('visibilitychange', stopIfPaused)
      window.removeEventListener('offline', stopIfPaused)
    }
  }, [controller, remoteActive])
  useEffect(() => {
    controller.cancel()
    setPage(0)
  }, [controller, kind, scope, method])
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
    controller.cancel()
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
    if (!ready) return (
      <div className="control-note" role="status">
        <p>{loading ? 'Catalog loading.' : error ?? 'Catalog not loaded.'}</p>
        <button type="button" disabled={loading || paused} onClick={load}>
          {kind === 'orbits' ? props.orbitalVisible ? 'Retry catalogs' : 'Enable ORBITS' : `Load ${kind}`}
        </button>
      </div>
    )
    const airports = kind === 'airports' ? discoverAirports(props.airports, drafts.airports) : []
    const ports = kind === 'ports' ? discoverPorts(props.ports, drafts.ports) : []
    const orbits = kind === 'orbits' ? discoverLoadedOrbits(orbitalCatalog.entries, drafts.orbits) : []
    const rows = kind === 'airports' ? airports : kind === 'ports' ? ports : orbits
    const paging = orbitalCatalogPage<unknown>(rows, page, DISCOVERY_CONFIG.catalogResultLimit)
    const start = paging.page * DISCOVERY_CONFIG.catalogResultLimit
    return (
      <>
        {input(kind, kind === 'airports' ? 'Airport name, city, ICAO or IATA' :
          kind === 'ports' ? 'Port name' : 'Orbital name, NORAD or COSPAR')}
        <p className="control-note" role="status">{rows.length} matches in loaded catalog{rows.length === 0 ? '.' : ` · ${paging.rangeStart}–${paging.rangeEnd}.`}</p>
        {kind === 'orbits' && orbitalCatalog.missing.length > 0 && (
          <p className="control-note">{orbitalCatalog.missing.includes('curated') ? 'Curated catalog unavailable.' : 'Starlink sample unavailable.'}</p>
        )}
        <ul ref={catalogListRef} className="object-find-results" aria-label="Loaded catalog matches">
          {airports.slice(start, start + DISCOVERY_CONFIG.catalogResultLimit).map((airport) => (
            <li key={airport.id}>
              <strong>{airport.name}</strong><span>{[airport.ident, airport.iataCode, airport.municipality].filter(Boolean).join(' · ')}</span>
              <ObjectResultButton prefix="object-find-result" disabled={navigationDisabled}
                onSelect={() => onNavigate({ latitude: airport.latitude, longitude: airport.longitude, label: `Airport: ${airport.name}` })}>Go to airport</ObjectResultButton>
            </li>
          ))}
          {ports.slice(start, start + DISCOVERY_CONFIG.catalogResultLimit).map((port) => (
            <li key={port.id}>
              <strong>{port.name}</strong><span>Generalized static location</span>
              <ObjectResultButton prefix="object-find-result" disabled={navigationDisabled}
                onSelect={() => onNavigate({ latitude: port.latitude, longitude: port.longitude, label: `Port: ${port.name}` })}>Go to port</ObjectResultButton>
            </li>
          ))}
          {orbits.slice(start, start + DISCOVERY_CONFIG.catalogResultLimit).map((entry) => (
            <li key={entry.id}>
              <strong>{entry.record.name}</strong><span>NORAD {entry.record.noradCatalogId} · {orbitalObjectTypeLabel(entry.record.objectType)} ({entry.record.objectType})</span>
              <span>{entry.position ? `Modeled ${formatAge(entry.position.modeledFor, now)}` : 'Modeled position unavailable'}</span>
              {entry.position && <ObjectResultButton prefix="object-find-result" disabled={navigationDisabled}
                onSelect={() => {
                  if (!entry.position || Date.now() - entry.position.modeledFor > DISCOVERY_CONFIG.maximumModeledPositionAgeMs) return
                  onNavigate({ latitude: entry.position.latitude, longitude: entry.position.longitude, label: `Modeled: ${entry.record.name}` })
                }}>Go to modeled point</ObjectResultButton>}
              <details className="context-details"><summary>Element &amp; catalog times</summary>
                <p>Element epoch {entry.record.epoch}. Retrieved {entry.snapshot.retrievedAt}.</p>
                <p>Published {entry.snapshot.publishedAt}. {entry.owner === 'starlink' ? 'Bounded Starlink sample.' : 'Curated catalog.'}</p>
                <p>Modeled, not live tracking or optical visibility.</p>
              </details>
            </li>
          ))}
        </ul>
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
        <details className="context-details"><summary>Catalog source &amp; limits</summary>
          {kind === 'airports' ? <p>OurAirports · {props.airportSource?.licenseName ?? 'Public domain'} · snapshot {props.airportSource?.publishedAt ?? 'date unavailable'}. Large and medium airports only; static, not airport operations.</p> :
            kind === 'ports' ? <p>Natural Earth · {props.portSource?.licenseName ?? 'Public domain'} · snapshot {props.portSource?.publishedAt ?? 'date unavailable'}. Generalized ports, not berth or navigation information.</p> :
              <p>CelesTrak · curated catalog and bounded Starlink sample, not the complete constellation. Modeled, not live or optical. Find does not change map filters.</p>}
        </details>
      </>
    )
  }
  const scopedContent = (
    <div ref={contentRef} className="object-find" onFocusCapture={(event) => {
      if (event.target instanceof HTMLElement) lastFocusedRef.current = event.target
    }} onKeyDown={(event) => {
      if (event.key !== 'Escape' || workspaceOwnsFullscreen(event.currentTarget) || lookupState.phase !== 'loading') return
      event.preventDefault()
      event.stopPropagation()
      controller.cancel()
    }}>
      <div className={mobile && isTraffic ? 'object-find-heading-row' : undefined}>
      {props.kindSelect}
      {isTraffic && <label className="object-find-scope"><span>Scope</span>
        <select aria-label="Find scope" value={scope} onChange={(event) => {
          const next = event.currentTarget.value
          if (next === 'view' || next === 'received' || next === 'outside') setScopes((current) => ({ ...current, [kind]: next }))
        }}>
          {mobile && <option value="view">In view</option>}
          {kind === 'ships' && <option value="received">Received</option>}
          <option value="outside">Outside view</option>
        </select>
      </label>}
      </div>
      {mobile && scope === 'view' ? props.currentView :
        kind === 'ships' && scope === 'received' ? <>
          {input('received', 'Name, MMSI, IMO or callsign')}
          <p className="control-note">Digitraffic metadata · last 24 hours · no new request.</p>
          {!cachedShips?.loaded ? <p className="control-note" role="status">No metadata received this session.</p> :
            [...drafts.received.trim()].length < 2 ? <p className="control-note">Enter at least two characters.</p> :
              <IdentityResults result={cachedShips.result} now={now} navigationDisabled onNavigate={onNavigate} />}
        </> : isTraffic && scope === 'outside' ? <>
          <form onSubmit={(event) => {
            event.preventDefault()
            if (!remoteActive || document.hidden || !navigator.onLine || (kind !== 'ships' && kind !== 'aircraft')) {
              setLookupState({ phase: 'error', message: 'Lookup paused. Return to LIVE and reconnect to submit.' })
              return
            }
            void controller.lookup(kind, method, drafts[kind])
          }}>
            <label className="object-find-scope"><span>By</span>
              <select aria-label="Outside-view lookup method" value={method} onChange={(event) => {
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
            result={lookupState.result} now={now} navigationDisabled={navigationDisabled} onNavigate={onNavigate} />}
          <details className="context-details"><summary>Source, coverage &amp; limits</summary>
            {kind === 'ships' ? <>
              <p><a href="https://openwaters.io/api/ais/" target="_blank" rel="noreferrer">Open Waters AIS</a> · prefix search, at most 50 matches. Receiver-dependent identities, not a complete ship registry. Free exact IMO lookup is unavailable.</p>
              <p>REST metadata time is not a position clock. All ship matches are identity-only; no map position is offered. Original source credits are retained with each result.</p>
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
  return mobile ? scopedContent : <>
    {props.currentView}
    <details className="context-details object-find-extra" onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
      <summary>Outside this view &amp; loaded catalogs</summary>
      {scopedContent}
    </details>
  </>
}
