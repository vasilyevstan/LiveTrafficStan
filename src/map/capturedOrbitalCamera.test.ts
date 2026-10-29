import { LngLat, type CameraOptions, type LngLatLike, type Map as MapLibreMap } from 'maplibre-gl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModeledOrbitalPosition } from '../domain/orbital'
import { orbitalViewUnavailableReason, type CapturedOrbitalView } from '../domain/orbitalView'
import type { AircraftViewPosition } from '../domain/aircraftView'
import {
  aircraftViewFraming,
  createCapturedAircraftCamera,
  createCapturedOrbitalCamera,
  orbitalEyeCameraOptions,
  orbitalViewFraming,
} from './capturedOrbitalCamera'

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

describe('orbital Earth framing', () => {
  const fieldOfView = 36.86989764584402
  it('preserves the low-orbit oblique view and actual prior aperture', () => {
    expect(orbitalViewFraming(position, 315, 517, fieldOfView)).toEqual({
      initialPitch: 72, fieldOfView,
    })
  })
  it('fits both axes of desktop and portrait high views rather than relying on vertical FOV', () => {
    const high = { ...position, altitudeKm: 21_528 }
    const desktop = orbitalViewFraming(high, 1280, 900, fieldOfView)
    const phone = orbitalViewFraming(high, 315, 517, fieldOfView)
    expect(desktop?.initialPitch).toBe(0)
    expect(desktop?.fieldOfView).toBeCloseTo(30.853677536993345, 8)
    expect(phone?.initialPitch).toBe(0)
    expect(phone?.fieldOfView).toBeCloseTo(48.732331897319504, 8)
  })
  it('rejects invalid dimensions/apertures and unsupported tiny framing instead of native clamping', () => {
    for (const [width, height, fov] of [[0, 517, fieldOfView], [315, NaN, fieldOfView], [315, 517, 151]]) {
      expect(orbitalViewFraming(position, width, height, fov)).toBeUndefined()
    }
    expect(orbitalViewFraming({ ...position, altitudeKm: 1e12 }, 1280, 900, fieldOfView)).toBeUndefined()
  })
})

describe('captured orbital camera cleanup', () => {
  let now = 0
  let frameId = 0
  const frames = new Map<number, FrameRequestCallback>()
  const motionPreference = Object.assign(new EventTarget(), { matches: false })
  beforeEach(() => {
    vi.useFakeTimers()
    now = 0
    frameId = 0
    frames.clear()
    motionPreference.matches = false
    vi.stubGlobal('performance', { now: () => now })
    vi.stubGlobal('window', {
      setTimeout, clearTimeout, matchMedia: () => motionPreference,
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.set(++frameId, callback)
        return frameId
      },
      cancelAnimationFrame: (id: number) => frames.delete(id),
    })
    vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false, body: {}, activeElement: null }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  type Callbacks = Parameters<typeof createCapturedOrbitalCamera>[2]
  const fixture = <C = ReturnType<typeof createCapturedOrbitalCamera>>(
    initialPosition = position,
    create?: (map: MapLibreMap, callbacks: Callbacks) => C,
  ) => {
    // Native DOM/MapLibre behavior is browser-qualified; this Node double isolates cleanup faults.
    const attributes = new Map([['aria-label', 'Ordinary map']])
    const canvas = Object.assign(new EventTarget(), {
      style: { visibility: 'visible', touchAction: 'none', cursor: '' },
      clientWidth: 1280, clientHeight: 900,
      getAttribute: (key: string) => attributes.get(key) ?? null,
      setAttribute: (key: string, value: string) => attributes.set(key, value),
      removeAttribute: (key: string) => attributes.delete(key),
      hasPointerCapture: () => false,
      releasePointerCapture: vi.fn(),
      setPointerCapture: vi.fn(),
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
    const listeners = new Map<string, () => void>()
    let maximumPitch = 60
    let fieldOfView = 36.86989764584402
    let sky: ReturnType<MapLibreMap['getSky']> = { 'atmosphere-blend': 0.2 }
    const map = {
      ...geometry(), ...handlers, jumpTo, once,
      getMaxPitch: () => maximumPitch,
      setMaxPitch: vi.fn((value: number) => { maximumPitch = value }),
      getVerticalFieldOfView: () => fieldOfView,
      setVerticalFieldOfView: vi.fn((value: number) => { fieldOfView = value }),
      getSky: () => sky,
      setSky: vi.fn((value: typeof sky) => { sky = value }),
      getStyle: () => ({ version: 8, sources: {}, layers: [] }),
      on: vi.fn((type: string, callback: () => void) => { listeners.set(type, callback) }),
      off: vi.fn((type: string) => { listeners.delete(type) }),
      stop: vi.fn<MapLibreMap['stop']>(), getCanvas: () => canvas,
      getCenter: () => new LngLat(24.123456789, 59.654321987),
      getZoom: () => 11.123456, getBearing: () => 17.234567, getPitch: () => 22.345678,
      getRoll: () => 0.456789, getCenterElevation: () => 12.5,
      getPadding: () => ({ top: 17.4, bottom: 19.8, left: 13.2, right: 23.6 }),
    } as unknown as MapLibreMap
    const view: CapturedOrbitalView = {
      revision: 1, viewRequestId: 2, position: initialPosition,
      snapshot: {
        schemaVersion: 2, sourceContractVersion: 2, catalogId: 'fixture', sources: [], recordCount: 0,
        records: [], retrievedAt: new Date(2_000).toISOString(), publishedAt: new Date(2_000).toISOString(),
        sha256: 'a'.repeat(64),
      },
    }
    const callbacks = {
      onReturn: vi.fn(), onFailure: vi.fn(), onRestoreFailure: vi.fn(),
      onReady: vi.fn(), onNotice: vi.fn(),
      onPosition: vi.fn(), onPause: vi.fn(),
    }
    const camera = (create ? create(map, callbacks) : createCapturedOrbitalCamera(map, view, callbacks)) as C
    const expectRestoredInput = () => {
      expect(Object.values(handlers).map(handler => handler.isEnabled())).toEqual(
        [true, false, false, true, true, true, true, true],
      )
      expect(canvas.style).toEqual({ visibility: 'visible', touchAction: 'none', cursor: '' })
      expect(canvas.getAttribute('aria-label')).toBe('Ordinary map')
      expect(map.getMaxPitch()).toBe(60)
      expect(map.getVerticalFieldOfView()).toBe(36.86989764584402)
      expect(frames.size).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    }
    const renderReady = () => {
      for (let index = 0; index < 2; index += 1) {
        const render = once.mock.calls.at(-1)
        if (!render) throw Error('Expected readiness render')
        render[1]()
      }
    }
    const tick = (milliseconds: number) => {
      now += milliseconds
      const pending = [...frames.values()]
      frames.clear()
      for (const callback of pending) callback(now)
    }
    return { camera, canvas, callbacks, jumpTo, once, map, renderReady, tick, expectRestoredInput,
      emit: (type: string) => listeners.get(type)?.(), listeners }
  }

  const pointer = (type: string, pointerType: string, x: number, y: number) =>
    Object.assign(new Event(type, { cancelable: true }), {
      isPrimary: true, button: 0, pointerId: 1, pointerType, clientX: x, clientY: y,
    })

  it('starts Earth-facing along modeled travel rather than north', () => {
    const forward = { ...position, travelBearingDegrees: 90 }
    const { camera, map, jumpTo, renderReady, expectRestoredInput } = fixture(forward)
    camera.setReady(true)
    renderReady()
    expect(jumpTo.mock.calls.at(-1)?.[0]).toEqual(orbitalEyeCameraOptions(map, forward, 90, 72))
    const target = LngLat.convert(jumpTo.mock.calls.at(-1)?.[0].center ?? [0, 0])
    expect(target.lng).toBeGreaterThan(0)
    expect(target.lat).toBeCloseTo(0, 10)
    camera.exit(true)
    expectRestoredInput()
  })

  it('keeps a manual look offset through forward wrap, motion, Pause, resume, style and resize', () => {
    const forward = { ...position, travelBearingDegrees: 359 }
    const { camera, canvas, map, jumpTo, renderReady, tick, emit, expectRestoredInput } = fixture(forward)
    const first = { ...forward, modeledFor: 4_000 }
    camera.setPlayback(true, first)
    camera.setReady(true)
    renderReady()
    canvas.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowRight' }))
    expect(jumpTo.mock.calls.at(-1)?.[0]).toEqual(orbitalEyeCameraOptions(map, first, 5, 72))
    camera.setPlayback(true, { ...first, modeledFor: 5_000, travelBearingDegrees: 1 })
    tick(500)
    const halfway = { ...first, modeledFor: 4_500, travelBearingDegrees: 0 }
    expect(jumpTo.mock.calls.at(-1)?.[0]).toEqual(orbitalEyeCameraOptions(map, halfway, 6, 72))
    camera.setPlayback(false)
    const paints = jumpTo.mock.calls.length
    tick(10_000)
    expect(jumpTo).toHaveBeenCalledTimes(paints)
    camera.setPlayback(true, { ...first, modeledFor: 15_000, travelBearingDegrees: 40 })
    tick(0)
    expect(jumpTo.mock.calls.at(-1)?.[0]).toEqual(orbitalEyeCameraOptions(map, first, 46, 72))
    for (const event of ['style.load', 'resize']) {
      emit(event)
      renderReady()
      expect(jumpTo.mock.calls.at(-1)?.[0]).toEqual(orbitalEyeCameraOptions(map, first, 46, 72))
    }
    camera.exit(true)
    expectRestoredInput()
  })

  it('tilts an unsafe initial forward target to nadir without turning backward', () => {
    const north = { ...position, latitude: 80, travelBearingDegrees: 0 }
    const { camera, map, renderReady, jumpTo, expectRestoredInput } = fixture(north)
    camera.setReady(true)
    renderReady()
    expect(jumpTo.mock.calls.at(-1)?.[0]).toEqual(orbitalEyeCameraOptions(map, north, 0, 0))
    expect(jumpTo.mock.calls.at(-1)?.[0].bearing).toBe(0)
    camera.exit(true)
    expectRestoredInput()
  })

  it('holds only an accepted travel reference when a rejected moving pose is followed by unknown direction', () => {
    const forward = { ...position, travelBearingDegrees: 90 }
    const { camera, map, renderReady, tick, callbacks, jumpTo, expectRestoredInput } = fixture(forward)
    camera.setPlayback(true, { ...forward, modeledFor: 4_000 })
    camera.setReady(true)
    renderReady()
    camera.setPlayback(true, { ...forward, modeledFor: 5_000, travelBearingDegrees: 180 })
    vi.mocked(map.calculateCameraOptionsFromTo).mockReturnValueOnce({ center: [0, 0], zoom: -100, pitch: 0 })
    tick(500)
    expect(callbacks.onPause).toHaveBeenCalledTimes(1)
    camera.setPlayback(true, { ...position, modeledFor: 6_000 })
    tick(0)
    expect(jumpTo.mock.calls.at(-1)?.[0]).toEqual(orbitalEyeCameraOptions(map, position, 90, 72))
    expect(callbacks.onPosition.mock.calls.at(-1)?.[0].travelBearingDegrees).toBeUndefined()
    camera.exit(true)
    expectRestoredInput()
  })

  it('retains low-orbit shading and the existing arrow-key direction', () => {
    const { camera, canvas, map, renderReady, jumpTo, expectRestoredInput } = fixture()
    camera.setReady(true)
    renderReady()
    expect(camera.earthFramed).toBe(false)
    expect(map.setSky).not.toHaveBeenCalled()
    canvas.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowDown' }))
    expect(jumpTo.mock.calls.at(-1)?.[0]).toEqual(orbitalEyeCameraOptions(map, position, 0, 66))
    camera.exit(true)
    expectRestoredInput()
  })

  it.each(['mouse', 'touch'])('inverts only mouse look, including through nadir (%s)', pointerType => {
    const high = { ...position, altitudeKm: 21_528 }
    const { camera, canvas, renderReady, jumpTo, map, expectRestoredInput } = fixture(high)
    camera.setReady(true)
    renderReady()
    const sign = pointerType === 'mouse' ? -1 : 1
    const expected = orbitalEyeCameraOptions(map, high, sign * 2, sign * 2)
    canvas.dispatchEvent(pointer('pointerdown', pointerType, 100, 100))
    canvas.dispatchEvent(pointer('pointermove', pointerType, 110, 90))
    canvas.dispatchEvent(pointer('pointerup', pointerType, 110, 90))
    expect(jumpTo.mock.calls.at(-1)?.[0]).toEqual(expected)
    camera.exit(true)
    expectRestoredInput()
  })

  it('tries independent axes at most three times and keeps only an accepted look', () => {
    const { camera, canvas, renderReady, map, jumpTo, callbacks } = fixture()
    camera.setReady(true)
    renderReady()
    const calculate = vi.mocked(map.calculateCameraOptionsFromTo)
    calculate.mockImplementation((_from, _height, target) => ({
      center: target, zoom: Math.abs(LngLat.convert(target).lng) > 1e-9 ? -100 : 5,
      bearing: 123, pitch: 0,
    }))
    calculate.mockClear()
    canvas.dispatchEvent(pointer('pointerdown', 'mouse', 100, 100))
    canvas.dispatchEvent(pointer('pointermove', 'mouse', 110, 110))
    expect(calculate).toHaveBeenCalledTimes(3)
    const accepted = LngLat.convert(jumpTo.mock.calls.at(-1)?.[0].center ?? [0, 0])
    expect(accepted.lng).toBeCloseTo(0, 10)
    expect(accepted.lat).toBeGreaterThan(0)
    expect(callbacks.onNotice).toHaveBeenLastCalledWith(expect.stringContaining('Map display limit'))
    calculate.mockClear()
    const paints = jumpTo.mock.calls.length
    canvas.dispatchEvent(pointer('pointermove', 'mouse', 120, 110))
    expect(calculate.mock.calls.length).toBeLessThanOrEqual(3)
    expect(jumpTo.mock.calls).toHaveLength(paints)
    camera.exit(false)
  })

  it('reframes resize without re-aiming and restores the latest native style sky and prior lens', () => {
    const high = { ...position, altitudeKm: 21_528 }
    const { camera, canvas, map, renderReady, emit, jumpTo, expectRestoredInput } = fixture(high)
    camera.setReady(true)
    renderReady()
    expect(camera.earthFramed).toBe(true)
    expect(map.getVerticalFieldOfView()).toBeCloseTo(30.853677536993345, 8)
    expect(map.getSky()['atmosphere-blend']).toBe(1)
    canvas.dispatchEvent(pointer('pointerdown', 'mouse', 100, 100))
    canvas.dispatchEvent(pointer('pointermove', 'mouse', 110, 90))
    const before = jumpTo.mock.calls.at(-1)?.[0]
    Object.assign(canvas, { clientWidth: 315, clientHeight: 517 })
    emit('resize')
    renderReady()
    expect(map.getVerticalFieldOfView()).toBeCloseTo(48.732331897319504, 8)
    const after = jumpTo.mock.calls.at(-1)?.[0]
    if (!before?.center || !after?.center) throw Error('Expected accepted look targets')
    expect(LngLat.convert(after.center).lng).toBeCloseTo(LngLat.convert(before.center).lng, 10)
    expect(LngLat.convert(after.center).lat).toBeCloseTo(LngLat.convert(before.center).lat, 10)
    expect(after.bearing).toBe(before.bearing)
    expect(after.roll).toBe(before.roll)
    map.setSky({ 'sky-color': '#102030', 'atmosphere-blend': 0.3 })
    emit('style.load')
    renderReady()
    camera.exit(false)
    expect(map.getSky()).toEqual({ 'sky-color': '#102030', 'atmosphere-blend': 0.3 })
    expectRestoredInput()
  })

  it('pauses at the exact last display when a moving look reaches a native limit', () => {
    const { camera, map, renderReady, tick, callbacks, expectRestoredInput } = fixture()
    camera.setReady(true)
    renderReady()
    camera.setPlayback(true, { ...position, modeledFor: 4_000, longitude: 0.1 })
    vi.mocked(map.calculateCameraOptionsFromTo).mockReturnValueOnce({ center: [0, 0], zoom: -100, pitch: 0 })
    tick(100)
    expect(callbacks.onPause).toHaveBeenCalledTimes(1)
    expect(callbacks.onPosition.mock.calls.at(-1)?.[0]).toMatchObject({ modeledFor: 3_000, longitude: 0 })
    expect(callbacks.onFailure).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
    camera.setPlayback(true, { ...position, modeledFor: 5_000, longitude: 0.2 })
    expect(callbacks.onNotice).toHaveBeenLastCalledWith(undefined)
    tick(100)
    expect(callbacks.onPosition.mock.calls.at(-1)?.[0]).toMatchObject({ modeledFor: 5_000, longitude: 0.2 })
    camera.exit(true)
    expectRestoredInput()
  })

  it('fences a queued style callback after disposal before touching the old map', () => {
    const { camera, listeners, map } = fixture()
    const late = listeners.get('style.load')
    camera.exit(false)
    const getSky = vi.spyOn(map, 'getSky').mockImplementation(() => { throw Error('disposed map') })
    expect(() => late?.()).not.toThrow()
    expect(getSky).not.toHaveBeenCalled()
  })

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

  it('starts obliquely, interpolates accepted poses without handoffs, and pauses the exact displayed pose', () => {
    const { camera, map, renderReady, tick, once, jumpTo, callbacks, expectRestoredInput } = fixture()
    const first = { ...position, modeledFor: 4_000 }
    camera.setPlayback(true, first)
    camera.setReady(true)
    renderReady()
    expect(map.getMaxPitch()).toBe(80)
    expect(LngLat.convert(vi.mocked(map.calculateCameraOptionsFromTo).mock.calls[0][2]).lat).toBeGreaterThan(0)
    const handoffs = once.mock.calls.length
    camera.setPlayback(true, { ...position, modeledFor: 5_000, longitude: 0.1, altitudeKm: 402 })
    tick(500)
    const paint = vi.mocked(map.calculateCameraOptionsFromTo).mock.calls.at(-1)
    expect(paint?.[1]).toBe(401_000)
    expect(LngLat.convert(paint?.[0] ?? [0, 0]).lng).toBeCloseTo(0.05, 9)
    expect(callbacks.onPosition).toHaveBeenCalledTimes(1)
    expect(once.mock.calls).toHaveLength(handoffs)
    const paints = jumpTo.mock.calls.length
    camera.setPlayback(false)
    expect(callbacks.onPosition.mock.calls.at(-1)?.[0]).toMatchObject({ modeledFor: 4_500, altitudeKm: 401 })
    tick(30_000)
    expect(jumpTo).toHaveBeenCalledTimes(paints)
    expect(frames.size).toBe(0)
    camera.setPlayback(true, { ...position, modeledFor: 35_000, longitude: 1 })
    camera.setReady(true)
    tick(0)
    camera.setPlayback(false)
    expect(callbacks.onPosition.mock.calls.at(-1)?.[0]).toMatchObject({ modeledFor: 35_000, longitude: 1 })
    camera.exit(true)
    expectRestoredInput()
  })

  it('stops active animation while hidden and never replays hidden time on validated resume', () => {
    const { camera, renderReady, tick, callbacks, expectRestoredInput } = fixture()
    camera.setPlayback(true, { ...position, modeledFor: 4_000 })
    camera.setReady(true)
    renderReady()
    Object.assign(document, { hidden: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames.size).toBe(0)
    camera.setReady(false)
    tick(30_000)
    Object.assign(document, { hidden: false })
    camera.setPlayback(true, { ...position, modeledFor: 34_000, longitude: 1 })
    camera.setReady(true)
    renderReady()
    expect(callbacks.onPosition.mock.calls.at(-1)?.[0]).toMatchObject({ modeledFor: 34_000, longitude: 1 })
    camera.exit(false)
    expectRestoredInput()
  })

  it('returns once when selected modeling stalls and ignores obsolete frame/model callbacks', () => {
    const { camera, renderReady, tick, callbacks, jumpTo, expectRestoredInput } = fixture()
    camera.setPlayback(true, { ...position, modeledFor: 4_000 })
    camera.setReady(true)
    renderReady()
    const frame = [...frames.values()][0]
    tick(5_001)
    expect(callbacks.onFailure).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('stopped updating'))
    const paints = jumpTo.mock.calls.length
    frame(6_000)
    camera.setPlayback(true, { ...position, modeledFor: 9_000 })
    expect(jumpTo).toHaveBeenCalledTimes(paints)
    expectRestoredInput()
  })

  it('rejects a different source generation and removes the active-only reduced-motion listener', () => {
    const { camera, callbacks, expectRestoredInput } = fixture()
    motionPreference.matches = true
    motionPreference.dispatchEvent(new Event('change'))
    expect(callbacks.onPause).toHaveBeenCalledTimes(1)
    camera.setPlayback(true, { ...position, modeledFor: 4_000, snapshotSha256: 'b'.repeat(64) })
    expect(callbacks.onFailure).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('no longer matches'))
    motionPreference.dispatchEvent(new Event('change'))
    expect(callbacks.onPause).toHaveBeenCalledTimes(1)
    expectRestoredInput()
  })
  describe('aircraft kind', () => {
    const flight: AircraftViewPosition = {
      id: 'aircraft:511123', name: 'TST123', latitude: 0, longitude: 0,
      altitudeKm: 10, travelBearingDegrees: 90, observedAt: 0,
    }
    const aircraftFixture = () => {
      const projection = { enter: vi.fn(), restore: vi.fn() }
      const result = fixture(position, (map, callbacks) => createCapturedAircraftCamera(
        map, { revision: 1, viewRequestId: 2, position: flight }, projection,
        callbacks as unknown as Parameters<typeof createCapturedAircraftCamera>[3]))
      return { ...result, projection }
    }
    const latitudes = (jumpTo: ReturnType<typeof aircraftFixture>['jumpTo']) =>
      jumpTo.mock.calls.map(([options]) => LngLat.convert(options.center ?? [0, 0]).lat)

    it('enters the override before placement and restores it before the previous camera', () => {
      const { camera, map, jumpTo, projection, renderReady, expectRestoredInput } = aircraftFixture()
      camera.setReady(true)
      expect(projection.enter).toHaveBeenCalledTimes(1)
      renderReady()
      expect(projection.enter.mock.invocationCallOrder[0]).toBeLessThan(jumpTo.mock.invocationCallOrder[0])
      camera.exit(true)
      expect(projection.restore).toHaveBeenCalledTimes(1)
      const restoreOrder = projection.restore.mock.invocationCallOrder[0]
      expect(restoreOrder).toBeLessThan(vi.mocked(map.setMaxPitch).mock.invocationCallOrder.at(-1) ?? 0)
      expect(restoreOrder).toBeLessThan(jumpTo.mock.invocationCallOrder.at(-1) ?? 0)
      expect(jumpTo.mock.calls.at(-1)?.[0]).toMatchObject({ zoom: 11.123456, bearing: 17.234567 })
      expectRestoredInput()
    })

    it('glides between observations one cadence behind, holds at the latest and never stalls', () => {
      const { camera, jumpTo, callbacks, renderReady, tick, expectRestoredInput } = aircraftFixture()
      camera.setPlayback(true, flight)
      camera.setReady(true)
      renderReady()
      camera.setPlayback(true, { ...flight, latitude: 1, observedAt: 20_000 })
      const before = jumpTo.mock.calls.length
      for (let step = 0; step < 50; step += 1) tick(1_000)
      const shown = latitudes(jumpTo).slice(before)
      expect(shown.length).toBeGreaterThan(10)
      expect(shown.every((value, index) => index === 0 || value >= shown[index - 1])).toBe(true)
      expect(Math.min(...shown)).toBeGreaterThan(0)
      expect(shown.at(-1)).toBeCloseTo(1, 3)
      const observed = callbacks.onPosition.mock.calls.map(([value]) => value.observedAt)
      expect(observed.every(value => value >= 0 && value <= 20_000)).toBe(true)
      for (let step = 0; step < 300; step += 1) tick(1_000)
      expect(callbacks.onFailure).not.toHaveBeenCalled()
      camera.exit(true)
      expectRestoredInput()
    })

    it('resumes from the paused display instead of skipping ahead', () => {
      const { camera, jumpTo, renderReady, tick, expectRestoredInput } = aircraftFixture()
      camera.setPlayback(true, flight)
      camera.setReady(true)
      renderReady()
      camera.setPlayback(true, { ...flight, latitude: 1, observedAt: 20_000 })
      for (let step = 0; step < 5; step += 1) tick(1_000)
      const paused = latitudes(jumpTo).at(-1) ?? 0
      camera.setPlayback(false)
      tick(60_000)
      camera.setPlayback(true)
      tick(16)
      expect(latitudes(jumpTo).at(-1) ?? 0).toBeCloseTo(paused, 2)
      camera.exit(true)
      expectRestoredInput()
    })

    it('jumps across a long gap and rejects a different aircraft', () => {
      const { camera, jumpTo, callbacks, renderReady, tick, expectRestoredInput } = aircraftFixture()
      camera.setPlayback(true, flight)
      camera.setReady(true)
      renderReady()
      camera.setPlayback(true, { ...flight, latitude: 3, observedAt: 61_000 })
      tick(16)
      expect(latitudes(jumpTo).at(-1)).toBeCloseTo(3, 3)
      camera.setPlayback(true, { ...flight, id: 'aircraft:abcdef', observedAt: 62_000 })
      expect(callbacks.onFailure).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('no longer matches'))
      expectRestoredInput()
    })

    it('keeps the prior aperture and rejects invalid canvases', () => {
      expect(aircraftViewFraming(315, 517, 36.86989764584402)).toEqual({
        initialPitch: 76, fieldOfView: 36.86989764584402,
      })
      expect(aircraftViewFraming(0, 517, 36.86989764584402)).toBeUndefined()
      expect(aircraftViewFraming(315, 517, 151)).toBeUndefined()
    })
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

  it('keeps a one-degree native headroom at the look limit instead of rejecting floating-point pitch overshoot', () => {
    const map = { ...geometry(), getMaxPitch: () => 80 }
    map.calculateCameraOptionsFromTo.mockReturnValue({ center: [0, 0], zoom: 4, pitch: 79 + 1e-10 })
    expect(orbitalEyeCameraOptions(map, position, 0, 79)).toBeDefined()
    expect(orbitalEyeCameraOptions(map, position, 0, 80)).toBeUndefined()
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
