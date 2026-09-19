import { describe, expect, it } from 'vitest'
import {
  buildPortsProjection,
  parseProjectedPorts,
} from './ports-projection.mjs'

const feature = (id, name, rank, longitude, latitude) => ({
  type: 'Feature',
  properties: {
    ne_id: id,
    name,
    scalerank: rank,
    website: 'https://ignored.example',
  },
  geometry: {
    type: 'Point',
    coordinates: [longitude, latitude],
  },
})

describe('port projection', () => {
  it('retains only stable identity, name, rank, and coordinates in ID order', () => {
    const projection = buildPortsProjection({
      type: 'FeatureCollection',
      features: [
        feature(20, 'SECOND', 8, 25, 60),
        feature(10, 'FIRST', 3, 24, 59),
      ],
    })
    const parsed = parseProjectedPorts(
      JSON.parse(projection.contents.toString('utf8')),
    )

    expect(parsed).toEqual([
      {
        id: '10',
        name: 'FIRST',
        rank: 3,
        longitude: 24,
        latitude: 59,
      },
      {
        id: '20',
        name: 'SECOND',
        rank: 8,
        longitude: 25,
        latitude: 60,
      },
    ])
    expect(projection.counts.rankCounts).toEqual({ 3: 1, 8: 1 })
    expect(projection.contents.toString('utf8')).not.toContain('website')
  })

  it('rejects malformed, duplicate, and unsorted projected records', () => {
    expect(() =>
      buildPortsProjection({
        type: 'FeatureCollection',
        features: [feature(1, '', 3, 24, 59)],
      }),
    ).toThrow(/invalid/)

    const duplicate = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: '1',
          properties: { name: 'FIRST', rank: 3 },
          geometry: { type: 'Point', coordinates: [24, 59] },
        },
        {
          type: 'Feature',
          id: '1',
          properties: { name: 'SECOND', rank: 4 },
          geometry: { type: 'Point', coordinates: [25, 60] },
        },
      ],
    }
    expect(() => parseProjectedPorts(duplicate)).toThrow(/invalid/)
  })
})
