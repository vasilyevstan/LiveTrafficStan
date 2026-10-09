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
  live: boolean
  state: OrbitalControllerState
  selectedId: string | null
  counts: OrbitalPopulationCounts
  horizonMs: number
  pageSize: number
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
  live,
  state,
  selectedId,
  counts,
  horizonMs,
  pageSize,
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
  const active = parentVisible && live
  const status = active ? stateMessage(state) : undefined
  const sampleLabel = snapshot?.starlink.sampleAlgorithm.includes('shell')
    ? 'Shell-balanced sample'
    : 'Systematic sample'

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
    <section
      className="control-group orbital-starlink"
      aria-labelledby="starlink-sample-heading"
    >
      <div className="orbital-starlink__heading">
        <h3 id="starlink-sample-heading" className="eyebrow">
          Starlink sample
        </h3>
      </div>

      <p className="control-note">
        Included with ORBITS. A bounded sample, not the full constellation.
      </p>
      {!parentVisible && (
        <p className="control-note">
          Enable ORBITS above to load and model the
          sample.
        </p>
      )}
      {!live && (
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
          <dl
            className="orbital-summary-metrics"
            aria-label="Starlink sample summary"
          >
            <div>
              <dt>Modeled</dt>
              <dd>{counts.modeledNowCount}</dd>
              <span>of {snapshot.recordCount} sampled</span>
            </div>
            <div>
              <dt>In map</dt>
              <dd>
                {counts.inFootprintCount === undefined
                  ? '—'
                  : counts.inFootprintCount}
              </dd>
              <span>
                {counts.inFootprintCount === undefined
                  ? 'Area unavailable'
                  : `${counts.shownInFootprintCount ?? 0} shown`}
              </span>
            </div>
            <div>
              <dt>Next {horizonMinutes}m</dt>
              <dd>
                {counts.futureCrossingCount === undefined
                  ? counts.inFootprintCount === undefined
                    ? '—'
                    : '…'
                  : counts.futureCrossingCount}
              </dd>
              <span>
                {counts.futureCrossingCount === undefined
                  ? counts.inFootprintCount === undefined
                    ? 'Unavailable'
                    : 'Updating'
                  : counts.futureCrossingCount === 1
                    ? 'map pass'
                    : 'map passes'}
              </span>
            </div>
          </dl>

          <div className="vessel-discovery__summary orbital-context__counts orbital-starlink__provenance">
            <p>
              {sampleLabel} from{' '}
              {snapshot.starlink.populationCount.toLocaleString('en-US')}{' '}
              source objects.
            </p>
            {snapshot.starlink.shells && (
              <p>
                {snapshot.starlink.shells.length} inclination bands ·{' '}
                {snapshot.starlink.shells
                  .map((shell) => shell.sampleCount)
                  .join('/')} sampled.
              </p>
            )}
            <p>
              GP{' '}
              {formatTimestamp(
                Date.parse(snapshot.starlink.sources.gp.retrievedAt),
              )}
              {' · '}SATCAT{' '}
              {formatTimestamp(
                Date.parse(snapshot.starlink.sources.satcat.retrievedAt),
              )}
            </p>
            <p>
              Not the full constellation. SGP4 modeled, not live telemetry,
              optical visibility, or operational status.
            </p>
          </div>

          <div className="vessel-discovery__summary orbital-starlink__page">
            <p>
              {catalogPage.rangeStart}-{catalogPage.rangeEnd} of{' '}
              {catalogPage.listedRowCount} sampled objects · page{' '}
              {catalogPage.page + 1}/{catalogPage.pageCount}.
            </p>
          </div>

          <ul
            className="vessel-results orbital-results orbital-catalog-results"
            aria-label={`${sampleLabel} results`}
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
    </section>
  )
}
