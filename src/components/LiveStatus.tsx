import { formatAge } from '../domain/format'
import type { ProviderStatus } from '../domain/traffic'

interface LiveStatusProps {
  aircraftCount: number
  vesselCount: number
  aircraftStatus: ProviderStatus
  marineStatus: ProviderStatus
  now: number
}

const providerLabel = (name: string, status: ProviderStatus) => {
  if (status.paused) return `${name} paused`
  if (status.phase === 'error') return `${name} unavailable`
  if (status.updating) return `${name} updating area`
  if (status.phase === 'loading' || status.phase === 'idle') {
    return `${name} connecting`
  }
  return `${name} current`
}

export function LiveStatus({
  aircraftCount,
  vesselCount,
  aircraftStatus,
  marineStatus,
  now,
}: LiveStatusProps) {
  const statuses = [aircraftStatus, marineStatus]
  const allPaused = statuses.every((status) => status.paused)
  const liveCount = statuses.filter((status) => status.phase === 'live').length
  const errorCount = statuses.filter((status) => status.phase === 'error').length
  const mode = allPaused
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
      aria-live="polite"
      aria-label="Traffic provider status"
    >
      <div className="live-status__summary">
        <span className="live-status__dot" aria-hidden="true" />
        <strong>{mode}</strong>
        <span aria-hidden="true">/</span>
        <span>{aircraftCount} aircraft</span>
        <span aria-hidden="true">/</span>
        <span>{vesselCount} ships</span>
        <span aria-hidden="true">/</span>
        <span>updated {formatAge(latestUpdate || undefined, now)}</span>
      </div>
      <div className="live-status__providers">
        <span title={aircraftStatus.error}>
          {providerLabel('Aircraft', aircraftStatus)}
        </span>
        <span title={marineStatus.error}>
          {providerLabel('Marine', marineStatus)}
        </span>
      </div>
    </section>
  )
}
