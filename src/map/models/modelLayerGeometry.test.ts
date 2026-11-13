import { describe, expect, it } from 'vitest'
import {
  frameInputFixture,
  modelInstanceFixture,
  type CameraFixture,
} from './modelCameraFixtures'
import { packModelInstances, type ModelInstance } from './modelInstances'
import {
  modelGroupStats,
  modelPickAnchors,
  modelPickHits,
  referenceNeedsUpdate,
  visibleWorldCopies,
  worldCopyVisible,
} from './modelLayerGeometry'
import {
  MODEL_FLAG_DROP_LINE,
  MODEL_FLAG_SELECTED,
  createModelFrame,
  mercatorUnitsPerMeter,
  mercatorX,
  mercatorY,
  projectModelInstance,
} from './modelProjection'

const LIMITS = { maximumReferenceDriftWorlds: 0.25, maximumReferenceDriftPx: 100_000 }

const frameFor = (camera: CameraFixture, transition = 0) => {
  const frame = createModelFrame(frameInputFixture(camera, transition))
  if (!frame) throw new Error('camera fixture produced no frame')
  return frame
}

const statsFor = (camera: CameraFixture, instances: ModelInstance[]) =>
  modelGroupStats(packModelInstances(instances, frameFor(camera).reference))

describe('modelGroupStats', () => {
  it('reports overlays, airborne state and bounds padded by model extent', () => {
    const camera = { longitude: 24.75, latitude: 59.43, zoom: 8 }
    const stats = statsFor(camera, [
      modelInstanceFixture({ id: 'a', altitudeMeters: 10_000, flags: MODEL_FLAG_DROP_LINE }),
      modelInstanceFixture({ id: 'v', model: 'vessel', extentMeters: 300, flags: MODEL_FLAG_SELECTED }),
    ])
    const mpm = mercatorUnitsPerMeter(59.43)
    expect(stats).toMatchObject({ airborne: true, anyDropLine: true, anySelected: true })
    expect(stats.minX).toBeCloseTo(-300 * mpm, 12)
    expect(stats.maxX).toBeCloseTo(300 * mpm, 12)
    expect(stats.maxZ).toBeCloseTo(10_040 * mpm, 12)
  })

  it('keeps empty and surface-only groups free of overlay passes', () => {
    const camera = { longitude: 0, latitude: 0, zoom: 4 }
    expect(statsFor(camera, [])).toMatchObject({ airborne: false, minX: Infinity, maxX: -Infinity })
    expect(statsFor(camera, [modelInstanceFixture({ altitudeMeters: -12 })])).toMatchObject({
      airborne: false,
      anyDropLine: false,
      anySelected: false,
    })
  })
})

describe('referenceNeedsUpdate', () => {
  const reference = { x: 0.5, y: 0.5 }

  it('anchors once and keeps the reference for small drift', () => {
    expect(referenceNeedsUpdate(undefined, reference, 4, LIMITS)).toBe(true)
    expect(referenceNeedsUpdate(reference, { x: 0.5001, y: 0.4999 }, 4, LIMITS)).toBe(false)
  })

  it('re-anchors on pixel drift, world drift, unwrapped world jumps and invalid centres', () => {
    expect(referenceNeedsUpdate(reference, { x: 0.501, y: 0.5 }, 18, LIMITS)).toBe(true)
    expect(referenceNeedsUpdate(reference, { x: 0.8, y: 0.5 }, 0, LIMITS)).toBe(true)
    expect(referenceNeedsUpdate(reference, { x: 1.5, y: 0.5 }, 0, LIMITS)).toBe(true)
    expect(referenceNeedsUpdate(reference, { x: Number.NaN, y: 0.5 }, 4, LIMITS)).toBe(true)
  })
})

describe('visibleWorldCopies', () => {
  const dateline = [
    modelInstanceFixture({ id: 'west', longitude: -170, latitude: 10 }),
    modelInstanceFixture({ id: 'east', longitude: 170, latitude: -10 }),
  ]

  it('adds only the Mercator copies that reach the canvas', () => {
    const camera = { longitude: 0, latitude: 0, zoom: 0 }
    const frame = frameFor(camera)
    const stats = statsFor(camera, dateline)
    expect(visibleWorldCopies(frame, stats, true)).toEqual([0, -1, 1])
    expect(worldCopyVisible(frame, stats, 2)).toBe(false)
  })

  it('draws only the primary copy for local views, globe frames and disabled copies', () => {
    const local = { longitude: 24.75, latitude: 59.43, zoom: 6 }
    expect(visibleWorldCopies(frameFor(local), statsFor(local, [modelInstanceFixture()]), true)).toEqual([0])
    const world = { longitude: 0, latitude: 0, zoom: 0 }
    const stats = statsFor(world, dateline)
    expect(visibleWorldCopies(frameFor(world, 1), stats, true)).toEqual([0])
    expect(visibleWorldCopies(frameFor(world), stats, false)).toEqual([0])
  })
})

describe('model picking anchors', () => {
  it('hits a wrapped world copy and keeps the nearest hit per object', () => {
    const camera = { longitude: 0, latitude: 0, zoom: 0 }
    const frame = frameFor(camera)
    const east = modelInstanceFixture({ id: 'east', longitude: 170, latitude: 0 })
    const anchors = modelPickAnchors(frame, [east], [0, -1, 1])
    expect(anchors).toHaveLength(3)
    const shifted = projectModelInstance(
      { ...frame, reference: { x: frame.reference.x - 1, y: frame.reference.y } },
      east,
    )!
    expect(shifted.x).toBeCloseTo(400 + (170 / 360) * 512 - 512, 6)
    const hits = modelPickHits('aircraft', anchors, [shifted.x + 2, shifted.y])
    expect(hits).toEqual([{ group: 'aircraft', id: 'east', distance: expect.closeTo(2, 6) }])
    expect(modelPickHits('aircraft', anchors, [10, 10])).toEqual([])
  })

  it('matches the CPU projection used by the shader for the primary copy', () => {
    const camera = { longitude: 24.75, latitude: 59.43, zoom: 9, pitchDegrees: 50, bearingDegrees: 30 }
    const frame = frameFor(camera)
    const instance = modelInstanceFixture({ longitude: 24.8, latitude: 59.45 })
    const [{ anchor }] = modelPickAnchors(frame, [instance], [0])
    expect(anchor).toEqual(projectModelInstance(frame, instance))
    expect(frame.reference).toEqual({ x: mercatorX(24.75), y: mercatorY(59.43) })
  })
})
