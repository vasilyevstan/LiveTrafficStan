import { describe, expect, it } from 'vitest'
import type { Aircraft } from '../domain/traffic'
import type { HistoricalObservation } from './observations'
import { SessionObservationHistory } from './sessionHistory'

const config = {
  retentionMs: 60 * 60_000,
  maxRecords: 3,
  maxLogicalBytes: 1_000_000,
  sampleIntervalMs: 10_000,
}

const aircraft = (
  observedAt: number,
  receivedAt = observedAt,
  latitude = 59,
): Aircraft => ({
  id: 'aircraft:test',
  kind: 'aircraft',
  provider: 'ADSB.lol',
  hex: 'ABC123',
  position: { observedAt, latitude, longitude: 24 },
  receivedAt,
  markerIcon: 'aircraft',
  markerScale: 1,
})

describe('SessionObservationHistory', () => {
  it('samples only advancing source observations at ten-second intervals', () => {
    const history = new SessionObservationHistory(config)
    const context = { sessionId: 'session', segmentId: 'segment' }

    expect(
      history.ingest([aircraft(10_000)], context, 10_000).appended,
    ).toHaveLength(1)
    expect(
      history.ingest([aircraft(10_000, 11_000, 59.1)], context, 11_000)
        .appended,
    ).toHaveLength(0)
    expect(
      history.ingest([aircraft(19_999, 20_000, 59.1)], context, 20_000)
        .appended,
    ).toHaveLength(0)
    expect(
      history.ingest([aircraft(20_000, 20_000, 59)], context, 20_000)
        .appended,
    ).toHaveLength(1)

    expect(history.snapshot().records.map((record) => record.observedAt)).toEqual(
      [10_000, 20_000],
    )
  })

  it('retains stationary reports and prunes the oldest count first', () => {
    const history = new SessionObservationHistory(config)
    const context = { sessionId: 'session', segmentId: 'segment' }

    let removed: HistoricalObservation[] = []
    for (const observedAt of [10_000, 20_000, 30_000, 40_000]) {
      removed = history.ingest(
        [aircraft(observedAt)],
        context,
        observedAt,
      ).removed
    }

    expect(removed.map((record) => record.observedAt)).toEqual([10_000])
    expect(history.snapshot().records.map((record) => record.observedAt)).toEqual(
      [20_000, 30_000, 40_000],
    )
  })

  it('does not repopulate cleared history from a cached snapshot', () => {
    const history = new SessionObservationHistory(config)
    const context = { sessionId: 'session', segmentId: 'segment' }
    const cached = aircraft(10_000, 11_000)

    history.ingest([cached], context, 11_000)
    history.clear(12_000)
    history.ingest([cached], context, 13_000)

    expect(history.snapshot().records).toHaveLength(0)
    expect(
      history.ingest([aircraft(20_000, 20_000)], context, 20_000)
        .appended,
    ).toHaveLength(1)
  })
})
