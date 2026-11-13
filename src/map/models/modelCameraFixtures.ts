import type { ModelInstance } from './modelInstances'
import {
  IDENTITY_MATRIX,
  mercatorX,
  mercatorY,
  multiplyMat4,
  translationMat4,
  type ModelFrameInput,
} from './modelProjection'

/** Test cameras that follow MapLibre 6.10's Mercator and vertical-perspective chains. */
export const MAPLIBRE_DEFAULT_FOV_RADIANS = 0.6435011087932844

const RADIANS = Math.PI / 180
const TILE_SIZE = 512

export interface CameraFixture {
  longitude: number
  latitude: number
  zoom: number
  pitchDegrees?: number
  bearingDegrees?: number
  cssWidth?: number
  cssHeight?: number
}

const perspective = (fovy: number, aspect: number, near: number, far: number) => {
  const f = 1 / Math.tan(fovy / 2)
  const nf = 1 / (near - far)
  return Float64Array.from([
    f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0,
  ])
}

export const scaleMat4 = (x: number, y: number, z: number) =>
  Float64Array.from([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1])

const rotateXMat4 = (radians: number) => {
  const [c, s] = [Math.cos(radians), Math.sin(radians)]
  return Float64Array.from([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1])
}

const rotateYMat4 = (radians: number) => {
  const [c, s] = [Math.cos(radians), Math.sin(radians)]
  return Float64Array.from([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1])
}

const rotateZMat4 = (radians: number) => {
  const [c, s] = [Math.cos(radians), Math.sin(radians)]
  return Float64Array.from([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
}

const chain = (...matrices: ArrayLike<number>[]) =>
  matrices.reduce<Float64Array>(
    (product, matrix) => multiplyMat4(product, matrix),
    Float64Array.from(IDENTITY_MATRIX),
  )

export const cameraFixture = ({
  longitude,
  latitude,
  zoom,
  pitchDegrees = 0,
  bearingDegrees = 0,
  cssWidth = 800,
  cssHeight = 600,
}: CameraFixture) => {
  const worldSize = TILE_SIZE * 2 ** zoom
  const fov = MAPLIBRE_DEFAULT_FOV_RADIANS
  const cameraToCenterDistance = (0.5 / Math.tan(fov / 2)) * cssHeight
  const pitch = pitchDegrees * RADIANS
  const bearing = bearingDegrees * RADIANS
  const mercatorMatrix = chain(
    perspective(fov, cssWidth / cssHeight, cssHeight / 50, cameraToCenterDistance * 100),
    scaleMat4(1, -1, 1),
    translationMat4(0, 0, -cameraToCenterDistance),
    rotateXMat4(pitch),
    rotateZMat4(-bearing),
    translationMat4(-mercatorX(longitude) * worldSize, -mercatorY(latitude) * worldSize, 0),
    scaleMat4(worldSize, worldSize, worldSize),
  )
  const globeRadiusPixels = worldSize / (2 * Math.PI) / Math.cos(latitude * RADIANS)
  const globeMatrix = chain(
    perspective(fov, cssWidth / cssHeight, 0.5, cameraToCenterDistance + globeRadiusPixels * 2),
    translationMat4(0, 0, -cameraToCenterDistance),
    rotateXMat4(-pitch),
    rotateZMat4(bearing),
    translationMat4(0, 0, -globeRadiusPixels),
    rotateXMat4(latitude * RADIANS),
    rotateYMat4(-longitude * RADIANS),
    scaleMat4(globeRadiusPixels, globeRadiusPixels, globeRadiusPixels),
  )
  return { mercatorMatrix, globeMatrix, worldSize, cameraToCenterDistance, globeRadiusPixels }
}

export const frameInputFixture = (camera: CameraFixture, transition = 0): ModelFrameInput => {
  const { mercatorMatrix, globeMatrix } = cameraFixture(camera)
  return {
    transition,
    mainMatrix: transition > 0 ? globeMatrix : mercatorMatrix,
    fallbackMatrix: mercatorMatrix,
    centerLongitude: camera.longitude,
    centerLatitude: camera.latitude,
    zoom: camera.zoom,
    cssWidth: camera.cssWidth ?? 800,
    cssHeight: camera.cssHeight ?? 600,
    reference: { x: mercatorX(camera.longitude), y: mercatorY(camera.latitude) },
  }
}

/** A surface model instance at Tallinn; override fields per test. */
export const modelInstanceFixture = (overrides: Partial<ModelInstance> = {}): ModelInstance => ({
  id: 'object',
  model: 'aircraft',
  longitude: 24.75,
  latitude: 59.43,
  altitudeMeters: 0,
  headingDegrees: 0,
  lengthMeters: 40,
  beamMeters: 20,
  heightMeters: 12,
  bounds: {
    minimum: [-20, -10, 0],
    maximum: [20, 10, 12],
  },
  extentMeters: 40,
  floorPx: 28,
  opacity: 1,
  flags: 0,
  lengthScale: 1,
  tint: [255, 255, 255],
  detail: [0, 0, 0],
  ...overrides,
})
