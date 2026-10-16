import { LOCAL_MAP_TOOLS_CONFIG } from '../config/appConfig'
import type { Coordinates } from '../domain/center'
import type { LocalRulerAvailability, LocalRulerState } from '../domain/localRuler'
import type { MapProjectionPreference } from '../domain/preferences'
import { normalizeLongitude } from '../domain/viewport'
import { supportsLocalMapGeometry, type LocalGeometryLimits, type LocalGeometryMap } from './localMapGeometry'

export interface LocalRulerHandle {
  setPointAtCenter: () => boolean
  focusMap: () => void
  refresh: () => LocalRulerAvailability
}

interface RulerMap extends LocalGeometryMap {
  getStyle(): unknown
  isMoving(): boolean
  doubleClickZoom: { isEnabled(): boolean; enable(): unknown; disable(): unknown }
  on(type: string, listener: () => void): unknown
  off(type: string, listener: () => void): unknown
}

export const rulerCenterIsUsable = (
  canvas: { left: number; top: number; width: number; height: number },
  viewport: { offsetLeft: number; offsetTop: number; width: number; height: number },
  isCanvasAtPoint: (x: number, y: number) => boolean,
) => {
  if (![canvas.left, canvas.top, canvas.width, canvas.height,
    viewport.offsetLeft, viewport.offsetTop, viewport.width, viewport.height].every(Number.isFinite) ||
    canvas.width < LOCAL_MAP_TOOLS_CONFIG.rulerCenterClearancePx ||
    canvas.height < LOCAL_MAP_TOOLS_CONFIG.rulerCenterClearancePx ||
    viewport.width <= 0 || viewport.height <= 0) return false
  const x = canvas.left + canvas.width / 2, y = canvas.top + canvas.height / 2
  const half = LOCAL_MAP_TOOLS_CONFIG.rulerCenterClearancePx / 2
  if (x - half < viewport.offsetLeft || y - half < viewport.offsetTop ||
      x + half > viewport.offsetLeft + viewport.width || y + half > viewport.offsetTop + viewport.height) return false
  const offsets = Array.from({ length: 9 }, (_, index) => -half + index * half / 4)
  return offsets.every(dx => offsets.every(dy => isCanvasAtPoint(x + dx, y + dy)))
}

export const isRulerPlacementTap = (
  event: Pick<PointerEvent, 'isTrusted' | 'button' | 'isPrimary' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
  gesture: { originRevision: number | undefined; revision: number; pointerCount: number; moved: boolean; multiple: boolean },
) => event.isTrusted && event.button === 0 && event.isPrimary &&
  !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
  gesture.originRevision === gesture.revision && gesture.pointerCount === 1 &&
  !gesture.moved && !gesture.multiple

export const createLocalRulerInteraction = ({
  map, read, projection, limits, disabled, centerUsable, onAvailability, onPoint, onCancel,
}: {
  map: RulerMap
  read: () => LocalRulerState
  projection: () => MapProjectionPreference
  limits: () => LocalGeometryLimits
  disabled: () => boolean
  centerUsable: () => boolean
  onAvailability: (availability: LocalRulerAvailability) => void
  onPoint: (point: Coordinates) => void
  onCancel: () => void
}) => {
  let disposed = false
  let previousAvailability: LocalRulerAvailability | undefined
  let previousDoubleClick: boolean | undefined
  const supported = () => !disabled() && Boolean(map.getStyle()) &&
    supportsLocalMapGeometry(map, projection(), limits())
  const update = () => {
    if (disposed) return 'unsupported'
    const availability: LocalRulerAvailability = disabled() || projection() !== 'flat' ? 'unsupported'
      : !map.getStyle() ? 'updating'
      : !supported() ? 'unsupported'
      : map.isMoving() ? 'moving'
        : read().phase === 'placing' && !centerUsable() ? 'obscured' : 'available'
    if (availability !== previousAvailability) {
      previousAvailability = availability
      onAvailability(availability)
    }
    return availability
  }
  const moving = () => {
    if (!disposed && read().points.length && !supported()) update()
  }
  const sync = () => {
    if (disposed) return
    if (read().phase === 'placing' && previousDoubleClick === undefined) {
      previousDoubleClick = map.doubleClickZoom.isEnabled()
      map.doubleClickZoom.disable()
    } else if (read().phase !== 'placing' && previousDoubleClick !== undefined) {
      if (previousDoubleClick) map.doubleClickZoom.enable()
      else map.doubleClickZoom.disable()
      previousDoubleClick = undefined
    }
    update()
  }
  const place = (point: [number, number]) => {
    sync()
    if (disposed || read().phase !== 'placing' || read().points.length === 2 ||
        update() !== 'available') return false
    const canvas = map.getCanvas()
    if (!point.every(Number.isFinite) || point[0] < 0 || point[1] < 0 ||
        point[0] > canvas.clientWidth || point[1] > canvas.clientHeight) {
      onPoint({ latitude: Number.NaN, longitude: Number.NaN })
      return false
    }
    const coordinate = map.unproject(point)
    onPoint({ latitude: coordinate.lat, longitude: normalizeLongitude(coordinate.lng) })
    return true
  }
  const events = ['movestart', 'moveend', 'resize', 'style.load', 'projectiontransition'] as const
  for (const event of events) map.on(event, update)
  map.on('move', moving)
  sync()
  return {
    sync,
    refresh: update,
    place,
    center: () => {
      if (disposed) return false
      const canvas = map.getCanvas()
      return place([canvas.clientWidth / 2, canvas.clientHeight / 2])
    },
    escape: (
      event: Pick<KeyboardEvent, 'key' | 'isComposing' | 'defaultPrevented' | 'preventDefault' | 'stopPropagation'>,
      fullscreen: boolean,
    ) => {
      if (disposed || read().phase !== 'placing' || event.key !== 'Escape' ||
          event.isComposing || event.defaultPrevented || fullscreen) return false
      event.preventDefault()
      event.stopPropagation()
      onCancel()
      return true
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      for (const event of events) map.off(event, update)
      map.off('move', moving)
      if (previousDoubleClick !== undefined) {
        if (previousDoubleClick) map.doubleClickZoom.enable()
        else map.doubleClickZoom.disable()
        previousDoubleClick = undefined
      }
    },
  }
}
