import type { AirportBoardDirection } from '../../domain/airportBoard.js'
import { normalizeAeroDataBoxBoard } from './airportBoardNormalization.js'

// Invented test records; no retained provider flight data.
export const AIRPORT_BOARD_TEST_NOW = Date.parse('2026-10-08T17:00:00Z')

export const airportBoardFlightFixture = (direction: AirportBoardDirection = 'arrivals') => {
  const current = {
    quality: ['Basic', 'Live'],
    scheduledTime: { utc: '2026-10-08 17:30Z', local: '2026-10-08 20:30+03:00' },
    revisedTime: { utc: '2026-10-08 17:40Z', local: '2026-10-08 20:40+03:00' },
    terminal: '1',
    gate: 'A2',
  }
  const opposite = {
    airport: { name: 'Fixture Airport', iata: 'HEL', icao: 'EFHK' },
    quality: ['Basic'],
  }
  return {
    number: direction === 'arrivals' ? 'TS100' : 'TS200',
    status: 'Expected',
    codeshareStatus: 'IsOperator',
    isCargo: false,
    airline: { name: 'Test Airways' },
    arrival: direction === 'arrivals' ? current : opposite,
    departure: direction === 'departures' ? current : opposite,
  }
}

export const airportBoardFixture = (now = AIRPORT_BOARD_TEST_NOW, icao = 'EETN') =>
  normalizeAeroDataBoxBoard({
    arrivals: [airportBoardFlightFixture()],
    departures: [airportBoardFlightFixture('departures')],
  }, icao, now, now)
