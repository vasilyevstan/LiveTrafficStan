import { describe, expect, it } from 'vitest'
import { parseLocationInput } from './locationInput'

describe('parseLocationInput', () => {
  it.each([
    ['59.437, 24.7536', 59.437, 24.754, '59.437, 24.754'],
    [' -90 , -180 ', -90, -180, '-90.000, -180.000'],
    ['+.5, 180.', 0.5, 180, '0.500, 180.000'],
    ['+59.437, -24.7536', 59.437, -24.754, '59.437, -24.754'],
    ['-.5, +.25', -0.5, 0.25, '-0.500, 0.250'],
    ['-0, -0', 0, 0, '0.000, 0.000'],
  ])(
    'parses and rounds coordinate input %s',
    (input, latitude, longitude, label) => {
      expect(parseLocationInput(input, 3, 100)).toEqual({
        kind: 'coordinates',
        center: { latitude, longitude, label },
      })
    },
  )

  it.each([
    '91, 24',
    '59, 181',
    'NaN, 24',
    'Infinity, 24',
    '1e2, 24',
    '59..450, 24.760',
    '59.450, 24..760',
    '--59.450, 24.760',
    '59.450, ++24.760',
    '+-59.450, 24.760',
    '59.450, -+24.760',
    '59.45-0, 24.760',
    '.+59, 24.760',
    '59 .450, 24.760',
    '59.450, 24 760',
    '1e+, 24',
    '1e--2, 24',
    '1e2e3, 24',
    '59, -1E..2',
    '--NaN, 24',
    '59, ++Infinity',
    '., 24',
    '59, --',
    '59,',
    ', 24.760',
    '1, 2, 3',
    '59..450, 24.760, 1',
  ])('rejects malformed or out-of-range coordinate intent %s', (input) => {
    expect(parseLocationInput(input, 3, 100).kind).toBe('error')
  })

  it.each([
    ['Tallinn', 'Tallinn'],
    ['Tallinn, Estonia', 'Tallinn, Estonia'],
    ['Paris, 75000', 'Paris, 75000'],
    ['59.4, Tallinn', '59.4, Tallinn'],
    ['5th Avenue, New York', '5th Avenue, New York'],
    ["St. John's, 47", "St. John's, 47"],
    ['A-12, 34', 'A-12, 34'],
    ['E, 24', 'E, 24'],
    ['1E Street, 24', '1E Street, 24'],
    ['59..450, Tallinn', '59..450, Tallinn'],
  ])('preserves named query %s', (input, query) => {
    expect(parseLocationInput(input, 3, 100)).toEqual({
      kind: 'query',
      query,
    })
  })

  it('rejects empty and overlong input', () => {
    expect(parseLocationInput('   ', 3, 100).kind).toBe('error')
    expect(parseLocationInput('a'.repeat(101), 3, 100).kind).toBe('error')
  })
})
