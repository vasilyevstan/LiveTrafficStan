import { describe, expect, it } from 'vitest'
import type { Aircraft, Vessel } from '../domain/traffic'
import {
  DEFAULT_VESSEL_FILTERS,
  filterVessels,
  ONE_KNOT_KPH,
} from '../domain/vesselFilters'
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

  it.each([
    { squawk: '0000', expected: '0000' },
    { squawk: '0042', expected: '0042' },
    { squawk: ' 7000 ', expected: '7000' },
    { squawk: '7500', expected: '7500' },
    { squawk: '7600', expected: '7600' },
    { squawk: '7700', expected: '7700' },
    { squawk: '8888', expected: undefined },
    { squawk: '042', expected: undefined },
    { squawk: '00042', expected: undefined },
    { squawk: '12 3', expected: undefined },
  ])('normalizes squawk $squawk in new history projections', ({ squawk, expected }) => {
    const projected = projectHistoricalObservation(
      { ...aircraft, squawk },
      context,
    )
    const baseline = projectHistoricalObservation(
      { ...aircraft, squawk: expected },
      context,
    )
    const withoutSquawk = projectHistoricalObservation(aircraft, context)

    expect(projected).toEqual(baseline)
    if (!projected || projected.kind !== 'aircraft' || !withoutSquawk) {
      throw new Error('Expected an aircraft observation')
    }
    expect(projected.squawk).toBe(expected)
    expect(validateHistoricalObservation(projected)).toEqual(projected)
    expect(
      historicalObservationToEntity(projected, aircraft.position.observedAt),
    ).toEqual({
      ...historicalObservationToEntity(
        withoutSquawk,
        aircraft.position.observedAt,
      ),
      squawk: expected,
    })
  })

  it('keeps malformed legacy squawk bytes while omitting the field from playback', () => {
    const baseline = projectHistoricalObservation(
      { ...aircraft, squawk: '7000' },
      context,
    )
    if (!baseline || baseline.kind !== 'aircraft') {
      throw new Error('Expected an aircraft observation')
    }
    const legacy = { ...baseline, squawk: '8888' }
    const original = JSON.stringify(legacy)

    expect(new TextEncoder().encode(original).byteLength).toBe(legacy.logicalBytes)
    expect(validateHistoricalObservation(legacy)).toBe(legacy)
    expect(historicalObservationToEntity(legacy, 10_000)).toEqual({
      ...historicalObservationToEntity(baseline, 10_000),
      squawk: undefined,
    })
    expect(JSON.stringify(legacy)).toBe(original)
  })

  it('preserves raw legacy squawk through unrelated existing row repair', () => {
    const baseline = projectHistoricalObservation(
      { ...aircraft, squawk: '7000' },
      context,
    )
    if (!baseline || baseline.kind !== 'aircraft') {
      throw new Error('Expected an aircraft observation')
    }
    const canonical = { ...baseline, squawk: '8888' }
    const legacy = { ...canonical, logicalBytes: 1, destination: 'FORBIDDEN' }
    const original = JSON.stringify(legacy)
    const repaired = validateHistoricalObservation(legacy)

    expect(repaired).toEqual(canonical)
    expect(repaired?.logicalBytes).toBe(baseline.logicalBytes)
    if (!repaired) throw new Error('Expected a repaired observation')
    expect(historicalObservationToEntity(repaired, 10_000)).toEqual({
      ...historicalObservationToEntity(baseline, 10_000),
      squawk: undefined,
    })
    expect(JSON.stringify(legacy)).toBe(original)
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

  it.each([0, ONE_KNOT_KPH])('recomputes yacht eligibility at the cursor with speed %s', (speedKph) => {
    const projected = projectHistoricalObservation(
      {
        ...vessel,
        vesselCategory: 'other',
        vesselType: 'Sailing vessel',
        lengthMeters: 20,
        speedKph,
        markerIcon: 'vessel',
      },
      context,
    )
    if (!projected || projected.kind !== 'vessel') {
      throw new Error('Expected a vessel observation')
    }

    expect(projected).toMatchObject({
      observedAt: 20_000,
      speedKph,
      vesselType: 'Sailing vessel',
      lengthMeters: 20,
      markerIcon: 'vessel',
    })

    const beforeMetadata = historicalObservationToEntity(
      projected,
      18_000,
    )
    const atObservation = historicalObservationToEntity(
      projected,
      20_000,
    )
    if (
      beforeMetadata.kind !== 'vessel' ||
      atObservation.kind !== 'vessel'
    ) {
      throw new Error('Expected historical vessels')
    }

    expect(
      filterVessels([beforeMetadata], DEFAULT_VESSEL_FILTERS, {
        displayTime: 18_000,
        expireAfterMs: 600_000,
      }),
    ).toEqual([])
    expect(
      filterVessels([atObservation], DEFAULT_VESSEL_FILTERS, {
        displayTime: 20_000,
        expireAfterMs: 600_000,
      }),
    ).toHaveLength(1)
    expect(
      filterVessels([atObservation], DEFAULT_VESSEL_FILTERS, {
        displayTime: 140_001,
        expireAfterMs: 600_000,
      }),
    ).toHaveLength(1)
    expect(
      filterVessels([atObservation], DEFAULT_VESSEL_FILTERS, {
        displayTime: 620_001,
        expireAfterMs: 600_000,
      }),
    ).toEqual([])
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
