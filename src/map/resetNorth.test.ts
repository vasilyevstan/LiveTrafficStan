import { describe, expect, it, vi } from 'vitest'
import { consumeNorthReset } from './resetNorth'

const animation = { durationMs: 250, reducedMotion: false }
const request = { revision: 1, viewRequestId: 7 }

describe('reset north command', () => {
  it('fences prior work and uses the bearing-only native API exactly once', () => {
    const order: string[] = []
    const map = {
      stop: vi.fn(() => order.push('stop')),
      resetNorth: vi.fn(() => order.push('reset')),
    }
    const fence = vi.fn(() => order.push('fence'))
    const revision = { current: 0 }

    expect(consumeNorthReset(request, revision, 7, map, animation, fence)).toBe(250)
    expect(order).toEqual(['fence', 'stop', 'reset'])
    expect(map.resetNorth).toHaveBeenCalledExactlyOnceWith({ duration: 250 })
    expect(consumeNorthReset(request, revision, 7, map, animation, fence)).toBeUndefined()
    expect(fence).toHaveBeenCalledTimes(1)
    expect(map.stop).toHaveBeenCalledTimes(1)
    expect(map.resetNorth).toHaveBeenCalledTimes(1)
  })

  it('uses immediate native rotation for reduced motion', () => {
    const map = { stop: vi.fn(), resetNorth: vi.fn() }
    expect(consumeNorthReset(request, { current: 0 }, 7, map, {
      ...animation, reducedMotion: true,
    }, vi.fn())).toBe(0)
    expect(map.resetNorth).toHaveBeenCalledExactlyOnceWith({ duration: 0 })
  })

  it('consumes stale navigation without fencing or replaying it later', () => {
    const map = { stop: vi.fn(), resetNorth: vi.fn() }
    const fence = vi.fn()
    const revision = { current: 0 }
    expect(consumeNorthReset(request, revision, 8, map, animation, fence)).toBeUndefined()
    expect(revision.current).toBe(1)
    expect(consumeNorthReset(request, revision, 7, map, animation, fence)).toBeUndefined()
    expect(fence).not.toHaveBeenCalled()
    expect(map.resetNorth).not.toHaveBeenCalled()
    expect(consumeNorthReset({ revision: 2, viewRequestId: 8 }, revision, 8, map, animation, fence)).toBe(250)
    expect(map.resetNorth).toHaveBeenCalledTimes(1)
  })

  it('does not queue an unavailable map command for a later mount or style', () => {
    const revision = { current: 0 }
    const map = { stop: vi.fn(), resetNorth: vi.fn() }
    const fence = vi.fn()
    expect(consumeNorthReset(undefined, revision, 7, null, animation, fence)).toBeUndefined()
    expect(revision.current).toBe(0)
    expect(consumeNorthReset(request, revision, 7, null, animation, fence)).toBeUndefined()
    expect(revision.current).toBe(1)
    expect(consumeNorthReset(request, revision, 7, map, animation, fence)).toBeUndefined()
    expect(fence).not.toHaveBeenCalled()
    expect(map.resetNorth).not.toHaveBeenCalled()
  })

  it('surfaces native failure and never silently retries a consumed command', () => {
    const failure = new Error('native rotation failed')
    const map = { stop: vi.fn(), resetNorth: vi.fn(() => { throw failure }) }
    const revision = { current: 0 }
    expect(() => consumeNorthReset(request, revision, 7, map, animation, vi.fn())).toThrow(failure)
    expect(consumeNorthReset(request, revision, 7, map, animation, vi.fn())).toBeUndefined()
    expect(map.resetNorth).toHaveBeenCalledTimes(1)
  })
})
