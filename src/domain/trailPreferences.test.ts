import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRAIL_PREFERENCES,
  resolveTrailPreferences,
  trailHistoryConfig,
} from './trailPreferences'

describe('trail preferences', () => {
  it('keeps the released visible 15-minute default', () => {
    expect(resolveTrailPreferences(undefined)).toEqual(
      DEFAULT_TRAIL_PREFERENCES,
    )
    expect(resolveTrailPreferences({})).toEqual(DEFAULT_TRAIL_PREFERENCES)
  })

  it('accepts only supported plain serializable values', () => {
    expect(
      resolveTrailPreferences({
        visible: false,
        durationMinutes: 60,
      }),
    ).toEqual({
      visible: false,
      durationMinutes: 60,
    })
    expect(
      resolveTrailPreferences({
        visible: 'yes',
        durationMinutes: 10,
      }),
    ).toEqual(DEFAULT_TRAIL_PREFERENCES)
  })

  it('derives bounded point caps from the selected duration', () => {
    expect(
      trailHistoryConfig(
        { durationMinutes: 5 },
        { pointsPerMinute: 12, maxTotalPoints: 50_000 },
      ),
    ).toEqual({
      durationMs: 5 * 60_000,
      maxPointsPerEntity: 60,
      maxTotalPoints: 50_000,
    })
    expect(
      trailHistoryConfig(
        { durationMinutes: 60 },
        { pointsPerMinute: 12, maxTotalPoints: 50_000 },
      ).maxPointsPerEntity,
    ).toBe(720)
  })
})
