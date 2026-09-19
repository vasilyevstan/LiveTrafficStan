import { describe, expect, it } from 'vitest'
import {
  buildAircraftMetadataProjection,
  parseProjectedShard,
  verifySha256,
} from './aircraft-metadata-projection.mjs'

const sourceTypes = {
  A320: ['AIRBUS A-320-200', 'L2J', 'M'],
  H125: ['AIRBUS HELICOPTERS H-125', 'H1T', 'L'],
}

describe('aircraft metadata projection', () => {
  it('builds deterministic available and globally ambiguous rows', () => {
    const sourceAircraft = {
      ABC123: ['ES-ABC', 'A320', '00'],
      ABC124: ['ES-DUP', 'A320', '00'],
      ABC125: ['ES-DUP', '', '00'],
      ABC126: ['ES-MISSING-TYPE', 'ZZZZ', '00'],
    }

    const first = buildAircraftMetadataProjection(
      sourceAircraft,
      sourceTypes,
    )
    const second = buildAircraftMetadataProjection(
      sourceAircraft,
      sourceTypes,
    )

    expect(first.counts).toMatchObject({
      availableRecords: 1,
      ambiguousRecords: 1,
      duplicateRegistrations: 1,
      shardCount: 1,
    })
    expect(first.shards.AB.contents.toString('utf8')).toBe(
      'C123\tES-ABC\tA320\nC124\tES-DUP\tA320\tA\n',
    )
    expect(second.shards.AB.contents).toEqual(first.shards.AB.contents)
    expect(second.shards.AB.metrics).toEqual(first.shards.AB.metrics)
  })

  it('rejects malformed source fields without creating partial rows', () => {
    const projection = buildAircraftMetadataProjection(
      {
        short: ['ES-ONE', 'A320'],
        ABC123: ['', 'A320'],
        ABC124: ['ES-TAB\tBAD', 'A320'],
        ABC125: ['ES-OK', ''],
        ABC126: ['ES-UNKNOWN', 'ZZZZ'],
      },
      sourceTypes,
    )

    expect(projection.counts.availableRecords).toBe(0)
    expect(projection.counts.shardCount).toBe(0)
  })

  it('validates complete sorted TSV shards', () => {
    expect(
      parseProjectedShard(
        'C123\tES-ABC\tA320\nC124\tES-DUP\tH125\tA\n',
        sourceTypes,
      ),
    ).toEqual(
      new Map([
        [
          'C123',
          {
            registration: 'ES-ABC',
            typeCode: 'A320',
            ambiguous: false,
          },
        ],
        [
          'C124',
          {
            registration: 'ES-DUP',
            typeCode: 'H125',
            ambiguous: true,
          },
        ],
      ]),
    )
    expect(() =>
      parseProjectedShard(
        'C124\tES-DUP\tH125\nC123\tES-ABC\tA320\n',
        sourceTypes,
      ),
    ).toThrow(/uniquely sorted/)
    expect(() =>
      parseProjectedShard(
        'C123\tES-ABC\tA320\nC123\tES-ABC\tA320\n',
        sourceTypes,
      ),
    ).toThrow(/uniquely sorted/)
    expect(() =>
      parseProjectedShard('C123\tES-ABC\tA320', sourceTypes),
    ).toThrow(/end with a newline/)
    expect(() =>
      parseProjectedShard(
        'C123\tES-ABC\tA320\tUNKNOWN\n',
        sourceTypes,
      ),
    ).toThrow(/invalid aircraft metadata status/i)
  })

  it('fails closed on a checksum mismatch', () => {
    expect(() =>
      verifySha256(
        Buffer.from('actual'),
        '0'.repeat(64),
        'Fixture archive',
      ),
    ).toThrow(/SHA-256 mismatch/)
  })
})
