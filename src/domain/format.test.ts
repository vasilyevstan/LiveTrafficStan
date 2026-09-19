import { describe, expect, it } from 'vitest'
import {
  formatAltitude,
  formatSpeed,
  formatVerticalSpeed,
  formatWeatherVisibility,
} from './format'

describe('measurement formatting', () => {
  it('keeps metric values as the default presentation', () => {
    expect(formatAltitude(1_000)).toBe('1,000 m')
    expect(formatSpeed(100)).toBe('100 km/h')
    expect(formatVerticalSpeed(1)).toBe('+1.0 m/s')
  })

  it('converts only presentation into aviation and nautical units', () => {
    expect(formatAltitude(1_000, 'aviation-nautical')).toBe('3,281 ft')
    expect(formatSpeed(100, 'aviation-nautical')).toBe('54 kn')
    expect(formatVerticalSpeed(1, 'aviation-nautical')).toBe(
      '+197 ft/min',
    )
  })

  it('preserves source visibility qualifiers in aviation presentation', () => {
    const visibility = {
      kilometers: 9.656064,
      relation: 'at-least' as const,
      sourceToken: '6+',
    }
    expect(formatWeatherVisibility(visibility, 'metric')).toBe(
      'at least 9.7 km',
    )
    expect(
      formatWeatherVisibility(visibility, 'aviation-nautical'),
    ).toBe('6+ statute mi')
  })
})
