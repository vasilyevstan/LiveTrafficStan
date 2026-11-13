import {
  TRAFFIC_MODEL_IDS,
  TRAFFIC_MODEL_SET,
  isTrafficModelId,
  trafficModelKind,
  type TrafficModelId,
  type TrafficModelKind,
} from './trafficModelCatalog'

const GLB_MAGIC = 0x46546c67
const GLB_VERSION = 2
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942
const COMPONENT_FLOAT = 5126
const COMPONENT_UNSIGNED_SHORT = 5123
const MODE_TRIANGLES = 4
const MAXIMUM_COORDINATE_METERS = 1_000
const TOP_LEVEL_KEYS = new Set([
  'asset',
  'scene',
  'scenes',
  'nodes',
  'materials',
  'meshes',
  'accessors',
  'bufferViews',
  'buffers',
])
const NODE_KEYS = new Set(['name', 'mesh', 'extras'])

/** Interleaved r, f, u position and face normal (float32), then RGB + role. */
export const MODEL_VERTEX_STRIDE_BYTES = 28
export const MODEL_MATERIAL_ROLE_BYTES = {
  body: 0,
  detail: 128,
  accent: 255,
} as const

type MaterialRole = keyof typeof MODEL_MATERIAL_ROLE_BYTES

export interface TrafficModelBounds {
  minimum: readonly [number, number, number]
  maximum: readonly [number, number, number]
}

export interface TrafficModelMesh {
  id: TrafficModelId
  kind: TrafficModelKind
  lengthMeters: number
  beamMeters: number
  heightMeters: number
  bounds: TrafficModelBounds
  triangleCount: number
  vertices: ArrayBuffer
}

export interface TrafficModelAssetLimits {
  maximumBytes: number
  maximumTrianglesPerModel: number
}

interface Material {
  role: MaterialRole
  rgb: readonly [number, number, number]
}

interface Primitive {
  positionStart: number
  positionCount: number
  indexStart: number
  indexCount: number
  material: Material
}

type JsonRecord = Record<string, unknown>

const fail = (message: string): never => {
  throw new Error(`Traffic model asset is invalid: ${message}`)
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const record = (value: unknown, label: string): JsonRecord =>
  isRecord(value) ? value : fail(`${label} must be an object`)

const list = (value: unknown, label: string): unknown[] =>
  Array.isArray(value) ? value : fail(`${label} must be an array`)

const indexInto = (value: unknown, length: number, label: string) =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < length
    ? (value as number)
    : fail(`${label} is out of range`)

const byteCount = (value: unknown, label: string, fallback?: number) => {
  const resolved = value === undefined ? fallback : value
  return Number.isInteger(resolved) && (resolved as number) >= 0
    ? (resolved as number)
    : fail(`${label} is not a byte count`)
}

const positiveNumber = (value: unknown, label: string) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fail(`${label} must be a positive number`)

const linearToSrgbByte = (value: number) => {
  const srgb =
    value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, srgb)) * 255)
}

const parseMaterial = (value: unknown, label: string): Material => {
  const material = record(value, label)
  const role = record(material.extras, `${label} extras`).lts_role
  if (role !== 'body' && role !== 'detail' && role !== 'accent') {
    return fail(`${label} role is unsupported`)
  }
  const pbr = record(material.pbrMetallicRoughness, `${label} PBR`)
  const factor = list(pbr.baseColorFactor, `${label} base colour`)
  if (
    factor.length !== 4 ||
    !factor.every(
      (channel) =>
        typeof channel === 'number' && channel >= 0 && channel <= 1,
    )
  ) {
    return fail(`${label} base colour is invalid`)
  }
  const [red, green, blue] = factor as number[]
  return {
    role,
    rgb: [
      linearToSrgbByte(red),
      linearToSrgbByte(green),
      linearToSrgbByte(blue),
    ],
  }
}

const accessorRange = (
  gltf: JsonRecord,
  binLength: number,
  accessorIndex: unknown,
  expected: { componentType: number; type: string; elementBytes: number },
  label: string,
) => {
  const accessors = list(gltf.accessors, 'accessors')
  const views = list(gltf.bufferViews, 'buffer views')
  const accessor = record(
    accessors[indexInto(accessorIndex, accessors.length, label)],
    label,
  )
  if (
    accessor.componentType !== expected.componentType ||
    accessor.type !== expected.type ||
    accessor.sparse !== undefined ||
    accessor.normalized === true
  ) {
    return fail(`${label} layout is unsupported`)
  }
  const count = accessor.count
  if (!Number.isInteger(count) || (count as number) <= 0) {
    return fail(`${label} count is invalid`)
  }
  const view = record(
    views[indexInto(accessor.bufferView, views.length, `${label} view`)],
    `${label} view`,
  )
  if (view.buffer !== 0) return fail(`${label} uses another buffer`)
  if (
    view.byteStride !== undefined &&
    view.byteStride !== expected.elementBytes
  ) {
    return fail(`${label} is interleaved`)
  }
  const viewStart = byteCount(view.byteOffset, `${label} view offset`, 0)
  const viewLength = byteCount(view.byteLength, `${label} view length`)
  const offset = byteCount(accessor.byteOffset, `${label} offset`, 0)
  const length = (count as number) * expected.elementBytes
  const start = viewStart + offset
  if (viewStart + viewLength > binLength || offset + length > viewLength) {
    return fail(`${label} exceeds its buffer`)
  }
  if (start % (expected.componentType === COMPONENT_FLOAT ? 4 : 2) !== 0) {
    return fail(`${label} is misaligned`)
  }
  return { start, count: count as number }
}

const readChunks = (bytes: ArrayBuffer, maximumBytes: number) => {
  if (bytes.byteLength < 28 || bytes.byteLength > maximumBytes) {
    return fail('file size is outside the supported range')
  }
  const view = new DataView(bytes)
  if (
    view.getUint32(0, true) !== GLB_MAGIC ||
    view.getUint32(4, true) !== GLB_VERSION ||
    view.getUint32(8, true) !== bytes.byteLength
  ) {
    return fail('GLB header is invalid')
  }
  const jsonLength = view.getUint32(12, true)
  if (
    view.getUint32(16, true) !== CHUNK_JSON ||
    jsonLength % 4 !== 0 ||
    20 + jsonLength + 8 > bytes.byteLength
  ) {
    return fail('JSON chunk is invalid')
  }
  const binHeader = 20 + jsonLength
  const binLength = view.getUint32(binHeader, true)
  if (
    view.getUint32(binHeader + 4, true) !== CHUNK_BIN ||
    binHeader + 8 + binLength !== bytes.byteLength
  ) {
    return fail('binary chunk is invalid')
  }
  let gltf: unknown
  try {
    gltf = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        new Uint8Array(bytes, 20, jsonLength),
      ),
    )
  } catch {
    return fail('JSON chunk cannot be decoded')
  }
  return {
    gltf: record(gltf, 'glTF document'),
    view,
    binStart: binHeader + 8,
    binLength,
  }
}

export const parseTrafficModelAsset = (
  bytes: ArrayBuffer,
  limits: TrafficModelAssetLimits,
): ReadonlyMap<TrafficModelId, TrafficModelMesh> => {
  const { gltf, view, binStart, binLength } = readChunks(
    bytes,
    limits.maximumBytes,
  )
  for (const key of Object.keys(gltf)) {
    if (!TOP_LEVEL_KEYS.has(key)) fail(`unsupported top-level ${key}`)
  }
  const asset = record(gltf.asset, 'asset')
  if (asset.version !== '2.0' || asset.minVersion !== undefined) {
    fail('glTF version is unsupported')
  }
  const buffers = list(gltf.buffers, 'buffers')
  const buffer = record(buffers[0], 'buffer')
  if (
    buffers.length !== 1 ||
    buffer.uri !== undefined ||
    byteCount(buffer.byteLength, 'buffer length') > binLength
  ) {
    fail('buffer is invalid')
  }

  const nodes = list(gltf.nodes, 'nodes')
  const scenes = list(gltf.scenes, 'scenes')
  const sceneNodes = list(
    record(
      scenes[indexInto(gltf.scene ?? 0, scenes.length, 'scene')],
      'scene',
    ).nodes,
    'scene nodes',
  )
  const sceneSet = new Set(sceneNodes)
  if (
    sceneSet.size !== nodes.length ||
    nodes.some((_, nodeIndex) => !sceneSet.has(nodeIndex))
  ) {
    fail('scene must contain every node once')
  }
  if (nodes.length !== TRAFFIC_MODEL_IDS.length) fail('model count changed')

  const materials = list(gltf.materials, 'materials').map((material, i) =>
    parseMaterial(material, `material ${i}`),
  )
  const meshes = list(gltf.meshes, 'meshes')
  const models = new Map<TrafficModelId, TrafficModelMesh>()

  nodes.forEach((value, nodeIndex) => {
    const label = `node ${nodeIndex}`
    const node = record(value, label)
    for (const key of Object.keys(node)) {
      if (!NODE_KEYS.has(key)) fail(`${label} has unsupported ${key}`)
    }
    const extras = record(node.extras, `${label} extras`)
    const id = extras.lts_model_id
    if (!isTrafficModelId(id) || models.has(id)) {
      return fail(`${label} model identity is invalid`)
    }
    if (
      node.name !== `LTS_${id}` ||
      extras.lts_model_set !== TRAFFIC_MODEL_SET ||
      extras.lts_kind !== trafficModelKind(id)
    ) {
      fail(`${label} model metadata is inconsistent`)
    }
    const mesh = record(
      meshes[indexInto(node.mesh, meshes.length, `${label} mesh`)],
      `${label} mesh`,
    )
    const primitives = list(mesh.primitives, `${id} primitives`).map(
      (primitiveValue, primitiveIndex): Primitive => {
        const primitiveLabel = `${id} primitive ${primitiveIndex}`
        const primitive = record(primitiveValue, primitiveLabel)
        const attributes = record(
          primitive.attributes,
          `${primitiveLabel} attributes`,
        )
        if (
          Object.keys(attributes).join() !== 'POSITION' ||
          (primitive.mode ?? MODE_TRIANGLES) !== MODE_TRIANGLES ||
          primitive.targets !== undefined
        ) {
          fail(`${primitiveLabel} layout is unsupported`)
        }
        const position = accessorRange(
          gltf,
          binLength,
          attributes.POSITION,
          { componentType: COMPONENT_FLOAT, type: 'VEC3', elementBytes: 12 },
          `${primitiveLabel} positions`,
        )
        const indices = accessorRange(
          gltf,
          binLength,
          primitive.indices,
          {
            componentType: COMPONENT_UNSIGNED_SHORT,
            type: 'SCALAR',
            elementBytes: 2,
          },
          `${primitiveLabel} indices`,
        )
        if (indices.count % 3 !== 0) fail(`${primitiveLabel} is not triangles`)
        return {
          positionStart: binStart + position.start,
          positionCount: position.count,
          indexStart: binStart + indices.start,
          indexCount: indices.count,
          material:
            materials[
              indexInto(
                primitive.material,
                materials.length,
                `${primitiveLabel} material`,
              )
            ],
        }
      },
    )
    if (primitives.length === 0) fail(`${id} has no geometry`)
    const triangleCount = primitives.reduce(
      (total, primitive) => total + primitive.indexCount / 3,
      0,
    )
    if (triangleCount > limits.maximumTrianglesPerModel) {
      fail(`${id} exceeds the triangle budget`)
    }
    const expanded = expandPrimitives(view, primitives, triangleCount, id)
    models.set(id, {
      id,
      kind: trafficModelKind(id),
      lengthMeters: positiveNumber(extras.lts_length_m, `${id} length`),
      beamMeters: positiveNumber(extras.lts_beam_m, `${id} beam`),
      heightMeters: positiveNumber(extras.lts_height_m, `${id} height`),
      bounds: expanded.bounds,
      triangleCount,
      vertices: expanded.vertices,
    })
  })

  return models
}

const expandPrimitives = (
  source: DataView,
  primitives: readonly Primitive[],
  triangleCount: number,
  id: TrafficModelId,
) => {
  const vertices = new ArrayBuffer(
    triangleCount * 3 * MODEL_VERTEX_STRIDE_BYTES,
  )
  const target = new DataView(vertices)
  const corner = new Float64Array(9)
  const minimum = [Infinity, Infinity, Infinity]
  const maximum = [-Infinity, -Infinity, -Infinity]
  let offset = 0
  for (const primitive of primitives) {
    for (let index = 0; index < primitive.indexCount; index += 3) {
      for (let vertex = 0; vertex < 3; vertex += 1) {
        const positionIndex = source.getUint16(
          primitive.indexStart + (index + vertex) * 2,
          true,
        )
        if (positionIndex >= primitive.positionCount) {
          fail(`${id} index is out of range`)
        }
        const base = primitive.positionStart + positionIndex * 12
        const x = source.getFloat32(base, true)
        const y = source.getFloat32(base + 4, true)
        const z = source.getFloat32(base + 8, true)
        // glTF is +Y up, +Z forward and -X starboard.
        const local = [-x, z, y]
        for (let axis = 0; axis < 3; axis += 1) {
          const coordinate = local[axis]
          if (
            !Number.isFinite(coordinate) ||
            Math.abs(coordinate) > MAXIMUM_COORDINATE_METERS
          ) {
            fail(`${id} coordinate is out of range`)
          }
          minimum[axis] = Math.min(minimum[axis], coordinate)
          maximum[axis] = Math.max(maximum[axis], coordinate)
          corner[vertex * 3 + axis] = coordinate
        }
      }
      const ax = corner[3] - corner[0]
      const ay = corner[4] - corner[1]
      const az = corner[5] - corner[2]
      const bx = corner[6] - corner[0]
      const by = corner[7] - corner[1]
      const bz = corner[8] - corner[2]
      let nx = ay * bz - az * by
      let ny = az * bx - ax * bz
      let nz = ax * by - ay * bx
      const length = Math.hypot(nx, ny, nz)
      if (length > 1e-12) {
        nx /= length
        ny /= length
        nz /= length
      } else {
        nx = 0
        ny = 0
        nz = 1
      }
      const { rgb, role } = primitive.material
      for (let vertex = 0; vertex < 3; vertex += 1) {
        target.setFloat32(offset, corner[vertex * 3], true)
        target.setFloat32(offset + 4, corner[vertex * 3 + 1], true)
        target.setFloat32(offset + 8, corner[vertex * 3 + 2], true)
        target.setFloat32(offset + 12, nx, true)
        target.setFloat32(offset + 16, ny, true)
        target.setFloat32(offset + 20, nz, true)
        target.setUint8(offset + 24, rgb[0])
        target.setUint8(offset + 25, rgb[1])
        target.setUint8(offset + 26, rgb[2])
        target.setUint8(offset + 27, MODEL_MATERIAL_ROLE_BYTES[role])
        offset += MODEL_VERTEX_STRIDE_BYTES
      }
    }
  }
  return {
    vertices,
    bounds: {
      minimum: minimum as [number, number, number],
      maximum: maximum as [number, number, number],
    },
  }
}
