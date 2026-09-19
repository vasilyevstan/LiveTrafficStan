interface PointerSample {
  pointerId: number
  pointerType: string
  clientX: number
  clientY: number
  timeStamp: number
}

interface ClickSample {
  clientX: number
  clientY: number
  timeStamp: number
}

interface TouchGesture {
  pointerIds: Set<number>
  primaryPointerId: number
  startX: number
  startY: number
  moved: boolean
  multiplePointers: boolean
}

interface CompletedTouch {
  clientX: number
  clientY: number
  timeStamp: number
}

interface RenderedFeatureLike {
  properties: Record<string, unknown> | null
}

const MAX_TAP_MOVEMENT_PX = 8
const MAX_CLICK_MATCH_DISTANCE_PX = 4
const MAX_CLICK_DELAY_MS = 1_000

export class TouchInteractionTracker {
  private gesture?: TouchGesture
  private completedTouch?: CompletedTouch

  pointerDown(event: PointerSample) {
    this.completedTouch = undefined
    if (event.pointerType !== 'touch') return

    if (this.gesture) {
      this.gesture.pointerIds.add(event.pointerId)
      this.gesture.multiplePointers = true
      return
    }

    this.gesture = {
      pointerIds: new Set([event.pointerId]),
      primaryPointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      multiplePointers: false,
    }
  }

  pointerMove(event: PointerSample) {
    const gesture = this.gesture
    if (
      event.pointerType !== 'touch' ||
      !gesture ||
      !gesture.pointerIds.has(event.pointerId)
    ) {
      return
    }

    if (
      event.pointerId === gesture.primaryPointerId &&
      Math.hypot(
        event.clientX - gesture.startX,
        event.clientY - gesture.startY,
      ) > MAX_TAP_MOVEMENT_PX
    ) {
      gesture.moved = true
    }
  }

  pointerUp(event: PointerSample) {
    const gesture = this.gesture
    if (
      event.pointerType !== 'touch' ||
      !gesture ||
      !gesture.pointerIds.has(event.pointerId)
    ) {
      this.completedTouch = undefined
      return
    }

    gesture.pointerIds.delete(event.pointerId)
    if (gesture.pointerIds.size > 0) return

    const movedAtPointerUp =
      event.pointerId === gesture.primaryPointerId &&
      Math.hypot(
        event.clientX - gesture.startX,
        event.clientY - gesture.startY,
      ) > MAX_TAP_MOVEMENT_PX
    if (
      event.pointerId === gesture.primaryPointerId &&
      !gesture.moved &&
      !movedAtPointerUp &&
      !gesture.multiplePointers
    ) {
      this.completedTouch = {
        clientX: event.clientX,
        clientY: event.clientY,
        timeStamp: event.timeStamp,
      }
    }
    this.gesture = undefined
  }

  pointerCancel(event: PointerSample) {
    if (
      event.pointerType === 'touch' &&
      this.gesture?.pointerIds.has(event.pointerId)
    ) {
      this.gesture = undefined
    }
    this.completedTouch = undefined
  }

  consumeClick(event: ClickSample) {
    const completedTouch = this.completedTouch
    this.completedTouch = undefined
    if (!completedTouch) return false

    const delayMs = event.timeStamp - completedTouch.timeStamp
    return (
      delayMs >= 0 &&
      delayMs <= MAX_CLICK_DELAY_MS &&
      Math.hypot(
        event.clientX - completedTouch.clientX,
        event.clientY - completedTouch.clientY,
      ) <= MAX_CLICK_MATCH_DISTANCE_PX
    )
  }
}

export const expandedHitBox = (
  point: { x: number; y: number },
  tolerancePx: number,
): [[number, number], [number, number]] => [
  [point.x - tolerancePx, point.y - tolerancePx],
  [point.x + tolerancePx, point.y + tolerancePx],
]

const featureId = (
  feature: RenderedFeatureLike,
  eligibleIds: ReadonlySet<string>,
) => {
  const id = feature.properties?.id
  return typeof id === 'string' && eligibleIds.has(id) ? id : null
}

export const exactEligibleFeatureId = (
  features: readonly RenderedFeatureLike[],
  eligibleIds: ReadonlySet<string>,
) => {
  for (const feature of features) {
    const id = featureId(feature, eligibleIds)
    if (id) return id
  }
  return null
}

export const uniqueEligibleFeatureId = (
  features: readonly RenderedFeatureLike[],
  eligibleIds: ReadonlySet<string>,
) => {
  const ids = new Set<string>()
  for (const feature of features) {
    const id = featureId(feature, eligibleIds)
    if (id) ids.add(id)
    if (ids.size > 1) return null
  }
  return ids.size === 1 ? [...ids][0] : null
}
