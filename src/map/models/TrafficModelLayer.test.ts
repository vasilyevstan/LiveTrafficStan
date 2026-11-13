import { readFileSync } from 'node:fs'
import type { CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import { TRAFFIC_MODEL_CONFIG } from '../../config/appConfig'
import { TrafficModelLayer } from './TrafficModelLayer'
import {
  frameInputFixture,
  modelInstanceFixture,
  type CameraFixture,
} from './modelCameraFixtures'
import { ModelGlError } from './modelGl'
import {
  MODEL_FLAG_DROP_LINE,
  MODEL_FLAG_SELECTED,
  createModelFrame,
  mercatorX,
  wrapMercatorOffset,
} from './modelProjection'
import { parseTrafficModelAsset } from './trafficModelAsset'

const committed = readFileSync(new URL('../../assets/models/traffic-models-v1.glb', import.meta.url))
const meshes = parseTrafficModelAsset(
  committed.buffer.slice(committed.byteOffset, committed.byteOffset + committed.byteLength) as ArrayBuffer,
  {
    maximumBytes: TRAFFIC_MODEL_CONFIG.maximumAssetBytes,
    maximumTrianglesPerModel: TRAFFIC_MODEL_CONFIG.maximumTrianglesPerModel,
  },
)
const vertexCount = (id: 'aircraft' | 'aircraft-heavy') => meshes.get(id)!.triangleCount * 3

interface GlCall {
  name: string
  args: unknown[]
}

const fakeGl = (options: { lost?: boolean; compiles?: boolean } = {}) => {
  const calls: GlCall[] = []
  let nextHandle = 0
  const handle = (kind: string) => ({ kind, handle: (nextHandle += 1) })
  const results: Record<string, (...args: unknown[]) => unknown> = {
    isContextLost: () => options.lost ?? false,
    createShader: () => handle('shader'),
    createProgram: () => handle('program'),
    createBuffer: () => handle('buffer'),
    createVertexArray: () => handle('vao'),
    getShaderParameter: () => options.compiles ?? true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => 'ERROR: fake compiler',
    getProgramInfoLog: () => '',
    getUniformLocation: (_program, name) => ({ uniform: name }),
  }
  const gl = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (typeof property !== 'string' || property === 'then') return undefined
        if (/^[A-Z0-9_]+$/.test(property)) return property
        return (...args: unknown[]) => {
          if (property !== 'isContextLost') calls.push({ name: property, args })
          return results[property]?.(...args)
        }
      },
    },
  ) as WebGL2RenderingContext
  return { gl, calls }
}

const TALLINN: CameraFixture = { longitude: 24.75, latitude: 59.43, zoom: 9 }
const WORLD: CameraFixture = { longitude: 0, latitude: 0, zoom: 0 }

const setup = (camera = TALLINN, glOptions: Parameters<typeof fakeGl>[0] = {}) => {
  const onFailure = vi.fn()
  const layer = new TrafficModelLayer(meshes, onFailure)
  const { gl, calls } = fakeGl(glOptions)
  const view = { camera }
  const triggerRepaint = vi.fn()
  const map = {
    getCenter: () => ({ lng: view.camera.longitude, lat: view.camera.latitude }),
    getZoom: () => view.camera.zoom,
    getRenderWorldCopies: () => true,
    getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
    triggerRepaint,
  } as unknown as MapLibreMap
  layer.onAdd(map)
  const render = (transition = 0) => {
    const input = frameInputFixture(view.camera, transition)
    layer.render(gl, {
      defaultProjectionData: {
        mainMatrix: input.mainMatrix,
        fallbackMatrix: input.fallbackMatrix,
        projectionTransition: transition,
      },
    } as unknown as CustomRenderMethodInput)
  }
  const show = (group: Parameters<TrafficModelLayer['setGroupActive']>[0], instances = [modelInstanceFixture()]) => {
    layer.setInstances(group, instances, '#336699')
    layer.setGroupActive(group, true)
  }
  return { layer, onFailure, gl, calls, map, view, triggerRepaint, render, show }
}

const named = (calls: readonly GlCall[], name: string) => calls.filter((call) => call.name === name)

const uniformValues = (calls: readonly GlCall[], uniform: string) =>
  calls
    .filter(
      (call) =>
        call.name.startsWith('uniform') && (call.args[0] as { uniform?: string })?.uniform === uniform,
    )
    .map((call) => call.args.slice(1))

const RESTORED_STATE = [
  ['bindVertexArray', [null]],
  ['useProgram', [null]],
  ['bindBuffer', ['ARRAY_BUFFER', null]],
  ['colorMask', [true, true, true, true]],
  ['depthMask', [true]],
  ['depthFunc', ['LEQUAL']],
  ['enable', ['DEPTH_TEST']],
  ['enable', ['BLEND']],
  ['blendFunc', ['ONE', 'ONE_MINUS_SRC_ALPHA']],
  ['disable', ['CULL_FACE']],
  ['cullFace', ['BACK']],
  ['frontFace', ['CCW']],
]

const tail = (calls: readonly GlCall[]) =>
  calls.slice(-RESTORED_STATE.length).map((call) => [call.name, call.args])

describe('TrafficModelLayer', () => {
  it('makes no GL calls in onAdd and allocates resources on the first drawn frame', () => {
    const { calls, render, show } = setup()
    render()
    expect(calls).toEqual([])
    show('aircraft')
    render()
    render()
    expect(named(calls, 'createProgram')).toHaveLength(3)
    const totalMeshBytes = [...meshes.values()].reduce((sum, mesh) => sum + mesh.vertices.byteLength, 0)
    expect((named(calls, 'bufferData')[0].args[1] as Uint8Array).byteLength).toBe(totalMeshBytes)
    expect(tail(calls)).toEqual(RESTORED_STATE)
  })

  it('draws each model run in a depth pre-pass and a colour pass', () => {
    const { calls, render, show } = setup()
    show('aircraft', [
      modelInstanceFixture({ id: 'a' }),
      modelInstanceFixture({ id: 'b', model: 'aircraft-heavy' }),
      modelInstanceFixture({ id: 'c' }),
    ])
    render()
    const draws = named(calls, 'drawArraysInstanced').map((call) => call.args)
    const aircraft = vertexCount('aircraft')
    const heavy = vertexCount('aircraft-heavy')
    expect(draws.map(([, , count, instances]) => [count, instances])).toEqual([
      [aircraft, 2],
      [heavy, 1],
      [aircraft, 2],
      [heavy, 1],
    ])
    expect(draws.every(([mode]) => mode === 'TRIANGLES')).toBe(true)
    expect(uniformValues(calls, 'u_depth_only')).toEqual([[1], [0]])
    expect(uniformValues(calls, 'u_footprint')).toEqual([[0], [0]])
    const offsetPointers = named(calls, 'vertexAttribPointer')
      .filter((call) => call.args[0] === 3)
      .map((call) => call.args[5])
    expect(offsetPointers).toEqual([0, 112, 0, 112])
  })

  it('uploads the camera-relative globe matrix and matching origin to every program', () => {
    const camera = { ...TALLINN, zoom: 11.7 }
    const { calls, render, show } = setup(camera)
    show('aircraft', [
      modelInstanceFixture({
        altitudeMeters: 1_000,
        flags: MODEL_FLAG_DROP_LINE | MODEL_FLAG_SELECTED,
      }),
    ])
    render(0.3)
    const frame = createModelFrame(frameInputFixture(camera, 0.3))!
    expect(uniformValues(calls, 'u_globe')).toEqual(
      Array.from({ length: 3 }, () => [false, frame.globeRtcMatrix]),
    )
    expect(uniformValues(calls, 'u_globe_origin')).toEqual(
      Array.from({ length: 3 }, () => [...frame.globeOrigin]),
    )
  })

  it('adds footprints, drop lines and selection rings only when needed', () => {
    const { calls, render, show } = setup()
    show('aircraft', [
      modelInstanceFixture({
        altitudeMeters: 10_000,
        flags: MODEL_FLAG_DROP_LINE | MODEL_FLAG_SELECTED,
      }),
    ])
    show('orbital', [
      modelInstanceFixture({ id: 'sat', model: 'orbital-payload', altitudeMeters: 500_000, flags: MODEL_FLAG_SELECTED }),
    ])
    render()
    const draws = named(calls, 'drawArraysInstanced').map((call) => call.args.slice(1))
    const aircraft = vertexCount('aircraft')
    expect(draws.slice(0, 6)).toEqual([
      [0, 6, 1],
      [0, 6, 1],
      [expect.any(Number), aircraft, 1],
      [expect.any(Number), aircraft, 1],
      [expect.any(Number), aircraft, 1],
      [expect.any(Number), aircraft, 1],
    ])
    expect(uniformValues(calls, 'u_footprint').slice(0, 4)).toEqual([[0], [1], [0], [1]])
    expect(uniformValues(calls, 'u_overlay_color')[0]).toEqual([0x33 / 255, 0x66 / 255, 0x99 / 255])
    expect(uniformValues(calls, 'u_ring_lifted_only')).toEqual([[0], [1]])
  })

  it('uploads instances only after changes and re-anchors after large camera drift', () => {
    const { calls, render, show, view } = setup()
    show('aircraft')
    render()
    render()
    expect(named(calls, 'bufferSubData')).toHaveLength(1)
    show('aircraft', [modelInstanceFixture({ id: 'b' })])
    render()
    expect(named(calls, 'bufferSubData')).toHaveLength(2)
    view.camera = { ...TALLINN, longitude: -74, latitude: 40.7 }
    render()
    const uploads = named(calls, 'bufferSubData')
    expect(uploads).toHaveLength(3)
    const floats = new Float32Array((uploads[2].args[2] as Uint8Array).buffer)
    expect(floats[0]).toBeCloseTo(wrapMercatorOffset(mercatorX(24.75) - mercatorX(-74)), 6)
  })

  it('draws Mercator world copies only where they can be visible', () => {
    const { calls, render, show } = setup(WORLD)
    show('vessels', [
      modelInstanceFixture({ id: 'west', model: 'vessel', longitude: -170, latitude: 10 }),
      modelInstanceFixture({ id: 'east', model: 'vessel', longitude: 170, latitude: -10 }),
    ])
    render()
    expect(uniformValues(calls, 'u_world_offset')).toEqual([[0], [-1], [1]])
    calls.length = 0
    render(1)
    expect(uniformValues(calls, 'u_world_offset')).toEqual([[0]])
  })

  it('picks the last drawn frame, including wrapped copies, for active groups only', () => {
    const { layer, render, show } = setup(WORLD)
    show('aircraft', [modelInstanceFixture({ id: 'east', longitude: 170, latitude: 0 })])
    const wrapped = [400 + (170 / 360) * 512 - 512, 300] as const
    expect(layer.pick(wrapped)).toEqual([])
    render()
    expect(layer.pick(wrapped)).toEqual([{ group: 'aircraft', id: 'east', distance: expect.any(Number) }])
    expect(layer.pick(wrapped, ['vessels'])).toEqual([])
    layer.setGroupActive('aircraft', false)
    expect(layer.pick(wrapped)).toEqual([])
  })

  it('fails closed on a compile failure and reports once after the frame', async () => {
    const { layer, calls, onFailure, render, show } = setup(TALLINN, { compiles: false })
    show('aircraft')
    render()
    expect(layer.failed).toBe(true)
    expect(onFailure).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(onFailure.mock.calls[0][0]).toBeInstanceOf(ModelGlError)
    expect(named(calls, 'drawArraysInstanced')).toEqual([])
    expect(named(calls, 'deleteBuffer')).toHaveLength(1)
    expect(tail(calls)).toEqual(RESTORED_STATE)
    calls.length = 0
    render()
    expect(calls).toEqual([])
    expect(layer.isGroupActive('aircraft')).toBe(false)
    expect(layer.pick([400, 300])).toEqual([])
  })

  it('skips a lost context without touching GL', () => {
    const { layer, calls, render, show } = setup(TALLINN, { lost: true })
    show('aircraft')
    render()
    expect(calls).toEqual([])
    expect(layer.pick([400, 300])).toEqual([])
  })

  it('releases GPU resources on removal and rebuilds retained data when re-added', () => {
    const { layer, calls, gl, map, render, show } = setup()
    show('aircraft')
    render()
    expect(layer.pick([400, 300])).toHaveLength(1)
    layer.onRemove(map, gl)
    expect(named(calls, 'deleteProgram')).toHaveLength(3)
    expect(named(calls, 'deleteVertexArray')).toHaveLength(8)
    expect(named(calls, 'deleteBuffer')).toHaveLength(5)
    expect(layer.pick([400, 300])).toEqual([])
    calls.length = 0
    render()
    expect(calls).toEqual([])
    layer.onAdd(map)
    render()
    expect(named(calls, 'createProgram')).toHaveLength(3)
    expect(named(calls, 'bufferSubData')).toHaveLength(1)
    expect(layer.pick([400, 300])).toHaveLength(1)
  })

  it('requests repaints only for changes while attached', () => {
    const { layer, triggerRepaint, show } = setup()
    show('aircraft')
    layer.setGroupActive('aircraft', true)
    expect(triggerRepaint).toHaveBeenCalledTimes(2)
    const detached = new TrafficModelLayer(meshes, vi.fn())
    expect(() => detached.setInstances('vessels', [], '#ffffff')).not.toThrow()
  })
})
