import { describe, expect, it } from 'vitest'
import {
  acknowledgeSavedActivity,
  emptySavedActivityState,
  observeSavedActivity,
  savedActivityLabel,
  type SavedActivityObservation,
} from './savedActivity'
import type { SavedObject } from './savedObjects'

const aircraft: SavedObject = {
  kind: 'aircraft',
  id: 'abc123',
  savedLabel: 'TEST123',
  savedAt: 1,
  registration: 'ES-ABC',
}

const observation = (
  phase: 'suspended' | 'current' | 'noncurrent' | 'conflict',
  revision = 1,
  overrides: Partial<SavedActivityObservation> = {},
): SavedActivityObservation => ({
  entry: aircraft,
  objectKey: 'aircraft:abc123',
  contextKey: 'view-1',
  state:
    phase === 'suspended'
      ? { phase }
      : phase === 'conflict'
        ? {
            phase,
            revision,
            signature: 'ES-ABC:ES-NEW',
            detail: 'Saved registration ES-ABC · current ES-NEW',
          }
        : { phase, revision },
  ...overrides,
})

describe('Saved activity', () => {
  it('silently baselines startup, context changes, and suspended lifecycles', () => {
    let state = observeSavedActivity(
      emptySavedActivityState(),
      [observation('current')],
      10,
      20,
    )
    expect(state.records).toEqual([])
    state = observeSavedActivity(
      state,
      [observation('noncurrent', 2, { contextKey: 'view-2' })],
      20,
      20,
    )
    state = observeSavedActivity(
      state,
      [observation('current', 3, { contextKey: 'view-2' })],
      30,
      20,
    )
    expect(state.records.map(savedActivityLabel)).toEqual([
      'Received in current map data',
    ])
    state = observeSavedActivity(
      state,
      [observation('suspended', 4)],
      40,
      20,
    )
    state = observeSavedActivity(
      state,
      [observation('current', 5)],
      50,
      20,
    )
    expect(state.records).toHaveLength(1)
  })

  it('reports later scoped reception once per valid noncurrent transition', () => {
    let state = observeSavedActivity(
      emptySavedActivityState(),
      [observation('noncurrent')],
      10,
      20,
    )
    state = observeSavedActivity(
      state,
      [observation('current', 2)],
      20,
      20,
    )
    expect(state.records.map(savedActivityLabel)).toEqual([
      'Received in current map data',
    ])
    const unchanged = state
    state = observeSavedActivity(
      state,
      [observation('current', 2)],
      30,
      20,
    )
    expect(state).toBe(unchanged)
    expect(state.records).toHaveLength(1)
    state = observeSavedActivity(
      state,
      [observation('noncurrent', 3)],
      40,
      20,
    )
    state = observeSavedActivity(
      state,
      [observation('current', 4)],
      50,
      20,
    )
    expect(state.records.map(savedActivityLabel)).toEqual([
      'Received again in current map data',
      'Received in current map data',
    ])
  })

  it('deduplicates identity conflicts and modeled crossings', () => {
    const satellite: SavedObject = {
      kind: 'orbital',
      id: '25544',
      savedLabel: 'ISS',
      savedAt: 1,
      internationalDesignator: '1998-067A',
    }
    const crossing: SavedActivityObservation = {
      entry: satellite,
      objectKey: 'orbital:25544',
      contextKey: 'orbital-view',
      state: { phase: 'current', revision: 1 },
      crossing: {
        signature: '25544:1000',
        firstCrossingAt: 1000,
      },
    }
    let state = observeSavedActivity(
      emptySavedActivityState(),
      [observation('current'), crossing],
      10,
      20,
    )
    expect(state.records).toEqual([])
    state = observeSavedActivity(
      state,
      [observation('conflict', 2), {
        ...crossing,
        state: { phase: 'current', revision: 2 },
        crossing: {
          signature: '25544:2000',
          firstCrossingAt: 2000,
        },
      }],
      20,
      20,
    )
    expect(state.records.map(savedActivityLabel)).toEqual([
      'Upcoming modeled crossing of the current map area',
      'Reported identity changed',
    ])
    state = observeSavedActivity(
      state,
      [observation('conflict', 3), {
        ...crossing,
        state: { phase: 'current', revision: 3 },
        crossing: {
          signature: '25544:2000',
          firstCrossingAt: 2000,
        },
      }],
      30,
      20,
    )
    expect(state.records).toHaveLength(2)
  })

  it('does not treat orbital position availability as traffic reception', () => {
    const satellite: SavedObject = {
      kind: 'orbital',
      id: '25544',
      savedLabel: 'ISS',
      savedAt: 1,
    }
    const orbital = (
      phase: 'current' | 'noncurrent',
      revision: number,
    ): SavedActivityObservation => ({
      entry: satellite,
      objectKey: 'orbital:25544',
      contextKey: 'orbital-view',
      state: { phase, revision },
    })
    let state = observeSavedActivity(
      emptySavedActivityState(),
      [orbital('noncurrent', 1)],
      10,
      20,
    )
    state = observeSavedActivity(
      state,
      [orbital('current', 2)],
      20,
      20,
    )
    expect(state.records).toEqual([])
  })

  it('bounds records, removes unsaved object activity, and acknowledges unread', () => {
    let state = emptySavedActivityState()
    state = observeSavedActivity(
      state,
      [observation('noncurrent')],
      1,
      2,
    )
    for (let revision = 2; revision <= 6; revision += 1) {
      state = observeSavedActivity(
        state,
        [
          observation(
            revision % 2 === 0 ? 'current' : 'noncurrent',
            revision,
          ),
        ],
        revision,
        2,
      )
    }
    expect(state.records).toHaveLength(2)
    expect(state.unreadIds.size).toBe(2)
    state = acknowledgeSavedActivity(state)
    expect(state.unreadIds.size).toBe(0)
    state = observeSavedActivity(state, [], 7, 2)
    expect(state.records).toEqual([])
    expect(state.trackers.size).toBe(0)
  })
})
