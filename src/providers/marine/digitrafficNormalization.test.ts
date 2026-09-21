import { describe, expect, it } from 'vitest'
import {
  DIGITRAFFIC_MARINE_CAPABILITIES,
  DIGITRAFFIC_PROVIDER_NAME,
} from './digitrafficCapabilities'
import {
  decodeAisEta,
  normalizeDigitrafficVessel,
  parseDigitrafficMqttLocation,
  parseDigitrafficMqttMetadata,
  parseDigitrafficRestLocations,
  parseDigitrafficRestMetadata,
  vesselCategory,
  vesselLengthMeters,
  vesselMarkerIcon,
  vesselNavigationCategory,
  vesselWidthMeters,
} from './digitrafficNormalization'

describe('Digitraffic normalization', () => {
  it('parses REST locations using the external record timestamp', () => {
    const locations = parseDigitrafficRestLocations({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [24.75, 59.44] },
          properties: {
            mmsi: 230123456,
            sog: 12.5,
            cog: 181,
            heading: 179,
            navStat: 0,
            timestamp: 42,
            timestampExternal: 1_800_000_000_000,
          },
        },
      ],
    })

    expect(locations).toEqual([
      {
        mmsi: 230123456,
        latitude: 59.44,
        longitude: 24.75,
        observedAt: 1_800_000_000_000,
        speedKnots: 12.5,
        courseDegrees: 181,
        headingDegrees: 179,
        navigationStatus: 0,
      },
    ])
  })

  it('normalizes REST and MQTT metadata field variants', () => {
    const rest = parseDigitrafficRestMetadata([
      {
        mmsi: 230123456,
        timestamp: 1_800_000_000_000,
        name: ' TEST SHIP@@@',
        referencePointA: 80,
        referencePointB: 20,
        referencePointC: 7,
        referencePointD: 8,
      },
    ])
    const mqtt = parseDigitrafficMqttMetadata(
      {
        timestamp: 1_800_000_001_000,
        name: 'TEST SHIP',
        refA: 82,
        refB: 18,
        refC: 6,
        refD: 9,
        type: 70,
      },
      230123456,
    )

    expect(rest[0]?.name).toBe('TEST SHIP')
    expect(vesselLengthMeters(rest[0])).toBe(100)
    expect(vesselWidthMeters(rest[0])).toBe(15)
    expect(mqtt?.shipType).toBe(70)
    expect(vesselLengthMeters(mqtt)).toBe(100)
  })

  it('decodes AIS ETA bit fields without inventing a year', () => {
    const encoded = (9 << 16) | (18 << 11) | (14 << 6) | 30
    expect(decodeAisEta(encoded)).toBe('09-18 14:30 UTC')
    expect(decodeAisEta(0)).toBeUndefined()
  })

  it('creates a normalized metric vessel and preserves missing dimensions', () => {
    const location = parseDigitrafficMqttLocation(
      {
        time: 1_800_000_000,
        lat: 59.44,
        lon: 24.75,
        sog: 10,
        cog: 90,
        heading: 92,
        navStat: 5,
      },
      230123456,
    )
    expect(location).toBeDefined()

    const vessel = normalizeDigitrafficVessel(
      location!,
      {
        mmsi: 230123456,
        timestamp: 1_800_000_000_000,
        name: 'TEST SHIP',
        shipType: 70,
        referencePointA: 80,
        referencePointB: 20,
        referencePointC: 7,
        referencePointD: 8,
        draught: 65,
        eta: (9 << 16) | (18 << 11) | (14 << 6) | 30,
      },
      1_800_000_002_000,
    )

    expect(vessel).toMatchObject({
      id: 'vessel:230123456',
      provider: DIGITRAFFIC_PROVIDER_NAME,
      name: 'TEST SHIP',
      vesselType: 'Cargo vessel',
      vesselCategory: 'cargo',
      lengthMeters: 100,
      widthMeters: 15,
      draughtMeters: 6.5,
      speedKph: 18.52,
      navigationStatus: 'Moored',
      navigationCategory: 'moored',
      metadataObservedAt: 1_800_000_000_000,
      eta: '09-18 14:30 UTC',
      markerIcon: 'vessel-cargo',
    })

    const withoutMetadata = normalizeDigitrafficVessel(
      location!,
      undefined,
      1_800_000_002_000,
    )
    expect(withoutMetadata.lengthMeters).toBeUndefined()
    expect(withoutMetadata.name).toBeUndefined()
    expect(DIGITRAFFIC_MARINE_CAPABILITIES.coverage).toMatchObject({
      kind: 'regional',
      exactBoundaryKnown: false,
    })
  })

  it('maps only trusted AIS ship types to the bounded icon vocabulary', () => {
    expect(
      [
        30,
        31,
        36,
        37,
        52,
        53,
        60,
        69,
        70,
        75,
        79,
        80,
        85,
        89,
        90,
        99,
        0,
        undefined,
      ].map(vesselMarkerIcon),
    ).toEqual([
      'vessel-fishing',
      'vessel',
      'vessel',
      'vessel',
      'vessel-tug',
      'vessel',
      'vessel-passenger',
      'vessel-passenger',
      'vessel-cargo',
      'vessel',
      'vessel-cargo',
      'vessel-tanker',
      'vessel',
      'vessel-tanker',
      'vessel',
      'vessel',
      'vessel',
      'vessel',
    ])
  })

  it('keeps defined, reserved, other, and unknown AIS values distinct', () => {
    expect(
      [30, 31, 52, 60, 65, 69, 70, 75, 79, 80, 85, 89, 90, 95, 99, 0]
        .map(vesselCategory),
    ).toEqual([
      'fishing',
      'tug-service',
      'tug-service',
      'passenger',
      'unknown',
      'passenger',
      'cargo',
      'unknown',
      'cargo',
      'tanker',
      'unknown',
      'tanker',
      'other',
      'unknown',
      'other',
      'unknown',
    ])

    const reservedShipTypes = [
      ...Array.from({ length: 19 }, (_, index) => index + 1),
      25,
      26,
      27,
      28,
      38,
      39,
      45,
      46,
      47,
      48,
      56,
      57,
      65,
      66,
      67,
      68,
      75,
      76,
      77,
      78,
      85,
      86,
      87,
      88,
      95,
      96,
      97,
      98,
    ]
    expect(reservedShipTypes.map(vesselCategory)).toEqual(
      reservedShipTypes.map(() => 'unknown'),
    )

    expect(
      [0, 1, 2, 5, 6, 7, 8, 14, 15, undefined]
        .map(vesselNavigationCategory),
    ).toEqual([
      'underway',
      'anchored',
      'restricted',
      'moored',
      'aground',
      'fishing',
      'underway',
      'other',
      'unknown',
      'unknown',
    ])
  })

  it('rejects metadata timestamps outside the JavaScript Date range', () => {
    const metadata = parseDigitrafficRestMetadata([
      {
        mmsi: 230123456,
        timestamp: Number.MAX_VALUE,
        name: 'INVALID TIME',
      },
    ])

    expect(metadata).toEqual([])
  })

  it('changes metadata-driven artwork without changing vessel identity', () => {
    const location = parseDigitrafficMqttLocation(
      {
        time: 1_800_000_000,
        lat: 59.44,
        lon: 24.75,
        sog: 15,
      },
      230123456,
    )
    expect(location).toBeDefined()

    const generic = normalizeDigitrafficVessel(
      location!,
      {
        mmsi: 230123456,
        timestamp: 1_800_000_000_000,
        name: 'CARGO EXPRESS',
      },
      1_800_000_002_000,
    )
    const cargo = normalizeDigitrafficVessel(
      location!,
      {
        mmsi: 230123456,
        timestamp: 1_800_000_003_000,
        name: 'CARGO EXPRESS',
        shipType: 70,
      },
      1_800_000_004_000,
    )

    expect(generic.markerIcon).toBe('vessel')
    expect(cargo.markerIcon).toBe('vessel-cargo')
    expect(cargo.id).toBe(generic.id)
    expect(cargo.position).toEqual(generic.position)
    expect(cargo.speedKph).toBe(generic.speedKph)
  })

  it('does not present the saturated AIS draught code as exact', () => {
    const location = parseDigitrafficMqttLocation(
      {
        time: 1_800_000_000,
        lat: 59.44,
        lon: 24.75,
      },
      230123456,
    )
    expect(location).toBeDefined()

    const vessel = normalizeDigitrafficVessel(
      location!,
      {
        mmsi: 230123456,
        timestamp: 1_800_000_000_000,
        draught: 255,
      },
      1_800_000_002_000,
    )

    expect(vessel.draughtMeters).toBeUndefined()
  })
})
