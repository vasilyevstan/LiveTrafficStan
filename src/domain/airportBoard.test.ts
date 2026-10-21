import { describe, expect, it } from 'vitest'
import { filterAirportBoardFlights, type AirportBoardFlight } from './airportBoard'
import { airportBoardFixture } from '../providers/airportBoards/airportBoardFixtures'

const base = airportBoardFixture().arrivals![0]!
const flights: AirportBoardFlight[] = [
  { ...base, number: 'TS 100', otherAirport: { name: 'Helsinki Fixture Airport', iata: 'HEL', icao: 'EFHK' } },
  { ...base, number: 'TS200', otherAirport: { name: 'New York Fixture Airport', iata: 'JFK', icao: 'KJFK' } },
  { ...base, number: 'TS100', codeshare: 'codeshare', status: 'Canceled' },
  { ...base, number: 'TS300', otherAirport: undefined },
]

describe('loaded airport-board filtering', () => {
  it('matches reported flight numbers without case or whitespace differences', () => {
    expect(filterAirportBoardFlights(flights, ' t S 1 0 0 ').map(({ index }) => index)).toEqual([0, 2])
    expect(filterAirportBoardFlights(flights, 's2').map(({ flight }) => flight.number)).toEqual(['TS200'])
  })

  it('matches only the reported other-airport name, IATA and ICAO', () => {
    for (const query of ['helsinki', 'hel', 'efhk']) {
      expect(filterAirportBoardFlights([flights[0]!], query).map(({ index }) => index)).toEqual([0])
    }
    expect(filterAirportBoardFlights(flights, ' NEW  YORK ').map(({ index }) => index)).toEqual([1])
    expect(filterAirportBoardFlights(flights, 'kjfk').map(({ index }) => index)).toEqual([1])
    expect(filterAirportBoardFlights(flights, 'EETN')).toEqual([])
  })

  it('preserves provider order, original row indices, codeshares and statuses', () => {
    const result = filterAirportBoardFlights(flights, 'ts100')
    expect(result.map(({ index }) => index)).toEqual([0, 2])
    expect(result[0]!.flight).toBe(flights[0])
    expect(result[1]!.flight).toBe(flights[2])
    expect(result[1]!.flight.codeshare).toBe('codeshare')
    expect(result[1]!.flight.status).toBe('Canceled')
  })

  it('retains all loaded rows for a blank query and handles missing airport fields', () => {
    for (const query of ['', '  \t\n ']) {
      expect(filterAirportBoardFlights(flights, query).map(({ index }) => index)).toEqual([0, 1, 2, 3])
    }
    expect(filterAirportBoardFlights(flights, 'ts300')[0]!.flight).toBe(flights[3])
    expect(filterAirportBoardFlights([], 'TS100')).toEqual([])
  })

  it('does not search airline, status, gate, terminal or invent approximate airport matches', () => {
    const row = {
      ...base, airline: 'Unsearched Airways', gate: 'UniqueGate', terminal: 'UniqueTerminal',
      otherAirport: { name: 'Tromsø Fixture Airport' },
    }
    for (const query of ['Unsearched', 'Expected', 'UniqueGate', 'UniqueTerminal', 'tromso']) {
      expect(filterAirportBoardFlights([row], query)).toEqual([])
    }
    expect(filterAirportBoardFlights([row], 'TROMSØ')[0]!.flight).toBe(row)
  })

  it('does not mutate loaded records and retains source indices at the existing row bound', () => {
    const records = Object.freeze(Array.from({ length: 500 }, (_, index) =>
      Object.freeze({ ...base, number: `FX${index}` })))
    expect(filterAirportBoardFlights(records, 'fx499')).toEqual([{ flight: records[499], index: 499 }])
    expect(filterAirportBoardFlights(records, 'does not exist')).toEqual([])
    expect(records[499]!.number).toBe('FX499')
  })
})
