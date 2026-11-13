import { describe, expect, it } from 'vitest'
import { cameraFixture, frameInputFixture, scaleMat4 } from './modelCameraFixtures'
import {
  contextOpacityFactor,
  createModelFrame,
  FOOTPRINT_OPACITY,
  IDENTITY_MATRIX,
  invertMat4,
  latitudeFromMercatorY,
  liftedVisibility,
  MAXIMUM_MERCATOR_LATITUDE,
  mercatorUnitsPerMeter,
  mercatorX,
  mercatorY,
  MODEL_FLAG_ZOOM_CONTEXT,
  modelHitDistance,
  multiplyMat4,
  perspectiveScale,
  projectLocalPoint,
  projectModelInstance,
  transformVec4,
  wrapMercatorOffset,
  type ModelFrame,
  type ModelInstanceGeometry,
} from './modelProjection'

const TALLINN = { longitude: 24.75, latitude: 59.43 }

const instance = (overrides: Partial<ModelInstanceGeometry> = {}): ModelInstanceGeometry => ({
  ...TALLINN,
  altitudeMeters: 0,
  headingDegrees: 0,
  lengthMeters: 30,
  beamMeters: 20,
  heightMeters: 10,
  bounds: {
    minimum: [-10, -15, 0],
    maximum: [10, 15, 10],
  },
  lengthScale: 1,
  overviewStretch: 1,
  extentMeters: 30,
  floorPx: 24,
  opacity: 1,
  flags: 0,
  ...overrides,
})

const eastOf = (longitude: number, latitude: number, meters: number) =>
  longitude + (meters * mercatorUnitsPerMeter(latitude)) * 360

const frameFor = (camera: Parameters<typeof frameInputFixture>[0], transition = 0) => {
  const frame = createModelFrame(frameInputFixture(camera, transition))
  if (!frame) throw new Error('expected a model frame')
  return frame
}

const cameraAltitudeMeters = (frame: ModelFrame, latitude: number) =>
  frame.cameraMercatorZ / mercatorUnitsPerMeter(latitude)

describe('model projection math', () => {
  it('inverts camera matrices and round-trips Mercator coordinates', () => {
    const { mercatorMatrix } = cameraFixture({ ...TALLINN, zoom: 12, pitchDegrees: 50, bearingDegrees: 30 })
    const inverse = invertMat4(mercatorMatrix)
    expect(inverse).toBeDefined()
    multiplyMat4(mercatorMatrix, inverse!).forEach((value, index) =>
      expect(value).toBeCloseTo(IDENTITY_MATRIX[index], 6),
    )
    expect(invertMat4(new Float64Array(16))).toBeUndefined()
    for (const latitude of [-80, -33.9, 0, 59.43, 85]) {
      expect(latitudeFromMercatorY(mercatorY(latitude))).toBeCloseTo(latitude, 9)
    }
    expect(mercatorY(89)).toBe(mercatorY(MAXIMUM_MERCATOR_LATITUDE))
    expect(wrapMercatorOffset(0.98)).toBeCloseTo(-0.02, 12)
    expect(wrapMercatorOffset(-0.7)).toBeCloseTo(0.3, 12)
  })

  it('offsets east, north and up consistently in Mercator and globe space', () => {
    const frame = {
      transition: 1,
      mercatorMatrix: Float64Array.from(IDENTITY_MATRIX),
      globeMatrix: Float64Array.from(IDENTITY_MATRIX),
      reference: { x: 0.5, y: 0.5 },
    }
    const mpm = mercatorUnitsPerMeter(60)
    const east = projectLocalPoint(frame, 90, 60, 0, 1000)
    const north = projectLocalPoint(frame, 90, 60, 0, 0, 1000)
    const up = projectLocalPoint(frame, 90, 60, 0, 0, 0, 1000)
    const base = projectLocalPoint(frame, 90, 60, 0)
    expect(east.mercator[0] - base.mercator[0]).toBeCloseTo(1000 * mpm, 12)
    expect(north.mercator[1] - base.mercator[1]).toBeCloseTo(-1000 * mpm, 12)
    expect(up.mercator[2] - base.mercator[2]).toBeCloseTo(1000 * mpm, 12)
    // At 90°E the local east axis is -z, north tilts toward +y and up points outward.
    expect(east.sphere![2] - base.sphere![2]).toBeLessThan(0)
    expect(north.sphere![1] - base.sphere![1]).toBeGreaterThan(0)
    expect(Math.hypot(...up.sphere!)).toBeCloseTo(1 + 1000 / 6_371_008.8, 12)
  })

  it('aligns a top-down Mercator camera with MapLibre pixel scale', () => {
    const fixture = cameraFixture({ ...TALLINN, zoom: 12 })
    const frame = frameFor({ ...TALLINN, zoom: 12 })
    const pixelsPerMeter = fixture.worldSize * mercatorUnitsPerMeter(TALLINN.latitude)
    expect(frame.frontFaceCcw).toBe(true)
    expect(frame.cameraMercatorZ).toBeCloseTo(fixture.cameraToCenterDistance / fixture.worldSize, 12)
    const centre = projectModelInstance(frame, instance({ extentMeters: 300 }))
    expect(centre).toMatchObject({ lifted: true, alpha: 1 })
    expect(centre!.x).toBeCloseTo(400, 6)
    expect(centre!.y).toBeCloseTo(300, 6)
    expect(centre!.radiusPx).toBeCloseTo((300 * pixelsPerMeter) / 2, 6)
    const floor = projectModelInstance(frame, instance({ extentMeters: 10, floorPx: 24 }))
    expect(floor!.radiusPx).toBeCloseTo(12, 6)
    const east = projectModelInstance(
      frame,
      instance({ longitude: eastOf(TALLINN.longitude, TALLINN.latitude, 2000) }),
    )
    expect(east!.x).toBeCloseTo(400 + 2000 * pixelsPerMeter, 6)
    expect(east!.y).toBeCloseTo(300, 6)
  })

  it('enlarges the readable floor without changing natural close-zoom size or position', () => {
    const data = instance({
      lengthMeters: 200,
      beamMeters: 32,
      extentMeters: 200,
      bounds: { minimum: [-16, -100, 0], maximum: [16, 100, 10] },
      floorPx: 32,
    })
    for (const transition of [0, 1]) {
      const wideFrame = frameFor({ ...TALLINN, zoom: 11 }, transition)
      const oldWide = projectModelInstance(wideFrame, data)!
      const newWide = projectModelInstance(wideFrame, { ...data, floorPx: 48 })!
      expect(newWide.radiusPx / oldWide.radiusPx).toBeCloseTo(1.5, 5)
      expect(newWide.x).toBe(oldWide.x)
      expect(newWide.y).toBe(oldWide.y)
      expect(newWide.alpha).toBe(oldWide.alpha)
      const closeFrame = frameFor({ ...TALLINN, zoom: 16 }, transition)
      const oldClose = projectModelInstance(closeFrame, data)!
      const newClose = projectModelInstance(closeFrame, { ...data, floorPx: 48 })!
      expect(newClose.radiusPx).toBe(oldClose.radiusPx)
      expect(newClose.x).toBe(oldClose.x)
      expect(newClose.y).toBe(oldClose.y)
      expect(newClose.heightAxis).toEqual(oldClose.heightAxis)
    }
  })

  it('keeps the overview pick target and converges to true proportions at close zoom', () => {
    const cargo = instance({
      lengthMeters: 200,
      beamMeters: 32,
      extentMeters: 200,
      bounds: { minimum: [-16, -100, 0], maximum: [16, 100, 36] },
      floorPx: 34,
    })
    const stretched = { ...cargo, overviewStretch: Math.sqrt(200 / 32 / 3.5) }
    for (const transition of [0, 1]) {
      const wide = frameFor({ ...TALLINN, zoom: 9 }, transition)
      const plain = projectModelInstance(wide, cargo)!
      const wider = projectModelInstance(wide, stretched)!
      expect(wider.radiusPx).toBe(plain.radiusPx)
      expect(wider.heightAxis).toEqual(plain.heightAxis)
      for (const axis of ['lengthAxis', 'beamAxis'] as const) {
        expect(wider[axis].x).toBeCloseTo(plain[axis].x, 3)
        expect(wider[axis].y).toBeCloseTo(plain[axis].y, 3)
      }
      const close = frameFor({ ...TALLINN, zoom: 17 }, transition)
      expect(projectModelInstance(close, stretched)).toEqual(projectModelInstance(close, cargo))
    }
  })

  it('keeps float32 globe surface depth precise with camera-relative coordinates', () => {
    const gpuClip = (matrix: ArrayLike<number>, point: readonly number[]) =>
      [0, 1, 2, 3].map((row) =>
        point.reduce(
          (sum, value, column) =>
            Math.fround(sum + Math.fround(Math.fround(matrix[column * 4 + row]) * Math.fround(value))),
          0,
        ),
      )
    for (const zoom of [10.5, 11.7, 14]) {
      const frame = frameFor({ ...TALLINN, zoom }, 1)
      const { sphere } = projectLocalPoint(frame, 24.77, 59.44, 0, 500, 500, 20)
      const exact = transformVec4(frame.globeMatrix, ...sphere!, 1)
      const direct = gpuClip(frame.globeMatrix, [...sphere!, 1])
      const relative = gpuClip(frame.globeRtcMatrix, [
        sphere![0] - frame.globeOrigin[0],
        sphere![1] - frame.globeOrigin[1],
        sphere![2] - frame.globeOrigin[2],
        1,
      ])
      const expectedDepth = exact[2] / exact[3]
      const relativeError = Math.abs(relative[2] / relative[3] - expectedDepth)
      expect(relativeError).toBeLessThan(2e-7)
      expect(relativeError).toBeLessThan(Math.abs(direct[2] / direct[3] - expectedDepth))
    }
  })

  it('lifts low aircraft by altitude and fades high ones to a ground footprint', () => {
    const fixture = cameraFixture({ ...TALLINN, zoom: 12 })
    const frame = frameFor({ ...TALLINN, zoom: 12 })
    const pixelsPerMeter = fixture.worldSize * mercatorUnitsPerMeter(TALLINN.latitude)
    const longitude = eastOf(TALLINN.longitude, TALLINN.latitude, 2000)
    const cameraAltitude = cameraAltitudeMeters(frame, TALLINN.latitude)
    const distance = fixture.cameraToCenterDistance
    const height = 2000 * pixelsPerMeter
    const lifted = projectModelInstance(frame, instance({ longitude, altitudeMeters: 2000 }))
    expect(lifted).toMatchObject({ lifted: true, alpha: 1 })
    expect(lifted!.x).toBeCloseTo(400 + (2000 * pixelsPerMeter * distance) / (distance - height), 4)
    expect(liftedVisibility(frame, 0.6 * cameraAltitude, TALLINN.latitude)).toBeCloseTo(0.84375, 9)
    const high = projectModelInstance(frame, instance({ longitude, altitudeMeters: 1.4 * cameraAltitude }))
    expect(high).toMatchObject({ lifted: false, alpha: FOOTPRINT_OPACITY })
    expect(high!.x).toBeCloseTo(400 + 2000 * pixelsPerMeter, 6)
    expect(liftedVisibility(frame, -50, TALLINN.latitude)).toBe(1)
  })

  it('applies zoom-context opacity and drops invisible instances', () => {
    expect(contextOpacityFactor(2)).toBe(0)
    expect(contextOpacityFactor(5)).toBeCloseTo(0.425, 12)
    expect(contextOpacityFactor(12)).toBeCloseTo(0.85, 12)
    const frame = frameFor({ ...TALLINN, zoom: 5 })
    const context = projectModelInstance(frame, instance({ opacity: 0.98, flags: MODEL_FLAG_ZOOM_CONTEXT }))
    expect(context!.alpha).toBeCloseTo(0.98 * 0.425, 12)
    expect(projectModelInstance(frame, instance({ opacity: 0.001 }))).toBeUndefined()
    expect(projectModelInstance(frameFor({ ...TALLINN, zoom: 2.5 }), instance({ flags: 1 }))).toBeUndefined()
  })

  it('keeps pitched cameras anchored and scales the floor with perspective', () => {
    const frame = frameFor({ ...TALLINN, zoom: 14, pitchDegrees: 60, bearingDegrees: 30 })
    expect(frame.frontFaceCcw).toBe(true)
    const centre = projectModelInstance(frame, instance({ extentMeters: 1 }))
    expect(centre!.x).toBeCloseTo(400, 6)
    expect(centre!.y).toBeCloseTo(300, 6)
    expect(centre!.radiusPx).toBeCloseTo(12, 6)
    const ahead = projectModelInstance(frame, instance({ latitude: 59.44, extentMeters: 1 }))
    expect(ahead!.y).toBeLessThan(300)
    expect(ahead!.radiusPx).toBeLessThan(12)
    expect(perspectiveScale(1, 1)).toBe(1)
    expect(perspectiveScale(1, 100)).toBeCloseTo(0.505, 12)
    expect(perspectiveScale(1, 1e12)).toBeCloseTo(0.5, 9)
    expect(perspectiveScale(10, 1)).toBe(2)
  })

  it('wraps instances across the antimeridian around the reference', () => {
    const frame = frameFor({ longitude: 179.9, latitude: 0, zoom: 9 })
    const fixture = cameraFixture({ longitude: 179.9, latitude: 0, zoom: 9 })
    const across = projectModelInstance(frame, instance({ longitude: -179.95, latitude: 0 }))
    expect(across!.x).toBeCloseTo(400 + (0.15 / 360) * fixture.worldSize, 4)
    expect(mercatorX(-179.95)).toBeLessThan(0.001)
  })

  it('detects mirrored projections for back-face culling', () => {
    const input = frameInputFixture({ ...TALLINN, zoom: 10, pitchDegrees: 40 })
    const mirrored = multiplyMat4(scaleMat4(-1, 1, 1), input.mainMatrix)
    const frame = createModelFrame({ ...input, mainMatrix: mirrored, fallbackMatrix: mirrored })
    expect(frame?.frontFaceCcw).toBe(false)
    expect(createModelFrame({ ...input, cssWidth: 0 })).toBeUndefined()
  })

  it('projects the globe, mixes the transition and hides the far side', () => {
    const camera = { ...TALLINN, zoom: 3 }
    const fixture = cameraFixture(camera)
    const globe = frameFor(camera, 1)
    expect(globe.frontFaceCcw).toBe(true)
    expect(globe.cameraGlobeAltitudeMeters).toBeCloseTo(
      (fixture.cameraToCenterDistance / fixture.globeRadiusPixels) * 6_371_008.8,
      3,
    )
    const centre = projectModelInstance(globe, instance())
    expect(centre!.x).toBeCloseTo(400, 6)
    expect(centre!.y).toBeCloseTo(300, 6)
    const satellite = projectModelInstance(globe, instance({ altitudeMeters: 400_000 }))
    expect(satellite).toMatchObject({ lifted: true })
    const antipode = { longitude: TALLINN.longitude - 180, latitude: -TALLINN.latitude }
    expect(projectLocalPoint(globe, antipode.longitude, antipode.latitude, 0).clip[3]).toBeGreaterThan(0)
    expect(projectModelInstance(globe, instance(antipode))).toBeUndefined()

    const far = instance({ longitude: eastOf(TALLINN.longitude, TALLINN.latitude, 800_000) })
    const mercatorX0 = projectModelInstance(frameFor(camera, 0), far)!.x
    const globeX = projectModelInstance(globe, far)!.x
    const mixedX = projectModelInstance(frameFor(camera, 0.5), far)!.x
    expect(Math.abs(mercatorX0 - globeX)).toBeGreaterThan(1)
    expect(mixedX).toBeGreaterThan(Math.min(mercatorX0, globeX))
    expect(mixedX).toBeLessThan(Math.max(mercatorX0, globeX))
  })

  it('projects forward and starboard axes with shader scale at street zooms', () => {
    for (const zoom of [14, 16]) {
      const fixture = cameraFixture({ ...TALLINN, zoom })
      const frame = frameFor({ ...TALLINN, zoom })
      const instanceData = instance({
        headingDegrees: 0,
        lengthMeters: 200,
        beamMeters: 32,
        heightMeters: 36,
        lengthScale: 1.49,
        extentMeters: 200 * 1.49,
        floorPx: 36,
      })
      const pixelsPerMeter = fixture.worldSize * mercatorUnitsPerMeter(TALLINN.latitude)
      const scale = Math.max(
        1,
        instanceData.floorPx / (instanceData.extentMeters * pixelsPerMeter),
      )
      const northbound = projectModelInstance(frame, instanceData)!
      const expectedLengthHalf = Math.max(
        instanceData.floorPx / 2,
        (instanceData.lengthMeters * instanceData.lengthScale * scale * pixelsPerMeter) / 2,
      )
      const expectedBeamHalf = Math.max(
        instanceData.floorPx / 2,
        (instanceData.beamMeters * instanceData.lengthScale * scale * pixelsPerMeter) / 2,
      )
      expect(Math.abs(northbound.lengthAxis.x)).toBeLessThan(0.1)
      expect(northbound.lengthAxis.y).toBeLessThan(0)
      expect(Math.hypot(northbound.lengthAxis.x, northbound.lengthAxis.y)).toBeCloseTo(
        expectedLengthHalf,
        0,
      )
      expect(northbound.beamAxis.x).toBeGreaterThan(0)
      expect(Math.abs(northbound.beamAxis.y)).toBeLessThan(0.1)
      expect(Math.hypot(northbound.beamAxis.x, northbound.beamAxis.y)).toBeCloseTo(
        expectedBeamHalf,
        0,
      )
      expect(
        modelHitDistance(northbound, {
          x: northbound.x + northbound.lengthAxis.x * 0.8,
          y: northbound.y + northbound.lengthAxis.y * 0.8,
        }),
      ).toBeDefined()
      const length = Math.hypot(northbound.lengthAxis.x, northbound.lengthAxis.y)
      const perpendicular = {
        x: -northbound.lengthAxis.y / length,
        y: northbound.lengthAxis.x / length,
      }
      const beamHalf =
        Math.abs(
          northbound.lengthAxis.x * northbound.beamAxis.y -
            northbound.lengthAxis.y * northbound.beamAxis.x,
        ) / length
      expect(
        modelHitDistance(northbound, {
          x: northbound.x + perpendicular.x * (beamHalf + 5),
          y: northbound.y + perpendicular.y * (beamHalf + 5),
        }),
      ).toBeUndefined()

      const eastbound = projectModelInstance(
        frame,
        { ...instanceData, headingDegrees: 90 },
      )!
      expect(eastbound.lengthAxis.x).toBeGreaterThan(0)
      expect(Math.abs(eastbound.lengthAxis.y)).toBeLessThan(0.1)
      expect(Math.abs(eastbound.beamAxis.x)).toBeLessThan(0.1)
      expect(eastbound.beamAxis.y).toBeGreaterThan(0)
    }
  })

  it('includes the projected upper silhouette of a tall model in its pick hull', () => {
    const frame = frameFor({ ...TALLINN, zoom: 16, pitchDegrees: 55 })
    const data = instance({
      headingDegrees: 90,
      lengthMeters: 200,
      beamMeters: 32,
      heightMeters: 36,
      bounds: {
        minimum: [-16, -100, 0],
        maximum: [16, 100, 36],
      },
      extentMeters: 200,
      floorPx: 36,
    })
    const anchor = projectModelInstance(frame, data)!
    const center = projectLocalPoint(frame, data.longitude, data.latitude, 0)
    const pixelsPerMeter =
      (frame.kMercator * mercatorUnitsPerMeter(data.latitude)) / center.mercator[3]
    const modelScale = Math.max(
      1,
      (data.floorPx * perspectiveScale(frame.centerW, center.clip[3])) /
        (data.extentMeters * pixelsPerMeter),
    )
    const top = projectLocalPoint(
      frame,
      data.longitude,
      data.latitude,
      0,
      0,
      0,
      data.heightMeters * data.lengthScale * modelScale,
    ).clip
    const upperPoint = {
      x: anchor.x + anchor.heightAxis.x * 0.8,
      y: anchor.y + anchor.heightAxis.y * 0.8,
    }
    expect(anchor.heightAxis.x).toBeCloseTo(
      ((top[0] / top[3] - center.clip[0] / center.clip[3]) / 2) * frame.cssWidth,
      8,
    )
    expect(anchor.heightAxis.y).toBeCloseTo(
      ((center.clip[1] / center.clip[3] - top[1] / top[3]) / 2) * frame.cssHeight,
      8,
    )
    expect(Math.abs(anchor.heightAxis.y)).toBeGreaterThan(10)
    expect(modelHitDistance(anchor, upperPoint)).toBeDefined()
    expect(
      modelHitDistance(anchor, {
        x: anchor.x + anchor.heightAxis.x * 1.5,
        y: anchor.y + anchor.heightAxis.y * 1.5,
      }),
    ).toBeUndefined()
  })

  it('uses asymmetric mesh bounds to pick the heeled sailing-boat sail', () => {
    const frame = frameFor({ ...TALLINN, zoom: 18, pitchDegrees: 55 })
    const data = instance({
      lengthMeters: 80,
      beamMeters: 7.08,
      heightMeters: 20,
      bounds: {
        minimum: [-4.9, -40, 0],
        maximum: [2.2, 40, 20],
      },
      extentMeters: 80,
      floorPx: 24,
    })
    const anchor = projectModelInstance(frame, data)!
    const screenPoint = (east: number, up: number) => {
      const clip = projectLocalPoint(
        frame,
        data.longitude,
        data.latitude,
        0,
        east,
        0,
        up,
      ).clip
      return {
        x: ((clip[0] / clip[3] + 1) / 2) * frame.cssWidth,
        y: ((1 - clip[1] / clip[3]) / 2) * frame.cssHeight,
      }
    }

    expect(modelHitDistance(anchor, screenPoint(-4.5, 12))).toBeDefined()
    const nominalBounds = projectModelInstance(frame, {
      ...data,
      bounds: {
        minimum: [-data.beamMeters / 2, -data.lengthMeters / 2, 0],
        maximum: [data.beamMeters / 2, data.lengthMeters / 2, data.heightMeters],
      },
    })!
    expect(modelHitDistance(nominalBounds, screenPoint(-4.5, 12))).toBeUndefined()
  })

  it('hits points and boxes against the projected model hull', () => {
    const anchor = {
      x: 100,
      y: 100,
      radiusPx: 10,
      lengthAxis: { x: 10, y: 0 },
      beamAxis: { x: 0, y: 10 },
      heightAxis: { x: 0, y: 0 },
      hull: [
        { x: 90, y: 90 },
        { x: 110, y: 90 },
        { x: 110, y: 110 },
        { x: 90, y: 110 },
      ],
      alpha: 1,
      lifted: true,
    }
    expect(modelHitDistance(anchor, { x: 106, y: 108 })).toBeCloseTo(10, 12)
    expect(modelHitDistance(anchor, [111, 100])).toBeUndefined()
    expect(modelHitDistance(anchor, [[85, 85], [95, 95]])).toBeCloseTo(Math.hypot(10, 10), 12)
    expect(modelHitDistance(anchor, [[111, 111], [125, 125]])).toBeUndefined()
    expect(modelHitDistance(anchor, [{ x: 95, y: 95 }, { x: 105, y: 105 }])).toBe(0)
  })

  it('rejects points beside a long narrow model and intersects touch boxes with its hull', () => {
    const anchor = {
      x: 100,
      y: 100,
      radiusPx: 62,
      lengthAxis: { x: 62, y: 0 },
      beamAxis: { x: 0, y: 10 },
      heightAxis: { x: 0, y: 0 },
      hull: [
        { x: 38, y: 90 },
        { x: 162, y: 90 },
        { x: 162, y: 110 },
        { x: 38, y: 110 },
      ],
      alpha: 1,
      lifted: true,
    }
    expect(modelHitDistance(anchor, { x: 100, y: 45 })).toBeUndefined()
    expect(modelHitDistance(anchor, { x: 100, y: 90 })).toBe(10)
    expect(modelHitDistance(anchor, [[95, 85], [105, 95]])).toBeCloseTo(Math.hypot(0, 10), 12)
    expect(modelHitDistance(anchor, [[95, 75], [105, 85]])).toBeUndefined()
  })
})
