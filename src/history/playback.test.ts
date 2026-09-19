import { describe, expect, it } from 'vitest'
import type { Aircraft } from '../domain/traffic'
import {
  createObservationIndex,
  historicalRange,
  historicalSnapshot,
  historicalSnapshotFromIndexes,
  historicalTrailSegments,
  historicalTrailSegmentsFromIndexes,
  initialPlaybackState,
  mergeHistoricalObservations,
  playbackReducer,
} from './playback'
import {
  projectHistoricalObservation,
  type HistoricalObservation,
} from './observations'

const aircraft = (
  id: string,
  observedAt: number,
  latitude: number,
): Aircraft => ({
  id,
  kind: 'aircraft',
  provider: 'ADSB.lol',
  hex: id.replace('aircraft:', '').toUpperCase(),
  position: { observedAt, latitude, longitude: 24 },
  receivedAt: observedAt,
  markerIcon: 'aircraft',
  markerScale: 1,
})

const observation = (
  id: string,
  observedAt: number,
  latitude: number,
  segmentId = 'segment-a',
) =>
  projectHistoricalObservation(aircraft(id, observedAt, latitude), {
    sessionId: 'session',
    segmentId,
  }) as HistoricalObservation

describe('history playback', () => {
  it('enters paused, scrubs, advances at speed, and stops at the frozen end', () => {
    let state = playbackReducer(initialPlaybackState, {
      type: 'enter',
      range: { oldest: 1_000, newest: 5_000 },
    })
    state = playbackReducer(state, { type: 'scrub', cursor: 2_000 })
    state = playbackReducer(state, { type: 'set-speed', speed: 2 })
    state = playbackReducer(state, { type: 'play' })
    state = playbackReducer(state, { type: 'tick', elapsedMs: 2_000 })

    expect(state).toEqual({
      mode: 'history-paused',
      cursor: 5_000,
      range: { oldest: 1_000, newest: 5_000 },
      speed: 2,
    })
    expect(playbackReducer(state, { type: 'return-live' })).toEqual({
      mode: 'live',
    })
  })

  it('selects the newest observation at or before the cursor', () => {
    const records = [
      observation('aircraft:a', 1_000, 59),
      observation('aircraft:a', 3_000, 60),
      observation('aircraft:b', 2_000, 61),
    ]
    const snapshot = historicalSnapshot(createObservationIndex(records), 2_500)

    expect(snapshot.map((entity) => [entity.id, entity.position.latitude])).toEqual(
      [
        ['aircraft:a', 59],
        ['aircraft:b', 61],
      ],
    )
    expect(historicalRange(records)).toEqual({ oldest: 1_000, newest: 3_000 })
  })

  it('deduplicates durable/session overlap with durable winning', () => {
    const session = observation('aircraft:a', 1_000, 59)
    const durable = { ...session, latitude: 60 }

    expect(mergeHistoricalObservations([durable], [session])).toEqual([
      durable,
    ])

    expect(
      historicalSnapshotFromIndexes(
        [
          createObservationIndex([session]),
          createObservationIndex([durable]),
        ],
        1_000,
      ),
    ).toMatchObject([
      {
        id: 'aircraft:a',
        position: { latitude: 60 },
      },
    ])
  })

  it('breaks selected trails on source gaps and navigation segments', () => {
    const records = [
      observation('aircraft:a', 1_000, 59),
      observation('aircraft:a', 2_000, 59.1),
      observation('aircraft:a', 200_000, 59.2),
      observation('aircraft:a', 210_000, 59.3, 'segment-b'),
    ]

    expect(
      historicalTrailSegments(
        createObservationIndex(records),
        'aircraft:a',
        220_000,
        300_000,
        { aircraft: 120_000, vessel: 600_000 },
      ).map((segment) => segment.map((point) => point.observedAt)),
    ).toEqual([[1_000, 2_000], [200_000], [210_000]])
  })

  it('combines durable and session indexes without rebuilding full history', () => {
    const durable = [
      observation('aircraft:a', 1_000, 59),
      observation('aircraft:a', 2_000, 59.1),
      observation('aircraft:b', 1_000, 60),
    ]
    const session = [
      observation('aircraft:a', 2_000, 59.2),
      observation('aircraft:a', 3_000, 59.3),
    ]
    const indexes = [
      createObservationIndex(session),
      createObservationIndex(durable),
    ]

    expect(
      historicalSnapshotFromIndexes(indexes, 3_000).map((entity) => [
        entity.id,
        entity.position.observedAt,
        entity.position.latitude,
      ]),
    ).toEqual([
      ['aircraft:a', 3_000, 59.3],
      ['aircraft:b', 1_000, 60],
    ])
    expect(
      historicalTrailSegmentsFromIndexes(
        indexes,
        'aircraft:a',
        3_000,
        10_000,
        { aircraft: 120_000, vessel: 600_000 },
      ).flat(),
    ).toMatchObject([
      { observedAt: 1_000, latitude: 59 },
      { observedAt: 2_000, latitude: 59.1 },
      { observedAt: 3_000, latitude: 59.3 },
    ])
  })
})
