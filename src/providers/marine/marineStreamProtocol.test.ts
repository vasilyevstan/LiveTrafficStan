import { describe, expect, it } from 'vitest'
import {
  compactMarineBoxes,
  marineBoxArea,
  marineQueryBoxes,
  parseMarineStreamView,
} from './marineStreamProtocol'

const query = {
  center: { latitude: 59.437, longitude: 24.754, label: 'View' },
  radiusKm: 35,
}

describe('marine subscription geometry', () => {
  it('encloses the query circle and rounds boxes outwards', () => {
    const boxes = marineQueryBoxes(query)!
    expect(boxes).toHaveLength(1)
    expect(boxes[0][0]).toBeLessThan(59.123)
    expect(boxes[0][2]).toBeGreaterThan(59.751)
    expect(marineBoxArea(boxes)).toBeGreaterThan(0)
  })

  it('splits antimeridian interests without subscribing to the world', () => {
    const boxes = marineQueryBoxes({
      ...query, center: { ...query.center, longitude: 179.99 },
    })!
    expect(boxes).toHaveLength(2)
    expect(boxes[0][3]).toBe(180)
    expect(boxes[1][1]).toBe(-180)
    expect(marineBoxArea(boxes)).toBeLessThan(2)
  })

  it('rejects invalid or oversized queries instead of clamping them', () => {
    for (const radiusKm of [0, -1, 100.01, Infinity, NaN]) {
      expect(marineQueryBoxes({ ...query, radiusKm })).toBeUndefined()
    }
    expect(marineQueryBoxes({
      ...query, center: { ...query.center, latitude: 90 },
    })).toBeUndefined()
  })

  it('does not forward a Home label or unnecessarily precise coordinates', () => {
    const frame = {
      version: 1, type: 'view', revision: 1, radiusKm: 35,
      center: { latitude: 59.437, longitude: 24.754, label: 'Private label' },
    }
    expect(parseMarineStreamView(frame)?.center).toEqual({
      latitude: 59.437, longitude: 24.754,
    })
    expect(parseMarineStreamView({
      ...frame, center: { latitude: 59.437123, longitude: 24.754 },
    })).toBeUndefined()
  })

  it('removes redundant boxes without losing another viewer coverage', () => {
    const boxes = compactMarineBoxes([
      [59, 24, 60, 25],
      [59.1, 24.1, 59.9, 24.9],
      [54, 12, 55, 14],
      [59, 24, 60, 25],
    ])
    expect(boxes).toEqual([[59, 24, 60, 25], [54, 12, 55, 14]])
  })
})
