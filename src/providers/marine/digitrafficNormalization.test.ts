import { describe, expect, it } from 'vitest'
import {
  decodeAisEta,
  normalizeDigitrafficVessel,
  parseDigitrafficMqttLocation,
  parseDigitrafficMqttMetadata,
  parseDigitrafficRestLocations,
  parseDigitrafficRestMetadata,
  vesselLengthMeters,
  vesselMarkerIcon,
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
      name: 'TEST SHIP',
      vesselType: 'Cargo vessel',
      lengthMeters: 100,
      widthMeters: 15,
      draughtMeters: 6.5,
      speedKph: 18.52,
      navigationStatus: 'Moored',
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
  })

  it('maps only trusted AIS ship types to the bounded icon vocabulary', () => {
    expect(
      [
        30,
        31,
        52,
        53,
        60,
        69,
        70,
        79,
        80,
        89,
        90,
        0,
        undefined,
      ].map(vesselMarkerIcon),
    ).toEqual([
      'vessel-fishing',
      'vessel',
      'vessel-tug',
      'vessel',
      'vessel-passenger',
      'vessel-passenger',
      'vessel-cargo',
      'vessel-cargo',
      'vessel-tanker',
      'vessel-tanker',
      'vessel',
      'vessel',
      'vessel',
    ])
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
