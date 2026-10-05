import { describe, expect, it } from 'vitest'
import { normalizeAisVessel } from '../providers/marine/digitrafficNormalization'
import {
  historicalObservationToEntity,
  MARINE_HISTORY_LICENSE_DECISION,
  projectHistoricalObservation,
  validateHistoricalObservation,
} from './observations'
import {
  createObservationIndex,
  historicalRange,
  historicalSnapshot,
  historicalTrailSegments,
} from './playback'

const record = (provider = 'AISStream', at = 1_000, receivedAt = at + 100) => {
  const vessel = normalizeAisVessel(
    { mmsi: 230123456, latitude: 59.44, longitude: 24.75, observedAt: at },
    { mmsi: 230123456, name: 'EXAMPLE', shipType: 37, lengthMeters: 9 },
    receivedAt, provider,
    provider === 'AISStream' ? 'AISStream' : 'Open Waters AIS | AISHub',
  )
  const value = projectHistoricalObservation(vessel, {
    sessionId: 'session', segmentId: `segment-${provider}`,
  })
  if (!value) throw new Error('Fixture projection failed')
  return value
}

describe('multi-source marine history', () => {
  it.each(['AISStream', 'Open Waters AIS'])('retains %s provenance and attribution', (provider) => {
    const value = record(provider)
    expect(value.licenseDecisionId).toBe(MARINE_HISTORY_LICENSE_DECISION)
    expect(validateHistoricalObservation(value)).toEqual(value)
    const entity = historicalObservationToEntity(value, value.receivedAt)
    expect(entity.provider).toBe(provider)
    expect(entity).toHaveProperty('attribution')
    expect(entity).toHaveProperty('lengthMeters', 9)
  })

  it('does not put unknown-time metadata into an earlier playback moment', () => {
    const value = record('Open Waters AIS', 1_000, 2_000)
    expect(historicalObservationToEntity(value, 1_500)).toHaveProperty('name', undefined)
    expect(historicalObservationToEntity(value, 2_000)).toHaveProperty('name', 'EXAMPLE')
    expect(historicalRange([value])).toEqual({ oldest: 1_000, newest: 2_000 })
  })

  it('shows one vessel when its position source changes and retains both source segments', () => {
    const records = [
      record('AISStream', 1_000),
      record('AISStream', 2_000),
      record('Open Waters AIS', 3_000),
      record('Open Waters AIS', 4_000),
    ]
    const index = createObservationIndex(records)
    const snapshot = historicalSnapshot(index, 5_000)
    expect(snapshot).toHaveLength(1)
    expect(snapshot[0].provider).toBe('Open Waters AIS')
    const segments = historicalTrailSegments(
      index, 'vessel:230123456', 5_000, 10_000,
      { aircraft: 120_000, vessel: 600_000 },
    )
    expect(segments.map((segment) => segment.map((point) => point.observedAt)))
      .toEqual([[1_000, 2_000], [3_000, 4_000]])
  })

  it('does not silently authorize a new marine provider without source attribution', () => {
    const vessel = normalizeAisVessel(
      { mmsi: 230123456, latitude: 59, longitude: 24, observedAt: 1_000 },
      undefined, 2_000, 'AISStream',
    )
    expect(projectHistoricalObservation(vessel, { sessionId: 's', segmentId: 'g' }))
      .toBeUndefined()
  })
})
