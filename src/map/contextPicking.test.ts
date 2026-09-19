import { describe, expect, it, vi } from 'vitest'
import { pickContextFeature } from './contextPicking'

const sources = (
  values: Partial<
    Record<
      | 'exactWeather'
      | 'exactAirport'
      | 'exactPort'
      | 'nearbyWeather'
      | 'nearbyAirport'
      | 'nearbyPort',
      string
    >
  > = {},
) => ({
  exactWeather: vi.fn(() => values.exactWeather),
  exactAirport: vi.fn(() => values.exactAirport),
  exactPort: vi.fn(() => values.exactPort),
  nearbyWeather: vi.fn(() => values.nearbyWeather),
  nearbyAirport: vi.fn(() => values.nearbyAirport),
  nearbyPort: vi.fn(() => values.nearbyPort),
})

describe('context picking', () => {
  it('orders every exact hit before every context near-miss', () => {
    const candidates = sources({
      exactPort: 'port-1',
      nearbyAirport: 'airport-1',
    })

    expect(pickContextFeature(candidates, true)).toEqual({
      kind: 'port',
      id: 'port-1',
    })
    expect(candidates.exactAirport).toHaveBeenCalledTimes(1)
    expect(candidates.exactPort).toHaveBeenCalledTimes(1)
    expect(candidates.nearbyWeather).not.toHaveBeenCalled()
    expect(candidates.nearbyAirport).not.toHaveBeenCalled()
    expect(candidates.nearbyPort).not.toHaveBeenCalled()
  })

  it('gives weather then airports deterministic priority within a hit class', () => {
    expect(
      pickContextFeature(
        sources({
          exactWeather: 'weather-exact',
          exactAirport: 'airport-exact',
        }),
        true,
      ),
    ).toEqual({ kind: 'weather', id: 'weather-exact' })

    expect(
      pickContextFeature(
        sources({
          exactAirport: 'airport-exact',
          exactPort: 'port-exact',
        }),
        true,
      ),
    ).toEqual({ kind: 'airport', id: 'airport-exact' })

    expect(
      pickContextFeature(
        sources({
          nearbyWeather: 'weather-nearby',
          nearbyAirport: 'airport-nearby',
          nearbyPort: 'port-nearby',
        }),
        true,
      ),
    ).toEqual({ kind: 'weather', id: 'weather-nearby' })
  })

  it('never evaluates near-misses without a validated touch tap', () => {
    const candidates = sources({ nearbyAirport: 'airport-nearby' })

    expect(pickContextFeature(candidates, false)).toBeNull()
    expect(candidates.nearbyWeather).not.toHaveBeenCalled()
    expect(candidates.nearbyAirport).not.toHaveBeenCalled()
    expect(candidates.nearbyPort).not.toHaveBeenCalled()
  })
})
