import { describe, expect, it } from 'vitest'
import {
  kilometersPerHourToKnots,
  kilometersToStatuteMiles,
  knotsToKilometersPerHour,
  metersPerSecondToFeetPerMinute,
  metersToFeet,
  statuteMilesToKilometers,
} from './units'

describe('unit conversions', () => {
  it('uses exact aviation and nautical conversion constants', () => {
    expect(metersToFeet(0.3048)).toBeCloseTo(1, 12)
    expect(knotsToKilometersPerHour(1)).toBe(1.852)
    expect(kilometersPerHourToKnots(1.852)).toBeCloseTo(1, 12)
    expect(metersPerSecondToFeetPerMinute(1)).toBeCloseTo(
      196.85039370078738,
      12,
    )
    expect(statuteMilesToKilometers(1)).toBe(1.609344)
    expect(kilometersToStatuteMiles(1.609344)).toBeCloseTo(1, 12)
  })
})
