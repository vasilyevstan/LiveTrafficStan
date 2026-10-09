import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AIRCRAFT_SEARCH_MAX_LENGTH,
  aircraftResultContext,
  aircraftResultLabel,
} from '../domain/aircraftSearch'
import {
  inViewPage,
  rankVesselsInView,
  vesselInViewMeasurement,
  type InViewAvailability,
  type OrbitalInView,
  type VesselInViewRanking,
} from '../domain/inView'
import { formatDimension } from '../domain/format'
import {
  DEFAULT_ORBITAL_DISCOVERY_FILTERS,
  discoverOrbitalCatalog,
} from '../domain/orbitalDiscovery'
import type { DisplayAircraft, DisplayVessel } from '../domain/traffic'
import {
  VESSEL_RESULT_LIMIT,
  vesselResultContext,
  vesselResultLabel,
} from '../domain/vesselFilters'

interface InViewPanelProps {
  aircraft: readonly DisplayAircraft[]
  totalAircraft: number
  aircraftQuery: string
  aircraftVisible: boolean
  aircraftAvailability: InViewAvailability
  selectedAircraftId: string | null
  onAircraftQueryChange: (query: string) => void
  onAircraftSelect: (id: string, originId: string) => void
  vessels: readonly DisplayVessel[]
  vesselsVisible: boolean
  vesselAvailability: InViewAvailability
  selectedVesselId: string | null
  onVesselSelect: (id: string, originId: string) => void
  orbits: OrbitalInView
  selectedOrbitalId: string | null
  onOrbitalSelect: (id: string, originId: string) => void
  pageSize: number
  maximumOrbitalQueryLength: number
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
  aircraft,
  totalAircraft,
  aircraftQuery,
  aircraftVisible,
  aircraftAvailability,
  selectedAircraftId,
  onAircraftQueryChange,
  onAircraftSelect,
  vessels,
  vesselsVisible,
  vesselAvailability,
  selectedVesselId,
  onVesselSelect,
  orbits,
  selectedOrbitalId,
  onOrbitalSelect,
  pageSize,
  maximumOrbitalQueryLength,
}: InViewPanelProps) {
  const [kind, setKind] = useState<Kind>('aircraft')
  const [orbitalQuery, setOrbitalQuery] = useState('')
  const [vesselRanking, setVesselRanking] = useState<VesselInViewRanking>('length')
  const [pages, setPages] = useState({ aircraft: 0, ships: 0, orbits: 0 })
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const focusPageRef = useRef<Kind | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
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
      ? aircraft.map((entity) => ({
          key: entity.id,
          id: entity.id,
          label: aircraftResultLabel(entity),
          context: aircraftResultContext(entity),
    }))
      : []
    const orbitalRows: ResultRow[] = orbitalResults.map((position) => ({
      key: `norad:${position.noradCatalogId}`,
      id: position.id,
      label: position.name,
      context: `NORAD ${position.noradCatalogId} · ${position.objectType} · ${
        position.owner === 'starlink' ? 'Starlink sample' : 'Curated'
      }`,
      detail: shownIds.has(position.id) ? 'Shown on map' : 'Not shown at this zoom',
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
        ].filter(Boolean).join(' · '),
      }
    })
    return { aircraft: aircraftRows, ships: vesselRows, orbits: orbitalRows }
  }, [aircraft, aircraftAvailability.available, orbits.rows, orbitalQuery, rankedVessels.rows])
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
      document.getElementById(kind === 'ships'
        ? `in-view-ships-ranking-${vesselRanking}`
        : `in-view-${kind}-search`)?.focus()
    }
  }, [focusedKey, kind, results, vesselRanking])

  useEffect(() => {
    const targetKind = focusPageRef.current
    if (!targetKind) return
    focusPageRef.current = null
    const first = paged[targetKind].rows[0]
    if (!first) return
    const target = document.getElementById(
      `in-view-${targetKind}-result-${first.key}`,
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
  const selectedVesselOutside = vesselAvailability.available
    ? vessels.find(({ id }) =>
        id === selectedVesselId && !rankedVessels.rows.some((vessel) => vessel.id === id),
      )
    : undefined

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
            {isShips ? (
              <div className="control-options control-options--two" role="group" aria-label="Rank ships">
                {(['length', 'draught'] as const).map((ranking) => (
                  <button
                    key={ranking}
                    id={`in-view-ships-ranking-${ranking}`}
                    type="button"
                    className={vesselRanking === ranking ? 'is-active' : undefined}
                    aria-pressed={vesselRanking === ranking}
                    onClick={() => {
                      setFocusedKey(null)
                      setVesselRanking(ranking)
                      setPages((current) => ({ ...current, ships: 0 }))
                    }}
                  >
                    {ranking === 'length' ? 'Longest' : 'Deepest draught'}
                  </button>
                ))}
              </div>
            ) : <input
              id={`in-view-${value}-search`}
              type="search"
              aria-label={
                isAircraft ? 'Search aircraft in view' : 'Search modeled objects in view'
              }
              value={query}
              maxLength={isAircraft ? AIRCRAFT_SEARCH_MAX_LENGTH : maximumOrbitalQueryLength}
              placeholder={isAircraft ? 'Callsign, registration, ICAO24, type' : 'Name, NORAD ID, designator'}
              onChange={(event) => {
                if (isAircraft) onAircraftQueryChange(event.currentTarget.value)
                else {
                  setOrbitalQuery(event.currentTarget.value.slice(0, maximumOrbitalQueryLength))
                }
                setPages((current) => ({ ...current, [value]: 0 }))
              }}
            />}
            <div className="in-view__status" role="status">
              {availability.available && (
                <p>{isAircraft
                  ? `${total} individual aircraft in view${aircraftVisible ? '' : ' · layer hidden'}`
                  : isShips
                    ? `${rankedVessels.rows.length} of ${rankedVessels.rankableCount} ranked · ${total} in view${vesselsVisible ? '' : ' · layer hidden'}`
                    : `${orbits.shownCount} shown of ${total} modeled in view${orbits.partial ? ' · partial' : ''}`}</p>
              )}
              {availability.message && <p>{availability.message}</p>}
              {isOrbits && orbits.sourceMessages.map((message) => <p key={message}>{message}</p>)}
              {availability.available && !isShips && query && <p>{results[value].length} of {total} match this search.</p>}
              {availability.available && total === 0 && <p>{isAircraft
                ? 'No unexpired aircraft in this view.'
                : isShips
                  ? 'No current ship observations match this view and its filters.'
                  : 'No matching modeled positions in this view.'}</p>}
              {availability.available && total > 0 && results[value].length === 0 && <p>{isShips
                ? `No ships in this view report a usable ${vesselRanking}.`
                : 'No objects match this search.'}</p>}
            </div>
            {page.rows.length > 0 && (
              <ul
                className="vessel-results in-view-results"
                aria-label={isAircraft ? 'Aircraft in view' : isShips ? 'Ranked ships in view' : 'Modeled objects in view'}
                onBlurCapture={(event) => {
                  if (
                    !(event.relatedTarget instanceof Node) ||
                    !event.currentTarget.contains(event.relatedTarget)
                  ) {
                    setFocusedKey(null)
                  }
                }}
              >
                {page.rows.map((row) => {
                  const originId = `in-view-${value}-result-${row.key}`
                  return (
                    <li key={row.key}>
                      <button
                        id={originId}
                        type="button"
                        title={row.title}
                        aria-pressed={selected === row.id}
                        disabled={!selectable}
                        onFocus={() => setFocusedKey(row.key)}
                        onClick={() => onSelect(row.id, originId)}
                      >
                        <strong>{row.label}</strong>
                        <span>{row.context}</span>
                        {row.detail && <span>{row.detail}</span>}
                      </button>
                    </li>
                  )
                })}
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
                {rankedVessels.unrankedCount} without reported {vesselRanking}; excluded from this ranking, not treated as zero.
              </p>
            )}
            <p className="control-note control-note--muted">
              {isAircraft
                ? 'Individual observations, not cluster symbols or fading last-local samples.'
                : isShips
                  ? `Up to ${VESSEL_RESULT_LIMIT} highest-ranked observed ships, not complete coverage. The map is unchanged; search and vessel filters are in More / Find. Reported draught is not water depth.`
                  : 'Modeled ground positions, not live telemetry or optical visibility. Includes a bounded Starlink sample, not the full constellation. Predicted passes are separate in More.'}
            </p>
            {isShips && selectedVesselOutside && (
              <p className="control-note">
                Selected outside this shortlist: {vesselResultLabel(selectedVesselOutside)}. Not added to the ranking.
              </p>
            )}
            {isOrbits && orbits.selectedOutside && (
              <p className="control-note">
                Selected outside this {orbits.selectedOutside.reason}: {orbits.selectedOutside.position.name}. Not added to these totals.
              </p>
            )}
          </section>
        )
      })}
    </div>
  )
}
