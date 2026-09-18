import { describe, expect, it, vi } from 'vitest'
import {
  createMapSafely,
  MAP_INITIALIZATION_ERROR,
  mapErrorPresentation,
  type TrafficMapError,
} from './mapInitialization'

describe('createMapSafely', () => {
  it('returns a successfully created map without reporting an error', () => {
    const map = { remove: vi.fn() }
    const onError = vi.fn()

    expect(createMapSafely(() => map, onError)).toBe(map)
    expect(onError).not.toHaveBeenCalled()
  })

  it.each([new Error('private constructor details'), 'unexpected value'])(
    'reports a sanitized initialization error for %s',
    (thrownValue) => {
      const onError = vi.fn()

      const map = createMapSafely(() => {
        throw thrownValue
      }, onError)

      expect(map).toBeNull()
      expect(onError).toHaveBeenCalledOnce()
      expect(onError).toHaveBeenCalledWith(MAP_INITIALIZATION_ERROR)
    },
  )
})

describe('mapErrorPresentation', () => {
  it('distinguishes initialization failure from a runtime map issue', () => {
    expect(mapErrorPresentation(MAP_INITIALIZATION_ERROR)).toEqual({
      title: 'Map unavailable',
      message:
        'The map could not start. Check browser graphics support or reload.',
    })

    const runtimeError: TrafficMapError = {
      kind: 'runtime',
      message: 'Style request failed',
    }
    expect(mapErrorPresentation(runtimeError)).toEqual({
      title: 'Map data issue',
      message: 'Style request failed',
    })
  })
})
