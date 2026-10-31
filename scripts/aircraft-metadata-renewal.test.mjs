import { describe, expect, it } from 'vitest'
import { assessAircraftMetadataAge } from './aircraft-metadata-age.mjs'
import {
  buildAircraftMetadataRenewalBody,
  planAircraftMetadataRenewalIssue,
} from './aircraft-metadata-renewal.mjs'

const publishedAt = '2026-10-25T09:05:04Z'
const publicationTime = Date.parse(publishedAt)
const expiresAt = publicationTime + 45 * 24 * 60 * 60 * 1_000
const ageAt = (now) =>
  assessAircraftMetadataAge({
    publishedAt,
    staleAfterDays: 45,
    futureToleranceHours: 24,
    now,
  })
const planAt = (now, issue) =>
  planAircraftMetadataRenewalIssue({
    assessment: ageAt(now),
    issue,
    outputVersion: '2026-10-25-v1',
    publishedAt,
    assignee: 'vasilyevstan',
  })

describe('planAircraftMetadataRenewalIssue', () => {
  it('creates one durable issue at the first warning stage', () => {
    expect(planAt(expiresAt - 21 * 24 * 60 * 60 * 1_000)).toMatchObject({
      action: 'create',
      body: /aircraft-metadata-renewal-stage:21-day/,
    })
  })

  it('updates only when the reminder stage changes', () => {
    const body = buildAircraftMetadataRenewalBody({
      outputVersion: '2026-10-25-v1',
      publishedAt,
      expiresAt,
      warningStage: '21-day',
    })
    const existing = {
      state: 'open',
      body,
      assignees: [{ login: 'vasilyevstan' }],
    }

    expect(
      planAt(expiresAt - 20 * 24 * 60 * 60 * 1_000, existing).action,
    ).toBe('none')
    expect(
      planAt(expiresAt - 14 * 24 * 60 * 60 * 1_000, existing),
    ).toMatchObject({
      action: 'update',
      body: /aircraft-metadata-renewal-stage:14-day/,
    })
  })

  it('reopens a closed issue while renewal is still due', () => {
    expect(
      planAt(expiresAt - 7 * 24 * 60 * 60 * 1_000, {
        state: 'closed',
        body: '',
      }),
    ).toMatchObject({
      action: 'reopen',
      body: /aircraft-metadata-renewal-stage:7-day/,
    })
  })

  it('closes the open issue after a fresh snapshot removes the warning', () => {
    const newPublishedAt = '2026-11-25T09:05:04Z'
    const newExpiresAt = Date.parse(newPublishedAt) + 45 * 24 * 60 * 60 * 1_000
    const assessment = assessAircraftMetadataAge({
      publishedAt: newPublishedAt,
      staleAfterDays: 45,
      futureToleranceHours: 24,
      now: newExpiresAt - 22 * 24 * 60 * 60 * 1_000,
    })

    expect(
      planAircraftMetadataRenewalIssue({
        assessment,
        issue: {
          state: 'open',
          body: 'old warning',
          assignees: [{ login: 'vasilyevstan' }],
        },
        outputVersion: '2026-11-25-v1',
        publishedAt: newPublishedAt,
        assignee: 'vasilyevstan',
      }),
    ).toMatchObject({
      action: 'close',
      body: /renewal reminder resolved/i,
    })
  })

  it('restores the named owner without rewriting an unchanged reminder', () => {
    const body = buildAircraftMetadataRenewalBody({
      outputVersion: '2026-10-25-v1',
      publishedAt,
      expiresAt,
      warningStage: '21-day',
    })

    expect(
      planAt(expiresAt - 20 * 24 * 60 * 60 * 1_000, {
        state: 'open',
        body,
        assignees: [],
      }),
    ).toEqual({ action: 'assign' })
  })
})
