import { describe, expect, it } from 'vitest'
import {
  assertSha256Digest,
  buildCountryAllocationsProjection,
  canonicalizeWikidataMidResults,
} from './country-allocations-projection.mjs'

const wikidata = (vars, bindings) =>
  JSON.stringify({
    head: { vars },
    results: { bindings },
  })

const binding = (values) =>
  Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== null)
      .map(([name, value]) => [
        name,
        {
          type: name === 'item' ? 'uri' : 'literal',
          value,
        },
      ]),
  )

const isoRows = [
  binding({
    item: 'http://www.wikidata.org/entity/Q30',
    itemLabel: 'United States',
    iso2: 'US',
  }),
  binding({
    item: 'http://www.wikidata.org/entity/Q191',
    itemLabel: 'Estonia',
    iso2: 'EE',
  }),
]

describe('country allocation projection', () => {
  it('rejects malformed configured SHA-256 values', () => {
    expect(() => assertSha256Digest('abc', 'MID source')).toThrow(
      'MID source SHA-256 is invalid',
    )
  })

  it('canonicalizes Wikidata rows independently of response order', () => {
    const first = wikidata(
      ['item', 'itemLabel', 'mid', 'iso2'],
      [
        binding({
          item: 'http://www.wikidata.org/entity/Q191',
          itemLabel: 'Estonia',
          mid: '276',
          iso2: 'EE',
        }),
        binding({
          item: 'http://www.wikidata.org/entity/Q30',
          itemLabel: 'United States',
          mid: '338',
          iso2: 'US',
        }),
      ],
    )
    const second = wikidata(
      ['item', 'itemLabel', 'mid', 'iso2'],
      JSON.parse(first).results.bindings.reverse(),
    )

    expect(canonicalizeWikidataMidResults(first).contents).toEqual(
      canonicalizeWikidataMidResults(second).contents,
    )
  })

  it('rejects an entire MID when another matching row lacks ISO data', () => {
    const projection = buildCountryAllocationsProjection({
      midSource: JSON.stringify({
        276: ['EE', 'EST', '', 'Estonia'],
        338: ['US', 'USA', '', 'United States'],
      }),
      midCrosscheck: wikidata(
        ['item', 'itemLabel', 'mid', 'iso2'],
        [
          binding({
            item: 'http://www.wikidata.org/entity/Q191',
            itemLabel: 'Estonia',
            mid: '276',
            iso2: 'EE',
          }),
          binding({
            item: 'http://www.wikidata.org/entity/Q30',
            itemLabel: 'United States',
            mid: '338',
            iso2: 'US',
          }),
          binding({
            item: 'http://www.wikidata.org/entity/Q797',
            itemLabel: 'Alaska',
            mid: '338',
            iso2: null,
          }),
        ],
      ),
      aircraftSource: [
        'state,noOfAddr,startAddr,endAddr',
        'Estonia,000800,511000,5117FF',
      ].join('\n'),
      isoCrosswalk: wikidata(['item', 'itemLabel', 'iso2'], isoRows),
      stateIsoAliases: {},
      outputVersion: 'test-v1',
    })
    const output = JSON.parse(projection.contents.toString('utf8'))

    expect(output.mids).toEqual({
      276: ['Estonia', 'EE'],
    })
    expect(projection.counts.excludedMids).toEqual([338])
  })

  it('excludes invalid-count and special aircraft rows without repairing them', () => {
    const projection = buildCountryAllocationsProjection({
      midSource: JSON.stringify({
        276: ['EE', 'EST', '', 'Estonia'],
      }),
      midCrosscheck: wikidata(
        ['item', 'itemLabel', 'mid', 'iso2'],
        [
          binding({
            item: 'http://www.wikidata.org/entity/Q191',
            itemLabel: 'Estonia',
            mid: '276',
            iso2: 'EE',
          }),
        ],
      ),
      aircraftSource: [
        'state,noOfAddr,startAddr,endAddr',
        'Comoros,000000,035000,0357FF',
        'Estonia,000800,511000,5117FF',
        'ICAO(1),008000,F00000,F07FFF',
      ].join('\n'),
      isoCrosswalk: wikidata(['item', 'itemLabel', 'iso2'], isoRows),
      stateIsoAliases: {},
      outputVersion: 'test-v1',
    })
    const output = JSON.parse(projection.contents.toString('utf8'))

    expect(output.aircraftRanges).toEqual([
      [0x511000, 0x5117ff, 'Estonia', 'EE'],
    ])
    expect(projection.counts.excludedAircraftRows).toEqual([
      {
        state: 'Comoros',
        startAddr: '035000',
        reason: 'count-mismatch',
      },
      {
        state: 'ICAO(1)',
        startAddr: 'F00000',
        reason: 'special-use',
      },
    ])
  })
})
