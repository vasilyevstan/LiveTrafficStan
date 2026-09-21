import { describe, expect, it } from 'vitest'
import { TRAFFIC_MARKER_ICONS } from '../domain/traffic'
import {
  RENDER_ONLY_MARKER_ICONS,
  TRAFFIC_STYLE_IMAGE_IDS,
} from '../domain/trafficPresentation'
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

  it('keeps render-only vessel shapes outside persisted marker IDs', () => {
    for (const icon of RENDER_ONLY_MARKER_ICONS) {
      expect(TRAFFIC_MARKER_ICONS).not.toContain(icon)
      expect(TRAFFIC_STYLE_IMAGE_IDS).toContain(icon)
    }
  })
})
