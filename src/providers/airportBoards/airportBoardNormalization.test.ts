import { describe, expect, it } from 'vitest'
import { AIRPORT_BOARD_CONFIG as config } from '../../config/airportBoardConfig'
import { AIRPORT_BOARD_STATUS_LABELS } from '../../domain/airportBoard'
import {
  AirportBoardFormatError,
  normalizeAeroDataBoxBoard,
  parseAirportBoardSnapshot,
} from './airportBoardNormalization'
import { AIRPORT_BOARD_TEST_NOW as now, airportBoardFixture, airportBoardFlightFixture } from './airportBoardFixtures'

const normalize = (arrivals: unknown, departures: unknown = []) =>
  normalizeAeroDataBoxBoard({ arrivals, departures }, 'EETN', now, now + 100)

describe('airport board normalization', () => {
  it('projects only board context, exact direction, reported status and selected-airport clocks', () => {
    const row = { ...airportBoardFlightFixture(), callSign: 'DO NOT MATCH', aircraft: { reg: 'DO NOT MATCH' }, location: { lat: 59, lon: 24 } }
    const result = normalize([row], [airportBoardFlightFixture('departures')])
    expect(result.arrivals?.[0]).toMatchObject({
      number: 'TS100', codeshare: 'operator', status: 'Expected',
      otherAirport: { name: 'Fixture Airport', icao: 'EFHK', iata: 'HEL' },
      quality: ['schedule', 'live'],
      scheduled: { utc: now + 30 * 60_000, local: '2026-10-08T20:30:00.000+03:00' },
    })
    expect(result.departures?.[0]?.number).toBe('TS200')
    expect(JSON.stringify(result)).not.toMatch(/callSign|DO NOT MATCH|"location"|"aircraft"/)
    expect(JSON.stringify(result)).not.toMatch(/lastUpdated|sourceUpdated|occurrenceId/)
  })

  it.each(Object.keys(AIRPORT_BOARD_STATUS_LABELS))('preserves reported %s without inferring its certainty', status => {
    expect(normalize([{ ...airportBoardFlightFixture(), status }]).arrivals?.[0]?.status).toBe(status)
  })

  it.each([
    ['IsOperator', 'operator'], ['IsCodeshared', 'codeshare'], ['Unknown', 'unknown'],
  ])('preserves %s codeshare semantics', (codeshareStatus, codeshare) => {
    expect(normalize([{ ...airportBoardFlightFixture(), codeshareStatus }]).arrivals?.[0]?.codeshare).toBe(codeshare)
  })

  it('removes only identical projected rows, retaining marketing and conflicting rows separately', () => {
    const row = airportBoardFlightFixture()
    const result = normalize([row, row, { ...row, codeshareStatus: 'IsCodeshared' }, { ...row, status: 'Delayed' }])
    expect(result.arrivals).toHaveLength(3)
  })

  it('distinguishes successful empty directions from missing/null coverage', () => {
    expect(normalize([], null)).toMatchObject({ arrivals: [], departures: null })
    expect(normalize(null, [])).toMatchObject({ arrivals: null, departures: [] })
    expect(() => normalizeAeroDataBoxBoard({}, 'EETN', now, now)).toThrow(AirportBoardFormatError)
  })

  it('keeps missing optional clocks, destination and quality unknown', () => {
    const row = { number: 'TS101', status: 'Unknown', codeshareStatus: 'Unknown', isCargo: false }
    expect(normalize([row]).arrivals?.[0]).toMatchObject({ quality: [], codeshare: 'unknown', status: 'Unknown' })
    expect(normalize([row]).arrivals?.[0]?.scheduled).toBeUndefined()
    expect(normalize([row]).arrivals?.[0]?.otherAirport).toBeUndefined()
  })

  it.each([
    ['2026-10-08 22:30Z', '2026-10-09 01:30+03:00'],
    ['2026-03-29 01:30Z', '2026-03-29 04:30+03:00'],
    ['2026-10-25 00:30Z', '2026-10-25 03:30+03:00'],
    ['2026-10-25 01:30Z', '2026-10-25 03:30+02:00'],
    ['2026-10-08T17:30:01.123Z', '2026-10-08T13:30:01.123-04:00'],
  ])('validates UTC %s against airport-local %s across midnight and DST', (utc, local) => {
    const row = { ...airportBoardFlightFixture(), arrival: { quality: ['Live'], scheduledTime: { utc, local } } }
    expect(normalize([row]).arrivals?.[0]?.scheduled?.utc).toBe(Date.parse(utc.replace(' ', 'T')))
  })

  it.each([
    ['2026-02-30 17:30Z', '2026-02-30 20:30+03:00'],
    ['2026-10-08 17:30', '2026-10-08 20:30+03:00'],
    ['2026-10-08 17:30Z', '2026-10-08 20:30+02:00'],
    ['2026-10-08 17:30Z', '2026-10-08 32:30+15:00'],
    ['2026-10-08 17:30Z', '2026-10-08 20:30'],
  ])('rejects invalid or inconsistent UTC/local clocks (%s)', (utc, local) => {
    expect(() => normalize([{ ...airportBoardFlightFixture(), arrival: { quality: [], scheduledTime: { utc, local } } }])).toThrow(AirportBoardFormatError)
  })

  it.each([
    { status: 'Invented' }, { codeshareStatus: 'Invented' }, { isCargo: 'false' },
    { number: 'X'.repeat(33) }, { number: 'TS100\u202e' },
    { movement: {} }, { arrival: { quality: ['Invented'] } },
    { departure: { airport: { name: 'Other', icao: 'eetn' } } },
  ])('fails closed on malformed supported fields: %j', override => {
    expect(() => normalize([{ ...airportBoardFlightFixture(), ...override }])).toThrow(AirportBoardFormatError)
  })

  it('enforces the combined raw row bound before exact-duplicate removal', () => {
    const rows = Array.from({ length: config.maximumFlights / 2 + 1 }, () => airportBoardFlightFixture())
    expect(() => normalize(rows, rows)).toThrow(AirportBoardFormatError)
    expect(normalize(rows).arrivals).toHaveLength(1)
  })

  it('validates the own snapshot identity, schema, clock and complete payload', () => {
    const fixture = airportBoardFixture()
    expect(parseAirportBoardSnapshot(JSON.parse(JSON.stringify(fixture)), 'EETN')).toEqual(fixture)
    expect(() => parseAirportBoardSnapshot(fixture, 'EFHK')).toThrow(AirportBoardFormatError)
    expect(() => parseAirportBoardSnapshot({ ...fixture, schemaVersion: 2 }, 'EETN')).toThrow(AirportBoardFormatError)
    expect(() => parseAirportBoardSnapshot({ ...fixture, retrievedAt: now - 1 }, 'EETN')).toThrow(AirportBoardFormatError)
    expect(() => parseAirportBoardSnapshot({ ...fixture, retrievedAt: now + config.upstreamTimeoutMs + 1 }, 'EETN')).toThrow(AirportBoardFormatError)
  })
})
