import type { ReactNode } from 'react'
import { formatAge, formatTimestamp } from '../domain/format'
import { workspaceOwnsFullscreen } from '../app/fullscreen'
import type { ProviderStatus } from '../domain/traffic'
import type { MarineProviderCapabilities } from '../providers/types'

interface LiveStatusProps {
  compact?: boolean
  aircraftCount: number
  vesselCount: number
  aircraftStatus: ProviderStatus
  marineStatus: ProviderStatus
  marineCapabilities: MarineProviderCapabilities
  now: number
  online: boolean
  historicalAt?: number
  trafficContext?: boolean
  scopeLabel?: string
  viewportPaused?: boolean
  viewportNotice?: ReactNode
}

const providerLabel = (
  name: string,
  status: ProviderStatus,
  healthyState = 'current',
) => {
  if (status.paused) return `${name} paused`
  if (status.phase === 'error') return `${name} unavailable`
  if (status.updating) return `${name} updating area`
  if (status.phase === 'loading' || status.phase === 'idle') {
    return `${name} connecting`
  }
  return `${name} ${healthyState}`
}

export function LiveStatus({
  compact = false,
  aircraftCount,
  vesselCount,
  aircraftStatus,
  marineStatus,
  marineCapabilities,
  now,
  online,
  historicalAt,
  trafficContext = false,
  scopeLabel,
  viewportPaused = false,
  viewportNotice,
}: LiveStatusProps) {
  const statuses = [aircraftStatus, marineStatus]
  const allPaused = statuses.every((status) => status.paused)
  const liveCount = statuses.filter((status) => status.phase === 'live').length
  const errorCount = statuses.filter((status) => status.phase === 'error').length
  const partialSources = marineCapabilities.coverage.kind === 'global-best-effort' &&
    marineStatus.phase === 'live' && Boolean(marineStatus.error)
  const mode =
    historicalAt !== undefined
      ? 'HISTORY'
      : !online
        ? 'OFFLINE'
      : viewportPaused || allPaused
        ? 'PAUSED'
        : liveCount === 2
          ? partialSources ? 'PARTIAL' : 'LIVE'
          : liveCount === 1 && errorCount === 1
            ? 'PARTIAL'
            : errorCount === 2
              ? 'UNAVAILABLE'
              : 'CONNECTING'
  const latestUpdate = Math.max(
    aircraftStatus.lastDataAt ?? 0,
    marineStatus.lastDataAt ?? 0,
  )

  return (
    <section
      className={`live-status live-status--${mode.toLowerCase()}`}
      aria-live={historicalAt === undefined && !viewportPaused ? 'polite' : undefined}
      aria-label={
        historicalAt === undefined
          ? scopeLabel ? `Traffic provider status · ${scopeLabel}` : 'Traffic provider status'
          : 'Historical traffic status'
      }
    >
      <span className="live-status__mode">
        <span className="live-status__dot" aria-hidden="true" />
        <strong>{viewportPaused && mode === 'PAUSED' ? 'VIEW PAUSED' : mode}</strong>
      </span>
      <details
        className="live-status__disclosure"
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !event.currentTarget.open ||
            workspaceOwnsFullscreen(event.currentTarget)) return
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.open = false
          event.currentTarget.querySelector('summary')?.focus()
        }}
      >
        <summary>
          <span className="live-status__summary">
            {scopeLabel && historicalAt === undefined ? (
              <span title={`${aircraftCount} aircraft · ${vesselCount} ships shown`}>{scopeLabel}</span>
            ) : trafficContext && historicalAt === undefined ? (
              <>
                <span>Last local sample</span>
                {(!compact || !viewportPaused) && <span>Live updates paused</span>}
              </>
            ) : (
              <>
                <span>{aircraftCount} aircraft</span>
                <span title={marineCapabilities.coverage.label}>
                  {compact ? `${vesselCount} ships` :
                    `${vesselCount} ships shown · ${marineCapabilities.coverage.kind === 'global-best-effort'
                      ? 'global sources' : 'regional source'}`}
                </span>
              </>
            )}
          </span>
          <span className="live-status__updated">
            <span>
              {historicalAt === undefined
                ? `${compact ? '' : 'updated '}${formatAge(latestUpdate || undefined, now)}`
                : `at ${formatTimestamp(historicalAt)}`}
            </span>
            <span className="live-status__disclosure-label">
              {compact ? 'Details' : 'Provider details'}
            </span>
          </span>
        </summary>
        <div className="live-status__providers">
          {compact && (
            <div className="mobile-disclosure-heading">
              <strong>Provider details</strong>
              <button type="button" aria-label="Close provider details" onClick={event => {
                const disclosure = event.currentTarget.closest('details')
                if (disclosure) {
                  disclosure.open = false
                  disclosure.querySelector('summary')?.focus({ preventScroll: true })
                }
              }}>Close</button>
            </div>
          )}
          {scopeLabel && <span>{scopeLabel}: {aircraftCount} aircraft · {vesselCount} ships shown in enabled layers.</span>}
          {!online && historicalAt === undefined && (
            <span>
              Browser offline; live updates unavailable.
            </span>
          )}
          {historicalAt !== undefined && (
            <span>
              {online
                ? 'Eligible live acquisition continues in the background.'
                : 'Browser offline; local playback remains available'}
            </span>
          )}
          <div title={aircraftStatus.error}>
            {providerLabel('Aircraft', aircraftStatus)}
            {' · '}<a href="https://www.adsb.lol/" target="_blank" rel="noreferrer">ADSB.lol</a>
            {aircraftStatus.error && (
              <details className="context-details">
                <summary>Aircraft error details</summary>
                <span className="live-status__error">{aircraftStatus.error}</span>
              </details>
            )}
          </div>
          <div title={marineStatus.error}>
            {providerLabel('Marine stream', marineStatus, 'connected')}
            <span className="live-status__sources">
              <a href="https://www.digitraffic.fi/en/marine-traffic/" target="_blank" rel="noreferrer">Digitraffic</a>
              {marineCapabilities.coverage.kind === 'global-best-effort' && <>
                {' · '}<a href="https://aisstream.io/" target="_blank" rel="noreferrer">AISStream</a>
                {' · '}<a href="https://openwaters.io/ais/" target="_blank" rel="noreferrer">Open Waters AIS</a>
              </>}
            </span>
            {marineStatus.error && (
              <details className="context-details">
                <summary>Marine error details</summary>
                <span className="live-status__error">{marineStatus.error}</span>
              </details>
            )}
          </div>
          <span>{marineCapabilities.coverage.kind === 'global-best-effort'
            ? 'Best-effort receiver coverage.'
            : 'Regional receiver coverage.'}</span>
          <details className="context-details">
            <summary>Sources &amp; data rights</summary>
            <span>{marineCapabilities.coverage.label}</span>
          {marineCapabilities.coverage.kind === 'global-best-effort' && (
            <span>
              Open Waters network inputs: AISHub, Kystverket, BarentsWatch,
              Digitraffic, AISStream and volunteer receivers. The sources
              credited on each ship identify the data actually used.
            </span>
          )}
          <span className="live-status__credits">
            ADSB.lol: <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL 1.0</a>.
            {' '}Source: Fintraffic / digitraffic.fi, license{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC 4.0 BY</a>.
            {' '}Traffic is filtered, normalized and deduplicated.
          </span>
          {marineCapabilities.coverage.kind === 'global-best-effort' && (
            <span className="live-status__credits">
              Contains data under the{' '}
              <a href="https://data.norge.no/nlod/en/2.0" target="_blank" rel="noreferrer">Norwegian licence for Open Government data (NLOD)</a>
              {' '}distributed by the Norwegian Coastal Administration.
              {' '}Data delivered by BarentsWatch. AISHub attribution is carried
              through each contributing record. Open Waters volunteer receptions:{' '}
              <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer">CC0</a>;
              {' '}volunteer aggregate:{' '}
              <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL</a>.
              {' '}<a href="https://openwaters.io/ais/#license" target="_blank" rel="noreferrer">Original-source terms</a>.
            </span>
          )}
          </details>
          {compact && viewportNotice}
        </div>
      </details>
    </section>
  )
}
