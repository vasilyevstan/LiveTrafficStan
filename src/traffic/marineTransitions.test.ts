import { describe, expect, it } from 'vitest'
import { normalizeAisVessel } from '../providers/marine/digitrafficNormalization'
import { reconcileMotionStates } from './interpolation'

const vessel = (provider: string, name: string, longitude: number, observedAt: number) =>
  normalizeAisVessel(
    { mmsi: 230123456, latitude: 59.44, longitude, observedAt },
    { mmsi: 230123456, name, shipType: 37, lengthMeters: 9 },
    observedAt + 1, provider, provider,
  )

describe('marine source transitions', () => {
  it('retains observed motion across compatible source changes', () => {
    const first = vessel('Fintraffic Digitraffic', 'EXAMPLE', 24.75, 1_000)
    const initial = reconcileMotionStates(new Map(), [first], 1_000, 1_500)
    const second = vessel('AISStream', 'EXAMPLE', 24.751, 2_000)
    const next = reconcileMotionStates(initial, [second], 2_000, 1_500)
    expect(next.get(first.id)?.durationMs).toBe(1_500)
  })

  it('does not interpolate between conflicting identities from different sources', () => {
    const first = vessel('Fintraffic Digitraffic', 'EXAMPLE', 24.75, 1_000)
    const initial = reconcileMotionStates(new Map(), [first], 1_000, 1_500)
    const second = vessel('AISStream', 'OTHER', 24.751, 2_000)
    const next = reconcileMotionStates(initial, [second], 2_000, 1_500)
    expect(next.get(first.id)?.durationMs).toBe(0)
    expect(next.get(first.id)?.from).toEqual(second.position)
  })

  it('stops an in-flight interpolation even if the conflicting report shares its target', () => {
    const first = vessel('Fintraffic Digitraffic', 'EXAMPLE', 24.75, 1_000)
    const target = vessel('Fintraffic Digitraffic', 'EXAMPLE', 24.751, 2_000)
    const initial = reconcileMotionStates(new Map(), [first], 1_000, 1_500)
    const moving = reconcileMotionStates(initial, [target], 2_000, 1_500)
    const replacement = { ...target, provider: 'AISStream', name: 'OTHER' }
    const next = reconcileMotionStates(moving, [replacement], 2_500, 1_500)
    expect(next.get(first.id)?.durationMs).toBe(0)
  })
})
