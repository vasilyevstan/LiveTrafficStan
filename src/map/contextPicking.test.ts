import { describe, expect, it, vi } from 'vitest'
import { pickContextFeature } from './contextPicking'

const sources = (
  values: Partial<
    Record<
      'exactAirport' | 'exactPort' | 'nearbyAirport' | 'nearbyPort',
      string
    >
  > = {},
) => ({
  exactAirport: vi.fn(() => values.exactAirport),
  exactPort: vi.fn(() => values.exactPort),
  nearbyAirport: vi.fn(() => values.nearbyAirport),
  nearbyPort: vi.fn(() => values.nearbyPort),
})

describe('context picking', () => {
  it('orders exact airport and port hits before every context near-miss', () => {
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
    expect(candidates.nearbyAirport).not.toHaveBeenCalled()
    expect(candidates.nearbyPort).not.toHaveBeenCalled()
  })

  it('gives airports deterministic priority within the same hit class', () => {
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
          nearbyAirport: 'airport-nearby',
          nearbyPort: 'port-nearby',
        }),
        true,
      ),
    ).toEqual({ kind: 'airport', id: 'airport-nearby' })
  })

  it('never evaluates near-misses without a validated touch tap', () => {
    const candidates = sources({ nearbyAirport: 'airport-nearby' })

    expect(pickContextFeature(candidates, false)).toBeNull()
    expect(candidates.nearbyAirport).not.toHaveBeenCalled()
    expect(candidates.nearbyPort).not.toHaveBeenCalled()
  })
})
