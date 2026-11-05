import { useEffect, useMemo, useRef, useState } from 'react'
import { ObjectResultButton } from './ObjectResultButton'
import {
  AIRCRAFT_SEARCH_MAX_LENGTH,
  aircraftResultContext,
  aircraftResultLabel,
} from '../domain/aircraftSearch'
import {
  inViewPage,
  rankAircraftInView,
  rankVesselsInView,
  aircraftInViewMeasurement,
  vesselInViewMeasurement,
  type AircraftInViewRanking,
  type InViewAvailability,
  type OrbitalInView,
  type VesselInViewRanking,
} from '../domain/inView'
import { formatAltitude, formatDimension, formatSpeed } from '../domain/format'
import {
  DEFAULT_ORBITAL_DISCOVERY_FILTERS,
  discoverOrbitalCatalog,
} from '../domain/orbitalDiscovery'
import type { DisplayAircraft, DisplayVessel } from '../domain/traffic'
import type { UnitSystem } from '../domain/units'
import { vesselResultContext, vesselResultLabel } from '../domain/vesselFilters'

interface InViewPanelProps {
  unavailableMessage?: string
  aircraft: readonly DisplayAircraft[]
  totalAircraft: number
  aircraftQuery: string
  aircraftVisible: boolean
  aircraftAvailability: InViewAvailability
  units?: UnitSystem
  selectedAircraftId: string | null
  onAircraftQueryChange: (query: string) => void
  onAircraftSelect: (id: string, originId: string) => void
  vessels: readonly DisplayVessel[]
  vesselsVisible: boolean
  vesselAvailability: InViewAvailability
  selectedVesselId: string | null
  onVesselSelect: (id: string, originId: string) => void
  onFindShips?: () => void
  orbits: OrbitalInView
  selectedOrbitalId: string | null
  onOrbitalSelect: (id: string, originId: string) => void
  pageSize: number
  maximumOrbitalQueryLength: number
  savedKeys?: ReadonlySet<string>
}

const CATEGORIES = ['aircraft', 'ships', 'orbits'] as const
const CATEGORY_LABELS = { aircraft: 'Aircraft', ships: 'Ships', orbits: 'Orbits' }
type Kind = (typeof CATEGORIES)[number]

interface ResultRow {
  key: string
  id: string
  label: string
  context: string
  detail?: string
  title?: string
}

export function InViewPanel({
  unavailableMessage,
  aircraft,
  totalAircraft,
  aircraftQuery,
  aircraftVisible,
  aircraftAvailability,
  units = 'metric',
  selectedAircraftId,
  onAircraftQueryChange,
  onAircraftSelect,
  vessels,
  vesselsVisible,
  vesselAvailability,
  selectedVesselId,
  onVesselSelect,
  onFindShips,
  orbits,
  selectedOrbitalId,
  onOrbitalSelect,
  pageSize,
  maximumOrbitalQueryLength,
  savedKeys = new Set(),
}: InViewPanelProps) {
  const [kind, setKind] = useState<Kind>('aircraft')
  const [orbitalQuery, setOrbitalQuery] = useState('')
  const [aircraftRanking, setAircraftRanking] = useState<AircraftInViewRanking>('altitude')
  const [vesselRanking, setVesselRanking] = useState<VesselInViewRanking>('length')
  const [pages, setPages] = useState({ aircraft: 0, ships: 0, orbits: 0 })
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const focusPageRef = useRef<Kind | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const rankedAircraft = useMemo(() => rankAircraftInView(
    aircraftAvailability.available ? aircraft : [],
    aircraftRanking,
    aircraftQuery,
  ), [aircraft, aircraftAvailability.available, aircraftQuery, aircraftRanking])
  const rankedVessels = useMemo(() => rankVesselsInView(
    vesselAvailability.available ? vessels : [],
    vesselRanking,
  ), [vessels, vesselAvailability.available, vesselRanking])
  const results = useMemo(() => {
    const orbitalResults = discoverOrbitalCatalog(
      orbits.rows.map(({ position }) => position),
      orbitalQuery,
      DEFAULT_ORBITAL_DISCOVERY_FILTERS,
    )
    const shownIds = new Set(
      orbits.rows.filter(({ shown }) => shown).map(({ position }) => position.id),
    )
    const aircraftRows: ResultRow[] = aircraftAvailability.available
      ? rankedAircraft.rows.map((entity) => {
        const altitude = aircraftInViewMeasurement(entity, 'altitude')
        const speed = aircraftInViewMeasurement(entity, 'speed')
        return {
          key: entity.id,
          id: entity.id,
          label: aircraftResultLabel(entity),
          context: [
            aircraftResultContext(entity),
            altitude === undefined ? 'Altitude not reported' : `Altitude ${formatAltitude(altitude, units)}`,
            speed === undefined ? 'Speed not reported' : `Speed ${formatSpeed(speed, units)}`,
          ].join(' · '),
          detail: savedKeys.has(`aircraft:${entity.hex.toLowerCase()}`) ? 'Saved' : undefined,
        }
      })
      : []
    const orbitalRows: ResultRow[] = orbitalResults.map((position) => ({
      key: `norad:${position.noradCatalogId}`,
      id: position.id,
      label: position.name,
      context: `NORAD ${position.noradCatalogId} · ${position.objectType} · ${
        position.owner === 'starlink' ? 'Starlink sample' : 'Curated'
      }`,
      detail: [
        shownIds.has(position.id) ? 'Shown on map' : 'Not shown at this zoom',
        savedKeys.has(`orbital:${position.noradCatalogId}`) ? 'Saved' : undefined,
      ].filter(Boolean).join(' · '),
      title: `Element epoch ${new Date(position.elementEpoch).toISOString()}. Modeled ${new Date(position.modeledFor).toISOString()}. Retrieved ${new Date(position.snapshotRetrievedAt).toISOString()}.`,
      }))
    const vesselRows: ResultRow[] = rankedVessels.rows.map((vessel) => {
      const length = vesselInViewMeasurement(vessel, 'length')
      const draught = vesselInViewMeasurement(vessel, 'draught')
      return {
        key: vessel.id,
        id: vessel.id,
        label: vesselResultLabel(vessel),
        context: [
          length === undefined ? 'Length not reported' : `${formatDimension(length)} long`,
          draught === undefined ? 'Draught not reported' : `${formatDimension(draught)} draught`,
        ].join(' · '),
        detail: [
          vesselResultContext(vessel),
          vessel.freshness === 'stale' ? 'STALE' : undefined,
          savedKeys.has(`vessel:${vessel.mmsi}`) ? 'Saved' : undefined,
        ].filter(Boolean).join(' · '),
      }
    })
    return { aircraft: aircraftRows, ships: vesselRows, orbits: orbitalRows }
  }, [aircraftAvailability.available, orbits.rows, orbitalQuery, rankedAircraft.rows, rankedVessels.rows, savedKeys, units])
  const paged = useMemo(() => ({
    aircraft: inViewPage(results.aircraft, pages.aircraft, pageSize, focusedKey),
    ships: inViewPage(results.ships, pages.ships, pageSize, focusedKey),
    orbits: inViewPage(results.orbits, pages.orbits, pageSize, focusedKey),
  }), [results, pages.aircraft, pages.ships, pages.orbits, pageSize, focusedKey])

  useEffect(() => {
    if (
      pages.aircraft === paged.aircraft.page &&
      pages.ships === paged.ships.page &&
      pages.orbits === paged.orbits.page
    ) return
    setPages({
      aircraft: paged.aircraft.page,
      ships: paged.ships.page,
      orbits: paged.orbits.page,
    })
  }, [pages.aircraft, pages.ships, pages.orbits, paged.aircraft.page, paged.ships.page, paged.orbits.page])

  useEffect(() => {
    if (!focusedKey || results[kind].some(({ key }) => key === focusedKey)) return
    setFocusedKey(null)
    if (
      document.activeElement === document.body &&
      rootRef.current?.getClientRects().length
    ) {
      const targetId = kind === 'ships'
        ? `in-view-ships-ranking-${vesselRanking}`
        : kind === 'aircraft'
          ? `in-view-aircraft-ranking-${aircraftRanking}`
          : `in-view-${kind}-search`
      document.getElementById(targetId)?.focus()
    }
  }, [aircraftRanking, focusedKey, kind, results, vesselRanking])

  useEffect(() => {
    const targetKind = focusPageRef.current
    if (!targetKind) return
    focusPageRef.current = null
    const first = paged[targetKind].rows[0]
    if (!first) return
    const target = rootRef.current?.querySelector<HTMLElement>(
      `#in-view-${targetKind}-panel .in-view-results button`,
    )
    if (target?.getClientRects().length) target.focus()
  }, [paged])

  const changePage = (targetKind: Kind, page: number) => {
    setFocusedKey(null)
    focusPageRef.current = targetKind
    setPages((current) => ({ ...current, [targetKind]: page }))
  }
  const availabilityByKind = {
    aircraft: aircraftAvailability,
    ships: vesselAvailability,
    orbits,
  }
  const totals = { aircraft: totalAircraft, ships: vessels.length, orbits: orbits.rows.length }

  if (unavailableMessage) {
    return <div ref={rootRef} className="in-view">
      <p className="metadata-status" role="status">{unavailableMessage}</p>
    </div>
  }

  return (
    <div ref={rootRef} className="in-view">
      <div
        className="control-options control-options--three in-view__tabs"
        role="group"
        aria-label="In view category"
      >
        {CATEGORIES.map((value) => (
          <button
            id={`in-view-${value}-tab`}
            key={value}
            type="button"
            className={kind === value ? 'is-active' : undefined}
            aria-pressed={kind === value}
            aria-controls={`in-view-${value}-panel`}
            onClick={() => {
              setFocusedKey(null)
              setKind(value)
            }}
          >
            {CATEGORY_LABELS[value]}
            <span className="in-view__count">
              {availabilityByKind[value].available ? totals[value] : '—'}
            </span>
          </button>
        ))}
      </div>
      {CATEGORIES.map((value) => {
        const isAircraft = value === 'aircraft'
        const isShips = value === 'ships'
        const isOrbits = value === 'orbits'
        const availability = availabilityByKind[value]
        const page = paged[value]
        const total = totals[value]
        const query = isAircraft ? aircraftQuery : orbitalQuery
        const showSearch = !isShips && (total > 5 || Boolean(query))
        const selected = isAircraft ? selectedAircraftId : isShips ? selectedVesselId : selectedOrbitalId
        const onSelect = isAircraft ? onAircraftSelect : isShips ? onVesselSelect : onOrbitalSelect
        const selectable = isAircraft ? aircraftVisible : isShips ? vesselsVisible : true
        return (
          <section
            key={value}
            id={`in-view-${value}-panel`}
            className="control-panel__task in-view__section"
            hidden={kind !== value}
            aria-labelledby={`in-view-${value}-tab`}
          >
            {(isAircraft || isShips) && (
              <div
                className="control-options control-options--two"
                role="group"
                aria-label={isAircraft ? 'Rank aircraft' : 'Rank ships'}
              >
                {(isAircraft ? ['altitude', 'speed'] as const : ['length', 'draught'] as const).map((ranking) => {
                  const activeRanking = isAircraft ? aircraftRanking : vesselRanking
                  const rankingId = isAircraft
                    ? `in-view-aircraft-ranking-${ranking}`
                    : `in-view-ships-ranking-${ranking}`
                  const label = ranking === 'altitude'
                    ? 'Highest altitude'
                    : ranking === 'speed'
                      ? 'Fastest speed'
                      : ranking === 'length'
                        ? 'Longest'
                        : 'Deepest draught'
                  return (
                    <button
                      key={ranking}
                      id={rankingId}
                      type="button"
                      className={activeRanking === ranking ? 'is-active' : undefined}
                      aria-pressed={activeRanking === ranking}
                      onClick={() => {
                        setFocusedKey(null)
                        if (ranking === 'altitude' || ranking === 'speed') {
                          setAircraftRanking(ranking)
                          setPages((current) => ({ ...current, aircraft: 0 }))
                        } else {
                          setVesselRanking(ranking)
                          setPages((current) => ({ ...current, ships: 0 }))
                        }
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            )}
            {showSearch && <input
              id={`in-view-${value}-search`}
              type="search"
              aria-label={
                isAircraft ? 'Search aircraft in view' : 'Search modeled objects in view'
              }
              value={query}
              maxLength={isAircraft ? AIRCRAFT_SEARCH_MAX_LENGTH : maximumOrbitalQueryLength}
              placeholder={isAircraft ? 'Search aircraft' : 'Search orbits'}
              onChange={(event) => {
                if (isAircraft) onAircraftQueryChange(event.currentTarget.value)
                else {
                  setOrbitalQuery(event.currentTarget.value.slice(0, maximumOrbitalQueryLength))
                }
                setPages((current) => ({ ...current, [value]: 0 }))
              }}
            />}
            <div className="in-view__status" role="status">
              {availability.available && isAircraft && !aircraftVisible && <p>Layer hidden.</p>}
              {availability.available && isShips && !vesselsVisible && <p>Layer hidden.</p>}
              {availability.available && isOrbits && orbits.partial && <p>Partial results.</p>}
              {availability.message && <p>{availability.message}</p>}
              {isOrbits && orbits.sourceMessages.map((message) => <p key={message}>{message}</p>)}
              {availability.available && !isShips && query && <p>{results[value].length} of {total} match this search.</p>}
              {availability.available && total === 0 && <p>{isAircraft
                ? 'No unexpired aircraft in this view.'
                : isShips
                  ? 'No current ship observations match this view and its filters.'
                  : 'No matching modeled positions in this view.'}</p>}
              {availability.available && total > 0 && results[value].length === 0 && <p>No objects match this search.</p>}
            </div>
            {isShips && onFindShips && (
              <button className="in-view__find-ships" type="button" onClick={onFindShips}>
                Find ships by name or ID
              </button>
            )}
            {page.rows.length > 0 && (
              <ul
                className="vessel-results in-view-results"
                aria-label={isAircraft ? 'Aircraft in view' : isShips ? 'Ships in view' : 'Modeled objects in view'}
                onBlurCapture={(event) => {
                  if (
                    !(event.relatedTarget instanceof Node) ||
                    !event.currentTarget.contains(event.relatedTarget)
                  ) {
                    setFocusedKey(null)
                  }
                }}
              >
                {page.rows.map((row) => (
                    <li key={row.key}>
                      <ObjectResultButton
                        prefix={`in-view-${value}-result`}
                        title={row.title}
                        aria-pressed={selected === row.id}
                        disabled={!selectable}
                        onFocus={() => setFocusedKey(row.key)}
                        onSelect={(originId) => onSelect(row.id, originId)}
                      >
                        <strong>{row.label}</strong>
                        <span>{row.context}</span>
                        {row.detail && <span>{row.detail}</span>}
                      </ObjectResultButton>
                    </li>
                ))}
              </ul>
            )}
            {page.pageCount > 1 && (
              <div className="in-view__paging">
                <p>{page.rangeStart}–{page.rangeEnd} of {page.listedRowCount}</p>
                <div className="control-options control-options--two">
                  <button
                    type="button"
                    disabled={page.page === 0}
                    onClick={() => changePage(value, page.page - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page.page + 1 >= page.pageCount}
                    onClick={() => changePage(value, page.page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            {isShips && availability.available && rankedVessels.unrankedCount > 0 && (
              <p className="control-note">
                {rankedVessels.unrankedCount} without reported {vesselRanking}, listed last.
              </p>
            )}
            {isAircraft && availability.available && rankedAircraft.unrankedCount > 0 && (
              <p className="control-note">
                {rankedAircraft.unrankedCount} without reported {aircraftRanking}, listed last.
              </p>
            )}
            {!isAircraft && <p className="control-note control-note--muted">
              {isShips ? 'Draught is not water depth.'
                : 'Modeled, not live or optical. Includes a Starlink sample.'}
            </p>}
            {isOrbits && orbits.selectedOutside && (
              <p className="control-note">
                Selected outside this {orbits.selectedOutside.reason}: {orbits.selectedOutside.position.name}.
              </p>
            )}
          </section>
        )
      })}
    </div>
  )
}
