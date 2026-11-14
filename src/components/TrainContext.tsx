import { formatAge } from '../domain/format'
import { trainCategoryLabel, trainSummary, type DisplayTrain } from '../domain/trains'
import { TRAIN_SOURCES } from '../providers/rail/trainSources'
import { ObjectResultButton } from './ObjectResultButton'

interface TrainContextProps {
  trains: readonly DisplayTrain[]
  selectedTrainId: string | null
  emptyMessage: string
  resultLimit: number
  now: number
  onSelect: (id: string, originId: string) => void
}

export function TrainContext({
  trains,
  selectedTrainId,
  emptyMessage,
  resultLimit,
  now,
  onSelect,
}: TrainContextProps) {
  const listed = trains.slice(0, resultLimit)

  return (
    <fieldset className="control-group vessel-discovery train-context">
      <legend>Trains in this view</legend>
      <div className="vessel-discovery__summary">
        <p role="status">
          {trains.length} train{trains.length === 1 ? '' : 's'}
        </p>
        <p>Reported positions; not predicted.</p>
      </div>

      {trains.length === 0 ? (
        <p className="control-note" role="status">
          {emptyMessage}
        </p>
      ) : (
        <ul className="vessel-results" aria-label="Trains in this view">
          {listed.map((train) => (
            <li key={train.id}>
              <ObjectResultButton
                prefix="train-context-result"
                aria-pressed={train.id === selectedTrainId}
                onSelect={(originId) => onSelect(train.id, originId)}
              >
                <strong>{trainSummary(train)}</strong>
                <span>
                  {trainCategoryLabel(train.category)} ·{' '}
                  {TRAIN_SOURCES[train.sourceId].name} ·{' '}
                  {formatAge(train.observedAt, now)}
                  {train.freshness === 'stale' ? ' · stale' : ''}
                </span>
              </ObjectResultButton>
            </li>
          ))}
        </ul>
      )}

      {trains.length > resultLimit && (
        <p className="control-note control-note--muted">
          First {resultLimit} of {trains.length} shown.
        </p>
      )}
    </fieldset>
  )
}
