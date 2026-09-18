import type { FreshnessThresholds } from '../config/appConfig'
import type {
  DisplayTrafficEntity,
  TrafficEntity,
} from '../domain/traffic'

export const trafficFreshness = (
  observedAt: number,
  now: number,
  thresholds: FreshnessThresholds,
) => {
  const age = Math.max(0, now - observedAt)
  if (age > thresholds.expireAfterMs) return 'expired' as const
  if (age > thresholds.staleAfterMs) return 'stale' as const
  return 'live' as const
}

export const displayTraffic = <T extends TrafficEntity>(
  entities: readonly T[],
  now: number,
  thresholds: FreshnessThresholds,
): DisplayTrafficEntity<T>[] =>
  entities.flatMap((entity) => {
    const freshness = trafficFreshness(
      entity.position.observedAt,
      now,
      thresholds,
    )
    return freshness === 'expired' ? [] : [{ ...entity, freshness }]
  })
