import { describe, expect, it } from 'vitest'
import type { Aircraft } from '../domain/traffic'
import {
  hasActiveMotion,
  reconcileMotionStates,
  sampleMotion,
} from './interpolation'

const aircraft = (latitude: number, longitude: number): Aircraft => ({
  id: 'aircraft:test',
  kind: 'aircraft',
  provider: 'test',
  hex: 'ABC123',
  position: {
    latitude,
    longitude,
    observedAt: 1,
  },
  receivedAt: 1,
  markerIcon: 'aircraft',
  markerScale: 1,
})

describe('position interpolation', () => {
  it('moves only between observed targets and stops exactly at the target', () => {
    const initial = reconcileMotionStates(new Map(), [aircraft(59, 24)], 0, 1_000)
    const moved = reconcileMotionStates(
      initial,
      [aircraft(60, 26)],
      1_000,
      1_000,
    )
    const state = moved.get('aircraft:test')
    expect(state).toBeDefined()

    expect(sampleMotion(state!, 1_500)).toMatchObject({
      latitude: 59.5,
      longitude: 25,
    })
    expect(sampleMotion(state!, 3_000)).toMatchObject({
      latitude: 60,
      longitude: 26,
    })
    expect(hasActiveMotion(moved, 1_500)).toBe(true)
    expect(hasActiveMotion(moved, 2_000)).toBe(false)
  })

  it('does not restart motion when only non-position fields change', () => {
    const initial = reconcileMotionStates(new Map(), [aircraft(59, 24)], 0, 1_000)
    const sameTarget = reconcileMotionStates(
      initial,
      [{ ...aircraft(59, 24), callsign: 'TEST' }],
      500,
      1_000,
    )

    expect(sameTarget.get('aircraft:test')).toBe(initial.get('aircraft:test'))
  })
})
