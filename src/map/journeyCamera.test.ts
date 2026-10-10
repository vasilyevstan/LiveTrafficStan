import { describe, expect, it, vi } from 'vitest'
import { LngLat, LngLatBounds, MercatorCoordinate, type LngLatBoundsLike } from 'maplibre-gl'
import type { JourneySnapshot } from '../domain/journey'
import { chooseJourneyCamera, journeyIsFramed, largestJourneyFitRect } from './journeyCamera'

const snapshot: JourneySnapshot = {
  revision: 1, identity: 'aircraft:test', kind: 'aircraft', title: 'Test',
  capturedAt: 1_800_000_000_000,
  position: { latitude: 0, longitude: 179, observedAt: 1_800_000_000_000 },
  segments: [{
    phase: 'remaining', certainty: 'estimated', source: 'Test',
    points: [{ latitude: 0, longitude: 179 }, { latitude: 1, longitude: -179 }],
  }],
  endpoints: [], limitations: [], sources: [],
}
const padding = { left: 20, right: 20, top: 20, bottom: 20 }

describe('one-shot journey framing', () => {
  it('uses the largest unobscured area for desktop, mobile and a magnified viewport', () => {
    const desktop = largestJourneyFitRect({ left: 0, right: 1280, top: 0, bottom: 900 }, [
      { left: 16, right: 386, top: 120, bottom: 642 },
      { left: 1188, right: 1264, top: 16, bottom: 470 },
      { left: 16, right: 296, top: 16, bottom: 104 },
    ])!
    expect(desktop.left).toBeGreaterThanOrEqual(386)
    expect(desktop.right).toBeLessThanOrEqual(1188)
    for (const offset of [0, 80]) {
      const mobile = largestJourneyFitRect({ left: offset, right: offset + 315, top: 0, bottom: 517 }, [
        { left: offset, right: offset + 315, top: 0, bottom: 212 },
        { left: offset, right: offset + 315, top: 417, bottom: 517 },
      ])!
      expect(mobile).toEqual({ left: offset + 20, right: offset + 295, top: 212, bottom: 417 })
    }
    expect(largestJourneyFitRect({ left: 0, right: 60, top: 0, bottom: 60 }, [])).toBeUndefined()
  })

  it('keeps an antimeridian path narrow and only evaluates cameras without moving the map', () => {
    const map = {
      cameraForBounds: vi.fn().mockReturnValue({ center: [180, 0.5], zoom: 6, bearing: 0 }),
    }
    const fit = chooseJourneyCamera(map, snapshot, padding)
    expect(fit.kind).toBe('available')
    if (fit.kind !== 'available') return
    expect(fit.bounds).toEqual([[179, 0], [181, 1]])
    expect(map.cameraForBounds).toHaveBeenCalledExactlyOnceWith(
      [[179, 0], [181, 1]],
      { padding, bearing: 0, maxZoom: 12 },
    )
    expect(fit.camera.bearing).toBe(0)
  })

  it('declines polar, unsafe-wide or unsupported fits explicitly instead of changing projection', () => {
    const map = { cameraForBounds: vi.fn().mockReturnValue(undefined) }
    expect(chooseJourneyCamera(map, snapshot, undefined).kind).toBe('unavailable')
    expect(chooseJourneyCamera(map, snapshot, padding).kind).toBe('unavailable')
    const polar = { ...snapshot, endpoints: [{ latitude: 89, longitude: 0, label: 'Pole', role: 'stop' as const }] }
    expect(chooseJourneyCamera(map, polar, padding).kind).toBe('unavailable')
    const wide = { ...snapshot, endpoints: [{ latitude: 0, longitude: 0, label: 'Opposite', role: 'stop' as const }] }
    expect(chooseJourneyCamera(map, wide, padding).kind).toBe('unavailable')
    expect(map.cameraForBounds).toHaveBeenCalledOnce()
  })

  it('keeps diagonal routes north-up instead of rotating to gain zoom', () => {
    const map = {
      cameraForBounds: vi.fn((value: LngLatBoundsLike) => {
        const bounds = LngLatBounds.convert(value)
        const sw = MercatorCoordinate.fromLngLat(bounds.getSouthWest())
        const ne = MercatorCoordinate.fromLngLat(bounds.getNorthEast())
        return {
          center: new MercatorCoordinate((sw.x + ne.x) / 2, (sw.y + ne.y) / 2).toLngLat(),
          zoom: Math.log2(Math.min(300 / (ne.x - sw.x), 800 / (sw.y - ne.y)) / 512),
        }
      }),
    }
    const diagonal = {
      ...snapshot, position: { latitude: 0, longitude: 0, observedAt: snapshot.capturedAt },
      segments: [{ ...snapshot.segments[0]!, points: [
        { latitude: 10, longitude: -10 }, { latitude: -10, longitude: 10 },
      ] }],
    }
    const fit = chooseJourneyCamera(map, diagonal, padding)
    if (fit.kind !== 'available') throw new Error('Expected actual-geometry fit')
    expect(fit.camera.bearing).toBe(0)
    expect(map.cameraForBounds).toHaveBeenCalledOnce()
    expect(fit.camera.zoom).toBe(map.cameraForBounds.mock.results[0]!.value.zoom)
    const center = LngLat.convert(fit.camera.center)
    expect(center.lng).toBeCloseTo(0)
    expect(center.lat).toBeCloseTo(0)
  })

  it('reports declined fits and cannot inherit an arbitrary fitted bearing', () => {
    const map = {
      cameraForBounds: vi.fn().mockReturnValue({ center: [180, 0.5], zoom: 6, bearing: 47 }),
    }
    const fit = chooseJourneyCamera(map, snapshot, padding)
    expect(fit.kind === 'available' && fit.camera.bearing).toBe(0)
    map.cameraForBounds.mockImplementation(() => { throw new Error('Unsupported fit') })
    expect(chooseJourneyCamera(map, snapshot, padding)).toEqual({
      kind: 'unavailable', message: 'Path framing unavailable. Explore or return to local view.',
    })
  })

  it('checks actual projected visibility and rejects an occluded back-side globe point', () => {
    const onePoint = { ...snapshot, segments: [], endpoints: [{ latitude: 0, longitude: 179, label: 'Captured', role: 'captured' as const }] }
    const map = {
      getCenter: vi.fn().mockReturnValue({ lng: 180 }),
      getCanvas: vi.fn().mockReturnValue({ clientWidth: 315, clientHeight: 517 }),
      project: vi.fn().mockReturnValue({ x: 150, y: 250 }),
      unproject: vi.fn().mockReturnValue({ lat: 0, lng: 179 }),
    }
    expect(journeyIsFramed(map, onePoint, padding)).toBe(true)
    map.unproject.mockReturnValue({ lat: 0, lng: 1 })
    expect(journeyIsFramed(map, onePoint, padding)).toBe(false)
    map.project.mockReturnValue({ x: 3, y: 250 })
    expect(journeyIsFramed(map, onePoint, padding)).toBe(false)
  })
})
