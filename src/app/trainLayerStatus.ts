import { TRAIN_SOURCE_IDS } from '../domain/trains'
import { TRAIN_SOURCES } from '../providers/rail/trainSources'
import type { TrainSourceStatuses } from './TrainController'

export const TRAIN_COVERAGE_SUMMARY = TRAIN_SOURCE_IDS
  .map((sourceId) => TRAIN_SOURCES[sourceId].coverage)
  .join('; ')

export interface TrainLayerStatus {
  busy: boolean
  /** Truthful, ordered notes: coverage, loading, per-source failures. */
  notes: string[]
  emptyMessage: string
}

interface TrainLayerStatusInput {
  statuses: TrainSourceStatuses
  viewportAvailable: boolean
  historyActive: boolean
  shownCount: number
}

export const trainLayerStatus = ({
  statuses,
  viewportAvailable,
  historyActive,
  shownCount,
}: TrainLayerStatusInput): TrainLayerStatus => {
  if (historyActive) {
    return {
      busy: false,
      notes: ['Trains are live only and hidden in HISTORY.'],
      emptyMessage: 'Trains are live only and hidden in HISTORY.',
    }
  }
  if (!viewportAvailable) {
    return {
      busy: false,
      notes: ['Zoom in to see trains.'],
      emptyMessage: 'Zoom in to see trains.',
    }
  }
  const active = TRAIN_SOURCE_IDS.map((sourceId) => statuses[sourceId]).filter(
    (status) => status.active,
  )
  if (active.length === 0) {
    const message = `No live train source covers this view. Coverage: ${TRAIN_COVERAGE_SUMMARY}.`
    return { busy: false, notes: [message], emptyMessage: message }
  }
  const loading = active.filter(
    (status) => status.lastSuccessAt === undefined && status.phase !== 'error',
  )
  const failed = active.filter((status) => status.phase === 'error')
  const notes = [
    ...failed.map((status) =>
      `${TRAIN_SOURCES[status.sourceId].name} unavailable: ${
        (status.error ?? 'request failed').replace(/\.$/, '')}.${
        status.lastSuccessAt === undefined ? '' : ' Showing earlier reports until they expire.'}`),
    ...(loading.length > 0
      ? [`Loading ${loading.map((status) => TRAIN_SOURCES[status.sourceId].name).join(', ')}.`]
      : []),
  ]
  const answered = active.some((status) => status.lastSuccessAt !== undefined)
  return {
    busy: loading.length > 0,
    notes,
    emptyMessage: answered && shownCount === 0
      ? 'No trains reported in this view.'
      : loading.length > 0
        ? 'Loading trains.'
        : 'No train reports are available for this view.',
  }
}
