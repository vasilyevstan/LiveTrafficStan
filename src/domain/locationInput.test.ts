import { describe, expect, it } from 'vitest'
import { parseLocationInput } from './locationInput'

describe('parseLocationInput', () => {
  it.each([
    ['59.437, 24.7536', 59.437, 24.754, '59.437, 24.754'],
    [' -90 , -180 ', -90, -180, '-90.000, -180.000'],
    ['+.5, 180.', 0.5, 180, '0.500, 180.000'],
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
    '59,',
    '1, 2, 3',
  ])('rejects malformed or out-of-range coordinate intent %s', (input) => {
    expect(parseLocationInput(input, 3, 100).kind).toBe('error')
  })

  it.each([
    ['Tallinn', 'Tallinn'],
    ['Tallinn, Estonia', 'Tallinn, Estonia'],
    ['Paris, 75000', 'Paris, 75000'],
    ['59.4, Tallinn', '59.4, Tallinn'],
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
