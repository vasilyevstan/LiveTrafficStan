import { formatTimestamp } from '../domain/format'
import {
  orbitalObjectTypeLabel,
  type OrbitalControllerState,
} from '../domain/orbital'

interface OrbitalContextProps {
  state: OrbitalControllerState
  selectedId: string | null
  horizonMs: number
  now: number
  onSelect: (id: string) => void
}

const futureTime = (timestamp: number, now: number) => {
  const minutes = Math.max(0, Math.round((timestamp - now) / 60_000))
  return `${formatTimestamp(timestamp)} · in ${minutes} min`
}

export function OrbitalContext({
  state,
  selectedId,
  horizonMs,
  now,
  onSelect,
}: OrbitalContextProps) {
  const { prediction } = state
  const horizonMinutes = Math.round(horizonMs / 60_000)

  return (
    <fieldset className="control-group vessel-discovery orbital-context">
      <legend>Modeled orbital objects</legend>
      <div className="vessel-discovery__summary">
        <p role="status">
          {prediction.mode === 'world'
            ? `${prediction.inViewCount} modeled objects over the visible world`
            : prediction.mode === 'invalid'
              ? 'Crossing count unavailable for this view'
              : `${prediction.inViewCount} in view · ${prediction.futureCrossingCount} crossing within ${horizonMinutes} min`}
        </p>
        <p>SGP4 model; not live telemetry.</p>
      </div>

      {prediction.results.length === 0 ? (
        <p className="control-note">
          {prediction.message ??
            'No crossing in this window.'}
        </p>
      ) : (
        <ul
          className="vessel-results orbital-results"
          aria-label="Modeled orbital objects for this view"
        >
          {prediction.results.map((result) => (
            <li key={result.id}>
              <button
                id={`orbital-context-result-${result.noradCatalogId}`}
                type="button"
                aria-pressed={result.id === selectedId}
                onClick={() => onSelect(result.id)}
              >
                <strong>{result.name}</strong>
                <span>
                  {orbitalObjectTypeLabel(result.objectType)} · NORAD{' '}
                  {result.noradCatalogId} ·{' '}
                  {result.currentlyInView
                    ? 'in view now'
                    : result.firstCrossingAt === undefined
                      ? 'crossing time unavailable'
                      : futureTime(result.firstCrossingAt, now)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {prediction.totalResults > prediction.results.length && (
        <p className="control-note control-note--muted">
          First {prediction.results.length} of {prediction.totalResults} shown.
        </p>
      )}
    </fieldset>
  )
}
