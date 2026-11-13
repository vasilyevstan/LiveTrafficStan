import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  MODEL_MATERIAL_ROLE_BYTES,
  MODEL_VERTEX_STRIDE_BYTES,
  parseTrafficModelAsset,
  type TrafficModelMesh,
} from './trafficModelAsset'
import { TRAFFIC_MODEL_IDS } from './trafficModelCatalog'

const LIMITS = { maximumBytes: 128 * 1024, maximumTrianglesPerModel: 600 }
const committed = readFileSync(
  new URL('../../assets/models/traffic-models-v1.glb', import.meta.url),
)
const assetBytes = () =>
  committed.buffer.slice(
    committed.byteOffset,
    committed.byteOffset + committed.byteLength,
  ) as ArrayBuffer

const chunks = () => {
  const view = new DataView(assetBytes())
  const jsonLength = view.getUint32(12, true)
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(view.buffer, 20, jsonLength)),
  ) as Record<string, unknown>
  const binLength = view.getUint32(20 + jsonLength, true)
  const bin = new Uint8Array(view.buffer, 28 + jsonLength, binLength)
  return { json, bin: bin.slice() }
}

const glb = (json: unknown, bin: Uint8Array) => {
  let text = JSON.stringify(json)
  while (new TextEncoder().encode(text).byteLength % 4 !== 0) text += ' '
  const jsonBytes = new TextEncoder().encode(text)
  const total = 28 + jsonBytes.byteLength + bin.byteLength
  const bytes = new ArrayBuffer(total)
  const view = new DataView(bytes)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonBytes.byteLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(bytes, 20).set(jsonBytes)
  view.setUint32(20 + jsonBytes.byteLength, bin.byteLength, true)
  view.setUint32(24 + jsonBytes.byteLength, 0x004e4942, true)
  new Uint8Array(bytes, 28 + jsonBytes.byteLength).set(bin)
  return bytes
}

type Gltf = {
  nodes: Record<string, unknown>[]
  meshes: { primitives: Record<string, unknown>[] }[]
  accessors: Record<string, unknown>[]
  bufferViews: Record<string, unknown>[]
  materials: Record<string, unknown>[]
} & Record<string, unknown>

const mutated = (change: (json: Gltf, bin: Uint8Array) => void) => {
  const { json, bin } = chunks()
  change(json as Gltf, bin)
  return glb(json, bin)
}

const vertexAt = (mesh: TrafficModelMesh, index: number) => {
  const view = new DataView(mesh.vertices)
  const offset = index * MODEL_VERTEX_STRIDE_BYTES
  return {
    position: [0, 4, 8].map((byte) => view.getFloat32(offset + byte, true)),
    normal: [12, 16, 20].map((byte) => view.getFloat32(offset + byte, true)),
    material: [24, 25, 26, 27].map((byte) => view.getUint8(offset + byte)),
  }
}

const bounds = (mesh: TrafficModelMesh) => {
  const minimum = [Infinity, Infinity, Infinity]
  const maximum = [-Infinity, -Infinity, -Infinity]
  for (let index = 0; index < mesh.triangleCount * 3; index += 1) {
    vertexAt(mesh, index).position.forEach((value, axis) => {
      minimum[axis] = Math.min(minimum[axis], value)
      maximum[axis] = Math.max(maximum[axis], value)
    })
  }
  return { minimum, maximum }
}

describe('committed traffic model asset', () => {
  const models = parseTrafficModelAsset(assetBytes(), LIMITS)

  it('ships every model identity within the byte and triangle budgets', () => {
    expect(committed.byteLength).toBeLessThanOrEqual(128 * 1024)
    expect([...models.keys()].sort()).toEqual([...TRAFFIC_MODEL_IDS].sort())
    for (const model of models.values()) {
      // Named spacecraft draw at most one instance each, so they get more detail.
      const named = model.id === 'orbital-iss' || model.id === 'orbital-hubble'
      const budget = named ? 400 : { aircraft: 300, vessel: 260, orbital: 120 }[model.kind]
      expect(model.triangleCount, model.id).toBeLessThanOrEqual(budget)
      expect(model.vertices.byteLength).toBe(
        model.triangleCount * 3 * MODEL_VERTEX_STRIDE_BYTES,
      )
    }
    const total = [...models.values()].reduce(
      (sum, model) => sum + model.triangleCount,
      0,
    )
    expect(total).toBe(2_920)
  })

  it('uses the starboard, forward and up frame with a keel origin', () => {
    for (const model of models.values()) {
      const { minimum, maximum } = bounds(model)
      expect(model.bounds).toEqual({ minimum, maximum })
      const tolerance = 0.02 * model.lengthMeters + 0.02
      expect(
        Math.abs(maximum[0] - minimum[0] - model.beamMeters),
        `${model.id} beam`,
      ).toBeLessThanOrEqual(tolerance)
      expect(
        Math.abs(maximum[1] - minimum[1] - model.lengthMeters),
        `${model.id} length`,
      ).toBeLessThanOrEqual(tolerance)
      expect(
        Math.abs(maximum[2] - minimum[2] - model.heightMeters),
        `${model.id} height`,
      ).toBeLessThanOrEqual(tolerance)
      expect(Math.abs(minimum[2]), `${model.id} keel`).toBeLessThan(1e-3)
      if (model.id === 'vessel-sailing') {
        // The builder centres the hull, not the boom swung to one side.
        expect(Math.abs(minimum[0])).toBeGreaterThan(model.beamMeters / 2)
        expect(Math.abs(maximum[0])).toBeLessThan(model.beamMeters / 2)
      } else {
        expect(
          Math.abs(maximum[0] + minimum[0]),
          `${model.id} r`,
        ).toBeLessThan(tolerance)
      }
      expect(Math.abs(maximum[1] + minimum[1]), `${model.id} f`).toBeLessThan(
        tolerance,
      )
    }
  })

  it('keeps closed, outward-wound geometry safe for back-face culling', () => {
    for (const model of models.values()) {
      const key = (position: number[]) =>
        position.map((value) => Math.round(value * 1e4)).join()
      const edges = new Map<string, number>()
      let volume = 0
      for (let triangle = 0; triangle < model.triangleCount; triangle += 1) {
        const corners = [0, 1, 2].map(
          (corner) => vertexAt(model, triangle * 3 + corner).position,
        )
        const [a, b, c] = corners
        volume +=
          (a[0] * (b[1] * c[2] - b[2] * c[1]) -
            a[1] * (b[0] * c[2] - b[2] * c[0]) +
            a[2] * (b[0] * c[1] - b[1] * c[0])) /
          6
        for (let corner = 0; corner < 3; corner += 1) {
          const from = key(corners[corner])
          const to = key(corners[(corner + 1) % 3])
          const forward = `${from}>${to}`
          const reverse = `${to}>${from}`
          if ((edges.get(reverse) ?? 0) > 0) {
            edges.set(reverse, edges.get(reverse)! - 1)
          } else {
            edges.set(forward, (edges.get(forward) ?? 0) + 1)
          }
        }
      }
      const open = [...edges.values()].reduce((sum, count) => sum + count, 0)
      expect(open, `${model.id} open edges`).toBe(0)
      expect(volume, `${model.id} volume`).toBeGreaterThan(0)
    }
  })

  it('encodes face normals and sRGB accent bytes per vertex', () => {
    const aircraft = models.get('aircraft')!
    const roles = new Set<number>()
    for (let index = 0; index < aircraft.triangleCount * 3; index += 1) {
      const { normal, material } = vertexAt(aircraft, index)
      expect(Math.hypot(...normal)).toBeCloseTo(1, 5)
      roles.add(material[3])
    }
    expect(roles).toEqual(
      new Set(Object.values(MODEL_MATERIAL_ROLE_BYTES)),
    )
    const accents = new Set<string>()
    for (const model of models.values()) {
      for (let index = 0; index < model.triangleCount * 3; index += 1) {
        const { material } = vertexAt(model, index)
        if (material[3] === MODEL_MATERIAL_ROLE_BYTES.accent) {
          accents.add(material.slice(0, 3).join())
        }
      }
    }
    // LTS_orange is linear [0.80695, 0.0999, 0.00368].
    expect(accents).toContain('232,89,12')
  })
})

describe('parseTrafficModelAsset', () => {
  const rejects = (bytes: ArrayBuffer, message: RegExp) =>
    expect(() => parseTrafficModelAsset(bytes, LIMITS)).toThrow(message)

  it('rejects malformed containers and size limits', () => {
    const bytes = assetBytes()
    const badMagic = bytes.slice(0)
    new DataView(badMagic).setUint32(0, 0, true)
    rejects(badMagic, /header/)
    rejects(bytes.slice(0, bytes.byteLength - 4), /header/)
    expect(() =>
      parseTrafficModelAsset(bytes, { ...LIMITS, maximumBytes: 1024 }),
    ).toThrow(/size/)
    expect(() =>
      parseTrafficModelAsset(bytes, {
        ...LIMITS,
        maximumTrianglesPerModel: 100,
      }),
    ).toThrow(/triangle budget/)
  })

  it('rejects unsupported glTF features and inconsistent identities', () => {
    rejects(mutated((json) => {
      json.extensionsUsed = ['KHR_draco_mesh_compression']
    }), /extensionsUsed/)
    rejects(mutated((json) => {
      json.nodes[0].translation = [0, 1, 0]
    }), /translation/)
    rejects(mutated((json) => {
      json.nodes[1].extras = { ...(json.nodes[0].extras as object) }
    }), /identity|inconsistent/)
    rejects(mutated((json) => {
      json.nodes[0].extras = {
        ...(json.nodes[0].extras as object),
        lts_kind: 'vessel',
      }
    }), /inconsistent/)
    rejects(mutated((json) => {
      json.nodes.pop()
      json.scenes = [{ nodes: json.nodes.map((_, index) => index) }]
    }), /model count/)
    rejects(mutated((json) => {
      json.meshes[0].primitives[0].mode = 1
    }), /layout/)
    rejects(mutated((json) => {
      json.materials[0].extras = { lts_role: 'emissive' }
    }), /role/)
  })

  it('rejects accessor layouts and indices outside their buffers', () => {
    rejects(mutated((json) => {
      json.bufferViews[0].byteStride = 16
    }), /interleaved/)
    rejects(mutated((json) => {
      json.accessors[0].byteOffset = 2
    }), /misaligned|exceeds/)
    rejects(mutated((json) => {
      json.bufferViews[0].byteLength = 1e9
    }), /exceeds/)
    rejects(mutated((json, bin) => {
      const indices = json.accessors[1]
      const view = json.bufferViews[indices.bufferView as number]
      new DataView(bin.buffer).setUint16(view.byteOffset as number, 9999, true)
    }), /index is out of range/)
  })
})
