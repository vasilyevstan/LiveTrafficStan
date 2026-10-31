const millisecondsPerDay = 24 * 60 * 60 * 1_000

export const assessAircraftMetadataAge = ({
  publishedAt,
  staleAfterDays,
  futureToleranceHours,
  now,
}) => {
  const publishedAtMs = Date.parse(publishedAt)
  if (!Number.isFinite(publishedAtMs)) {
    throw new Error('Aircraft metadata publication date is invalid')
  }
  if (!Number.isFinite(now)) {
    throw new Error('Aircraft metadata assessment time is invalid')
  }
  if (!Number.isFinite(staleAfterDays) || staleAfterDays <= 0) {
    throw new Error('Aircraft metadata stale interval is invalid')
  }
  if (!Number.isFinite(futureToleranceHours) || futureToleranceHours < 0) {
    throw new Error('Aircraft metadata future-date tolerance is invalid')
  }

  const expiresAt = publishedAtMs + staleAfterDays * millisecondsPerDay
  const isFutureDated =
    publishedAtMs > now + futureToleranceHours * 60 * 60 * 1_000
  const isExpired = now > expiresAt
  const remainingMs = expiresAt - now
  const warningStage = isExpired
    ? 'expired'
    : remainingMs <= 7 * millisecondsPerDay
      ? '7-day'
      : remainingMs <= 14 * millisecondsPerDay
        ? '14-day'
        : remainingMs <= 21 * millisecondsPerDay
          ? '21-day'
          : 'fresh'

  return {
    publishedAtMs,
    expiresAt,
    isFutureDated,
    isExpired,
    warningStage,
  }
}
