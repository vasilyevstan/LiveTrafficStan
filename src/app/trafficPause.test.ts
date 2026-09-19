import { describe, expect, it } from 'vitest'
import { shouldPauseTraffic } from './trafficPause'

const query = {
  center: { latitude: 59, longitude: 24, label: 'Test' },
  radiusKm: 20,
}

describe('shouldPauseTraffic', () => {
  it('composes offline, hidden, and ineligible pause reasons', () => {
    expect(shouldPauseTraffic(query, false, true)).toBe(false)
    expect(shouldPauseTraffic(query, false, false)).toBe(true)
    expect(shouldPauseTraffic(query, true, true)).toBe(true)
    expect(shouldPauseTraffic(null, false, true)).toBe(true)
  })
})
