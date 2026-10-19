import { LngLat, MercatorCoordinate, type JumpToOptions, type Map as MapLibreMap } from 'maplibre-gl'
import { ORBITAL_VIEW_CONFIG } from '../config/appConfig'
import { orbitalViewUnavailableReason, ORBITAL_VIEW_MAXIMUM_LATITUDE, type CapturedOrbitalView } from '../domain/orbitalView'
import type { ModeledOrbitalPosition } from '../domain/orbital'
import { workspaceOwnsFullscreen } from '../app/fullscreen'

type CameraGeometry = Pick<MapLibreMap,
  'calculateCameraOptionsFromTo' | 'getMinZoom' | 'getMaxZoom' | 'getMaxPitch'>

export const orbitalEyeCameraOptions = (
  map: CameraGeometry,
  position: Readonly<ModeledOrbitalPosition>,
  yawDegrees: number,
  pitchDegrees: number,
): JumpToOptions | undefined => {
  const heightMeters = position.altitudeKm * 1_000
  if (orbitalViewUnavailableReason(position, 'auto') || !Number.isFinite(heightMeters) ||
    !Number.isFinite(yawDegrees) || !Number.isFinite(pitchDegrees) ||
    pitchDegrees < 0 || pitchDegrees > ORBITAL_VIEW_CONFIG.maximumLookPitchDegrees) return undefined
  const radians = Math.PI / 180
  const yaw = yawDegrees * radians
  const beta = pitchDegrees * radians
  // Public Mercator units supply the renderer's radius without changing app distance math.
  const ratio = 1 / (1 + MercatorCoordinate.fromLngLat([0, 0], heightMeters).z * 2 * Math.PI)
  const theta = beta - Math.asin(ratio * Math.sin(beta))
  const latitude = position.latitude * radians
  const longitude = position.longitude * radians
  const targetLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(theta) +
    Math.cos(latitude) * Math.sin(theta) * Math.cos(yaw),
  )
  const targetLongitude = longitude + Math.atan2(
    Math.sin(yaw) * Math.sin(theta) * Math.cos(latitude),
    Math.cos(theta) - Math.sin(latitude) * Math.sin(targetLatitude),
  )
  const target = new LngLat(targetLongitude / radians, targetLatitude / radians)
  if (Math.abs(target.lat) > ORBITAL_VIEW_MAXIMUM_LATITUDE) return undefined
  const options = map.calculateCameraOptionsFromTo(
    new LngLat(position.longitude, position.latitude), heightMeters, target, 0,
  )
  const { zoom, pitch } = options
  if (typeof zoom !== 'number' || !Number.isFinite(zoom) || zoom < map.getMinZoom() ||
    zoom > map.getMaxZoom() || typeof pitch !== 'number' || !Number.isFinite(pitch) ||
    pitch > map.getMaxPitch()) return undefined
  return {
    ...options, ...(pitchDegrees === 0 ? { bearing: yawDegrees } : {}),
    roll: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 },
  }
}

interface CapturedCameraCallbacks {
  onReturn: () => void
  onFailure: (message: string) => void
  onRestoreFailure: (message: string) => void
  onReady: (ready: boolean) => void
  onNotice: (message: string | undefined) => void
}

export const createCapturedOrbitalCamera = (
  map: MapLibreMap,
  view: CapturedOrbitalView,
  callbacks: CapturedCameraCallbacks,
) => {
  const canvas = map.getCanvas()
  map.stop()
  const center = map.getCenter()
  const previousCamera: JumpToOptions = {
    center: [center.lng, center.lat], zoom: map.getZoom(), bearing: map.getBearing(),
    pitch: map.getPitch(), roll: map.getRoll(), elevation: map.getCenterElevation(),
    padding: { ...map.getPadding() },
  }
  const handlers = [
    map.dragPan, map.dragRotate, map.scrollZoom, map.touchZoomRotate,
    map.touchPitch, map.doubleClickZoom, map.keyboard, map.boxZoom,
  ].map(handler => ({ handler, enabled: handler.isEnabled() }))
  const previousVisibility = canvas.style.visibility
  const previousTouchAction = canvas.style.touchAction
  const previousCursor = canvas.style.cursor
  const previousLabel = canvas.getAttribute('aria-label')
  let disposed = false
  let restoreFailure: string | undefined
  let ready = false
  let needsReapply = true
  let yaw = 0
  let pitch = 0
  let pointer: { id: number; x: number; y: number } | undefined
  let renderCallback: (() => void) | undefined
  let deadline: number | undefined
  let notice: string | undefined

  for (const { handler } of handlers) handler.disable()
  canvas.style.touchAction = 'pinch-zoom'
  canvas.style.cursor = 'grab'
  canvas.style.visibility = 'hidden'
  canvas.setAttribute('aria-label', `Captured modeled view from ${view.position.name}. Drag or use arrow keys to look; the eye stays fixed. Escape returns to the map.`)

  const clearHandoff = () => {
    if (renderCallback) map.off('render', renderCallback)
    renderCallback = undefined
    if (deadline !== undefined) window.clearTimeout(deadline)
    deadline = undefined
  }
  const hide = () => {
    clearHandoff()
    needsReapply = true
    canvas.style.visibility = 'hidden'
    callbacks.onReady(false)
  }
  const exit = (restore: boolean) => {
    if (disposed) return restoreFailure
    disposed = true
    clearHandoff()
    map.off('resize', reapply)
    map.off('style.load', reapply)
    document.removeEventListener('visibilitychange', visibilityChanged)
    canvas.removeEventListener('pointerdown', down, true)
    canvas.removeEventListener('pointermove', move, true)
    canvas.removeEventListener('pointerup', up, true)
    canvas.removeEventListener('pointercancel', up, true)
    canvas.removeEventListener('keydown', key, true)
    canvas.removeEventListener('wheel', wheel, true)
    canvas.removeEventListener('click', block, true)
    canvas.removeEventListener('dblclick', block, true)
    canvas.removeEventListener('contextmenu', block, true)
    if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id)
    pointer = undefined
    for (const { handler, enabled } of handlers) {
      if (enabled) handler.enable()
      else handler.disable()
    }
    canvas.style.visibility = previousVisibility
    canvas.style.touchAction = previousTouchAction
    canvas.style.cursor = previousCursor
    if (previousLabel === null) canvas.removeAttribute('aria-label')
    else canvas.setAttribute('aria-label', previousLabel)
    if (restore) {
      try {
        map.jumpTo(previousCamera)
      } catch (error) {
        restoreFailure = `The previous camera could not be restored: ${error instanceof Error ? error.message : 'native camera error'}. Captured view ended. Use Center or reload the map to recover.`
        callbacks.onRestoreFailure(restoreFailure)
      }
    }
    return restoreFailure
  }
  const fail = (message: string) => {
    callbacks.onFailure(exit(true) ?? message)
  }
  const afterRender = (callback: () => void) => {
    renderCallback = () => {
      renderCallback = undefined
      if (!disposed && ready && !document.hidden) callback()
    }
    map.once('render', renderCallback)
  }
  const apply = () => {
    const options = orbitalEyeCameraOptions(map, view.position, yaw, pitch)
    if (!options) return false
    map.jumpTo(options)
    return true
  }
  function reapply() {
    if (disposed || !ready || document.hidden) return
    clearHandoff()
    needsReapply = false
    canvas.style.visibility = 'hidden'
    callbacks.onReady(false)
    deadline = window.setTimeout(() => {
      fail('The captured map view did not become ready. Returned to the previous map.')
    }, ORBITAL_VIEW_CONFIG.readinessTimeoutMs)
    try {
      // Auto may replace its native transform on the first rendered placement.
      afterRender(() => {
        try {
          afterRender(() => {
            if (deadline !== undefined) window.clearTimeout(deadline)
            deadline = undefined
            canvas.style.visibility = previousVisibility
            callbacks.onReady(true)
            if (document.activeElement === document.body) canvas.focus({ preventScroll: true })
          })
          if (!apply()) fail('This canvas cannot preserve the captured eye. Returned to the previous map.')
        } catch (error) {
          fail(`Captured view failed: ${error instanceof Error ? error.message : 'native camera error'}. Returned to the previous map.`)
        }
      })
      if (!apply()) fail('This canvas cannot represent the captured eye. Returned to the previous map.')
    } catch (error) {
      fail(`Captured view failed: ${error instanceof Error ? error.message : 'native camera error'}. Returned to the previous map.`)
    }
  }
  const update = (nextYaw: number, nextPitch: number) => {
    if (disposed || !ready || renderCallback || document.hidden) return
    const boundedPitch = Math.max(0, Math.min(ORBITAL_VIEW_CONFIG.maximumLookPitchDegrees, nextPitch))
    const options = orbitalEyeCameraOptions(map, view.position, nextYaw, boundedPitch)
    const nextNotice = options ? undefined : 'View limit reached; the captured eye has not moved.'
    if (notice !== nextNotice) {
      notice = nextNotice
      callbacks.onNotice(notice)
    }
    if (!options) return
    yaw = ((nextYaw % 360) + 360) % 360
    pitch = boundedPitch
    map.jumpTo(options)
  }
  const block = (event: Event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  const down = (event: PointerEvent) => {
    block(event)
    if (!event.isPrimary || event.button !== 0) return
    canvas.focus({ preventScroll: true })
    canvas.setPointerCapture(event.pointerId)
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
    canvas.style.cursor = 'grabbing'
  }
  const move = (event: PointerEvent) => {
    block(event)
    if (!pointer || pointer.id !== event.pointerId) return
    const step = ORBITAL_VIEW_CONFIG.pointerDegreesPerPixel
    update(yaw + (event.clientX - pointer.x) * step, pitch - (event.clientY - pointer.y) * step)
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
  }
  const up = (event: PointerEvent) => {
    block(event)
    if (pointer?.id !== event.pointerId) return
    pointer = undefined
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    canvas.style.cursor = 'grab'
  }
  const wheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) block(event)
  }
  const key = (event: KeyboardEvent) => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
    const step = ORBITAL_VIEW_CONFIG.keyboardStepDegrees
    const directions: Record<string, readonly [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0],
      ArrowUp: [0, step], ArrowDown: [0, -step],
    }
    const delta = directions[event.key]
    if (delta) {
      block(event)
      update(yaw + delta[0], pitch + delta[1])
    } else if (['+', '-', '='].includes(event.key)) block(event)
    else if (event.key === 'Escape' && !workspaceOwnsFullscreen(canvas)) {
      block(event)
      callbacks.onReturn()
    }
  }
  function visibilityChanged() {
    if (document.hidden) hide()
    // A visible scene is released only by the App's validated controller acknowledgements.
  }
  canvas.addEventListener('pointerdown', down, { capture: true })
  canvas.addEventListener('pointermove', move, { capture: true })
  canvas.addEventListener('pointerup', up, { capture: true })
  canvas.addEventListener('pointercancel', up, { capture: true })
  canvas.addEventListener('keydown', key, { capture: true })
  canvas.addEventListener('wheel', wheel, { capture: true, passive: false })
  canvas.addEventListener('click', block, { capture: true })
  canvas.addEventListener('dblclick', block, { capture: true })
  canvas.addEventListener('contextmenu', block, { capture: true })
  document.addEventListener('visibilitychange', visibilityChanged)
  map.on('resize', reapply)
  map.on('style.load', reapply)
  return {
    exit,
    setReady(nextReady: boolean) {
      if (disposed) return
      const changed = ready !== nextReady
      ready = nextReady
      if (!ready) {
        if (changed) hide()
        if (!document.hidden && deadline === undefined) {
          deadline = window.setTimeout(() => {
            fail('The captured view could not pause and validate in time. Returned to the previous map.')
          }, ORBITAL_VIEW_CONFIG.readinessTimeoutMs)
        }
      } else if (!document.hidden && (changed || needsReapply)) reapply()
    },
  }
}
