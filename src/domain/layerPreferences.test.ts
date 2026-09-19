import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LAYER_PREFERENCES,
  updateLayerPreference,
} from './layerPreferences'

describe('layer preferences', () => {
  it('is a provider-neutral JSON-serializable boolean shape', () => {
    const enabled = updateLayerPreference(
      updateLayerPreference(
        DEFAULT_LAYER_PREFERENCES,
        'clusteringEnabled',
        true,
      ),
      'weatherVisible',
      true,
    )
    const roundTrip = JSON.parse(JSON.stringify(enabled))

    expect(roundTrip).toEqual(enabled)
    expect(Object.values(roundTrip).every((value) => typeof value === 'boolean'))
      .toBe(true)
    expect(roundTrip).not.toHaveProperty('provider')
    expect(roundTrip).not.toHaveProperty('observations')
    expect(roundTrip).not.toHaveProperty('clusterId')
    expect(roundTrip).not.toHaveProperty('phase')
  })
})
