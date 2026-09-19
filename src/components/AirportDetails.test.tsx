import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AirportDetails } from './AirportDetails'

describe('AirportDetails', () => {
  it('shows static airport facts, pinned provenance, and no-inference wording', () => {
    const html = renderToStaticMarkup(
      <AirportDetails
        airport={{
          id: '2301',
          name: 'Lennart Meri Tallinn Airport',
          kind: 'large',
          ident: 'EETN',
          icaoCode: 'EETN',
          iataCode: 'TLL',
          municipality: 'Tallinn',
          isoCountry: 'EE',
          longitude: 24.83264,
          latitude: 59.413246,
        }}
        source={{
          name: 'OurAirports',
          repositoryUrl:
            'https://github.com/davidmegginson/ourairports-data',
          commit: '5ed85eed28722bea80ebdde9e255e09b1e7317a8',
          publishedAt: '2026-09-19T01:53:15Z',
          termsUrl: 'https://ourairports.com/data/',
          documentationUrl:
            'https://ourairports.com/help/data-dictionary.html',
          licenseName: 'Public domain',
          outputVersion: 'ourairports-2026-09-19-v1',
        }}
        coordinatePrecision={3}
        onClose={() => undefined}
      />,
    )

    expect(html).toContain('Lennart Meri Tallinn Airport')
    expect(html).toContain('Large airport')
    expect(html).toContain('EETN')
    expect(html).toContain('TLL')
    expect(html).toContain('OurAirports ID')
    expect(html).toContain('2301')
    expect(html).toContain('Ident')
    expect(html).toContain('59.413, 24.833')
    expect(html).toContain('Static reference context only')
    expect(html).toContain('No operational status, arrival, departure, route')
    expect(html).toContain('Public domain')
    expect(html).not.toContain('Nearby aircraft')
  })
})
