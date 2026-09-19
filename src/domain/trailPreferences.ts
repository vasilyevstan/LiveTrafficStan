export const TRAIL_DURATION_OPTIONS_MINUTES = [5, 15, 30, 60] as const

export type TrailDurationMinutes =
  (typeof TRAIL_DURATION_OPTIONS_MINUTES)[number]

export interface TrailPreferences {
  visible: boolean
  durationMinutes: TrailDurationMinutes
}

export interface TrailHistoryLimits {
  pointsPerMinute: number
  maxTotalPoints: number
}

export const DEFAULT_TRAIL_PREFERENCES: TrailPreferences = {
  visible: true,
  durationMinutes: 15,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const isTrailDurationMinutes = (
  value: unknown,
): value is TrailDurationMinutes =>
  TRAIL_DURATION_OPTIONS_MINUTES.includes(value as TrailDurationMinutes)

export const resolveTrailPreferences = (
  value: unknown,
): TrailPreferences => {
  if (!isRecord(value)) return DEFAULT_TRAIL_PREFERENCES

  return {
    visible:
      typeof value.visible === 'boolean'
        ? value.visible
        : DEFAULT_TRAIL_PREFERENCES.visible,
    durationMinutes: isTrailDurationMinutes(value.durationMinutes)
      ? value.durationMinutes
      : DEFAULT_TRAIL_PREFERENCES.durationMinutes,
  }
}

export const trailHistoryConfig = (
  preferences: Pick<TrailPreferences, 'durationMinutes'>,
  limits: TrailHistoryLimits,
) => ({
  durationMs: preferences.durationMinutes * 60_000,
  maxPointsPerEntity:
    preferences.durationMinutes * limits.pointsPerMinute,
  maxTotalPoints: limits.maxTotalPoints,
})
