import type {
  ProjectionSpecification,
  StyleSpecification,
} from 'maplibre-gl'
import { MAP_PROJECTION_CONFIG } from '../config/appConfig'
import type { MapProjectionPreference } from '../domain/preferences'

interface ProjectionMap {
  getProjection(): ProjectionSpecification | undefined
  setProjection(projection: ProjectionSpecification): unknown
}

interface ViewportMap {
  getCanvas(): { clientWidth: number; clientHeight: number }
  getCenter(): { lat: number; lng: number }
  getPitch(): number
  getProjection(): ProjectionSpecification | undefined
  getBounds(): {
    getNorth(): number
    getSouth(): number
    getEast(): number
    getWest(): number
  }
  project(coordinate: [number, number]): { x: number; y: number }
  unproject(point: [number, number]): { lat: number; lng: number }
}

export const mapProjectionForPreference = (
  preference: MapProjectionPreference,
): ProjectionSpecification =>
  preference === 'auto'
    ? MAP_PROJECTION_CONFIG.automaticProjection
    : { type: 'mercator' }

export const applyMapProjection = (
  map: ProjectionMap,
  preference: MapProjectionPreference,
) => {
  const projection = mapProjectionForPreference(preference)
  if ((map.getProjection()?.type ?? 'mercator') === projection.type) {
    return false
  }
  map.setProjection(projection)
  return true
}

export const withMapProjection = (
  style: StyleSpecification,
  preference: MapProjectionPreference,
): StyleSpecification => ({
  ...style,
  projection: mapProjectionForPreference(preference),
})

const canvasPerimeter = (width: number, height: number, margin = 0) => {
  const points: [number, number][] = []
  const fullWidth = width + margin * 2
  const fullHeight = height + margin * 2
  for (let index = 0; index < 8; index += 1) {
    points.push([fullWidth * (index / 8) - margin, -margin])
  }
  for (let index = 0; index < 8; index += 1) {
    points.push([width + margin, fullHeight * (index / 8) - margin])
  }
  for (let index = 0; index < 8; index += 1) {
    points.push([fullWidth * (1 - index / 8) - margin, height + margin])
  }
  for (let index = 0; index < 8; index += 1) {
    points.push([-margin, fullHeight * (1 - index / 8) - margin])
  }
  return points
}

export const sampleMapViewport = (map: ViewportMap) => {
  const { clientWidth: width, clientHeight: height } = map.getCanvas()
  const center = map.getCenter()
  const bounds = map.getBounds()
  const projection = map.getProjection()?.type
  const curved = projection !== undefined && projection !== 'mercator'
  const validSize =
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  const perimeter = canvasPerimeter(width, height).map((point) => {
    const coordinate = map.unproject(point)
    return { latitude: coordinate.lat, longitude: coordinate.lng }
  })
  const surfaceIsContinuous =
    validSize &&
    (!curved ||
      (bounds.getNorth() < 90 &&
        bounds.getSouth() > -90 &&
        canvasPerimeter(
          width,
          height,
          MAP_PROJECTION_CONFIG.surfaceMarginPx,
        ).every(([x, y]) => {
          const coordinate = map.unproject([x, y])
          const projected = map.project([coordinate.lng, coordinate.lat])
          // Globe unprojection snaps sky pixels to the limb. The outer guard
          // keeps numerical tolerance from accepting an off-surface sliver.
          return (
            Math.hypot(projected.x - x, projected.y - y) <=
            MAP_PROJECTION_CONFIG.surfaceRoundTripTolerancePx
          )
        })))

  return {
    center: { latitude: center.lat, longitude: center.lng },
    perimeter,
    pitchDegrees: map.getPitch(),
    longitudeSpanDegrees: Math.abs(bounds.getEast() - bounds.getWest()),
    surfaceIsContinuous,
  }
}
