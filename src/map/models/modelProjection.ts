import { ZOOM_TRAFFIC_CONTEXT_CONFIG } from '../../config/appConfig'
import type { TrafficModelBounds } from './trafficModelAsset'

/** CPU mirror of the model shader, used for picking and per-frame uniforms. */
export const EARTH_RADIUS_METERS = 6_371_008.8
export const EARTH_CIRCUMFERENCE_METERS = 2 * Math.PI * EARTH_RADIUS_METERS
export const MAXIMUM_MERCATOR_LATITUDE = 85.051129
export const MODEL_FADE_START = 0.55
export const MODEL_FADE_END = 0.75
export const GLOBE_ONLY_TRANSITION = 0.999
export const HORIZON_TRANSITION = 0.5
export const HORIZON_EPSILON = 1e-3
export const MINIMUM_PERSPECTIVE_SCALE = 0.5
export const MAXIMUM_PERSPECTIVE_SCALE = 2
export const MINIMUM_VISIBLE_ALPHA = 0.004

const RADIANS = Math.PI / 180

export type Vec3 = readonly [number, number, number]
export type Vec4 = [number, number, number, number]

export const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

export const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Matches MapLibre's custom-layer mix between Mercator and globe output. */
export const mixTransition = (mercator: number, globe: number, t: number) =>
  t <= 0 ? mercator : t >= GLOBE_ONLY_TRANSITION ? globe : mercator + (globe - mercator) * t

export const mercatorX = (longitude: number) => (180 + longitude) / 360

const mercatorLatitude = (latitude: number) =>
  clamp(latitude, -MAXIMUM_MERCATOR_LATITUDE, MAXIMUM_MERCATOR_LATITUDE)

export const mercatorY = (latitude: number) =>
  (180 -
    (180 / Math.PI) *
      Math.log(Math.tan(Math.PI / 4 + (mercatorLatitude(latitude) * RADIANS) / 2))) /
  360

export const latitudeFromMercatorY = (y: number) =>
  (360 / Math.PI) * Math.atan(Math.exp((180 - y * 360) * RADIANS)) - 90

export const mercatorUnitsPerMeter = (latitude: number) =>
  1 / (EARTH_CIRCUMFERENCE_METERS * Math.cos(mercatorLatitude(latitude) * RADIANS))

export const wrapMercatorOffset = (offset: number) => offset - Math.round(offset)

export const sphereVector = (longitude: number, latitude: number): Vec3 => {
  const lambda = longitude * RADIANS
  const phi = latitude * RADIANS
  const cosine = Math.cos(phi)
  return [Math.sin(lambda) * cosine, Math.sin(phi), Math.cos(lambda) * cosine]
}

export const IDENTITY_MATRIX: Readonly<Float64Array> = Float64Array.from([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
])

/** Column-major `a × b`. */
export const multiplyMat4 = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  const out = new Float64Array(16)
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[column * 4 + k]
      out[column * 4 + row] = sum
    }
  }
  return out
}

export const translationMat4 = (x: number, y: number, z: number) => {
  const out = Float64Array.from(IDENTITY_MATRIX)
  out[12] = x
  out[13] = y
  out[14] = z
  return out
}

export const transformVec4 = (
  m: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
  w: number,
): Vec4 => [
  m[0] * x + m[4] * y + m[8] * z + m[12] * w,
  m[1] * x + m[5] * y + m[9] * z + m[13] * w,
  m[2] * x + m[6] * y + m[10] * z + m[14] * w,
  m[3] * x + m[7] * y + m[11] * z + m[15] * w,
]

export const invertMat4 = (a: ArrayLike<number>): Float64Array | undefined => {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] =
    Array.from({ length: 16 }, (_, index) => a[index])
  const b00 = a00 * a11 - a01 * a10
  const b01 = a00 * a12 - a02 * a10
  const b02 = a00 * a13 - a03 * a10
  const b03 = a01 * a12 - a02 * a11
  const b04 = a01 * a13 - a03 * a11
  const b05 = a02 * a13 - a03 * a12
  const b06 = a20 * a31 - a21 * a30
  const b07 = a20 * a32 - a22 * a30
  const b08 = a20 * a33 - a23 * a30
  const b09 = a21 * a32 - a22 * a31
  const b10 = a21 * a33 - a23 * a31
  const b11 = a22 * a33 - a23 * a32
  const determinant =
    b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  if (!Number.isFinite(determinant) || determinant === 0) return undefined
  const d = 1 / determinant
  return Float64Array.from([
    (a11 * b11 - a12 * b10 + a13 * b09) * d,
    (a02 * b10 - a01 * b11 - a03 * b09) * d,
    (a31 * b05 - a32 * b04 + a33 * b03) * d,
    (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d,
    (a00 * b11 - a02 * b08 + a03 * b07) * d,
    (a32 * b02 - a30 * b05 - a33 * b01) * d,
    (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d,
    (a01 * b08 - a00 * b10 - a03 * b06) * d,
    (a30 * b04 - a31 * b02 + a33 * b00) * d,
    (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d,
    (a00 * b09 - a01 * b07 + a02 * b06) * d,
    (a31 * b01 - a30 * b03 - a32 * b00) * d,
    (a20 * b03 - a21 * b01 + a22 * b00) * d,
  ])
}

/** Eye position of a perspective matrix: `M⁻¹ · (0, 0, 1, 0)`. */
const cameraPosition = (matrix: ArrayLike<number>): Vec3 | undefined => {
  const inverse = invertMat4(matrix)
  if (!inverse || Math.abs(inverse[11]) < 1e-300) return undefined
  return [inverse[8] / inverse[11], inverse[9] / inverse[11], inverse[10] / inverse[11]]
}

/** Smaller ray-sphere root strictly before the target means the globe hides it. */
export const horizonOccludes = (camera: Vec3, point: Vec3) => {
  const d = [point[0] - camera[0], point[1] - camera[1], point[2] - camera[2]]
  const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]
  const b = camera[0] * d[0] + camera[1] * d[1] + camera[2] * d[2]
  const c = camera[0] ** 2 + camera[1] ** 2 + camera[2] ** 2 - 1
  const discriminant = b * b - a * c
  if (a <= 0 || discriminant <= 0) return false
  const root = (-b - Math.sqrt(discriminant)) / a
  return root > 0 && root < 1 - HORIZON_EPSILON
}

export const contextOpacityFactor = (zoom: number) =>
  ZOOM_TRAFFIC_CONTEXT_CONFIG.maximumOpacity *
  clamp(
    (zoom - ZOOM_TRAFFIC_CONTEXT_CONFIG.minimumZoom) /
      (ZOOM_TRAFFIC_CONTEXT_CONFIG.fullOpacityZoom -
        ZOOM_TRAFFIC_CONTEXT_CONFIG.minimumZoom),
    0,
    1,
  )

export const perspectiveScale = (centerW: number, w: number) =>
  clamp(0.5 + (0.5 * centerW) / w, MINIMUM_PERSPECTIVE_SCALE, MAXIMUM_PERSPECTIVE_SCALE)

export const FOOTPRINT_OPACITY = 0.85
export const FOOTPRINT_HEIGHT_SCALE = 0.02
export const MODEL_FLAG_ZOOM_CONTEXT = 1
export const MODEL_FLAG_DROP_LINE = 2
export const MODEL_FLAG_SELECTED = 4

export interface MercatorPoint {
  x: number
  y: number
}

/** Fields read by both the shader and its CPU mirror. */
export interface ModelInstanceGeometry {
  longitude: number
  latitude: number
  altitudeMeters: number
  headingDegrees: number
  lengthMeters: number
  beamMeters: number
  heightMeters: number
  bounds: TrafficModelBounds
  lengthScale: number
  extentMeters: number
  floorPx: number
  opacity: number
  flags: number
}

export interface ModelFrameInput {
  transition: number
  mainMatrix: ArrayLike<number>
  fallbackMatrix: ArrayLike<number>
  centerLongitude: number
  centerLatitude: number
  zoom: number
  cssWidth: number
  cssHeight: number
  reference: MercatorPoint
}

export interface ModelFrame {
  transition: number
  mercatorMatrix: Float64Array
  globeMatrix: Float64Array
  rtcMatrix: Float32Array
  globeRtcMatrix: Float32Array
  globeOrigin: Vec3
  reference: MercatorPoint
  cssWidth: number
  cssHeight: number
  kMercator: number
  kGlobe: number
  centerW: number
  cameraGlobe: Vec3
  cameraMercatorZ: number
  cameraGlobeAltitudeMeters: number
  contextFactor: number
  frontFaceCcw: boolean
}

interface ProjectedPoint {
  mercator: Vec4
  globe?: Vec4
  clip: Vec4
  sphere?: Vec3
}

const mixClip = (mercator: Vec4, globe: Vec4, t: number): Vec4 => [
  mixTransition(mercator[0], globe[0], t),
  mixTransition(mercator[1], globe[1], t),
  mixTransition(mercator[2], globe[2], t),
  mixTransition(mercator[3], globe[3], t),
]

/** Projects a local east/north/up offset from an anchor, as the shader does. */
export const projectLocalPoint = (
  frame: Pick<ModelFrame, 'transition' | 'mercatorMatrix' | 'globeMatrix' | 'reference'>,
  longitude: number,
  latitude: number,
  altitudeMeters: number,
  east = 0,
  north = 0,
  up = 0,
): ProjectedPoint => {
  const mpm = mercatorUnitsPerMeter(latitude)
  const x =
    frame.reference.x + wrapMercatorOffset(mercatorX(longitude) - frame.reference.x) + east * mpm
  const mercator = transformVec4(
    frame.mercatorMatrix,
    x,
    mercatorY(latitude) - north * mpm,
    (altitudeMeters + up) * mpm,
    1,
  )
  if (frame.transition <= 0) return { mercator, clip: mercator }
  const u = sphereVector(longitude, latitude)
  const lambda = longitude * RADIANS
  const e: Vec3 = [Math.cos(lambda), 0, -Math.sin(lambda)]
  const n: Vec3 = [u[1] * e[2] - u[2] * e[1], u[2] * e[0] - u[0] * e[2], u[0] * e[1] - u[1] * e[0]]
  const lift = 1 + altitudeMeters / EARTH_RADIUS_METERS
  const offset = (axis: 0 | 1 | 2) =>
    u[axis] * lift + (e[axis] * east + n[axis] * north + u[axis] * up) / EARTH_RADIUS_METERS
  const sphere: Vec3 = [offset(0), offset(1), offset(2)]
  const globe = transformVec4(frame.globeMatrix, sphere[0], sphere[1], sphere[2], 1)
  return { mercator, globe, clip: mixClip(mercator, globe, frame.transition), sphere }
}

const rowNorm = (m: ArrayLike<number>) => Math.hypot(m[1], m[5], m[9])

export const createModelFrame = (input: ModelFrameInput): ModelFrame | undefined => {
  const transition = clamp(input.transition, 0, 1)
  if (!(input.cssWidth > 0 && input.cssHeight > 0)) return undefined
  const mercatorMatrix = Float64Array.from(transition > 0 ? input.fallbackMatrix : input.mainMatrix)
  const globeMatrix = Float64Array.from(transition > 0 ? input.mainMatrix : IDENTITY_MATRIX)
  const cameraMercator = cameraPosition(mercatorMatrix)
  const cameraGlobe = transition > 0 ? cameraPosition(globeMatrix) : ([0, 0, 0] as Vec3)
  if (!cameraMercator || !cameraGlobe || !(cameraMercator[2] > 0)) return undefined
  const centerSphere = sphereVector(input.centerLongitude, input.centerLatitude)
  const globeOrigin: Vec3 = [
    Math.fround(centerSphere[0]),
    Math.fround(centerSphere[1]),
    Math.fround(centerSphere[2]),
  ]
  const frame: ModelFrame = {
    transition,
    mercatorMatrix,
    globeMatrix,
    rtcMatrix: Float32Array.from(
      multiplyMat4(mercatorMatrix, translationMat4(input.reference.x, input.reference.y, 0)),
    ),
    globeRtcMatrix: Float32Array.from(
      multiplyMat4(globeMatrix, translationMat4(...globeOrigin)),
    ),
    globeOrigin,
    reference: { ...input.reference },
    cssWidth: input.cssWidth,
    cssHeight: input.cssHeight,
    kMercator: (rowNorm(mercatorMatrix) * input.cssHeight) / 2,
    kGlobe: (rowNorm(globeMatrix) * input.cssHeight) / 2,
    centerW: 1,
    cameraGlobe,
    cameraMercatorZ: cameraMercator[2],
    cameraGlobeAltitudeMeters: (Math.hypot(...cameraGlobe) - 1) * EARTH_RADIUS_METERS,
    contextFactor: contextOpacityFactor(input.zoom),
    frontFaceCcw: true,
  }
  const center = projectLocalPoint(frame, input.centerLongitude, input.centerLatitude, 0)
  if (!(center.clip[3] > 0)) return undefined
  frame.centerW = center.clip[3]
  const step = Math.max(1e-3, (1e-3 * cameraMercator[2]) / mercatorUnitsPerMeter(input.centerLatitude))
  const east = projectLocalPoint(frame, input.centerLongitude, input.centerLatitude, 0, step).clip
  const north = projectLocalPoint(frame, input.centerLongitude, input.centerLatitude, 0, 0, step).clip
  const ndc = (clip: Vec4) => [clip[0] / clip[3], clip[1] / clip[3]]
  const [x0, y0] = ndc(center.clip)
  const [x1, y1] = ndc(east)
  const [x2, y2] = ndc(north)
  frame.frontFaceCcw = !((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0) < 0)
  return frame
}

/** Lifted visibility `v`; the ground footprint uses `1 - v`. */
export const liftedVisibility = (frame: ModelFrame, altitudeMeters: number, latitude: number) => {
  if (!(altitudeMeters > 0)) return 1
  const ratio = mixTransition(
    (altitudeMeters * mercatorUnitsPerMeter(latitude)) / Math.max(frame.cameraMercatorZ, 1e-12),
    altitudeMeters / Math.max(frame.cameraGlobeAltitudeMeters, 1),
    frame.transition,
  )
  return 1 - smoothstep(MODEL_FADE_START, MODEL_FADE_END, ratio)
}

export const instanceBaseOpacity = (frame: ModelFrame, instance: ModelInstanceGeometry) =>
  instance.opacity * (instance.flags & MODEL_FLAG_ZOOM_CONTEXT ? frame.contextFactor : 1)

const occluded = (frame: ModelFrame, point: ProjectedPoint) =>
  frame.transition > HORIZON_TRANSITION &&
  point.sphere !== undefined &&
  horizonOccludes(frame.cameraGlobe, point.sphere)

export interface ModelAnchor {
  x: number
  y: number
  radiusPx: number
  lengthAxis: { x: number; y: number }
  beamAxis: { x: number; y: number }
  heightAxis: { x: number; y: number }
  hull: readonly { x: number; y: number }[]
  alpha: number
  lifted: boolean
}

const convexHull = (points: readonly { x: number; y: number }[]) => {
  const sorted = [...points]
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .filter(
      (point, index, values) =>
        index === 0 ||
        Math.hypot(point.x - values[index - 1].x, point.y - values[index - 1].y) > 1e-7,
    )
  if (sorted.length <= 2) return sorted
  const cross = (
    origin: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
  const lower: { x: number; y: number }[] = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop()
    lower.push(point)
  }
  const upper: { x: number; y: number }[] = []
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop()
    upper.push(point)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** Screen anchor of the dominant lifted or footprint draw, in CSS pixels. */
export const projectModelInstance = (
  frame: ModelFrame,
  instance: ModelInstanceGeometry,
): ModelAnchor | undefined => {
  const altitude = Math.max(0, instance.altitudeMeters)
  const visibility = liftedVisibility(frame, altitude, instance.latitude)
  const lifted = visibility > 0.5
  const alpha =
    instanceBaseOpacity(frame, instance) *
    (lifted ? visibility : (1 - visibility) * FOOTPRINT_OPACITY)
  if (!(alpha >= MINIMUM_VISIBLE_ALPHA)) return undefined
  const point = projectLocalPoint(frame, instance.longitude, instance.latitude, lifted ? altitude : 0)
  const w = point.clip[3]
  if (!(w > 0) || occluded(frame, point)) return undefined
  const mpm = mercatorUnitsPerMeter(instance.latitude)
  const pxPerMeter = mixTransition(
    (frame.kMercator * mpm) / point.mercator[3],
    frame.kGlobe / (EARTH_RADIUS_METERS * (point.globe?.[3] ?? 1)),
    frame.transition,
  )
  const drawnPx = Math.max(
    instance.floorPx * perspectiveScale(frame.centerW, w),
    instance.extentMeters * pxPerMeter,
  )
  const modelScale = Math.max(
    1,
    (instance.floorPx * perspectiveScale(frame.centerW, w)) /
      Math.max(instance.extentMeters * pxPerMeter, 1e-6),
  )
  const heading = instance.headingDegrees * RADIANS
  const halfLength =
    (instance.lengthMeters * instance.lengthScale * modelScale) / 2
  const halfBeam = (instance.beamMeters * instance.lengthScale * modelScale) / 2
  const centerX = ((point.clip[0] / w + 1) / 2) * frame.cssWidth
  const centerY = ((1 - point.clip[1] / w) / 2) * frame.cssHeight
  const projectOffset = (east: number, north: number, up: number) => {
    const projected = projectLocalPoint(
      frame,
      instance.longitude,
      instance.latitude,
      lifted ? altitude : 0,
      east,
      north,
      up,
    ).clip
    if (!(projected[3] > 0)) return undefined
    return {
      x: ((projected[0] / projected[3] + 1) / 2) * frame.cssWidth,
      y: ((1 - projected[1] / projected[3]) / 2) * frame.cssHeight,
    }
  }
  const relative = (projected: { x: number; y: number } | undefined) => ({
    x: (projected?.x ?? centerX) - centerX,
    y: (projected?.y ?? centerY) - centerY,
  })
  const lengthAxis = relative(
    projectOffset(halfLength * Math.sin(heading), halfLength * Math.cos(heading), 0),
  )
  const projectedBeamAxis = relative(
    projectOffset(halfBeam * Math.cos(heading), -halfBeam * Math.sin(heading), 0),
  )
  const verticalScale =
    instance.lengthScale * modelScale * (lifted ? 1 : FOOTPRINT_HEIGHT_SCALE)
  const lowerHeight =
    instance.bounds.minimum[2] === 0
      ? undefined
      : projectOffset(0, 0, instance.bounds.minimum[2] * verticalScale)
  const upperHeight = projectOffset(0, 0, instance.bounds.maximum[2] * verticalScale)
  const heightAxis = {
    x: (upperHeight?.x ?? centerX) - (lowerHeight?.x ?? centerX),
    y: (upperHeight?.y ?? centerY) - (lowerHeight?.y ?? centerY),
  }
  const minimumHalfAxis = (instance.floorPx * perspectiveScale(frame.centerW, w)) / 2
  const lengthMagnitude = Math.hypot(lengthAxis.x, lengthAxis.y)
  if (lengthMagnitude < minimumHalfAxis) {
    const direction = lengthMagnitude > 0 ? 1 / lengthMagnitude : 0
    lengthAxis.x =
      lengthMagnitude > 0
        ? lengthAxis.x * direction * minimumHalfAxis
        : minimumHalfAxis
    lengthAxis.y = lengthMagnitude > 0 ? lengthAxis.y * direction * minimumHalfAxis : 0
  }
  const lengthUnit = {
    x: lengthAxis.x / Math.hypot(lengthAxis.x, lengthAxis.y),
    y: lengthAxis.y / Math.hypot(lengthAxis.x, lengthAxis.y),
  }
  const perpendicular = { x: -lengthUnit.y, y: lengthUnit.x }
  const beamAlongLength =
    projectedBeamAxis.x * lengthUnit.x + projectedBeamAxis.y * lengthUnit.y
  const beamAcrossLength =
    projectedBeamAxis.x * perpendicular.x + projectedBeamAxis.y * perpendicular.y
  const minimumBeamAcross = Math.max(minimumHalfAxis, Math.abs(beamAcrossLength))
  const beamAxis = {
    x: beamAlongLength * lengthUnit.x + minimumBeamAcross * perpendicular.x,
    y: beamAlongLength * lengthUnit.y + minimumBeamAcross * perpendicular.y,
  }
  const pickPoints: { x: number; y: number }[] = []
  const localScale = instance.lengthScale * modelScale
  for (const starboard of [instance.bounds.minimum[0], instance.bounds.maximum[0]]) {
    for (const forward of [instance.bounds.minimum[1], instance.bounds.maximum[1]]) {
      for (const upMeters of [instance.bounds.minimum[2], instance.bounds.maximum[2]]) {
        const projected = projectOffset(
          starboard * localScale * Math.cos(heading) +
            forward * localScale * Math.sin(heading),
          -starboard * localScale * Math.sin(heading) +
            forward * localScale * Math.cos(heading),
          upMeters * verticalScale,
        )
        if (projected) pickPoints.push(projected)
      }
    }
  }
  for (const lengthSign of [-1, 1]) {
    for (const beamSign of [-1, 1]) {
      pickPoints.push({
        x: centerX + lengthAxis.x * lengthSign + beamAxis.x * beamSign,
        y: centerY + lengthAxis.y * lengthSign + beamAxis.y * beamSign,
      })
    }
  }
  return {
    x: centerX,
    y: centerY,
    radiusPx: drawnPx / 2,
    lengthAxis,
    beamAxis,
    heightAxis,
    hull: convexHull(pickPoints),
    alpha,
    lifted,
  }
}

export type ScreenPoint = { x: number; y: number } | readonly [number, number]
export type ScreenGeometry = ScreenPoint | readonly [ScreenPoint, ScreenPoint]

const screenXY = (point: ScreenPoint) =>
  'x' in point ? { x: point.x, y: point.y } : { x: point[0], y: point[1] }

const isScreenBox = (
  geometry: ScreenGeometry,
): geometry is readonly [ScreenPoint, ScreenPoint] =>
  Array.isArray(geometry) && typeof geometry[0] !== 'number'

/** Distance used to order hits, or undefined when the model misses. */
export const modelHitDistance = (anchor: ModelAnchor, geometry: ScreenGeometry) => {
  const pointInHull = (candidate: { x: number; y: number }) => {
    let sign = 0
    for (let index = 0; index < anchor.hull.length; index += 1) {
      const current = anchor.hull[index]
      const next = anchor.hull[(index + 1) % anchor.hull.length]
      const cross =
        (next.x - current.x) * (candidate.y - current.y) -
        (next.y - current.y) * (candidate.x - current.x)
      if (Math.abs(cross) <= 1e-7) continue
      const currentSign = Math.sign(cross)
      if (sign !== 0 && currentSign !== sign) return false
      sign = currentSign
    }
    return anchor.hull.length >= 3
  }
  const distanceToCenter = (candidate: { x: number; y: number }) =>
    Math.hypot(anchor.x - candidate.x, anchor.y - candidate.y)

  if (!isScreenBox(geometry)) {
    const candidate = screenXY(geometry)
    return pointInHull(candidate) ? distanceToCenter(candidate) : undefined
  }
  const a = screenXY(geometry[0])
  const b = screenXY(geometry[1])
  const box = [
    { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
    { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
    { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) },
  ]
  const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }]
  for (let index = 0; index < anchor.hull.length; index += 1) {
    const current = anchor.hull[index]
    const next = anchor.hull[(index + 1) % anchor.hull.length]
    const axis = { x: -(next.y - current.y), y: next.x - current.x }
    if (Math.hypot(axis.x, axis.y) > 1e-7) axes.push(axis)
  }
  for (const axis of axes) {
    const polygonProjection = anchor.hull.map((vertex) => vertex.x * axis.x + vertex.y * axis.y)
    const boxProjection = box.map((vertex) => vertex.x * axis.x + vertex.y * axis.y)
    if (
      Math.max(...polygonProjection) < Math.min(...boxProjection) ||
      Math.max(...boxProjection) < Math.min(...polygonProjection)
    ) {
      return undefined
    }
  }
  return distanceToCenter({
    x: (Math.min(a.x, b.x) + Math.max(a.x, b.x)) / 2,
    y: (Math.min(a.y, b.y) + Math.max(a.y, b.y)) / 2,
  })
}
