import { describe, expect, it } from 'vitest'
import { ProviderError } from '../providers/errors'
import {
  nextWeatherRequestAt,
  weatherRetryAt,
} from './useWeatherObservations'

describe('weather request gate', () => {
  it('preserves the session start cadence and provider block deadline', () => {
    expect(nextWeatherRequestAt(undefined, 0, 60_000)).toBe(0)
    expect(nextWeatherRequestAt(10_000, 0, 60_000)).toBe(70_000)
    expect(nextWeatherRequestAt(10_000, 90_000, 60_000)).toBe(90_000)
  })

  it('preserves Retry-After beyond the local cooldown', () => {
    expect(
      weatherRetryAt(
        new ProviderError('limited', 429, 120_000),
        10_000,
        70_000,
      ),
    ).toBe(130_000)
    expect(weatherRetryAt(new Error('offline'), 10_000, 70_000)).toBe(
      70_000,
    )
  })
})
