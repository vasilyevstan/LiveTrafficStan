import { LOCAL_MAP_TOOLS_CONFIG } from '../config/appConfig'
import type { MapProjectionPreference } from '../domain/preferences'
import { assessTrafficViewport } from '../domain/viewport'
import { sampleMapViewport } from './mapProjection'

export type LocalGeometryMap = Parameters<typeof sampleMapViewport>[0]

export interface LocalGeometryLimits {
  coordinatePrecision: number
  maximumRadiusKm: number
}

export const supportsLocalMapGeometry = (
  map: LocalGeometryMap,
  preference: MapProjectionPreference,
  limits: LocalGeometryLimits,
) => {
  const { clientWidth: width, clientHeight: height } = map.getCanvas()
  if (
    preference !== 'flat' ||
    map.getProjection()?.type !== 'mercator' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(map.getPitch()) ||
    Math.abs(map.getPitch()) > LOCAL_MAP_TOOLS_CONFIG.maximumPitchDegrees
  ) return false

  return assessTrafficViewport(sampleMapViewport(map), limits).kind === 'eligible'
}
