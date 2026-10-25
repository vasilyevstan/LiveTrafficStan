import { describe, expect, it } from 'vitest'
import { findLookupRequests, rankFindResults } from './unifiedFind'

describe('unified Find lookup planning', () => {
  it.each([
    ['230123456', [{ objectClass: 'ships', by: 'mmsi', query: '230123456' }]],
    ['  plus ultra  ', [{ objectClass: 'ships', by: 'name', query: 'plus ultra' }]],
    ['ABC123', [
      { objectClass: 'ships', by: 'name', query: 'ABC123' },
      { objectClass: 'aircraft', by: 'hex', query: 'ABC123' },
    ]],
    ['G-EZBI', [
      { objectClass: 'ships', by: 'name', query: 'G-EZBI' },
      { objectClass: 'aircraft', by: 'reg', query: 'G-EZBI' },
    ]],
    ['N123AB', [
      { objectClass: 'ships', by: 'name', query: 'N123AB' },
      { objectClass: 'aircraft', by: 'reg', query: 'N123AB' },
    ]],
    ['FIN2WN', [
      { objectClass: 'ships', by: 'name', query: 'FIN2WN' },
      { objectClass: 'aircraft', by: 'callsign', query: 'FIN2WN' },
    ]],
    ['  ', []],
  ])('plans at most one request per existing object source for %s', (query, expected) => {
    expect(findLookupRequests(query)).toEqual(expected)
  })
  it.each([
    ['callsign: ABC123', 'aircraft', 'callsign', 'ABC123'],
    ['reg:OHABC', 'aircraft', 'reg', 'OHABC'],
    ['registration: OHABC', 'aircraft', 'reg', 'OHABC'],
    ['ICAO24: abc123', 'aircraft', 'hex', 'abc123'],
    ['mmsi: 230123456', 'ships', 'mmsi', '230123456'],
  ])('permits an explicit identifier hint for an otherwise ambiguous %s without a selector', (query, objectClass, by, identifier) => {
    expect(findLookupRequests(query)).toEqual([{ objectClass, by, query: identifier }])
  })
  it('never plans a position lookup, automatic retry or all aircraft methods', () => {
    for (const query of ['ANTARES', 'ABC123', '230123456', 'N123AB']) {
      const requests = findLookupRequests(query)
      expect(requests).toHaveLength(new Set(requests.map((request) => request.objectClass)).size)
      expect(requests.some((request) => request.by === 'position')).toBe(false)
    }
  })
})

describe('mixed Find ranking', () => {
  it('ranks exact identity and name before prefix and contains, stably across types', () => {
    const rows = [
      { label: 'A TEST SHIP', identities: ['230123456'] },
      { label: 'TEST AIRPORT', identities: ['EETN'] },
      { label: 'Aircraft', identities: ['TEST'] },
      { label: 'TEST', identities: ['100460'] },
      { label: 'TEST PORT', identities: [] },
    ]
    expect(rankFindResults(rows, ' test ')).toEqual([rows[2], rows[3], rows[1], rows[4], rows[0]])
    expect(rows[0]?.label).toBe('A TEST SHIP')
  })
})
