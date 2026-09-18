import type { GeoPosition, TrafficEntity } from '../domain/traffic'

export interface MotionState {
  from: GeoPosition
  to: GeoPosition
  startedAt: number
  durationMs: number
}

export type MotionStates = ReadonlyMap<string, MotionState>

const samePosition = (first: GeoPosition, second: GeoPosition) =>
  first.latitude === second.latitude && first.longitude === second.longitude

export const sampleMotion = (
  state: MotionState,
  now: number,
): GeoPosition => {
  if (state.durationMs <= 0) return state.to

  const progress = Math.min(
    1,
    Math.max(0, (now - state.startedAt) / state.durationMs),
  )
  return {
    latitude:
      state.from.latitude +
      (state.to.latitude - state.from.latitude) * progress,
    longitude:
      state.from.longitude +
      (state.to.longitude - state.from.longitude) * progress,
    observedAt: state.to.observedAt,
  }
}

export const reconcileMotionStates = (
  previous: MotionStates,
  entities: readonly TrafficEntity[],
  now: number,
  durationMs: number,
) => {
  const next = new Map<string, MotionState>()

  for (const entity of entities) {
    const current = previous.get(entity.id)
    if (current && samePosition(current.to, entity.position)) {
      next.set(entity.id, current)
      continue
    }

    const from = current ? sampleMotion(current, now) : entity.position
    next.set(entity.id, {
      from,
      to: entity.position,
      startedAt: now,
      durationMs: samePosition(from, entity.position) ? 0 : durationMs,
    })
  }

  return next
}

export const hasActiveMotion = (states: MotionStates, now: number) => {
  for (const state of states.values()) {
    if (state.durationMs > 0 && now < state.startedAt + state.durationMs) {
      return true
    }
  }
  return false
}
