import { describe, expect, it } from 'vitest'
import {
  countryForAircraftHex,
  flagStateForMmsi,
  formatCountryAllocation,
} from './countryAllocations'

describe('flagStateForMmsi', () => {
  it('resolves assigned ordinary ship-station MMSIs', () => {
    expect(flagStateForMmsi(230_123_456)).toEqual({
      name: 'Finland',
      iso2: 'FI',
    })
    expect(flagStateForMmsi(276_123_456)).toEqual({
      name: 'Estonia',
      iso2: 'EE',
    })
    expect(flagStateForMmsi(352_123_456)).toEqual({
      name: 'Panama',
      iso2: 'PA',
    })
  })

  it.each([
    2_761_234,
    27_612_345,
    111_276_123,
    827_612_345,
    982_761_234,
    992_761_234,
    970_123_456,
    972_123_456,
    974_123_456,
    280_123_456,
    0,
    -276_123_456,
    276_123_456.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('does not assign special, unassigned, or malformed MMSI %s', (mmsi) => {
    expect(flagStateForMmsi(mmsi)).toBeUndefined()
  })
})

describe('countryForAircraftHex', () => {
  it('resolves inclusive allocation boundaries', () => {
    expect(countryForAircraftHex('511000')).toEqual({
      name: 'Estonia',
      iso2: 'EE',
    })
    expect(countryForAircraftHex('5117ff')).toEqual({
      name: 'Estonia',
      iso2: 'EE',
    })
    expect(countryForAircraftHex('A00000')).toEqual({
      name: 'United States',
      iso2: 'US',
    })
    expect(countryForAircraftHex('AFFFFF')).toEqual({
      name: 'United States',
      iso2: 'US',
    })
  })

  it.each([
    '510FFF',
    '511800',
    '035000',
    '899000',
    'F00000',
    'F09000',
    '000000',
    'FFFFFF',
    '12345',
    '1234567',
    '0x511000',
    'ZZZZZZ',
    ' 511000',
    '',
  ])('does not assign excluded, unallocated, or malformed address %s', (hex) => {
    expect(countryForAircraftHex(hex)).toBeUndefined()
  })
})

it('formats accessible country text without a decorative-only signal', () => {
  expect(
    formatCountryAllocation({ name: 'Estonia', iso2: 'EE' }),
  ).toBe('Estonia (EE)')
})
