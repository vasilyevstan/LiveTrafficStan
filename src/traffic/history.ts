import type { TrafficEntity, TrailPoint } from '../domain/traffic'

export interface TrailHistoryConfig {
  durationMs: number
  maxPointsPerEntity: number
  maxTotalPoints: number
}

export type TrailHistory = ReadonlyMap<string, readonly TrailPoint[]>
export type TrailObservationHighWater = Map<string, number>

const sameCoordinate = (first: TrailPoint, second: TrailPoint) =>
  first.latitude === second.latitude && first.longitude === second.longitude

const enforceTotalPointCap = (
  history: Map<string, TrailPoint[]>,
  maxTotalPoints: number,
) => {
  const totalPoints = [...history.values()].reduce(
    (total, points) => total + points.length,
    0,
  )
  const overflow = totalPoints - maxTotalPoints
  if (overflow <= 0) return history

  const ordered = [...history].flatMap(([entityId, points]) =>
    points.map((point, index) => ({
      entityId,
      index,
      observedAt: point.observedAt,
    })),
  )
  ordered.sort(
    (first, second) =>
      first.observedAt - second.observedAt ||
      first.entityId.localeCompare(second.entityId) ||
      first.index - second.index,
  )

  const removals = new Map<string, number>()
  for (const point of ordered.slice(0, overflow)) {
    removals.set(point.entityId, (removals.get(point.entityId) ?? 0) + 1)
  }

  for (const [entityId, count] of removals) {
    const retained = history.get(entityId)?.slice(count) ?? []
    if (retained.length === 0) {
      history.delete(entityId)
    } else {
      history.set(entityId, retained)
    }
  }

  return history
}

export const takeNewTrailObservations = (
  entities: readonly TrafficEntity[],
  highWater: TrailObservationHighWater,
  maxTrackedEntities: number,
) => {
  const unseen: TrafficEntity[] = []

  for (const entity of entities) {
    const observedAt = entity.position.observedAt
    const previousObservedAt = highWater.get(entity.id)
    if (
      previousObservedAt !== undefined &&
      observedAt <= previousObservedAt
    ) {
      continue
    }

    highWater.delete(entity.id)
    highWater.set(entity.id, observedAt)
    unseen.push(entity)
  }

  while (highWater.size > maxTrackedEntities) {
    const oldestEntityId = highWater.keys().next().value
    if (oldestEntityId === undefined) break
    highWater.delete(oldestEntityId)
  }

  return unseen
}

export const updateTrailHistory = (
  previous: TrailHistory,
  entities: readonly TrafficEntity[],
  now: number,
  config: TrailHistoryConfig,
) => {
  const cutoff = now - config.durationMs
  const next = new Map<string, TrailPoint[]>()

  for (const [id, points] of previous) {
    const retained = points.filter((point) => point.observedAt >= cutoff)
    if (retained.length > 0) next.set(id, retained.slice(-config.maxPointsPerEntity))
  }

  for (const entity of entities) {
    const point = entity.position
    if (point.observedAt < cutoff) continue

    const points = next.get(entity.id) ?? []
    const last = points.at(-1)
    if (
      last &&
      (point.observedAt <= last.observedAt || sameCoordinate(last, point))
    ) {
      continue
    }

    next.set(
      entity.id,
      [...points, { ...point }].slice(-config.maxPointsPerEntity),
    )
  }

  return enforceTotalPointCap(next, config.maxTotalPoints)
}

export const updateTrailHistoryAfterNavigation = (
  previous: TrailHistory,
  entities: readonly TrafficEntity[],
  now: number,
  config: TrailHistoryConfig,
  reset: boolean,
) =>
  updateTrailHistory(
    reset ? new Map() : previous,
    entities,
    now,
    config,
  )
