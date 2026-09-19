import { describe, expect, it } from 'vitest'
import {
  buildAirportsProjection,
  parseCsv,
  parseProjectedAirports,
} from './airports-projection.mjs'

const header =
  'id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,scheduled_service,gps_code,icao_code,iata_code,local_code,home_link,wikipedia_link,keywords'

describe('airport projection', () => {
  it('parses quoted CSV and retains only large and medium airport context', () => {
    const source = [
      header,
      '20,EE-0020,medium_airport,"Second, Airport",60,25,,EU,EE,EE-37,"City ""North""",no,,,,,,,',
      '10,EETN,large_airport,Lennart Meri Tallinn Airport,59.413246,24.83264,131,EU,EE,EE-37,Tallinn,yes,EETN,EETN,TLL,,,,',
      '30,EE-0030,small_airport,Ignored Strip,59,24,,EU,EE,EE-37,Ignored,no,,,,,,,',
      '',
    ].join('\r\n')
    const projection = buildAirportsProjection(source)
    const parsed = parseProjectedAirports(
      JSON.parse(projection.contents.toString('utf8')),
    )

    expect(parsed).toEqual([
      {
        id: '10',
        name: 'Lennart Meri Tallinn Airport',
        kind: 'large',
        ident: 'EETN',
        municipality: 'Tallinn',
        isoCountry: 'EE',
        icaoCode: 'EETN',
        iataCode: 'TLL',
        longitude: 24.83264,
        latitude: 59.413246,
      },
      {
        id: '20',
        name: 'Second, Airport',
        kind: 'medium',
        ident: 'EE-0020',
        municipality: 'City "North"',
        isoCountry: 'EE',
        icaoCode: undefined,
        iataCode: undefined,
        longitude: 25,
        latitude: 60,
      },
    ])
    expect(projection.counts).toMatchObject({
      sourceRecords: 3,
      projectedRecords: 2,
      kindCounts: { large: 1, medium: 1 },
    })
    expect(projection.contents.toString('utf8')).not.toContain(
      'scheduled_service',
    )
    expect(projection.contents.toString('utf8')).not.toContain('icaoCode":""')
  })

  it('handles embedded newlines but rejects malformed and duplicate records', () => {
    expect(parseCsv('a,b\r\n"x\ny",z\r\n')).toEqual([
      ['a', 'b'],
      ['x\ny', 'z'],
    ])
    expect(() => parseCsv('a,b\n"unterminated')).toThrow(/unterminated/)

    const duplicate = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: '1',
          properties: {
            name: 'FIRST',
            kind: 'large',
            ident: 'FIRST',
            isoCountry: 'EE',
          },
          geometry: { type: 'Point', coordinates: [24, 59] },
        },
        {
          type: 'Feature',
          id: '1',
          properties: {
            name: 'SECOND',
            kind: 'medium',
            ident: 'SECOND',
            isoCountry: 'EE',
          },
          geometry: { type: 'Point', coordinates: [25, 60] },
        },
      ],
    }
    expect(() => parseProjectedAirports(duplicate)).toThrow(/invalid/)
  })
})
