import { describe, expect, it } from 'vitest'
import {
  exactEligibleFeatureId,
  expandedHitBox,
  TouchInteractionTracker,
  uniqueEligibleFeatureId,
} from './touchPicking'

const pointer = (
  overrides: Partial<{
    pointerId: number
    pointerType: string
    clientX: number
    clientY: number
    timeStamp: number
  }> = {},
) => ({
  pointerId: 1,
  pointerType: 'touch',
  clientX: 100,
  clientY: 200,
  timeStamp: 1_000,
  ...overrides,
})

const feature = (id: unknown) => ({
  properties: { id },
})

describe('TouchInteractionTracker', () => {
  it('allows one matching click after a settled touch tap', () => {
    const tracker = new TouchInteractionTracker()
    tracker.pointerDown(pointer())
    tracker.pointerUp(pointer({ timeStamp: 1_050 }))

    expect(
      tracker.consumeClick({
        clientX: 102,
        clientY: 201,
        timeStamp: 1_100,
      }),
    ).toBe(true)
    expect(
      tracker.consumeClick({
        clientX: 102,
        clientY: 201,
        timeStamp: 1_101,
      }),
    ).toBe(false)
  })

  it('keeps movement and generated-click matching inclusive at the boundary', () => {
    const tracker = new TouchInteractionTracker()
    tracker.pointerDown(pointer())
    tracker.pointerUp(pointer({ clientX: 108, timeStamp: 1_050 }))

    expect(
      tracker.consumeClick({
        clientX: 104,
        clientY: 200,
        timeStamp: 2_050,
      }),
    ).toBe(true)
  })

  it('rejects drag, pinch, cancellation, stale, and mismatched clicks', () => {
    const dragged = new TouchInteractionTracker()
    dragged.pointerDown(pointer())
    dragged.pointerMove(pointer({ clientX: 109 }))
    dragged.pointerUp(pointer({ clientX: 109 }))
    expect(
      dragged.consumeClick({ clientX: 109, clientY: 200, timeStamp: 1_100 }),
    ).toBe(false)

    const movedOnlyAtPointerUp = new TouchInteractionTracker()
    movedOnlyAtPointerUp.pointerDown(pointer())
    movedOnlyAtPointerUp.pointerUp(pointer({ clientX: 109 }))
    expect(
      movedOnlyAtPointerUp.consumeClick({
        clientX: 109,
        clientY: 200,
        timeStamp: 1_100,
      }),
    ).toBe(false)

    const pinched = new TouchInteractionTracker()
    pinched.pointerDown(pointer())
    pinched.pointerDown(pointer({ pointerId: 2, clientX: 120 }))
    pinched.pointerUp(pointer({ pointerId: 2, clientX: 120 }))
    pinched.pointerUp(pointer())
    expect(
      pinched.consumeClick({ clientX: 100, clientY: 200, timeStamp: 1_100 }),
    ).toBe(false)

    const canceled = new TouchInteractionTracker()
    canceled.pointerDown(pointer())
    canceled.pointerCancel(pointer())
    expect(
      canceled.consumeClick({ clientX: 100, clientY: 200, timeStamp: 1_100 }),
    ).toBe(false)

    const stale = new TouchInteractionTracker()
    stale.pointerDown(pointer())
    stale.pointerUp(pointer())
    expect(
      stale.consumeClick({ clientX: 100, clientY: 200, timeStamp: 2_001 }),
    ).toBe(false)

    const mismatched = new TouchInteractionTracker()
    mismatched.pointerDown(pointer())
    mismatched.pointerUp(pointer())
    expect(
      mismatched.consumeClick({ clientX: 105, clientY: 200, timeStamp: 1_100 }),
    ).toBe(false)
  })

  it('does not leak touch modality into a following mouse interaction', () => {
    const tracker = new TouchInteractionTracker()
    tracker.pointerDown(pointer())
    tracker.pointerUp(pointer())
    tracker.pointerDown(pointer({
      pointerId: 2,
      pointerType: 'mouse',
      timeStamp: 1_100,
    }))

    expect(
      tracker.consumeClick({ clientX: 100, clientY: 200, timeStamp: 1_150 }),
    ).toBe(false)
  })
})

describe('traffic feature picking', () => {
  const eligibleIds = new Set(['aircraft:one', 'vessel:two'])

  it('keeps the first eligible exact rendered result', () => {
    expect(
      exactEligibleFeatureId(
        [feature('aircraft:one'), feature('vessel:two')],
        eligibleIds,
      ),
    ).toBe('aircraft:one')
    expect(
      exactEligibleFeatureId(
        [feature('aircraft:expired'), feature('vessel:two')],
        eligibleIds,
      ),
    ).toBe('vessel:two')
  })

  it('deduplicates world copies and rejects ambiguous fallback results', () => {
    expect(
      uniqueEligibleFeatureId(
        [feature('aircraft:one'), feature('aircraft:one')],
        eligibleIds,
      ),
    ).toBe('aircraft:one')
    expect(
      uniqueEligibleFeatureId(
        [feature('aircraft:expired'), feature('vessel:two')],
        eligibleIds,
      ),
    ).toBe('vessel:two')
    expect(
      uniqueEligibleFeatureId(
        [feature('aircraft:one'), feature('vessel:two')],
        eligibleIds,
      ),
    ).toBeNull()
  })

  it('ignores hidden, expired, malformed, and cluster-like feature IDs', () => {
    expect(
      uniqueEligibleFeatureId(
        [
          feature('aircraft:expired'),
          feature(12),
          { properties: { cluster: true, cluster_id: 4 } },
        ],
        eligibleIds,
      ),
    ).toBeNull()
  })

  it('builds an 8 CSS-pixel extension without device-pixel scaling', () => {
    expect(expandedHitBox({ x: 100, y: 200 }, 8)).toEqual([
      [92, 192],
      [108, 208],
    ])
  })
})
