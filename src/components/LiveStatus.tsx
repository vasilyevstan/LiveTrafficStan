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
}: LiveStatusProps) {
  const statuses = [aircraftStatus, marineStatus]
  const allPaused = statuses.every((status) => status.paused)
  const liveCount = statuses.filter((status) => status.phase === 'live').length
  const errorCount = statuses.filter((status) => status.phase === 'error').length
  const mode =
    historicalAt !== undefined
      ? 'HISTORY'
      : !online
        ? 'OFFLINE'
      : allPaused
        ? 'PAUSED'
        : liveCount === 2
          ? 'LIVE'
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
      <div className="live-status__summary">
        <span className="live-status__dot" aria-hidden="true" />
        <strong>{mode}</strong>
        <span aria-hidden="true">/</span>
        <span>{aircraftCount} aircraft</span>
        <span aria-hidden="true">/</span>
        <span title={marineCapabilities.coverage.label}>
          {vesselCount} ships shown · regional source
        </span>
        <span aria-hidden="true">/</span>
        <span>
          {historicalAt === undefined
            ? `updated ${formatAge(latestUpdate || undefined, now)}`
            : `at ${formatTimestamp(historicalAt)}`}
        </span>
      </div>
      <div className="live-status__providers">
        {!online && historicalAt === undefined && (
          <span>
            Live traffic is unavailable while the browser is offline
          </span>
        )}
        {historicalAt !== undefined && (
          <span>
            {online
              ? 'Live acquisition continues in the background when eligible'
              : 'Browser offline; local playback remains available'}
          </span>
        )}
        <span title={aircraftStatus.error}>
          {providerLabel('Aircraft', aircraftStatus)}
        </span>
        <span title={marineStatus.error}>
          {providerLabel('Marine stream', marineStatus, 'connected')}
        </span>
        <span>{marineCapabilities.coverage.label}</span>
      </div>
    </section>
  )
}
