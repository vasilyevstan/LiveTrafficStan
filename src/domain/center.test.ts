import { describe, expect, it } from 'vitest'
import {
  centerFromCoordinates,
  roundCoordinate,
  sameCenterCoordinates,
} from './center'

describe('center helpers', () => {
  it('rounds provider coordinates without retaining negative zero', () => {
    expect(roundCoordinate(59.43749, 3)).toBe(59.437)
    expect(roundCoordinate(24.7536, 3)).toBe(24.754)
    expect(roundCoordinate(-0.0001, 3)).toBe(0)
  })

  it('creates a labeled rounded center', () => {
    expect(
      centerFromCoordinates(
        { latitude: 60.12349, longitude: 25.98751 },
        3,
        'Near you',
      ),
    ).toEqual({
      latitude: 60.123,
      longitude: 25.988,
      label: 'Near you',
    })
  })

  it('compares coordinates without treating labels as provider state', () => {
    expect(
      sameCenterCoordinates(
        { latitude: 59.437, longitude: 24.754 },
        { latitude: 59.437, longitude: 24.754 },
      ),
    ).toBe(true)
    expect(
      sameCenterCoordinates(
        { latitude: 59.437, longitude: 24.754 },
        { latitude: 59.438, longitude: 24.754 },
      ),
    ).toBe(false)
  })
})
