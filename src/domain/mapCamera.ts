export interface MapCameraState {
  latitude: number
  longitude: number
  zoom: number
  bearing: number
  pitch: number
}

export const MAP_CAMERA_LIMITS = {
  minimumLatitude: -90,
  maximumLatitude: 90,
  minimumLongitude: -180,
  maximumLongitude: 180,
  minimumZoom: 0,
  maximumZoom: 22,
  minimumBearing: -180,
  maximumBearing: 180,
  minimumPitch: 0,
  maximumPitch: 60,
} as const

const isBoundedNumber = (
  value: unknown,
  minimum: number,
  maximum: number,
): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= minimum &&
  value <= maximum

export const isMapCameraState = (
  value: unknown,
): value is MapCameraState => {
  if (typeof value !== 'object' || value === null) return false
  const camera = value as Record<string, unknown>
  return (
    isBoundedNumber(
      camera.latitude,
      MAP_CAMERA_LIMITS.minimumLatitude,
      MAP_CAMERA_LIMITS.maximumLatitude,
    ) &&
    isBoundedNumber(
      camera.longitude,
      MAP_CAMERA_LIMITS.minimumLongitude,
      MAP_CAMERA_LIMITS.maximumLongitude,
    ) &&
    isBoundedNumber(
      camera.zoom,
      MAP_CAMERA_LIMITS.minimumZoom,
      MAP_CAMERA_LIMITS.maximumZoom,
    ) &&
    isBoundedNumber(
      camera.bearing,
      MAP_CAMERA_LIMITS.minimumBearing,
      MAP_CAMERA_LIMITS.maximumBearing,
    ) &&
    isBoundedNumber(
      camera.pitch,
      MAP_CAMERA_LIMITS.minimumPitch,
      MAP_CAMERA_LIMITS.maximumPitch,
    )
  )
}

const rounded = (value: number, precision: number) => {
  const result = Number(value.toFixed(precision))
  return Object.is(result, -0) ? 0 : result
}

const wrapLongitude = (longitude: number) => {
  if (!Number.isFinite(longitude)) return longitude
  const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180
  return wrapped === -180 && longitude > 0 ? 180 : wrapped
}

export const roundMapCameraState = (
  camera: MapCameraState,
  coordinatePrecision: number,
): MapCameraState => ({
  latitude: rounded(camera.latitude, coordinatePrecision),
  longitude: rounded(
    wrapLongitude(camera.longitude),
    coordinatePrecision,
  ),
  zoom: rounded(camera.zoom, 2),
  bearing: rounded(camera.bearing, 1),
  pitch: rounded(camera.pitch, 1),
})
