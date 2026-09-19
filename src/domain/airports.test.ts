import { describe, expect, it } from 'vitest'
import type { Airport } from './airports'
import { airportsInViewport } from './airports'
import type { TrafficViewport } from './viewport'

const viewport: TrafficViewport = {
  center: { latitude: 0, longitude: 0, label: 'Test' },
  enclosingRadiusKm: 100,
  polygon: [
    { latitude: -1, longitude: -1 },
    { latitude: -1, longitude: 1 },
    { latitude: 1, longitude: 1 },
    { latitude: 1, longitude: -1 },
  ],
}

const airport = (
  id: string,
  name: string,
  kind: Airport['kind'],
  longitude: number,
  latitude: number,
): Airport => ({
  id,
  name,
  kind,
  ident: name,
  isoCountry: 'EE',
  longitude,
  latitude,
})

describe('airportsInViewport', () => {
  it('uses the exact viewport polygon and orders large airports before medium', () => {
    expect(
      airportsInViewport(
        [
          airport('3', 'BETA', 'medium', 0, 0),
          airport('2', 'CHARLIE', 'large', 0.5, 0.5),
          airport('1', 'ALPHA', 'large', 0, 0),
          airport('4', 'OUTSIDE', 'large', 2, 0),
        ],
        viewport,
      ).map(({ id }) => id),
    ).toEqual(['1', '2', '3'])
  })
})
