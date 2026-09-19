import { describe, expect, it } from 'vitest'
import type { Aircraft, Vessel } from '../domain/traffic'
import {
  ADSB_HISTORY_LICENSE_DECISION,
  DIGITRAFFIC_HISTORY_LICENSE_DECISION,
  historicalObservationToEntity,
  projectHistoricalObservation,
  validateHistoricalObservation,
} from './observations'

const context = {
  sessionId: 'session-1',
  segmentId: 'segment-1',
}

const aircraft: Aircraft = {
  id: 'aircraft:abc123',
  kind: 'aircraft',
  provider: 'ADSB.lol',
  hex: 'ABC123',
  callsign: 'TST123',
  position: {
    observedAt: 10_000,
    latitude: 59,
    longitude: 24,
  },
  receivedAt: 11_000,
  markerIcon: 'aircraft',
  markerScale: 1,
}

const vessel: Vessel = {
  id: 'vessel:123456789',
  kind: 'vessel',
  provider: 'Fintraffic Digitraffic',
  mmsi: 123456789,
  vesselCategory: 'cargo',
  navigationCategory: 'underway',
  name: 'TEST VESSEL',
  destination: 'SHOULD NOT PERSIST',
  eta: '09-20 10:30 UTC',
  position: {
    observedAt: 20_000,
    latitude: 59.1,
    longitude: 24.1,
  },
  receivedAt: 21_000,
  metadataObservedAt: 19_000,
  markerIcon: 'vessel-cargo',
  markerScale: 1.1,
}

describe('historical observation projection', () => {
  it('allowlists aircraft fields and provider rights provenance', () => {
    const projected = projectHistoricalObservation(aircraft, context)

    expect(projected).toMatchObject({
      kind: 'aircraft',
      provider: 'ADSB.lol',
      licenseDecisionId: ADSB_HISTORY_LICENSE_DECISION,
      sessionId: 'session-1',
      segmentId: 'segment-1',
    })
    expect(projected?.logicalBytes).toBeGreaterThan(0)
    expect(validateHistoricalObservation(projected)).toEqual(projected)
  })

  it('excludes vessel destination and ETA and gates future metadata', () => {
    const projected = projectHistoricalObservation(
      { ...vessel, name: 'Meri 🚢' },
      context,
    )

    expect(projected).toMatchObject({
      kind: 'vessel',
      licenseDecisionId: DIGITRAFFIC_HISTORY_LICENSE_DECISION,
    })
    expect(projected).not.toHaveProperty('destination')
    expect(projected).not.toHaveProperty('eta')
    if (!projected || projected.kind !== 'vessel') {
      throw new Error('Expected a vessel observation')
    }

    expect(
      historicalObservationToEntity(projected, 18_000),
    ).toMatchObject({
      kind: 'vessel',
      vesselCategory: 'unknown',
      markerIcon: 'vessel',
    })
    expect(
      historicalObservationToEntity(projected, 20_000),
    ).toMatchObject({
      kind: 'vessel',
      name: 'Meri 🚢',
      vesselCategory: 'cargo',
      markerIcon: 'vessel-cargo',
    })
    expect(projected.logicalBytes).toBe(
      new TextEncoder().encode(JSON.stringify(projected)).byteLength,
    )
  })

  it('rejects unapproved providers and malformed stored rows', () => {
    expect(
      projectHistoricalObservation(
        { ...aircraft, provider: 'Unreviewed provider' },
        context,
      ),
    ).toBeUndefined()
    expect(
      validateHistoricalObservation({
        ...projectHistoricalObservation(aircraft, context),
        latitude: 200,
      }),
    ).toBeUndefined()
  })

  it('canonicalizes stored rows to the exact provider allowlist and byte count', () => {
    const projected = projectHistoricalObservation(aircraft, context)
    if (!projected) throw new Error('Expected an aircraft observation')

    const canonical = validateHistoricalObservation({
      ...projected,
      logicalBytes: 1,
      destination: 'FORBIDDEN',
      browserLatitude: 59.4,
    })

    expect(canonical).toEqual(projected)
    expect(canonical).not.toHaveProperty('destination')
    expect(canonical).not.toHaveProperty('browserLatitude')
    expect(
      validateHistoricalObservation({
        ...projected,
        provider: 'Fintraffic Digitraffic',
      }),
    ).toBeUndefined()
    expect(
      validateHistoricalObservation({
        ...projected,
        licenseDecisionId: DIGITRAFFIC_HISTORY_LICENSE_DECISION,
      }),
    ).toBeUndefined()
  })
})
