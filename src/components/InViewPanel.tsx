import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AIRCRAFT_SEARCH_MAX_LENGTH,
  aircraftResultContext,
  aircraftResultLabel,
} from '../domain/aircraftSearch'
import {
  inViewPage,
  type InViewAvailability,
  type OrbitalInView,
} from '../domain/inView'
import {
  DEFAULT_ORBITAL_DISCOVERY_FILTERS,
  discoverOrbitalCatalog,
} from '../domain/orbitalDiscovery'
import type { DisplayAircraft } from '../domain/traffic'

interface InViewPanelProps {
  aircraft: readonly DisplayAircraft[]
  totalAircraft: number
  aircraftQuery: string
  aircraftVisible: boolean
  aircraftAvailability: InViewAvailability
  selectedAircraftId: string | null
  onAircraftQueryChange: (query: string) => void
  onAircraftSelect: (id: string, originId: string) => void
  orbits: OrbitalInView
  selectedOrbitalId: string | null
  onOrbitalSelect: (id: string, originId: string) => void
  pageSize: number
  maximumOrbitalQueryLength: number
}

type Kind = 'aircraft' | 'orbits'

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
  orbits,
  selectedOrbitalId,
  onOrbitalSelect,
  pageSize,
  maximumOrbitalQueryLength,
}: InViewPanelProps) {
  const [kind, setKind] = useState<Kind>('aircraft')
  const [orbitalQuery, setOrbitalQuery] = useState('')
  const [pages, setPages] = useState({ aircraft: 0, orbits: 0 })
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const focusPageRef = useRef<Kind | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
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
    return { aircraft: aircraftRows, orbits: orbitalRows }
  }, [aircraft, aircraftAvailability.available, orbits.rows, orbitalQuery])
  const paged = useMemo(() => ({
    aircraft: inViewPage(results.aircraft, pages.aircraft, pageSize, focusedKey),
    orbits: inViewPage(results.orbits, pages.orbits, pageSize, focusedKey),
  }), [results, pages.aircraft, pages.orbits, pageSize, focusedKey])

  useEffect(() => {
    if (
      pages.aircraft === paged.aircraft.page &&
      pages.orbits === paged.orbits.page
    ) return
    setPages({ aircraft: paged.aircraft.page, orbits: paged.orbits.page })
  }, [pages.aircraft, pages.orbits, paged.aircraft.page, paged.orbits.page])

  useEffect(() => {
    if (!focusedKey || results[kind].some(({ key }) => key === focusedKey)) return
    setFocusedKey(null)
    if (
      document.activeElement === document.body &&
      rootRef.current?.getClientRects().length
    ) {
      document.getElementById(`in-view-${kind}-search`)?.focus()
    }
  }, [focusedKey, kind, results])

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

  return (
    <div ref={rootRef} className="in-view">
      <div
        className="control-options control-options--two in-view__tabs"
        role="group"
        aria-label="In view category"
      >
        {(['aircraft', 'orbits'] as const).map((value) => (
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
            {value === 'aircraft' ? 'Aircraft' : 'Orbits'}
            <span className="in-view__count">
              {value === 'aircraft'
                ? aircraftAvailability.available ? totalAircraft : '—'
                : orbits.available ? orbits.rows.length : '—'}
            </span>
          </button>
        ))}
      </div>
      {(['aircraft', 'orbits'] as const).map((value) => {
        const isAircraft = value === 'aircraft'
        const availability = isAircraft ? aircraftAvailability : orbits
        const page = paged[value]
        const total = isAircraft ? totalAircraft : orbits.rows.length
        const query = isAircraft ? aircraftQuery : orbitalQuery
        const selected = isAircraft ? selectedAircraftId : selectedOrbitalId
        return (
          <section
            key={value}
            id={`in-view-${value}-panel`}
            className="control-panel__task in-view__section"
            hidden={kind !== value}
            aria-labelledby={`in-view-${value}-tab`}
          >
            <input
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
            />
            <div className="in-view__status" role="status">
              {availability.available && (
                <p>{isAircraft
                  ? `${total} individual aircraft in view${aircraftVisible ? '' : ' · layer hidden'}`
                  : `${orbits.shownCount} shown of ${total} modeled in view${orbits.partial ? ' · partial' : ''}`}</p>
              )}
              {availability.message && <p>{availability.message}</p>}
              {!isAircraft && orbits.sourceMessages.map((message) => <p key={message}>{message}</p>)}
              {availability.available && query && <p>{results[value].length} of {total} match this search.</p>}
              {availability.available && total === 0 && <p>{isAircraft ? 'No unexpired aircraft in this view.' : 'No matching modeled positions in this view.'}</p>}
              {availability.available && total > 0 && results[value].length === 0 && <p>No objects match this search.</p>}
            </div>
            {page.rows.length > 0 && (
              <ul
                className="vessel-results in-view-results"
                aria-label={isAircraft ? 'Aircraft in view' : 'Modeled objects in view'}
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
                        disabled={isAircraft && !aircraftVisible}
                        onFocus={() => setFocusedKey(row.key)}
                        onClick={() => isAircraft
                          ? onAircraftSelect(row.id, originId)
                          : onOrbitalSelect(row.id, originId)}
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
            <p className="control-note control-note--muted">
              {isAircraft
                ? 'Individual observations, not cluster symbols or fading last-local samples.'
                : 'Modeled ground positions, not live telemetry or optical visibility. Includes a bounded Starlink sample, not the full constellation. Predicted passes are separate in More.'}
            </p>
            {!isAircraft && orbits.selectedOutside && (
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
