import { describe, expect, it } from 'vitest'
import { filterMarineNetworkLand, makeLandCrossingPredicate } from './marine-route-land-filter.mjs'

const rectangle = (west, south, east, north) => [
  [west, south], [east, south], [east, north], [west, north], [west, south],
]
const collection = coordinates => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates } }],
})

describe('pinned shoreline exclusion for illustrative ship routes', () => {
  it('rejects crossings, inland edges and shoreline contact, but respects holes', () => {
    const crosses = makeLandCrossingPredicate(collection([rectangle(-1, -1, 1, 1), rectangle(-0.5, -0.5, 0.5, 0.5)]))
    expect(crosses([-2, 0], [2, 0])).toBe(true)
    expect(crosses([0.7, 0.7], [0.8, 0.8])).toBe(true)
    expect(crosses([-2, -1], [2, -1])).toBe(true)
    expect(crosses([-0.1, 0], [0.1, 0])).toBe(false)
    expect(crosses([-2, -2], [2, -2])).toBe(false)
  })

  it('checks the short antimeridian path, not a line through Greenwich', () => {
    const crosses = makeLandCrossingPredicate(collection([rectangle(-1, -1, 1, 1)]))
    expect(crosses([179, 0], [-179, 0])).toBe(false)
    const atSeam = makeLandCrossingPredicate(collection([rectangle(179.4, -1, 180, 1)]))
    expect(atSeam([179, 0], [-179, 0])).toBe(true)
  })

  it('splits output at excluded edges without bridging or shifting coordinates', () => {
    const input = {
      type: 'FeatureCollection',
      features: [{ geometry: { type: 'LineString', coordinates: [[-3, 0], [-2, 0], [2, 0], [3, 0]] } }],
    }
    const result = filterMarineNetworkLand(input, makeLandCrossingPredicate(collection([rectangle(-1, -1, 1, 1)])))
    expect(result.excludedEdges).toBe(1)
    expect(result.retainedEdges).toBe(2)
    expect(result.network.features.map(feature => feature.geometry.coordinates))
      .toEqual([[[-3, 0], [-2, 0]], [[2, 0], [3, 0]]])
  })
})
