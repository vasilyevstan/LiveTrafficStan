import { describe, expect, it } from 'vitest'
import { marineTrafficPause } from './marineTrafficPause'

const query = {
  center: { latitude: 59.437, longitude: 24.754, label: 'Area' },
  radiusKm: 100,
}

describe('marine traffic pause composition', () => {
  it('keeps the existing network lifecycle when the viewport exceeds marine range', () => {
    expect(marineTrafficPause(null, false, true, false)).toEqual({
      networkPaused: false,
      viewportPaused: true,
    })
    expect(marineTrafficPause(query, false, true, false)).toEqual({
      networkPaused: false,
      viewportPaused: false,
    })
  })

  it('still pauses the network for visibility, offline, and intentional capture reasons', () => {
    expect(marineTrafficPause(null, true, true, false).networkPaused).toBe(true)
    expect(marineTrafficPause(null, false, false, false).networkPaused).toBe(true)
    expect(marineTrafficPause(null, false, true, true).networkPaused).toBe(true)
  })
})
