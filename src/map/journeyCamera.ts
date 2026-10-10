import { LngLat, MercatorCoordinate, type Map as MapLibreMap, type PaddingOptions } from 'maplibre-gl'
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
    message: 'Not enough unobscured map space to frame this path. Close a menu or enlarge the view.',
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
      message: 'This polar or very wide path cannot be framed safely in the current projection. Explore the captured sections manually.',
    }
  }
  const bounds: [[number, number], [number, number]] = [[west, south], [east, north]]
  const projected = points.map((point, index) =>
    MercatorCoordinate.fromLngLat([longitudes[index]!, point.latitude]))
  let longest = 0
  let axis = 0
  let offset = 0
  for (const segment of snapshot.segments) {
    const start = projected[offset]
    const end = projected[offset + segment.points.length - 1]
    offset += segment.points.length
    if (!start || !end) continue
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    if (length > longest) {
      longest = length
      axis = Math.atan2(end.x - start.x, start.y - end.y) * 180 / Math.PI
    }
  }
  const clampAxis = (value: number) => {
    const undirected = ((value + 270) % 180 + 180) % 180 - 90
    return Math.max(-JOURNEY_CONFIG.maximumFitBearing, Math.min(JOURNEY_CONFIG.maximumFitBearing, undirected))
  }
  const anchor = MercatorCoordinate.fromLngLat([(west + east) / 2, (south + north) / 2])
  let best: Extract<JourneyCameraFit, { kind: 'available' }> | undefined
  for (const bearing of new Set([0, clampAxis(axis), clampAxis(axis + 90)])) {
    const radians = bearing * Math.PI / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    const rotated = projected.map(point => ({
      x: anchor.x + cos * (point.x - anchor.x) + sin * (point.y - anchor.y),
      y: anchor.y - sin * (point.x - anchor.x) + cos * (point.y - anchor.y),
    }))
    const southwest = new MercatorCoordinate(Math.min(...rotated.map(point => point.x)), Math.max(...rotated.map(point => point.y))).toLngLat()
    const northeast = new MercatorCoordinate(Math.max(...rotated.map(point => point.x)), Math.min(...rotated.map(point => point.y))).toLngLat()
    if (Math.max(Math.abs(southwest.lat), Math.abs(northeast.lat)) > JOURNEY_CONFIG.maximumFitLatitude) continue
    try {
      // Fit the actual rotated geometry, not its unrotated bounding-box diagonal.
      // MapLibre owns zoom/padding; inverse rotation restores geographic coordinates.
      const fitted = map.cameraForBounds([southwest, northeast], {
        padding, bearing: 0, maxZoom: JOURNEY_CONFIG.maximumFitZoom,
      })
      if (!fitted?.center || fitted.zoom === undefined || !Number.isFinite(fitted.zoom)) continue
      const center = MercatorCoordinate.fromLngLat(LngLat.convert(fitted.center))
      const restored = new MercatorCoordinate(
        anchor.x + cos * (center.x - anchor.x) - sin * (center.y - anchor.y),
        anchor.y + sin * (center.x - anchor.x) + cos * (center.y - anchor.y),
      ).toLngLat()
      if (![restored.lng, restored.lat].every(Number.isFinite)) continue
      if (!best || fitted.zoom > best.camera.zoom) best = {
        kind: 'available', bounds, padding,
        camera: { center: [restored.lng, restored.lat], zoom: fitted.zoom, bearing },
      }
    } catch {
      // A projection may decline one orientation while another remains usable.
    }
  }
  if (best) return best
  return { kind: 'unavailable', message: 'The map could not frame this path. Explore it manually or return to the local view.' }
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
