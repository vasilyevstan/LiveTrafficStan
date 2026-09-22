import { describe, expect, it } from 'vitest'
import { TRAFFIC_MARKER_ICONS } from '../domain/traffic'
import {
  AIRCRAFT_ALTITUDE_BANDS,
  AIRCRAFT_ALTITUDE_MARKER_ICONS,
  RENDER_ONLY_MARKER_ICONS,
  TRAFFIC_STYLE_IMAGE_IDS,
} from '../domain/trafficPresentation'
import {
  aircraftAltitudeColors,
  trafficIconTreatment,
} from './icons'

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

  it('keeps bounded altitude colors on aircraft silhouettes', () => {
    expect(AIRCRAFT_ALTITUDE_MARKER_ICONS).toHaveLength(20)
    for (const band of AIRCRAFT_ALTITUDE_BANDS) {
      const light = aircraftAltitudeColors('light', band)
      const dark = aircraftAltitudeColors('dark', band)
      expect(light.fill).toMatch(/^#(?:[0-9a-f]{6})$/i)
      expect(dark.fill).toMatch(/^#(?:[0-9a-f]{6})$/i)
      expect(light.fill).not.toBe(dark.fill)
    }
    expect(new Set(AIRCRAFT_ALTITUDE_MARKER_ICONS).size).toBe(20)
    expect(TRAFFIC_STYLE_IMAGE_IDS).toEqual(
      expect.arrayContaining(AIRCRAFT_ALTITUDE_MARKER_ICONS),
    )
  })
})
