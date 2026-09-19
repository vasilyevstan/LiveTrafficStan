import { describe, expect, it } from 'vitest'
import type { Aircraft } from '../domain/traffic'
import {
  takeNewTrailObservations,
  updateTrailHistory,
  updateTrailHistoryAfterNavigation,
} from './history'

const config = {
  durationMs: 15 * 60_000,
  maxPointsPerEntity: 3,
  maxTotalPoints: 10,
}

const aircraft = (
  observedAt: number,
  latitude: number,
  longitude: number,
  id = 'aircraft:test',
): Aircraft => ({
  id,
  kind: 'aircraft',
  provider: 'test',
  hex: 'ABC123',
  position: { observedAt, latitude, longitude },
  receivedAt: observedAt,
  markerIcon: 'aircraft',
  markerScale: 1,
})

describe('updateTrailHistory', () => {
  it('appends distinct observed positions and enforces the point cap', () => {
    let history = updateTrailHistory(
      new Map(),
      [aircraft(1_000, 59, 24)],
      1_000,
      config,
    )
    history = updateTrailHistory(
      history,
      [aircraft(2_000, 59.1, 24.1)],
      2_000,
      config,
    )
    history = updateTrailHistory(
      history,
      [aircraft(3_000, 59.2, 24.2)],
      3_000,
      config,
    )
    history = updateTrailHistory(
      history,
      [aircraft(4_000, 59.3, 24.3)],
      4_000,
      config,
    )

    expect(history.get('aircraft:test')?.map((point) => point.observedAt)).toEqual(
      [2_000, 3_000, 4_000],
    )
  })

  it('does not append duplicate coordinates and prunes old points', () => {
    const initial = new Map([
      [
        'aircraft:test',
        [
          { observedAt: 1_000, latitude: 59, longitude: 24 },
          { observedAt: 900_000, latitude: 59.1, longitude: 24.1 },
        ],
      ],
    ])

    const history = updateTrailHistory(
      initial,
      [aircraft(901_000, 59.1, 24.1)],
      901_001,
      config,
    )

    expect(history.get('aircraft:test')).toEqual([
      { observedAt: 900_000, latitude: 59.1, longitude: 24.1 },
    ])
  })

  it('drops pre-navigation points before accepting the current observation', () => {
    const previous = new Map([
      [
        'aircraft:test',
        [
          { observedAt: 1_000, latitude: 59, longitude: 24 },
          { observedAt: 2_000, latitude: 59.1, longitude: 24.1 },
        ],
      ],
    ])

    const history = updateTrailHistoryAfterNavigation(
      previous,
      [aircraft(3_000, 60, 25)],
      3_000,
      config,
      true,
    )

    expect(history.get('aircraft:test')).toEqual([
      { observedAt: 3_000, latitude: 60, longitude: 25 },
    ])
  })

  it('evicts the globally oldest points at the aggregate cap', () => {
    const boundedConfig = {
      ...config,
      maxPointsPerEntity: 10,
      maxTotalPoints: 3,
    }
    let history = updateTrailHistory(
      new Map(),
      [
        aircraft(1_000, 59, 24, 'aircraft:a'),
        aircraft(2_000, 59.1, 24.1, 'aircraft:b'),
      ],
      2_000,
      boundedConfig,
    )
    history = updateTrailHistory(
      history,
      [
        aircraft(3_000, 59.2, 24.2, 'aircraft:a'),
        aircraft(4_000, 59.3, 24.3, 'aircraft:b'),
      ],
      4_000,
      boundedConfig,
    )

    expect(history.get('aircraft:a')).toEqual([
      { observedAt: 3_000, latitude: 59.2, longitude: 24.2 },
    ])
    expect(history.get('aircraft:b')).toEqual([
      { observedAt: 2_000, latitude: 59.1, longitude: 24.1 },
      { observedAt: 4_000, latitude: 59.3, longitude: 24.3 },
    ])
  })

  it('does not restore a discarded observation after duration expansion', () => {
    const now = 15 * 60_000
    const oldObservation = aircraft(now - 7 * 60_000, 59, 24)
    const highWater = new Map<string, number>()
    const longConfig = {
      ...config,
      durationMs: 15 * 60_000,
    }
    const shortConfig = {
      ...config,
      durationMs: 5 * 60_000,
    }

    let history = updateTrailHistory(
      new Map(),
      takeNewTrailObservations([oldObservation], highWater, 10),
      now,
      longConfig,
    )
    history = updateTrailHistory(history, [], now, shortConfig)
    history = updateTrailHistory(
      history,
      takeNewTrailObservations([oldObservation], highWater, 10),
      now,
      longConfig,
    )

    expect(history.size).toBe(0)

    const newObservation = aircraft(now + 1_000, 59.1, 24.1)
    history = updateTrailHistory(
      history,
      takeNewTrailObservations([newObservation], highWater, 10),
      now + 1_000,
      longConfig,
    )

    expect(history.get('aircraft:test')).toEqual([
      { observedAt: now + 1_000, latitude: 59.1, longitude: 24.1 },
    ])
  })

  it('bounds observation high-water tracking by least-recently-seen entity', () => {
    const highWater = new Map<string, number>()

    takeNewTrailObservations(
      [
        aircraft(1_000, 59, 24, 'aircraft:a'),
        aircraft(2_000, 59.1, 24.1, 'aircraft:b'),
      ],
      highWater,
      2,
    )
    takeNewTrailObservations(
      [
        aircraft(3_000, 59.2, 24.2, 'aircraft:a'),
        aircraft(4_000, 59.3, 24.3, 'aircraft:c'),
      ],
      highWater,
      2,
    )

    expect([...highWater]).toEqual([
      ['aircraft:a', 3_000],
      ['aircraft:c', 4_000],
    ])
  })
})
