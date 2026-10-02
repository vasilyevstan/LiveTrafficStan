import { useEffect, useRef, useState } from 'react'
import { formatTimestamp } from '../domain/format'
import {
  isStarlinkOrbitalCatalogSnapshot,
  orbitalFeatureId,
  orbitalInternationalDesignatorLabel,
  orbitalObjectTypeLabel,
  type OrbitalControllerState,
} from '../domain/orbital'
import {
  orbitalCatalogPage,
  type OrbitalPopulationCounts,
} from '../domain/orbitalDiscovery'

interface StarlinkContextProps {
  parentVisible: boolean
  enabled: boolean
  live: boolean
  state: OrbitalControllerState
  selectedId: string | null
  counts: OrbitalPopulationCounts
  horizonMs: number
  pageSize: number
  onEnabledChange: (enabled: boolean) => void
  onSelect: (id: string, originId: string) => void
  onRetry: () => void
}

const stateMessage = (state: OrbitalControllerState) => {
  switch (state.phase) {
    case 'loading':
      return 'Loading the Starlink sample.'
    case 'refreshing':
      return state.positions.length > 0
        ? 'Refreshing the sample; safe modeled positions are retained.'
        : 'Preparing the refreshed sample; positions are temporarily unavailable.'
    case 'stale':
      return state.message ?? 'The Starlink sample is stale.'
    case 'unavailable':
    case 'offline':
    case 'clock-invalid':
    case 'paused-hidden':
    case 'paused-history':
      return state.message
    case 'empty':
      return state.message ?? 'The sample loaded without a safe position.'
    case 'disabled':
    case 'ready':
      return state.message
  }
}

export function StarlinkContext({
  parentVisible,
  enabled,
  live,
  state,
  selectedId,
  counts,
  horizonMs,
  pageSize,
  onEnabledChange,
  onSelect,
  onRetry,
}: StarlinkContextProps) {
  const [page, setPage] = useState(0)
  const restorePageFocusRef = useRef(false)
  const snapshot =
    state.snapshot &&
    isStarlinkOrbitalCatalogSnapshot(state.snapshot)
      ? state.snapshot
      : undefined
  const catalogPage = orbitalCatalogPage(
    snapshot?.records ?? [],
    page,
    pageSize,
  )
  const horizonMinutes = Math.round(horizonMs / 60_000)
  const active = parentVisible && enabled && live
  const status = active ? stateMessage(state) : undefined

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
          `starlink-catalog-result-${first.noradCatalogId}`,
        )
        ?.focus()
    })
  }, [catalogPage.page, catalogPage.rows])

  const changePage = (nextPage: number) => {
    restorePageFocusRef.current = true
    setPage(nextPage)
  }

  return (
    <fieldset className="control-group orbital-starlink">
      <legend>Starlink systematic sample</legend>
      <div className="control-options">
        <button
          type="button"
          className={enabled ? 'is-active' : undefined}
          aria-pressed={enabled}
          onClick={() => onEnabledChange(!enabled)}
        >
          STARLINK {enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {!parentVisible && enabled && (
        <p className="control-note">
          Preference remembered. Enable ORBITS above to load and model the
          sample.
        </p>
      )}
      {!live && enabled && (
        <p className="control-note">
          Starlink modeling is paused during historical traffic playback.
        </p>
      )}
      {status && (
        <div className="control-note ports-status" role="status">
          <span>{status}</span>
          {['unavailable', 'clock-invalid'].includes(state.phase) && (
            <button type="button" onClick={onRetry}>
              RETRY STARLINK
            </button>
          )}
        </div>
      )}

      {active && snapshot && (
        <>
          <div className="vessel-discovery__summary orbital-context__counts">
            <p>
              {counts.modeledNowCount} SAFE MODELED / {snapshot.recordCount}{' '}
              SAMPLE RECORDS · SOURCE REPORTED{' '}
              {snapshot.starlink.populationCount.toLocaleString('en-US')}.
            </p>
            <p>
              {counts.inFootprintCount === undefined
                ? 'MAP-AREA COUNTS UNAVAILABLE'
                : `${counts.shownInFootprintCount ?? 0} SHOWN · ${counts.inFootprintCount} IN MAP`}
              {' · '}
              {counts.futureCrossingCount === undefined
                ? 'PASSES UPDATING'
                : `${counts.futureCrossingCount} ${
                    counts.futureCrossingCount === 1 ? 'PASS' : 'PASSES'
                  } ≤${horizonMinutes}M`}
            </p>
            <p>
              GP retrieved{' '}
              {formatTimestamp(
                Date.parse(snapshot.starlink.sources.gp.retrievedAt),
              )}
              {' · '}SATCAT retrieved{' '}
              {formatTimestamp(
                Date.parse(snapshot.starlink.sources.satcat.retrievedAt),
              )}
              {' · '}inclination/RAAN systematic sample, not the full
              constellation · SGP4, not live telemetry, optical visibility,
              or operational status.
            </p>
          </div>

          <div className="vessel-discovery__summary">
            <p>
              {catalogPage.rangeStart}-{catalogPage.rangeEnd} of{' '}
              {catalogPage.listedRowCount} sampled rows · page{' '}
              {catalogPage.page + 1} of {catalogPage.pageCount}.
            </p>
          </div>

          <ul
            className="vessel-results orbital-results orbital-catalog-results"
            aria-label="Starlink systematic sample results"
          >
            {catalogPage.rows.map((record) => {
              const id = orbitalFeatureId(
                record.noradCatalogId,
                'starlink',
              )
              const position = state.positions.find(
                (candidate) => candidate.id === id,
              )
              const crossing = state.prediction.results.find(
                (candidate) => candidate.id === id,
              )
              const originId =
                `starlink-catalog-result-${record.noradCatalogId}`
              return (
                <li key={record.noradCatalogId}>
                  <button
                    id={originId}
                    type="button"
                    aria-pressed={selectedId === id}
                    aria-disabled={!position}
                    onClick={() => {
                      if (position) onSelect(id, originId)
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
                      {!position
                        ? 'Position unavailable'
                        : crossing?.currentlyInView
                          ? 'Safe modeled position · in map now'
                          : crossing?.firstCrossingAt !== undefined
                            ? `Safe modeled position · next map crossing ${formatTimestamp(
                                crossing.firstCrossingAt,
                              )}`
                            : 'Safe modeled position'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div
            className="orbital-context__pagination"
            role="group"
            aria-label="Starlink sample pages"
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
        </>
      )}
    </fieldset>
  )
}
