import { describe, expect, it } from 'vitest'
import { initialTrainSourceStatuses, type TrainSourceStatuses } from './TrainController'
import { TRAIN_COVERAGE_SUMMARY, trainLayerStatus } from './trainLayerStatus'

const statuses = (
  overrides: Partial<{ [K in keyof TrainSourceStatuses]: Partial<TrainSourceStatuses[K]> }>,
): TrainSourceStatuses => {
  const initial = initialTrainSourceStatuses()
  return Object.fromEntries(
    Object.entries(initial).map(([id, status]) => [
      id,
      { ...status, ...overrides[id as keyof TrainSourceStatuses] },
    ]),
  ) as unknown as TrainSourceStatuses
}

describe('train layer status', () => {
  it('keeps HISTORY, unsafe views, and uncovered views distinct', () => {
    expect(trainLayerStatus({
      statuses: statuses({ fintraffic: { active: true } }),
      viewportAvailable: true,
      historyActive: true,
      shownCount: 0,
    }).notes).toEqual(['Trains are live only and hidden in HISTORY.'])
    expect(trainLayerStatus({
      statuses: statuses({}),
      viewportAvailable: false,
      historyActive: false,
      shownCount: 0,
    }).emptyMessage).toBe('Zoom in to see trains.')
    const uncovered = trainLayerStatus({
      statuses: statuses({}),
      viewportAvailable: true,
      historyActive: false,
      shownCount: 0,
    })
    expect(uncovered.emptyMessage).toBe(
      `No live train source covers this view. Coverage: ${TRAIN_COVERAGE_SUMMARY}.`,
    )
    expect(TRAIN_COVERAGE_SUMMARY).toContain('Finland')
  })

  it('separates loading, successful empty, and per-source failure', () => {
    const loading = trainLayerStatus({
      statuses: statuses({ entur: { active: true, phase: 'loading' } }),
      viewportAvailable: true,
      historyActive: false,
      shownCount: 0,
    })
    expect(loading).toEqual({
      busy: true,
      notes: ['Loading Entur.'],
      emptyMessage: 'Loading trains.',
    })

    const mixed = trainLayerStatus({
      statuses: statuses({
        fintraffic: { active: true, phase: 'live', lastSuccessAt: 1 },
        entur: { active: true, phase: 'error', error: 'HTTP 503', lastSuccessAt: 1 },
      }),
      viewportAvailable: true,
      historyActive: false,
      shownCount: 0,
    })
    expect(mixed).toEqual({
      busy: false,
      notes: ['Entur unavailable: HTTP 503. Showing earlier reports until they expire.'],
      emptyMessage: 'No trains reported in this view.',
    })

    expect(trainLayerStatus({
      statuses: statuses({ mbta: { active: true, phase: 'error', error: 'Rate limited' } }),
      viewportAvailable: true,
      historyActive: false,
      shownCount: 0,
    })).toEqual({
      busy: false,
      notes: ['MBTA unavailable: Rate limited.'],
      emptyMessage: 'No train reports are available for this view.',
    })
  })
})
