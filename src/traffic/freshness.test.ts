import { describe, expect, it } from 'vitest'
import type { Aircraft } from '../domain/traffic'
import { displayTraffic, trafficFreshness } from './freshness'

const thresholds = {
  staleAfterMs: 10_000,
  expireAfterMs: 30_000,
}

const aircraft = (observedAt: number): Aircraft => ({
  id: 'aircraft:test',
  kind: 'aircraft',
  provider: 'test',
  hex: 'ABC123',
  position: {
    latitude: 59,
    longitude: 24,
    observedAt,
  },
  receivedAt: observedAt,
  markerIcon: 'aircraft',
  markerScale: 1,
})

describe('traffic freshness', () => {
  it('transitions current data through stale to expired', () => {
    const now = 100_000
    expect(trafficFreshness(now - 5_000, now, thresholds)).toBe('live')
    expect(trafficFreshness(now - 20_000, now, thresholds)).toBe('stale')
    expect(trafficFreshness(now - 31_000, now, thresholds)).toBe('expired')
  })

  it('removes expired traffic from display data', () => {
    const now = 100_000
    const displayed = displayTraffic(
      [aircraft(now - 5_000), { ...aircraft(now - 31_000), id: 'expired' }],
      now,
      thresholds,
    )

    expect(displayed).toHaveLength(1)
    expect(displayed[0]?.freshness).toBe('live')
  })
})
