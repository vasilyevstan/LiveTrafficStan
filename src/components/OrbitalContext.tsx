import { useEffect, useMemo, useRef, useState } from 'react'
import { formatTimestamp } from '../domain/format'
import {
  orbitalFeatureId,
  orbitalInternationalDesignatorLabel,
  orbitalObjectTypeLabel,
  type OrbitalControllerState,
  type OrbitalObject,
  type OrbitalObjectType,
  type OrbitalSourceGroup,
} from '../domain/orbital'
import {
  discoverOrbitalCatalog,
  orbitalCatalogPage,
  type OrbitalDiscoveryFilters,
  type OrbitalDisplaySelection,
  type OrbitalPopulationCounts,
} from '../domain/orbitalDiscovery'
import { orbitalEnrichmentForPosition } from '../domain/orbitalEnrichment'

interface OrbitalContextProps {
  state: OrbitalControllerState
  selectedId: string | null
  horizonMs: number
  now: number
  filters: OrbitalDiscoveryFilters
  display: OrbitalDisplaySelection
  counts: OrbitalPopulationCounts
  maximumQueryLength: number
  pageSize: number
  onFiltersChange: (filters: OrbitalDiscoveryFilters) => void
  onSelect: (id: string, originId: string) => void
}

const futureTime = (timestamp: number, now: number) => {
  const minutes = Math.max(0, Math.round((timestamp - now) / 60_000))
  return `${formatTimestamp(timestamp)} · in ${minutes} min`
}

const sourceGroupLabel = (group: OrbitalSourceGroup) => {
  switch (group) {
    case 'visual':
      return 'Visual catalog'
    case 'stations':
      return 'Stations'
    case 'weather':
      return 'Weather'
    case 'gnss':
      return 'GNSS'
    case 'science':
      return 'Science'
  }
}

const TYPE_OPTIONS: readonly {
  value: 'all' | OrbitalObjectType
  label: string
}[] = [
  { value: 'all', label: 'All types' },
  { value: 'PAY', label: 'Payload' },
  { value: 'R/B', label: 'Rocket body' },
  { value: 'DEB', label: 'Debris' },
  { value: 'UNK', label: 'Unknown' },
]

const positionStatus = (
  record: OrbitalObject,
  state: OrbitalControllerState,
) =>
  state.positions.some(
    ({ noradCatalogId }) =>
      noradCatalogId === record.noradCatalogId,
  )

export function OrbitalContext({
  state,
  selectedId,
  horizonMs,
  now,
  filters,
  display,
  counts,
  maximumQueryLength,
  pageSize,
  onFiltersChange,
  onSelect,
}: OrbitalContextProps) {
  const [view, setView] = useState<'nearby' | 'catalog'>('nearby')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const restorePageFocusRef = useRef(false)
  const horizonMinutes = Math.round(horizonMs / 60_000)
  const snapshot = state.snapshot
  const catalogResults = useMemo(
    () =>
      snapshot
        ? discoverOrbitalCatalog(snapshot.records, query, filters)
        : [],
    [filters, query, snapshot],
  )
  const catalogPage = orbitalCatalogPage(catalogResults, page, pageSize)
  const selectedPosition = selectedId
    ? state.positions.find(({ id }) => id === selectedId)
    : undefined

  useEffect(() => {
    if (page === catalogPage.page) return
    setPage(catalogPage.page)
  }, [catalogPage.page, page])

  useEffect(() => {
    if (!restorePageFocusRef.current) return
    restorePageFocusRef.current = false
    const first = catalogPage.rows[0]
    if (!first) return
    globalThis.requestAnimationFrame(() => {
      document
        .getElementById(
          `orbital-catalog-result-${first.noradCatalogId}`,
        )
        ?.focus()
    })
  }, [catalogPage.page, catalogPage.rows])

  const changePage = (nextPage: number) => {
    restorePageFocusRef.current = true
    setPage(nextPage)
  }

  const updateFilters = (next: OrbitalDiscoveryFilters) => {
    setPage(0)
    onFiltersChange(next)
  }

  const selectedExceptionMessage = display.selectedException
    ? display.selectedFiltered
      ? '+1 selected exception is shown outside the matching exact type and source-group totals.'
      : '1 matching selected exception is included in SHOWN despite the current zoom tier.'
    : undefined
  const nearbyResults =
    counts.futureCrossingCount === undefined
      ? []
      : state.prediction.results

  return (
    <fieldset className="control-group vessel-discovery orbital-context">
      <legend>Modeled orbital objects</legend>
      <div
        className="control-options control-options--two orbital-context__views"
        role="group"
        aria-label="Orbital results view"
      >
        <button
          type="button"
          className={view === 'nearby' ? 'is-active' : undefined}
          aria-pressed={view === 'nearby'}
          onClick={() => setView('nearby')}
        >
          NEARBY
        </button>
        <button
          type="button"
          className={view === 'catalog' ? 'is-active' : undefined}
          aria-pressed={view === 'catalog'}
          onClick={() => setView('catalog')}
        >
          CATALOG
        </button>
      </div>

      <div className="vessel-discovery__summary orbital-context__counts">
        <p>
          {counts.inFootprintCount === undefined
            ? `MAP-AREA COUNTS UNAVAILABLE · ${counts.modeledMatchCount} MODELED`
            : `${counts.shownInFootprintCount ?? 0} SHOWN · ${counts.inFootprintCount} IN MAP · ${
                counts.futureCrossingCount === undefined
                  ? 'PASSES UPDATING'
                  : `${counts.futureCrossingCount} ${
                      counts.futureCrossingCount === 1 ? 'PASS' : 'PASSES'
                    } ≤${horizonMinutes}M`
              }`}
        </p>
        <p>
          {counts.catalogCount} catalog · {counts.acceptedCount} accepted ·{' '}
          {counts.modeledNowCount} modeled now · {counts.catalogMatchCount}{' '}
          catalog matches · {counts.modeledMatchCount} modeled matches.
        </p>
        {display.zoomHiddenCount > 0 && (
          <p>
            {display.zoomHiddenCount} matching modeled{' '}
            {display.zoomHiddenCount === 1 ? 'object is' : 'objects are'}{' '}
            hidden by this zoom tier.
          </p>
        )}
        {counts.catalogMatchCount > counts.modeledMatchCount && (
          <p>
            {counts.catalogMatchCount - counts.modeledMatchCount} matching{' '}
            catalog{' '}
            {counts.catalogMatchCount - counts.modeledMatchCount === 1
              ? 'object has'
              : 'objects have'}{' '}
            no safe current position.
          </p>
        )}
        {selectedExceptionMessage && <p>{selectedExceptionMessage}</p>}
        <p>SGP4 geographic model; not live or optical visibility.</p>
      </div>

      {view === 'nearby' ? (
        <>
          {nearbyResults.length === 0 ? (
            <p className="control-note">
              {counts.catalogMatchCount === 0
                ? 'No catalog objects match the current exact filters.'
                : counts.modeledMatchCount === 0
                  ? 'Matching catalog objects have no safe current position.'
                  : state.prediction.message ??
                    'No current map presence or crossing in this window.'}
            </p>
          ) : (
            <ul
              className="vessel-results orbital-results"
              aria-label="Nearby modeled orbital objects"
            >
              {nearbyResults.map((result) => {
                const position = state.positions.find(
                  ({ id }) => id === result.id,
                )
                const enrichment = position
                  ? orbitalEnrichmentForPosition(position)
                  : undefined
                const originId = `orbital-context-result-${result.noradCatalogId}`
                return (
                  <li key={result.id}>
                    <button
                      id={originId}
                      type="button"
                      aria-pressed={result.id === selectedId}
                      disabled={!position}
                      onClick={() => onSelect(result.id, originId)}
                    >
                      <strong>{result.name}</strong>
                      <span>
                        {orbitalObjectTypeLabel(result.objectType)} · NORAD{' '}
                        {result.noradCatalogId} ·{' '}
                        {!position
                          ? 'Position unavailable'
                          : result.currentlyInView
                            ? 'in map now'
                            : result.firstCrossingAt === undefined
                              ? 'crossing time unavailable'
                              : futureTime(result.firstCrossingAt, now)}
                      </span>
                      <span className="orbital-context__purpose">
                        Purpose:{' '}
                        {enrichment?.purpose.shortLabel ??
                          'unavailable for this exact NORAD ID'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {counts.futureCrossingCount !== undefined &&
            state.prediction.totalResults > nearbyResults.length && (
            <p className="control-note control-note--muted">
              First {nearbyResults.length} of{' '}
              {state.prediction.totalResults} nearby rows shown.
            </p>
          )}
        </>
      ) : (
        <>
          <label className="vessel-discovery__label" htmlFor="orbital-query">
            Search complete catalog
          </label>
          <input
            id="orbital-query"
            type="search"
            value={query}
            maxLength={maximumQueryLength}
            placeholder="Name, NORAD ID, or designator"
            onChange={(event) => {
              setQuery(event.currentTarget.value.slice(0, maximumQueryLength))
              setPage(0)
            }}
          />
          <div className="vessel-discovery__filters orbital-context__filters">
            <label>
              <span>Exact type</span>
              <select
                value={filters.objectType}
                onChange={(event) =>
                  updateFilters({
                    ...filters,
                    objectType: event.currentTarget
                      .value as OrbitalDiscoveryFilters['objectType'],
                  })
                }
              >
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Exact source group</span>
              <select
                value={filters.sourceGroup}
                onChange={(event) =>
                  updateFilters({
                    ...filters,
                    sourceGroup: event.currentTarget
                      .value as OrbitalDiscoveryFilters['sourceGroup'],
                  })
                }
              >
                <option value="all">All source groups</option>
                {snapshot?.sources.map(({ group }) => (
                  <option key={group} value={group}>
                    {sourceGroupLabel(group)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="vessel-discovery__summary">
            <p>
              {catalogPage.rangeStart}-{catalogPage.rangeEnd} of{' '}
              {catalogPage.listedRowCount} listed rows · page{' '}
              {catalogPage.page + 1} of {catalogPage.pageCount}.
            </p>
            <p>
              Text changes only this list. Exact type and source-group filters
              also change local map and crossing eligibility.
            </p>
          </div>

          {catalogPage.rows.length === 0 ? (
            <p className="control-note">
              {query.trim()
                ? 'No catalog objects match this text and the exact filters.'
                : 'No catalog objects match the current exact filters.'}
            </p>
          ) : (
            <ul
              className="vessel-results orbital-results orbital-catalog-results"
              aria-label="Complete orbital catalog results"
            >
              {catalogPage.rows.map((record) => {
                const id = orbitalFeatureId(record.noradCatalogId)
                const hasPosition = positionStatus(record, state)
                const originId = `orbital-catalog-result-${record.noradCatalogId}`
                return (
                  <li key={record.noradCatalogId}>
                    <button
                      id={originId}
                      type="button"
                      aria-pressed={id === selectedId}
                      aria-disabled={!hasPosition}
                      onClick={() => {
                        if (hasPosition) onSelect(id, originId)
                      }}
                    >
                      <strong>{record.name}</strong>
                      <span>
                        {orbitalObjectTypeLabel(record.objectType)} · NORAD{' '}
                        {record.noradCatalogId} ·{' '}
                        {orbitalInternationalDesignatorLabel(
                          record.internationalDesignator,
                        )}
                      </span>
                      <span>
                        {hasPosition
                          ? id === selectedId && display.selectedException
                            ? 'Selected exception · safe current position'
                            : 'Safe current position'
                          : 'Position unavailable'}
                        {' · '}
                        {record.sourceGroups
                          .map(sourceGroupLabel)
                          .join(', ')}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div
            className="orbital-context__pagination"
            role="group"
            aria-label="Catalog pages"
          >
            <button
              type="button"
              disabled={catalogPage.page === 0}
              onClick={() => changePage(catalogPage.page - 1)}
            >
              PREVIOUS
            </button>
            <button
              type="button"
              disabled={catalogPage.page >= catalogPage.pageCount - 1}
              onClick={() => changePage(catalogPage.page + 1)}
            >
              NEXT
            </button>
          </div>
          {selectedPosition && display.selectedException && (
            <p className="control-note">{selectedExceptionMessage}</p>
          )}
        </>
      )}
    </fieldset>
  )
}
