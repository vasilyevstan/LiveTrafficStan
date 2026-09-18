import { describe, expect, it } from 'vitest'
import type { Vessel } from '../domain/traffic'
import {
  filterTrafficByRadius,
  filterVesselsByMinimumLength,
} from './filter'

const vessel = (
  id: string,
  lengthMeters?: number,
  latitude = 59,
): Vessel => ({
  id,
  kind: 'vessel',
  provider: 'test',
  mmsi: Number(id),
  position: {
    latitude,
    longitude: 24,
    observedAt: 1,
  },
  receivedAt: 1,
  lengthMeters,
  markerIcon: 'vessel',
  markerScale: 1,
})

describe('filterVesselsByMinimumLength', () => {
  it('keeps only vessels with a reliable length at or above the threshold', () => {
    expect(
      filterVesselsByMinimumLength(
        [vessel('1', 49), vessel('2', 50), vessel('3'), vessel('4', 140)],
        50,
      ).map((item) => item.id),
    ).toEqual(['2', '4'])
  })

  it('removes retained entities outside a changed radius immediately', () => {
    expect(
      filterTrafficByRadius(
        [vessel('1', 50), vessel('2', 50, 60)],
        { latitude: 59, longitude: 24 },
        20,
      ).map((item) => item.id),
    ).toEqual(['1'])
  })
})
