import { LngLat, type CameraOptions, type LngLatLike, type Map as MapLibreMap } from 'maplibre-gl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModeledOrbitalPosition } from '../domain/orbital'
import { orbitalViewUnavailableReason, type CapturedOrbitalView } from '../domain/orbitalView'
import { createCapturedOrbitalCamera, orbitalEyeCameraOptions } from './capturedOrbitalCamera'

const position: ModeledOrbitalPosition = {
  id: 'orbital:694', noradCatalogId: '694', name: 'Fixture',
  internationalDesignator: '1963-047A', objectType: 'R/B',
  sourceGroups: ['visual'], displayOrder: 0, elementEpoch: 1_000,
  snapshotRetrievedAt: 2_000, snapshotSha256: 'a'.repeat(64), modeledFor: 3_000,
  latitude: 0, longitude: 0, altitudeKm: 400, velocityKmPerSecond: 7.6,
}
const geometry = () => ({
  getMinZoom: () => -2,
  getMaxZoom: () => 22,
  getMaxPitch: () => 60,
  calculateCameraOptionsFromTo: vi.fn(
    (_from: LngLatLike, _height: number, target: LngLatLike, _ground?: number): CameraOptions =>
      ({ center: target, zoom: 5, bearing: 123, pitch: 0 }),
  ),
})

describe('captured orbital camera cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { setTimeout, clearTimeout })
    vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false, body: {}, activeElement: null }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  const fixture = () => {
    // Native DOM/MapLibre behavior is browser-qualified; this Node double isolates cleanup faults.
    const attributes = new Map([['aria-label', 'Ordinary map']])
    const canvas = Object.assign(new EventTarget(), {
      style: { visibility: 'visible', touchAction: 'none', cursor: '' },
      getAttribute: (key: string) => attributes.get(key) ?? null,
      setAttribute: (key: string, value: string) => attributes.set(key, value),
      removeAttribute: (key: string) => attributes.delete(key),
      hasPointerCapture: () => false,
      releasePointerCapture: vi.fn(),
      focus: vi.fn(),
    }) as unknown as HTMLCanvasElement
    const handler = (initial = true) => {
      let enabled = initial
      return { isEnabled: () => enabled, enable: () => { enabled = true }, disable: () => { enabled = false } }
    }
    const handlers = {
      dragPan: handler(), dragRotate: handler(false), scrollZoom: handler(false), touchZoomRotate: handler(),
      touchPitch: handler(), doubleClickZoom: handler(), keyboard: handler(), boxZoom: handler(),
    }
    const jumpTo = vi.fn<MapLibreMap['jumpTo']>().mockReturnThis()
    const once = vi.fn<(type: string, callback: () => void) => void>()
    const map = {
      ...geometry(), ...handlers, jumpTo, once,
      on: vi.fn<MapLibreMap['on']>(), off: vi.fn<MapLibreMap['off']>(),
      stop: vi.fn<MapLibreMap['stop']>(), getCanvas: () => canvas,
      getCenter: () => new LngLat(24.123456789, 59.654321987),
      getZoom: () => 11.123456, getBearing: () => 17.234567, getPitch: () => 22.345678,
      getRoll: () => 0.456789, getCenterElevation: () => 12.5,
      getPadding: () => ({ top: 17.4, bottom: 19.8, left: 13.2, right: 23.6 }),
    } as unknown as MapLibreMap
    const view: CapturedOrbitalView = {
      revision: 1, viewRequestId: 2, position,
      snapshot: {
        schemaVersion: 2, sourceContractVersion: 2, catalogId: 'fixture', sources: [], recordCount: 0,
        records: [], retrievedAt: new Date(2_000).toISOString(), publishedAt: new Date(2_000).toISOString(),
        sha256: 'a'.repeat(64),
      },
    }
    const callbacks = {
      onReturn: vi.fn(), onFailure: vi.fn(), onRestoreFailure: vi.fn(),
      onReady: vi.fn(), onNotice: vi.fn(),
    }
    const camera = createCapturedOrbitalCamera(map, view, callbacks)
    const expectRestoredInput = () => {
      expect(Object.values(handlers).map(handler => handler.isEnabled())).toEqual(
        [true, false, false, true, true, true, true, true],
      )
      expect(canvas.style).toEqual({ visibility: 'visible', touchAction: 'none', cursor: '' })
      expect(canvas.getAttribute('aria-label')).toBe('Ordinary map')
      expect(vi.getTimerCount()).toBe(0)
    }
    return { camera, canvas, callbacks, jumpTo, once, expectRestoredInput }
  }

  it('restores the exact raw camera and disabled handlers when native entry fails', () => {
    const { camera, callbacks, jumpTo, expectRestoredInput } = fixture()
    jumpTo.mockImplementationOnce(() => { throw new Error('placement failed') })
    camera.setReady(true)
    expect(jumpTo.mock.calls[1][0]).toEqual({
      center: [24.123456789, 59.654321987], zoom: 11.123456, bearing: 17.234567,
      pitch: 22.345678, roll: 0.456789, elevation: 12.5,
      padding: { top: 17.4, bottom: 19.8, left: 13.2, right: 23.6 },
    })
    expect(callbacks.onFailure).toHaveBeenCalledWith(expect.stringContaining('Returned to the previous map'))
    expect(callbacks.onRestoreFailure).not.toHaveBeenCalled()
    expectRestoredInput()
  })

  it('ends a double failure truthfully, reports recovery and fences late render/timer callbacks', () => {
    const { camera, callbacks, jumpTo, once, expectRestoredInput } = fixture()
    jumpTo.mockImplementation(() => { throw new Error('camera unavailable') })
    expect(() => camera.setReady(true)).not.toThrow()
    const message = callbacks.onFailure.mock.calls[0][0]
    expect(message).toContain('could not be restored')
    expect(message).not.toContain('Returned to')
    expect(callbacks.onRestoreFailure).toHaveBeenCalledExactlyOnceWith(message)
    const pendingRender = once.mock.calls[0][1]
    if (typeof pendingRender === 'function') pendingRender()
    vi.advanceTimersByTime(6_000)
    expect(callbacks.onFailure).toHaveBeenCalledTimes(1)
    expect(callbacks.onReady).not.toHaveBeenCalledWith(true)
    expectRestoredInput()
  })

  it('surfaces a manual Return restoration failure without claiming success or retaining input', () => {
    const { camera, callbacks, jumpTo, expectRestoredInput } = fixture()
    jumpTo.mockImplementation(() => { throw new Error('restore failed') })
    const failure = camera.exit(true)
    expect(failure).toContain('could not be restored')
    expect(callbacks.onRestoreFailure).toHaveBeenCalledExactlyOnceWith(failure)
    expect(callbacks.onFailure).not.toHaveBeenCalled()
    expectRestoredInput()
  })

  it('cancels a pending acknowledgement on navigation/unmount without a late Return', () => {
    const { camera, callbacks, jumpTo, expectRestoredInput } = fixture()
    camera.setReady(false)
    camera.exit(false)
    camera.setReady(true)
    vi.advanceTimersByTime(6_000)
    expect(jumpTo).not.toHaveBeenCalled()
    expect(callbacks.onFailure).not.toHaveBeenCalled()
    expect(callbacks.onRestoreFailure).not.toHaveBeenCalled()
    expectRestoredInput()
  })
})

describe('captured orbital camera geometry', () => {
  it('uses the exact km-to-meters eye, initial nadir, north-up and zero scene padding', () => {
    const map = geometry()
    const options = orbitalEyeCameraOptions(map, position, 0, 0)
    expect(map.calculateCameraOptionsFromTo).toHaveBeenCalledWith(
      new LngLat(0, 0), 400_000, new LngLat(0, 0), 0,
    )
    expect(options).toMatchObject({
      bearing: 0, roll: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 },
    })
  })

  it('moves only the surface look target using the renderer sphere, not the eye or its height', () => {
    const map = geometry()
    orbitalEyeCameraOptions(map, position, 0, 49)
    const [from, height, target, ground] = map.calculateCameraOptionsFromTo.mock.calls[0]
    const radians = Math.PI / 180
    const expected = 49 - Math.asin(6_371_008.8 / 6_771_008.8 * Math.sin(49 * radians)) / radians
    expect(from).toEqual(new LngLat(0, 0))
    expect(height).toBe(400_000)
    expect(ground).toBe(0)
    expect(LngLat.convert(target).lat).toBeCloseTo(expected, 8)
    expect(LngLat.convert(target).lng).toBe(0)
  })

  it('keeps wrapped longitude rather than moving or clamping the captured origin', () => {
    const map = geometry()
    expect(orbitalEyeCameraOptions(map, { ...position, longitude: 179.99 }, 90, 49)).toBeDefined()
    const [from, height, target] = map.calculateCameraOptionsFromTo.mock.calls[0]
    expect(LngLat.convert(from).lng).toBe(179.99)
    expect(height).toBe(400_000)
    expect(LngLat.convert(target).lng).toBeGreaterThan(180)
  })

  it('excludes Flat without changing its preference or calling any camera API', () => {
    expect(orbitalViewUnavailableReason(position, 'flat')).toContain('not Flat')
    expect(orbitalViewUnavailableReason(position, 'auto')).toBeUndefined()
    expect(orbitalViewUnavailableReason(undefined, 'auto')).toContain('accepted modeled position')
  })

  it.each([
    { latitude: 88.5 }, { latitude: Number.NaN }, { longitude: 181 },
    { altitudeKm: 0 }, { altitudeKm: -1 }, { altitudeKm: Number.POSITIVE_INFINITY },
  ])('rejects invalid or polar eyes without making a native camera call: %j', override => {
    const map = geometry()
    expect(orbitalEyeCameraOptions(map, { ...position, ...override }, 0, 0)).toBeUndefined()
    expect(map.calculateCameraOptionsFromTo).not.toHaveBeenCalled()
  })

  it('rejects an unrepresentable look direction instead of moving a near-polar eye', () => {
    const map = geometry()
    expect(orbitalEyeCameraOptions(map, { ...position, latitude: 79.9, altitudeKm: 550 }, 0, 59)).toBeUndefined()
    expect(map.calculateCameraOptionsFromTo).not.toHaveBeenCalled()
  })

  it('enforces actual native limits and never substitutes a different height or zoom', () => {
    const map = geometry()
    map.calculateCameraOptionsFromTo.mockReturnValue({ zoom: -3, pitch: 0 })
    expect(orbitalEyeCameraOptions(map, position, 0, 0)).toBeUndefined()
    map.calculateCameraOptionsFromTo.mockReturnValue({ zoom: 3, pitch: 61 })
    expect(orbitalEyeCameraOptions(map, position, 0, 30)).toBeUndefined()
    expect(map.calculateCameraOptionsFromTo.mock.calls.every(call => call[1] === 400_000)).toBe(true)
    expect(orbitalEyeCameraOptions(map, position, 0, 60)).toBeUndefined()
  })
})
