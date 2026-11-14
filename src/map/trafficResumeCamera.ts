import {
  MAP_CAMERA_LIMITS,
  type MapCameraState,
} from '../domain/mapCamera'
import type { TrafficViewport } from '../domain/viewport'

const RESUME_RADIUS_FRACTION = 0.9

export const marineResumeCamera = (
  camera: MapCameraState,
  viewport: TrafficViewport,
  maximumRadiusKm: number,
): MapCameraState | undefined => {
  const measuredRadiusKm =
    viewport.measuredRadiusKm ?? viewport.enclosingRadiusKm
  if (
    !Number.isFinite(measuredRadiusKm) ||
    measuredRadiusKm <= 0 ||
    !Number.isFinite(maximumRadiusKm) ||
    maximumRadiusKm <= 0
  ) {
    return undefined
  }

  if (measuredRadiusKm <= maximumRadiusKm) return camera

  const targetRadiusKm = maximumRadiusKm * RESUME_RADIUS_FRACTION
  const requiredZoom =
    camera.zoom + Math.log2(measuredRadiusKm / targetRadiusKm)
  if (
    !Number.isFinite(requiredZoom) ||
    requiredZoom > MAP_CAMERA_LIMITS.maximumZoom
  ) {
    return undefined
  }

  return {
    ...camera,
    zoom: Math.max(camera.zoom, requiredZoom),
  }
}
