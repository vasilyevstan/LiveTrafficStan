import { LngLat, MercatorCoordinate, type JumpToOptions, type Map as MapLibreMap } from 'maplibre-gl'
import { ORBITAL_VIEW_CONFIG } from '../config/appConfig'
import { interpolateOrbitalViewPosition, orbitalViewUnavailableReason, ORBITAL_VIEW_MAXIMUM_LATITUDE, type CapturedOrbitalView } from '../domain/orbitalView'
import type { ModeledOrbitalPosition } from '../domain/orbital'
import { workspaceOwnsFullscreen } from '../app/fullscreen'

type CameraGeometry = Pick<MapLibreMap,
  'calculateCameraOptionsFromTo' | 'getMinZoom' | 'getMaxZoom' | 'getMaxPitch'>

// Public Mercator units supply the renderer's radius without changing app distance math.
const orbitalRadiusRatio = (heightMeters: number) =>
  1 / (1 + MercatorCoordinate.fromLngLat([0, 0], heightMeters).z * 2 * Math.PI)

export const orbitalViewFraming = (
  position: Readonly<ModeledOrbitalPosition>,
  width: number,
  height: number,
  previousFieldOfView: number,
) => {
  if (orbitalViewUnavailableReason(position, 'auto') ||
    !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
    !Number.isFinite(previousFieldOfView) ||
    previousFieldOfView < ORBITAL_VIEW_CONFIG.nativeMinimumFieldOfViewDegrees ||
    previousFieldOfView > ORBITAL_VIEW_CONFIG.nativeMaximumFieldOfViewDegrees) return undefined
  const radius = Math.asin(orbitalRadiusRatio(position.altitudeKm * 1_000))
  if (radius * 360 / Math.PI > previousFieldOfView) {
    return {
      initialPitch: ORBITAL_VIEW_CONFIG.initialLookPitchDegrees,
      fieldOfView: previousFieldOfView,
    }
  }
  const fieldOfView = 2 * Math.atan(Math.tan(radius) /
    (ORBITAL_VIEW_CONFIG.earthFrameFraction * Math.min(1, width / height))) * 180 / Math.PI
  if (!Number.isFinite(fieldOfView) ||
    fieldOfView < ORBITAL_VIEW_CONFIG.nativeMinimumFieldOfViewDegrees ||
    fieldOfView > ORBITAL_VIEW_CONFIG.nativeMaximumFieldOfViewDegrees) return undefined
  return { initialPitch: 0, fieldOfView }
}

export const orbitalEyeCameraOptions = (
  map: CameraGeometry,
  position: Readonly<ModeledOrbitalPosition>,
  yawDegrees: number,
  pitchDegrees: number,
): JumpToOptions | undefined => {
  const heightMeters = position.altitudeKm * 1_000
  if (orbitalViewUnavailableReason(position, 'auto') || !Number.isFinite(heightMeters) ||
    !Number.isFinite(yawDegrees) || !Number.isFinite(pitchDegrees) ||
    Math.abs(pitchDegrees) > ORBITAL_VIEW_CONFIG.maximumLookPitchDegrees) return undefined
  const radians = Math.PI / 180
  const yaw = (yawDegrees + (pitchDegrees < 0 ? 180 : 0)) * radians
  const beta = Math.abs(pitchDegrees) * radians
  const ratio = orbitalRadiusRatio(heightMeters)
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
    roll: pitchDegrees < 0 ? 180 : 0,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
  }
}

interface CapturedCameraCallbacks {
  onReturn: () => void
  onFailure: (message: string) => void
  onRestoreFailure: (message: string) => void
  onReady: (ready: boolean) => void
  onNotice: (message: string | undefined) => void
  onPosition?: (position: Readonly<ModeledOrbitalPosition>) => void
  onPause?: () => void
}

export const createCapturedOrbitalCamera = (
  map: MapLibreMap,
  view: CapturedOrbitalView,
  callbacks: CapturedCameraCallbacks,
) => {
  const canvas = map.getCanvas()
  map.stop()
  const previousMaximumPitch = map.getMaxPitch()
  const previousFieldOfView = map.getVerticalFieldOfView()
  let previousSky = map.getSky()
  let skyApplied = false
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
  let orientationInitialized = false
  let earthFramed: boolean | undefined
  let yaw = 0
  let travelBearing = view.position.travelBearingDegrees ?? 0
  let pitch: number = ORBITAL_VIEW_CONFIG.initialLookPitchDegrees
  let currentPosition = view.position
  let previousPosition = currentPosition
  let latestPosition = currentPosition
  let lastAcceptedFor = currentPosition.modeledFor
  let receivedAt = performance.now()
  let waitingForPosition = true
  let playing = false
  let frame: number | undefined
  let reportedSecond: number | undefined
  let pointer: { id: number; x: number; y: number } | undefined
  let renderCallback: (() => void) | undefined
  let deadline: number | undefined
  let notice: string | undefined
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const motionPreferenceChanged = () => {
    if (reducedMotion?.matches) callbacks.onPause?.()
  }
  const stopFrame = () => {
    if (frame !== undefined) window.cancelAnimationFrame(frame)
    frame = undefined
  }
  const reportPosition = (force = false) => {
    const second = Math.floor(currentPosition.modeledFor / 1_000)
    if (!force && reportedSecond === second) return
    reportedSecond = second
    callbacks.onPosition?.(currentPosition)
  }

  for (const { handler } of handlers) handler.disable()
  canvas.style.touchAction = 'pinch-zoom'
  canvas.style.cursor = 'grab'
  canvas.style.visibility = 'hidden'
  canvas.setAttribute('aria-label', `Modeled 3D view from ${view.position.name}. Drag or use arrow keys to look. Pause holds the view. Escape returns to the map.`)

  const clearHandoff = () => {
    if (renderCallback) map.off('render', renderCallback)
    renderCallback = undefined
    if (deadline !== undefined) window.clearTimeout(deadline)
    deadline = undefined
  }
  const hide = () => {
    stopFrame()
    waitingForPosition = true
    clearHandoff()
    needsReapply = true
    canvas.style.visibility = 'hidden'
    callbacks.onReady(false)
  }
  const exit = (restore: boolean) => {
    if (disposed) return restoreFailure
    disposed = true
    stopFrame()
    clearHandoff()
    reducedMotion?.removeEventListener('change', motionPreferenceChanged)
    map.off('resize', reapply)
    map.off('style.load', styleLoaded)
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
    try {
      map.setMaxPitch(previousMaximumPitch)
      map.setVerticalFieldOfView(previousFieldOfView)
      if (restore) map.jumpTo(previousCamera)
      if (skyApplied && map.getStyle()) map.setSky(previousSky)
    } catch (error) {
      restoreFailure = `The previous camera could not be restored: ${error instanceof Error ? error.message : 'native camera error'}. Modeled view ended. Use Center or reload the map to recover.`
      callbacks.onRestoreFailure(restoreFailure)
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
  const lookOptions = (nextYaw: number, nextPitch: number) => orbitalEyeCameraOptions(
    map, currentPosition,
    ((currentPosition.travelBearingDegrees ?? travelBearing) + nextYaw) % 360, nextPitch,
  )
  const apply = () => {
    const options = lookOptions(yaw, pitch)
    if (!options) return false
    map.jumpTo(options)
    travelBearing = currentPosition.travelBearingDegrees ?? travelBearing
    return true
  }
  function animate(now: number) {
    frame = undefined
    if (disposed || !playing || !ready || renderCallback || document.hidden) return
    if (now - receivedAt > ORBITAL_VIEW_CONFIG.readinessTimeoutMs) {
      fail('The selected model stopped updating. Returned to the previous map.')
      return
    }
    const modeledFor = Math.max(previousPosition.modeledFor, Math.min(
      latestPosition.modeledFor,
      latestPosition.modeledFor + now - receivedAt - ORBITAL_VIEW_CONFIG.interpolationDelayMs,
    ))
    const position = interpolateOrbitalViewPosition(previousPosition, latestPosition, modeledFor)
    if (!position) {
      fail('The selected model changed unexpectedly. Returned to the previous map.')
      return
    }
    try {
      if (currentPosition.modeledFor !== position.modeledFor) {
        const previousDisplayedPosition = currentPosition
        currentPosition = position
        if (!apply()) {
          currentPosition = previousDisplayedPosition
          playing = false
          waitingForPosition = true
          reportPosition(true)
          notice = 'Map display limit. View paused at the last modeled position; adjust the look before playing.'
          callbacks.onNotice(notice)
          callbacks.onPause?.()
          return
        }
        reportPosition()
      }
      frame = window.requestAnimationFrame(animate)
    } catch (error) {
      fail(`Modeled view failed: ${error instanceof Error ? error.message : 'native camera error'}. Returned to the previous map.`)
    }
  }
  const startFrame = () => {
    if (!disposed && playing && ready && !renderCallback && !document.hidden && frame === undefined) {
      frame = window.requestAnimationFrame(animate)
    }
  }
  function reapply() {
    if (disposed || !ready || document.hidden) return
    stopFrame()
    clearHandoff()
    needsReapply = false
    canvas.style.visibility = 'hidden'
    callbacks.onReady(false)
    deadline = window.setTimeout(() => {
      fail('The captured map view did not become ready. Returned to the previous map.')
    }, ORBITAL_VIEW_CONFIG.readinessTimeoutMs)
    try {
      const framing = orbitalViewFraming(
        view.position, canvas.clientWidth, canvas.clientHeight, previousFieldOfView,
      )
      if (!framing) {
        fail('This canvas cannot frame the modeled eye. Returned to the previous map.')
        return
      }
      earthFramed = framing.initialPitch === 0
      map.setVerticalFieldOfView(framing.fieldOfView)
      if (earthFramed && map.getStyle()) {
        map.setSky({ ...previousSky, 'atmosphere-blend': ORBITAL_VIEW_CONFIG.earthAtmosphereBlend })
        skyApplied = true
      }
      if (!orientationInitialized) {
        map.setMaxPitch(ORBITAL_VIEW_CONFIG.nativeMaximumPitchDegrees)
        pitch = framing.initialPitch
        if (!lookOptions(yaw, pitch)) pitch = 0
        orientationInitialized = true
      }
      // Auto may replace its native transform on the first rendered placement.
      afterRender(() => {
        try {
          afterRender(() => {
            if (deadline !== undefined) window.clearTimeout(deadline)
            deadline = undefined
            canvas.style.visibility = previousVisibility
            callbacks.onReady(true)
            reportPosition(true)
            startFrame()
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
    let acceptedYaw = nextYaw
    let acceptedPitch = Math.max(-ORBITAL_VIEW_CONFIG.maximumLookPitchDegrees,
      Math.min(ORBITAL_VIEW_CONFIG.maximumLookPitchDegrees, nextPitch))
    let options = lookOptions(acceptedYaw, acceptedPitch)
    const nextNotice = options ? undefined : 'Map display limit. Try another look direction.'
    if (!options && acceptedYaw !== yaw) {
      options = lookOptions(acceptedYaw, pitch)
      if (options) acceptedPitch = pitch
    }
    if (!options && acceptedPitch !== pitch) {
      options = lookOptions(yaw, acceptedPitch)
      if (options) acceptedYaw = yaw
    }
    if (notice !== nextNotice) {
      notice = nextNotice
      callbacks.onNotice(notice)
    }
    if (!options) return
    yaw = ((acceptedYaw % 360) + 360) % 360
    pitch = acceptedPitch
    try {
      map.jumpTo(options)
    } catch (error) {
      fail(`Modeled view failed: ${error instanceof Error ? error.message : 'native camera error'}. Returned to the previous map.`)
    }
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
    const step = ORBITAL_VIEW_CONFIG.pointerDegreesPerPixel * (event.pointerType === 'mouse' ? -1 : 1)
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
  function styleLoaded() {
    if (disposed) return
    previousSky = map.getSky()
    skyApplied = false
    reapply()
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
  reducedMotion?.addEventListener('change', motionPreferenceChanged)
  map.on('resize', reapply)
  map.on('style.load', styleLoaded)
  return {
    exit,
    get earthFramed() { return earthFramed },
    setPlayback(nextPlaying: boolean, position?: Readonly<ModeledOrbitalPosition>) {
      if (disposed) return
      if (playing !== nextPlaying) {
        playing = nextPlaying
        stopFrame()
        waitingForPosition = true
        receivedAt = performance.now()
        if (playing && notice) {
          notice = undefined
          callbacks.onNotice(undefined)
        }
        if (!playing) reportPosition(true)
      }
      if (playing && position && position.modeledFor > lastAcceptedFor) {
        if (position.id !== view.position.id ||
          position.snapshotSha256 !== view.position.snapshotSha256 ||
          position.snapshotRetrievedAt !== view.position.snapshotRetrievedAt ||
          position.elementEpoch !== view.position.elementEpoch ||
          orbitalViewUnavailableReason(position, 'auto')) {
          fail('The selected model no longer matches this view. Returned to the previous map.')
          return
        }
        const fresh = waitingForPosition ||
          position.modeledFor - latestPosition.modeledFor > ORBITAL_VIEW_CONFIG.readinessTimeoutMs
        previousPosition = fresh ? position : latestPosition
        latestPosition = position
        if (fresh && (!ready || needsReapply || renderCallback)) currentPosition = position
        lastAcceptedFor = position.modeledFor
        receivedAt = performance.now()
        waitingForPosition = false
      }
      startFrame()
    },
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
