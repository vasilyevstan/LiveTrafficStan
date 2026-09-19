import { describe, expect, it } from 'vitest'
import {
  aircraftMetadataIdentity,
  aircraftMetadataIdentityKey,
  evaluateAircraftMetadataState,
  type AircraftMetadataControllerState,
} from './aircraftMetadata'

const publishedAt = '2026-09-13T07:35:29Z'
const publicationTime = Date.parse(publishedAt)

const readyState: AircraftMetadataControllerState = {
  phase: 'ready',
  identityKey: 'ABC123|ES-ABC|A320',
  metadata: {
    databaseRegistration: 'ES-ABC',
    typeCode: 'A320',
    modelDescription: 'AIRBUS A-320',
    confidence: 'registration-verified',
    source: {
      name: 'Fixture',
      repositoryUrl: 'https://example.test/source',
      publishedAt,
      outputVersion: 'test-v1',
      licenseName: 'ODC-By 1.0',
      licenseUrl: 'https://example.test/license',
    },
    staleAfterDays: 45,
    futureToleranceHours: 24,
  },
}

describe('aircraft metadata identity', () => {
  it('normalizes only case and outer whitespace into a stable key', () => {
    const identity = aircraftMetadataIdentity({
      hex: ' abc123 ',
      registration: ' es-abc ',
      aircraftType: ' a320 ',
    })

    expect(identity).toEqual({
      hex: 'ABC123',
      registration: 'ES-ABC',
      aircraftType: 'A320',
    })
    expect(aircraftMetadataIdentityKey(identity)).toBe(
      'ABC123|ES-ABC|A320',
    )
  })
})

describe('evaluateAircraftMetadataState', () => {
  it('accepts the exact 45-day boundary and rejects the following millisecond', () => {
    const boundary = publicationTime + 45 * 24 * 60 * 60 * 1_000

    expect(evaluateAircraftMetadataState(readyState, boundary).phase).toBe(
      'available',
    )
    expect(
      evaluateAircraftMetadataState(readyState, boundary + 1),
    ).toMatchObject({
      phase: 'unavailable',
      reason: 'stale',
    })
  })

  it('allows 24 hours of clock skew and rejects a later future date', () => {
    const toleratedNow = publicationTime - 24 * 60 * 60 * 1_000

    expect(
      evaluateAircraftMetadataState(readyState, toleratedNow).phase,
    ).toBe('available')
    expect(
      evaluateAircraftMetadataState(readyState, toleratedNow - 1),
    ).toMatchObject({
      phase: 'unavailable',
      reason: 'future',
    })
  })

  it('reevaluates a cached ready record without changing controller state', () => {
    const available = evaluateAircraftMetadataState(
      readyState,
      publicationTime,
    )
    const stale = evaluateAircraftMetadataState(
      readyState,
      publicationTime + 46 * 24 * 60 * 60 * 1_000,
    )

    expect(available.phase).toBe('available')
    expect(stale).toMatchObject({
      phase: 'unavailable',
      reason: 'stale',
    })
    expect(readyState.phase).toBe('ready')
  })
})
