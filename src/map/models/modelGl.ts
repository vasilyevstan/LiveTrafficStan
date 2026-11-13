import { MODEL_INSTANCE_STRIDE_BYTES } from './modelInstances'
import {
  DROP_LINE_FRAGMENT_SHADER,
  DROP_LINE_VERTEX_SHADER,
  MODEL_ATTRIBUTE,
  MODEL_FRAGMENT_SHADER,
  MODEL_VERTEX_SHADER,
  RING_FRAGMENT_SHADER,
  RING_VERTEX_SHADER,
} from './modelShaders'
import { MODEL_VERTEX_STRIDE_BYTES, type TrafficModelMesh } from './trafficModelAsset'
import type { TrafficModelId } from './trafficModelCatalog'

export class ModelGlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelGlError'
  }
}

const FRAME_UNIFORMS = [
  'u_mercator',
  'u_globe',
  'u_globe_origin',
  'u_transition',
  'u_k',
  'u_center_w',
  'u_camera_globe',
  'u_camera',
  'u_context',
  'u_world_offset',
  'u_viewport',
] as const

const PROGRAM_SOURCES = {
  model: [MODEL_VERTEX_SHADER, MODEL_FRAGMENT_SHADER, ['u_footprint', 'u_depth_only']],
  line: [DROP_LINE_VERTEX_SHADER, DROP_LINE_FRAGMENT_SHADER, ['u_overlay_color']],
  ring: [RING_VERTEX_SHADER, RING_FRAGMENT_SHADER, ['u_overlay_color', 'u_ring_lifted_only']],
} as const

export type ModelProgramName = keyof typeof PROGRAM_SOURCES
export type ModelUniform =
  | (typeof FRAME_UNIFORMS)[number]
  | (typeof PROGRAM_SOURCES)[ModelProgramName][2][number]

export interface ModelProgram {
  program: WebGLProgram
  uniforms: Partial<Record<ModelUniform, WebGLUniformLocation>>
  /** Frame revision whose shared uniforms are already uploaded. */
  frameRevision: number
}

export interface MeshRange {
  first: number
  count: number
}

export interface ModelGroupBuffers {
  buffer: WebGLBuffer
  capacityBytes: number
  modelVao: WebGLVertexArrayObject
  overlayVao: WebGLVertexArrayObject
}

export interface ModelGpuResources {
  programs: Record<ModelProgramName, ModelProgram>
  meshBuffer: WebGLBuffer
  meshRanges: ReadonlyMap<TrafficModelId, MeshRange>
  groups: Map<string, ModelGroupBuffers>
}

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type)
  if (!shader) throw new ModelGlError('Model shader allocation failed')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? ''
    gl.deleteShader(shader)
    throw new ModelGlError(`Model shader compilation failed ${log}`.trim())
  }
  return shader
}

const linkProgram = (
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  extraUniforms: readonly ModelUniform[],
): ModelProgram => {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  let fragment: WebGLShader | undefined
  let program: WebGLProgram | null = null
  try {
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
    program = gl.createProgram()
    if (!program) throw new ModelGlError('Model program allocation failed')
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? ''
      throw new ModelGlError(`Model program link failed ${log}`.trim())
    }
  } catch (error) {
    if (program) gl.deleteProgram(program)
    throw error
  } finally {
    gl.deleteShader(vertex)
    if (fragment) gl.deleteShader(fragment)
  }
  const uniforms: ModelProgram['uniforms'] = {}
  for (const name of [...FRAME_UNIFORMS, ...extraUniforms]) {
    const location = gl.getUniformLocation(program, name)
    if (location) uniforms[name] = location
  }
  return { program, uniforms, frameRevision: -1 }
}

const createBuffer = (gl: WebGL2RenderingContext) => {
  const buffer = gl.createBuffer()
  if (!buffer) throw new ModelGlError('Model buffer allocation failed')
  return buffer
}

const createVertexArray = (gl: WebGL2RenderingContext) => {
  const vao = gl.createVertexArray()
  if (!vao) throw new ModelGlError('Model vertex array allocation failed')
  return vao
}

const INSTANCE_ATTRIBUTES = [
  [MODEL_ATTRIBUTE.offset, 2, 'float', 0],
  [MODEL_ATTRIBUTE.geo, 2, 'float', 8],
  [MODEL_ATTRIBUTE.motion, 4, 'float', 16],
  [MODEL_ATTRIBUTE.size, 4, 'float', 32],
  [MODEL_ATTRIBUTE.tint, 4, 'color', 48],
  [MODEL_ATTRIBUTE.detail, 4, 'color', 52],
] as const

/** Points per-instance attributes at `firstInstance`; the target VAO must be bound. */
export const pointInstanceAttributes = (
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  firstInstance: number,
  colors: boolean,
) => {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  const base = firstInstance * MODEL_INSTANCE_STRIDE_BYTES
  for (const [location, size, kind, offset] of INSTANCE_ATTRIBUTES) {
    if (kind === 'color' && !colors) continue
    if (kind === 'color') {
      gl.vertexAttribPointer(location, size, gl.UNSIGNED_BYTE, true, MODEL_INSTANCE_STRIDE_BYTES, base + offset)
    } else {
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, MODEL_INSTANCE_STRIDE_BYTES, base + offset)
    }
  }
}

const enableInstanceAttributes = (gl: WebGL2RenderingContext, colors: boolean) => {
  for (const [location, , kind] of INSTANCE_ATTRIBUTES) {
    if (kind === 'color' && !colors) continue
    gl.enableVertexAttribArray(location)
    gl.vertexAttribDivisor(location, 1)
  }
}

const createGroupBuffers = (
  gl: WebGL2RenderingContext,
  meshBuffer: WebGLBuffer,
): ModelGroupBuffers => {
  const buffer = createBuffer(gl)
  const modelVao = createVertexArray(gl)
  gl.bindVertexArray(modelVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer)
  const stride = MODEL_VERTEX_STRIDE_BYTES
  gl.enableVertexAttribArray(MODEL_ATTRIBUTE.position)
  gl.vertexAttribPointer(MODEL_ATTRIBUTE.position, 3, gl.FLOAT, false, stride, 0)
  gl.enableVertexAttribArray(MODEL_ATTRIBUTE.normal)
  gl.vertexAttribPointer(MODEL_ATTRIBUTE.normal, 3, gl.FLOAT, false, stride, 12)
  gl.enableVertexAttribArray(MODEL_ATTRIBUTE.color)
  gl.vertexAttribPointer(MODEL_ATTRIBUTE.color, 4, gl.UNSIGNED_BYTE, true, stride, 24)
  enableInstanceAttributes(gl, true)
  const overlayVao = createVertexArray(gl)
  gl.bindVertexArray(overlayVao)
  enableInstanceAttributes(gl, false)
  gl.bindVertexArray(null)
  return { buffer, capacityBytes: 0, modelVao, overlayVao }
}

/** Uploads meshes and compiles programs. Throws `ModelGlError` on failure. */
export const createModelGpuResources = (
  gl: WebGL2RenderingContext,
  meshes: ReadonlyMap<TrafficModelId, TrafficModelMesh>,
  groups: readonly string[],
): ModelGpuResources => {
  const created: ModelGpuResources = {
    programs: {} as Record<ModelProgramName, ModelProgram>,
    meshBuffer: createBuffer(gl),
    meshRanges: new Map(),
    groups: new Map(),
  }
  try {
    for (const [name, [vertex, fragment, extras]] of Object.entries(PROGRAM_SOURCES)) {
      created.programs[name as ModelProgramName] = linkProgram(gl, vertex, fragment, extras)
    }
    let totalBytes = 0
    for (const mesh of meshes.values()) totalBytes += mesh.vertices.byteLength
    const vertices = new Uint8Array(totalBytes)
    const ranges = new Map<TrafficModelId, MeshRange>()
    let offset = 0
    for (const mesh of meshes.values()) {
      vertices.set(new Uint8Array(mesh.vertices), offset)
      ranges.set(mesh.id, { first: offset / MODEL_VERTEX_STRIDE_BYTES, count: mesh.triangleCount * 3 })
      offset += mesh.vertices.byteLength
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, created.meshBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
    created.meshRanges = ranges
    for (const group of groups) created.groups.set(group, createGroupBuffers(gl, created.meshBuffer))
    return created
  } catch (error) {
    deleteModelGpuResources(gl, created)
    throw error
  } finally {
    gl.bindVertexArray(null)
    gl.bindBuffer(gl.ARRAY_BUFFER, null)
  }
}

export const deleteModelGpuResources = (
  gl: WebGL2RenderingContext,
  resources: ModelGpuResources,
) => {
  for (const program of Object.values(resources.programs)) gl.deleteProgram(program.program)
  for (const group of resources.groups.values()) {
    gl.deleteVertexArray(group.modelVao)
    gl.deleteVertexArray(group.overlayVao)
    gl.deleteBuffer(group.buffer)
  }
  gl.deleteBuffer(resources.meshBuffer)
  resources.groups.clear()
}

/** Uploads packed instances, growing the buffer geometrically. */
export const uploadGroupInstances = (
  gl: WebGL2RenderingContext,
  group: ModelGroupBuffers,
  data: ArrayBuffer,
) => {
  gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer)
  if (data.byteLength > group.capacityBytes) {
    const capacity = Math.max(
      MODEL_INSTANCE_STRIDE_BYTES * 64,
      Math.ceil((data.byteLength * 1.5) / MODEL_INSTANCE_STRIDE_BYTES) * MODEL_INSTANCE_STRIDE_BYTES,
    )
    gl.bufferData(gl.ARRAY_BUFFER, capacity, gl.DYNAMIC_DRAW)
    group.capacityBytes = capacity
  }
  if (data.byteLength > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Uint8Array(data))
}

/** Restores the GL state MapLibre documents for custom layers. */
export const restoreModelGlState = (gl: WebGL2RenderingContext) => {
  gl.bindVertexArray(null)
  gl.useProgram(null)
  gl.bindBuffer(gl.ARRAY_BUFFER, null)
  gl.colorMask(true, true, true, true)
  gl.depthMask(true)
  gl.depthFunc(gl.LEQUAL)
  gl.enable(gl.DEPTH_TEST)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  gl.disable(gl.CULL_FACE)
  gl.disable(gl.POLYGON_OFFSET_FILL)
  gl.cullFace(gl.BACK)
  gl.frontFace(gl.CCW)
}
