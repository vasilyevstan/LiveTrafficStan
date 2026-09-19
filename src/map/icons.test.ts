import { describe, expect, it } from 'vitest'
import { trafficIconTreatment } from './icons'

describe('trafficIconTreatment', () => {
  it('preserves traffic-kind color identity with theme-specific edges', () => {
    const light = trafficIconTreatment('light')
    const dark = trafficIconTreatment('dark')

    expect(light.aircraftFill).not.toBe(dark.aircraftFill)
    expect(light.vesselFill).not.toBe(dark.vesselFill)
    expect(light.outerEdge).not.toBe(dark.outerEdge)
    expect(light.innerEdge).not.toBe(dark.innerEdge)

    expect(light.aircraftFill).toMatch(/^#(?:[0-9a-f]{6})$/i)
    expect(dark.aircraftFill).toMatch(/^#(?:[0-9a-f]{6})$/i)
    expect(light.vesselFill).toMatch(/^#(?:[0-9a-f]{6})$/i)
    expect(dark.vesselFill).toMatch(/^#(?:[0-9a-f]{6})$/i)
  })
})
