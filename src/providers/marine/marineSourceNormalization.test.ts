import { describe, expect, it } from 'vitest'
import { normalizeAisVessel } from './digitrafficNormalization'
import {
  AISSTREAM_PROVIDER_NAME,
  OPENWATERS_PROVIDER_NAME,
  parseMarineSourceMessage,
  parseMarineTimestamp,
  parseOpenWatersMetadataSnapshot,
} from './marineSourceNormalization'

const mmsi = 230123456
const observedAt = Date.parse('2026-10-04T12:00:00.123Z')
const position = {
  MessageID: 18,
  UserID: mmsi,
  Valid: true,
  Latitude: 59.44,
  Longitude: 24.75,
  Sog: 0,
  Cog: 360,
  TrueHeading: 511,
  Timestamp: 60,
}
const aisstream = (type: string, body: unknown) => ({
  MessageType: type,
  Message: { [type]: body },
  MetaData: {
    MMSI: mmsi,
    MMSI_String: String(mmsi),
    ShipName: 'EXAMPLE',
    latitude: 60,
    longitude: 25,
    time_utc: '2026-10-04 12:00:00.123456789 +0000 UTC',
  },
})

describe('marine stream normalization', () => {
  it('uses the full provider timestamp, not AIS seconds or cached coordinates', () => {
    const value = parseMarineSourceMessage(
      'aisstream', aisstream('StandardClassBPositionReport', position),
    )
    expect(value?.location).toMatchObject({
      mmsi, latitude: 59.44, longitude: 24.75, observedAt, speedKnots: 0,
    })
    expect(value?.location?.courseDegrees).toBeUndefined()
    expect(value?.location?.headingDegrees).toBeUndefined()
    expect(value?.location?.navigationStatus).toBeUndefined()
    expect(value?.metadata).toBeUndefined()
  })

  it.each([
    '2026-02-30T12:00:00Z',
    '2026-10-04T24:00:00Z',
    '2026-10-04T12:00:00',
    'not a timestamp',
    1_800_000_000,
  ])('rejects invalid or ambiguous timestamps: %s', (value) => {
    expect(parseMarineTimestamp(value)).toBeUndefined()
  })

  it('accepts UTC RFC3339 without requiring nanoseconds', () => {
    expect(parseMarineTimestamp('2026-10-04T12:00:00Z'))
      .toBe(Date.parse('2026-10-04T12:00:00Z'))
    expect(parseMarineTimestamp('2026-10-04T12:00:00.123+00:00'))
      .toBe(observedAt)
  })

  it('rejects mismatched identities, message IDs, invalid packets and AIS sentinels', () => {
    for (const replacement of [
      { UserID: 230123457 },
      { MessageID: 1 },
      { Valid: false },
      { Latitude: 91 },
      { Longitude: 181 },
    ]) {
      expect(parseMarineSourceMessage('aisstream', aisstream(
        'StandardClassBPositionReport', { ...position, ...replacement },
      ))).toBeUndefined()
    }
    const envelope = aisstream('StandardClassBPositionReport', position)
    envelope.MetaData.MMSI_String = '230123457'
    expect(parseMarineSourceMessage('aisstream', envelope)).toBeUndefined()
  })

  it('keeps static part A and B separate and never turns them into positions', () => {
    const a = parseMarineSourceMessage('aisstream', aisstream('StaticDataReport', {
      MessageID: 24, UserID: mmsi, Valid: true, PartNumber: false,
      ReportA: { Valid: true, Name: ' EXAMPLE@@' },
    }))
    const b = parseMarineSourceMessage('aisstream', aisstream('StaticDataReport', {
      MessageID: 24, UserID: mmsi, Valid: true, PartNumber: true,
      ReportB: {
        Valid: true, ShipType: 37, CallSign: 'CALL',
        Dimension: { A: 6, B: 3, C: 1, D: 2 },
      },
    }))
    expect(a?.location).toBeUndefined()
    expect(b?.location).toBeUndefined()
    expect(a?.metadata).toEqual({ mmsi, timestamp: observedAt, name: 'EXAMPLE' })
    expect(b?.metadata).toMatchObject({
      mmsi, shipType: 37, callSign: 'CALL', referencePointA: 6, referencePointB: 3,
    })
    const location = parseMarineSourceMessage(
      'aisstream', aisstream('StandardClassBPositionReport', position),
    )!.location!
    const vessel = normalizeAisVessel(
      location, { ...a!.metadata!, ...b!.metadata! }, observedAt + 1,
      AISSTREAM_PROVIDER_NAME,
    )
    expect(vessel).toMatchObject({
      id: `vessel:${mmsi}`, provider: 'AISStream', name: 'EXAMPLE',
      vesselType: 'Pleasure craft', lengthMeters: 9, widthMeters: 3,
    })
  })

  it('normalizes extended Class B without inferring voyage or navigation fields', () => {
    const value = parseMarineSourceMessage('aisstream', aisstream(
      'ExtendedClassBPositionReport',
      { ...position, MessageID: 19, Name: 'EXAMPLE', Type: 36, Dimension: { A: 8, B: 0, C: 1, D: 1 } },
    ))!
    const vessel = normalizeAisVessel(
      value.location!, value.metadata, observedAt + 1, AISSTREAM_PROVIDER_NAME,
    )
    expect(vessel.vesselType).toBe('Sailing vessel')
    expect(vessel.lengthMeters).toBe(8)
    expect(vessel.imo).toBeUndefined()
    expect(vessel.destination).toBeUndefined()
    expect(vessel.navigationStatus).toBeUndefined()
  })

  it('retains an Open Waters replay position time and its original source credit', () => {
    const value = parseMarineSourceMessage('openwaters', {
      type: 'event', mmsi, source: 'aishub',
      time: '2026-10-04T12:00:00.123Z',
      msg_type: 'PositionReport', synthesized: true,
      lat: 70, lon: 30,
      message: { ...position, MessageID: 1 },
    })!
    expect(value.location?.observedAt).toBe(observedAt)
    expect(value.location?.latitude).toBe(59.44)
    expect(value.attribution).toContain('Open Waters AIS')
    expect(value.attribution).toContain('AISHub')
  })

  it('does not describe a synthesized static clock as an observation time', () => {
    const value = parseMarineSourceMessage('openwaters', {
      type: 'event', mmsi, source: 'aishub',
      time: '2026-10-04T12:00:00.123Z',
      msg_type: 'ShipStaticData', synthesized: true,
      message: { MessageID: 5, UserID: mmsi, Valid: true, Name: 'EXAMPLE', Type: 37 },
    })!
    expect(value.location).toBeUndefined()
    expect(value.metadata?.timestamp).toBeUndefined()
    expect(value.metadata?.shipType).toBe(37)
  })

  it('uses REST only as metadata, never as a position or metadata freshness clock', () => {
    const values = parseOpenWatersMetadataSnapshot({
      type: 'FeatureCollection',
      attribution: { aishub: 'Open Waters AIS. AISHub' },
      features: [{
        id: mmsi,
        geometry: { type: 'Point', coordinates: [24.75, 59.44] },
        properties: {
          mmsi, kind: 'vessel', source: 'aishub', seen: '2026-10-04T12:00:00Z',
          name: 'EXAMPLE', type: 37, length: 9, beam: 3, eta: '10-05 12:30',
        },
      }],
    })
    expect(values[0].metadata).toMatchObject({ mmsi, lengthMeters: 9, shipType: 37 })
    expect(values[0].metadata.timestamp).toBeUndefined()
    expect(values[0]).not.toHaveProperty('location')
    const vessel = normalizeAisVessel(
      { mmsi, latitude: 59.44, longitude: 24.75, observedAt },
      values[0].metadata, observedAt + 1, OPENWATERS_PROVIDER_NAME,
      values[0].attribution,
    )
    expect(vessel).toMatchObject({
      provider: 'Open Waters AIS', lengthMeters: 9, widthMeters: 3,
      eta: '10-05 12:30 UTC',
      attribution: 'Open Waters AIS. AISHub',
    })
    expect(vessel.metadataObservedAt).toBeUndefined()
  })

  it('rejects truncated snapshots rather than treating partial metadata as complete', () => {
    expect(() => parseOpenWatersMetadataSnapshot({
      type: 'FeatureCollection', features: [], truncated: true,
    })).toThrow('incomplete')
  })
})
