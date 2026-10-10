import { LngLat, type Map as MapLibreMap, type PaddingOptions } from 'maplibre-gl'
import { JOURNEY_CONFIG } from '../config/appConfig'
import { distanceKm } from '../domain/geo'
import type { JourneySnapshot } from '../domain/journey'
import { unwrapLongitude } from '../domain/viewport'

export interface JourneyFitRect {
  left: number
  right: number
  top: number
  bottom: number
}

const intersects = (a: JourneyFitRect, b: JourneyFitRect) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

export const largestJourneyFitRect = (
  viewport: JourneyFitRect,
  obstacles: readonly JourneyFitRect[],
): JourneyFitRect | undefined => {
  const bounds = {
    left: viewport.left + JOURNEY_CONFIG.fitMarginPx,
    right: viewport.right - JOURNEY_CONFIG.fitMarginPx,
    top: viewport.top + JOURNEY_CONFIG.fitMarginPx,
    bottom: viewport.bottom - JOURNEY_CONFIG.fitMarginPx,
  }
  const blocked = obstacles.filter(rect => intersects(rect, bounds))
  const xs = [...new Set([bounds.left, bounds.right, ...blocked.flatMap(r => [r.left, r.right])])]
    .filter(x => x >= bounds.left && x <= bounds.right).sort((a, b) => a - b)
  const ys = [...new Set([bounds.top, bounds.bottom, ...blocked.flatMap(r => [r.top, r.bottom])])]
    .filter(y => y >= bounds.top && y <= bounds.bottom).sort((a, b) => a - b)
  let best: JourneyFitRect | undefined
  let area = 0
  for (const left of xs) for (const right of xs) {
    if (right - left < JOURNEY_CONFIG.minimumFitSizePx) continue
    for (const top of ys) for (const bottom of ys) {
      if (bottom - top < JOURNEY_CONFIG.minimumFitSizePx) continue
      const candidate = { left, right, top, bottom }
      const candidateArea = (right - left) * (bottom - top)
      if (candidateArea > area && !blocked.some(rect => intersects(candidate, rect))) {
        area = candidateArea
        best = candidate
      }
    }
  }
  return best
}

export const journeyFitPadding = (canvas: DOMRect): Required<PaddingOptions> | undefined => {
  const visual = window.visualViewport
  const left = Math.max(canvas.left, visual?.offsetLeft ?? 0)
  const top = Math.max(canvas.top, visual?.offsetTop ?? 0)
  const viewport = {
    left, top,
    right: Math.min(canvas.right, (visual?.offsetLeft ?? 0) + (visual?.width ?? window.innerWidth)),
    bottom: Math.min(canvas.bottom, (visual?.offsetTop ?? 0) + (visual?.height ?? window.innerHeight)),
  }
  const obstacles = [...document.querySelectorAll<HTMLElement>(
    '.brand-panel, .details-panel, .workspace-dock, .control-panel__more[open] > .control-panel__more-body, .control-panel__urgent:not([hidden]), .maplibregl-ctrl-attrib',
  )].filter(element => element.getClientRects().length > 0)
    .map(element => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left - 8, right: rect.right + 8, top: rect.top - 8, bottom: rect.bottom + 8 }
    })
  const area = largestJourneyFitRect(viewport, obstacles)
  return area ? {
    left: area.left - canvas.left,
    right: canvas.right - area.right,
    top: area.top - canvas.top,
    bottom: canvas.bottom - area.bottom,
  } : undefined
}

const journeyCoordinates = (snapshot: JourneySnapshot) => [
  ...snapshot.segments.flatMap(segment => segment.points),
  ...snapshot.endpoints,
]

export type JourneyCameraFit =
  | {
      kind: 'available'
      bounds: [[number, number], [number, number]]
      padding: Required<PaddingOptions>
      camera: { center: [number, number]; zoom: number; bearing: number }
    }
  | { kind: 'unavailable'; message: string }

export const chooseJourneyCamera = (
  map: Pick<MapLibreMap, 'cameraForBounds'>,
  snapshot: JourneySnapshot,
  padding: Required<PaddingOptions> | undefined,
): JourneyCameraFit => {
  if (!padding) return {
    kind: 'unavailable',
    message: 'Not enough map space. Close a menu or enlarge the view.',
  }
  const points = journeyCoordinates(snapshot)
  const longitudes = points.map(point => unwrapLongitude(point.longitude, snapshot.position.longitude))
  const latitudes = points.map(point => point.latitude)
  const west = Math.min(...longitudes)
  const east = Math.max(...longitudes)
  const south = Math.min(...latitudes)
  const north = Math.max(...latitudes)
  if (![west, east, south, north].every(Number.isFinite) ||
      east - west > JOURNEY_CONFIG.maximumFitLongitudeSpan ||
      Math.max(Math.abs(south), Math.abs(north)) > JOURNEY_CONFIG.maximumFitLatitude) {
    return {
      kind: 'unavailable',
      message: 'Polar or wide path: explore the sections manually.',
    }
  }
  const bounds: [[number, number], [number, number]] = [[west, south], [east, north]]
  const unavailable: JourneyCameraFit = {
    kind: 'unavailable', message: 'Path framing unavailable. Explore or return to local view.',
  }
  try {
    const fitted = map.cameraForBounds(bounds, {
      padding, bearing: 0, maxZoom: JOURNEY_CONFIG.maximumFitZoom,
    })
    if (!fitted?.center || fitted.zoom === undefined || !Number.isFinite(fitted.zoom)) {
      return unavailable
    }
    const center = LngLat.convert(fitted.center)
    if (![center.lng, center.lat].every(Number.isFinite)) return unavailable
    return {
      kind: 'available', bounds, padding,
      camera: { center: [center.lng, center.lat], zoom: fitted.zoom, bearing: 0 },
    }
  } catch {
    return unavailable
  }
}

export const journeyIsFramed = (
  map: Pick<MapLibreMap, 'project' | 'unproject' | 'getCanvas' | 'getCenter'>,
  snapshot: JourneySnapshot,
  padding: Required<PaddingOptions>,
) => {
  const { clientWidth: width, clientHeight: height } = map.getCanvas()
  try {
    const referenceLongitude = map.getCenter().lng
    return journeyCoordinates(snapshot).every(point => {
      const pixel = map.project([unwrapLongitude(point.longitude, referenceLongitude), point.latitude])
      if (!Number.isFinite(pixel.x) || !Number.isFinite(pixel.y) ||
          pixel.x < padding.left - 1 || pixel.x > width - padding.right + 1 ||
          pixel.y < padding.top - 1 || pixel.y > height - padding.bottom + 1) return false
      const visiblePoint = map.unproject(pixel)
      // Back-side globe points can project inside the canvas; require a surface round trip.
      return distanceKm(point, { latitude: visiblePoint.lat, longitude: visiblePoint.lng }) < 1
    })
  } catch {
    return false
  }
}
