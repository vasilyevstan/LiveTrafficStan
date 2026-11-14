import { describe, expect, it } from 'vitest'
import { assessTrafficViewport, type TrafficViewport } from '../domain/viewport'
import { activeTrainSources } from './useTrains'

const viewportAround = (longitude: number, latitude: number): TrafficViewport => {
  const half = 0.2
  const assessment = assessTrafficViewport({
    center: { latitude, longitude },
    perimeter: [
      { latitude: latitude + half, longitude: longitude - half },
      { latitude: latitude + half, longitude: longitude + half },
      { latitude: latitude - half, longitude: longitude + half },
      { latitude: latitude - half, longitude: longitude - half },
    ],
    pitchDegrees: 0,
  }, { coordinatePrecision: 3, maximumRadiusKm: 100 })
  if (!assessment.viewport) throw new Error('fixture viewport is invalid')
  return assessment.viewport
}

const sourcesAt = (longitude: number, latitude: number) =>
  [...activeTrainSources(viewportAround(longitude, latitude))]

describe('active train sources', () => {
  it.each([
    ['Helsinki', 24.94, 60.17, ['fintraffic']],
    ['Kolari', 23.8, 67.35, ['fintraffic']],
    ['Oslo', 10.75, 59.91, ['entur']],
    ['Bergen', 5.33, 60.39, ['entur']],
    ['Bodø', 14.4, 67.28, ['entur']],
    ['Narvik', 17.43, 68.44, ['entur']],
    ['Boston', -71.06, 42.35, ['mbta']],
    ['Jamaica', -73.81, 40.7, ['lirr']],
  ])('polls only the source covering %s', (_name, longitude, latitude, expected) => {
    expect(sourcesAt(longitude, latitude)).toEqual(expected)
  })

  it.each([
    ['Tallinn', 24.75, 59.44],
    ['Stockholm', 18.07, 59.33],
    ['Luleå', 22.15, 65.58],
    ['Copenhagen', 12.57, 55.68],
    ['Tromsø', 18.96, 69.65],
  ])('polls no train source over %s', (_name, longitude, latitude) => {
    expect(sourcesAt(longitude, latitude)).toEqual([])
  })

  it('polls nothing without a viewport', () => {
    expect(activeTrainSources(null).size).toBe(0)
  })
})
