import { describe, expect, it } from 'vitest'
import { assessAircraftMetadataAge } from './aircraft-metadata-age.mjs'

const publishedAt = '2026-10-25T09:05:04Z'
const publicationTime = Date.parse(publishedAt)
const day = 24 * 60 * 60 * 1_000
const expiresAt = publicationTime + 45 * day

const assessAt = (now) =>
  assessAircraftMetadataAge({
    publishedAt,
    staleAfterDays: 45,
    futureToleranceHours: 24,
    now,
  })

describe('assessAircraftMetadataAge', () => {
  it.each([
    [21, '21-day'],
    [14, '14-day'],
    [7, '7-day'],
  ])('moves into the %s-day warning at its exact threshold', (days, stage) => {
    const threshold = expiresAt - days * day

    expect(assessAt(threshold - 1).warningStage).not.toBe(stage)
    expect(assessAt(threshold).warningStage).toBe(stage)
    expect(assessAt(threshold + 1).warningStage).toBe(stage)
  })

  it('is valid at the exact age boundary and expires one millisecond later', () => {
    expect(assessAt(expiresAt)).toMatchObject({
      expiresAt,
      isExpired: false,
      warningStage: '7-day',
    })
    expect(assessAt(expiresAt + 1)).toMatchObject({
      isExpired: true,
      warningStage: 'expired',
    })
  })

  it('derives a new boundary and stage from a refreshed publication date', () => {
    const refreshedAt = '2026-11-25T09:05:04Z'
    const refreshedBoundary = Date.parse(refreshedAt) + 45 * day

    expect(
      assessAircraftMetadataAge({
        publishedAt: refreshedAt,
        staleAfterDays: 45,
        futureToleranceHours: 24,
        now: refreshedBoundary - 22 * day,
      }).warningStage,
    ).toBe('fresh')
  })

  it('rejects invalid publication dates and reports materially future dates', () => {
    expect(() =>
      assessAircraftMetadataAge({
        publishedAt: 'not-a-date',
        staleAfterDays: 45,
        futureToleranceHours: 24,
        now: publicationTime,
      }),
    ).toThrow('publication date is invalid')

    expect(
      assessAircraftMetadataAge({
        publishedAt: '2026-10-27T09:05:05Z',
        staleAfterDays: 45,
        futureToleranceHours: 24,
        now: publicationTime,
      }).isFutureDated,
    ).toBe(true)
  })
})
