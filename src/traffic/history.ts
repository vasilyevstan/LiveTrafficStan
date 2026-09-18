import type { TrafficEntity, TrailPoint } from '../domain/traffic'

export interface TrailHistoryConfig {
  durationMs: number
  maxPointsPerEntity: number
}

export type TrailHistory = ReadonlyMap<string, readonly TrailPoint[]>

const sameCoordinate = (first: TrailPoint, second: TrailPoint) =>
  first.latitude === second.latitude && first.longitude === second.longitude

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

  return next
}
