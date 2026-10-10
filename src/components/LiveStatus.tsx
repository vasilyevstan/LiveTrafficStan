import { formatAge, formatTimestamp } from '../domain/format'
import type { ProviderStatus } from '../domain/traffic'
import type { MarineProviderCapabilities } from '../providers/types'

interface LiveStatusProps {
  aircraftCount: number
  vesselCount: number
  aircraftStatus: ProviderStatus
  marineStatus: ProviderStatus
  marineCapabilities: MarineProviderCapabilities
  now: number
  online: boolean
  historicalAt?: number
  orbitalSummary?: string
  trafficContext?: boolean
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
  aircraftCount,
  vesselCount,
  aircraftStatus,
  marineStatus,
  marineCapabilities,
  now,
  online,
  historicalAt,
  orbitalSummary,
  trafficContext = false,
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
      : allPaused
        ? 'PAUSED'
        : liveCount === 2
          ? partialSources ? 'PARTIAL' : 'LIVE'
          : liveCount === 1 && errorCount === 1
            ? 'PARTIAL'
            : errorCount === 2
              ? 'OFFLINE'
              : 'CONNECTING'
  const latestUpdate = Math.max(
    aircraftStatus.lastDataAt ?? 0,
    marineStatus.lastDataAt ?? 0,
  )

  return (
    <section
      className={`live-status live-status--${mode.toLowerCase()}`}
      aria-live={historicalAt === undefined ? 'polite' : undefined}
      aria-label={
        historicalAt === undefined
          ? 'Traffic provider status'
          : 'Historical traffic status'
      }
    >
      <span className="live-status__mode">
        <span className="live-status__dot" aria-hidden="true" />
        <strong>{mode}</strong>
      </span>
      <details
        className="live-status__disclosure"
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !event.currentTarget.open) return
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.open = false
          event.currentTarget.querySelector('summary')?.focus()
        }}
      >
        <summary>
          <span className="live-status__summary">
            {trafficContext && historicalAt === undefined ? (
              <>
                <span>Last local sample</span>
                <span>Live updates paused</span>
              </>
            ) : (
              <>
                <span>{aircraftCount} aircraft</span>
                <span title={marineCapabilities.coverage.label}>
                  {vesselCount} ships shown ·{' '}
                  {marineCapabilities.coverage.kind === 'global-best-effort'
                    ? 'global sources' : 'regional source'}
                </span>
              </>
            )}
          </span>
          <span className="live-status__updated">
            <span>
              {historicalAt === undefined
                ? `updated ${formatAge(latestUpdate || undefined, now)}`
                : `at ${formatTimestamp(historicalAt)}`}
            </span>
            <span className="live-status__disclosure-label">
              Provider details
            </span>
          </span>
        </summary>
        <div className="live-status__providers">
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
          {orbitalSummary && (
            <span
              className="live-status__orbital"
              aria-hidden="true"
            >
              {orbitalSummary}
            </span>
          )}
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
          <span>
            Photos: <a href="https://www.planespotters.net/photo/api" target="_blank" rel="noreferrer">Planespotters</a>
            {' · '}<a href="https://openwaters.io/ais/" target="_blank" rel="noreferrer">Open Waters</a>
            {' / '}<a href="https://commons.wikimedia.org/" target="_blank" rel="noreferrer">Wikimedia Commons</a>.
            Each image carries its own artist and licence.
          </span>
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
          <span className="live-status__credits">
            Airport context: <a href="https://ourairports.com/data/" target="_blank" rel="noreferrer">OurAirports</a>.
            {' '}Generalized ports: <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Natural Earth</a>.
            {' '}Both are public domain. Weather observations:{' '}
            <a href="https://aviationweather.gov/data/api/" target="_blank" rel="noreferrer">NOAA/NWS Aviation Weather Center</a>
            {' '}(U.S. public domain unless marked otherwise).
            {' '}Modeled orbits: <a href="https://celestrak.org/" target="_blank" rel="noreferrer">CelesTrak</a>, not live telemetry.
          </span>
          </details>
        </div>
      </details>
    </section>
  )
}
