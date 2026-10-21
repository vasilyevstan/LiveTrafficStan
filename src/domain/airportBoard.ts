export const AIRPORT_BOARD_STATUS_LABELS = {
  Unknown: 'Status unknown',
  Expected: 'Expected',
  EnRoute: 'En route',
  CheckIn: 'Check-in open',
  Boarding: 'Boarding',
  GateClosed: 'Gate closed',
  Departed: 'Departed',
  Delayed: 'Delayed',
  Approaching: 'Approaching',
  Arrived: 'Arrived',
  Canceled: 'Cancelled',
  Diverted: 'Diverted',
  CanceledUncertain: 'Possibly cancelled',
} as const

export type AirportBoardStatus = keyof typeof AIRPORT_BOARD_STATUS_LABELS
export type AirportBoardDirection = 'arrivals' | 'departures'
export type AirportBoardQuality = 'schedule' | 'live' | 'approximate'

export interface AirportBoardTime {
  utc: number
  local: string
}

export interface AirportBoardFlight {
  number: string
  airline?: string
  otherAirport?: { name: string; iata?: string; icao?: string }
  status: AirportBoardStatus
  codeshare: 'operator' | 'codeshare' | 'unknown'
  cargo: boolean
  quality: AirportBoardQuality[]
  scheduled?: AirportBoardTime
  revised?: AirportBoardTime
  gate?: string
  terminal?: string
}

export const filterAirportBoardFlights = (
  flights: readonly AirportBoardFlight[],
  query: string,
) => {
  const normalized = (value: string) =>
    value.replace(/\s+/g, '').toLocaleLowerCase('en-US')
  const search = normalized(query)
  return flights.map((flight, index) => ({ flight, index })).filter(({ flight }) =>
    !search || [
      flight.number,
      flight.otherAirport?.name,
      flight.otherAirport?.iata,
      flight.otherAirport?.icao,
    ].some(value => value !== undefined && normalized(value).includes(search)),
  )
}

export interface AirportBoardSnapshot {
  schemaVersion: 1
  airportIcao: string
  requestedAt: number
  retrievedAt: number
  arrivals: AirportBoardFlight[] | null
  departures: AirportBoardFlight[] | null
}

export type AirportBoardState =
  | { phase: 'idle'; airportIcao?: string }
  | { phase: 'loading'; airportIcao: string; snapshot?: AirportBoardSnapshot }
  | { phase: 'ready'; airportIcao: string; snapshot: AirportBoardSnapshot }
  | {
      phase: 'error'
      airportIcao: string
      message: string
      retryAt?: number
      snapshot?: AirportBoardSnapshot
    }
  | { phase: 'expired'; airportIcao: string }
