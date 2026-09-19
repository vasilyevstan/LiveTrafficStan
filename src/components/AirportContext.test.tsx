import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  AIRPORT_RESULT_LIMIT,
  type Airport,
} from '../domain/airports'
import { AirportContext } from './AirportContext'

const airport = (index: number): Airport => ({
  id: String(index + 1),
  name: `Airport ${index + 1}`,
  kind: index === 0 ? 'large' : 'medium',
  ident: index === 0 ? 'EETN' : `EE-${index}`,
  icaoCode: index === 0 ? 'EETN' : undefined,
  iataCode: index === 0 ? 'TLL' : undefined,
  municipality: 'Tallinn',
  isoCountry: 'EE',
  longitude: 24.8,
  latitude: 59.4,
})

describe('AirportContext', () => {
  it('provides bounded native buttons for keyboard airport selection', () => {
    const airports = Array.from(
      { length: AIRPORT_RESULT_LIMIT + 2 },
      (_, index) => airport(index),
    )
    const html = renderToStaticMarkup(
      <AirportContext
        airports={airports}
        selectedAirportId="1"
        emptyMessage="No airports are shown in this view."
        onSelect={() => undefined}
      />,
    )

    expect(html).toContain('Airports in this view')
    expect(html).toContain(`${airports.length} airports in view`)
    expect(html).toContain('ICAO EETN')
    expect(html).toContain('IATA TLL')
    expect(html).toContain('aria-pressed="true"')
    expect((html.match(/<li>/g) ?? [])).toHaveLength(AIRPORT_RESULT_LIMIT)
    expect(html).toContain(
      `Showing the first ${AIRPORT_RESULT_LIMIT} of ${airports.length}`,
    )
  })

  it('keeps an empty current view explicit', () => {
    const html = renderToStaticMarkup(
      <AirportContext
        airports={[]}
        selectedAirportId={null}
        emptyMessage="No large or medium airports are shown in this view."
        onSelect={() => undefined}
      />,
    )

    expect(html).toContain('0 airports in view')
    expect(html).toContain(
      'No large or medium airports are shown in this view.',
    )
  })
})
