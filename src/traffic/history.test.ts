import { describe, expect, it } from 'vitest'
import type { Aircraft } from '../domain/traffic'
import { updateTrailHistory } from './history'

const config = {
  durationMs: 15 * 60_000,
  maxPointsPerEntity: 3,
}

const aircraft = (
  observedAt: number,
  latitude: number,
  longitude: number,
): Aircraft => ({
  id: 'aircraft:test',
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
})
