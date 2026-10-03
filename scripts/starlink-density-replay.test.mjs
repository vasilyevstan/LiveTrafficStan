import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  eciToGeodetic,
  gstime,
  json2satrec,
  propagate,
} from 'satellite.js'

const sourceTimeMs = Date.parse('2026-10-02T08:40:03.000Z')
const stepMs = 10 * 60_000
const stepCount = 145

const regions = {
  baltic: {
    minimumLatitude: 54,
    maximumLatitude: 70,
    minimumLongitude: 16,
    maximumLongitude: 40,
  },
  northernEurope: {
    minimumLatitude: 57.5,
    maximumLatitude: 80,
    minimumLongitude: -15,
    maximumLongitude: 40,
  },
}

const toOmm = (record) => ({
  OBJECT_NAME: record.name,
  OBJECT_ID: record.internationalDesignator,
  EPOCH: record.epoch,
  MEAN_MOTION: record.meanMotion,
  ECCENTRICITY: record.eccentricity,
  INCLINATION: record.inclination,
  RA_OF_ASC_NODE: record.rightAscensionOfAscendingNode,
  ARG_OF_PERICENTER: record.argumentOfPericenter,
  MEAN_ANOMALY: record.meanAnomaly,
  EPHEMERIS_TYPE: record.ephemerisType,
  CLASSIFICATION_TYPE: record.classificationType,
  NORAD_CAT_ID: record.noradCatalogId,
  ELEMENT_SET_NO: record.elementSetNumber,
  REV_AT_EPOCH: record.revolutionAtEpoch,
  BSTAR: record.bstar,
  MEAN_MOTION_DOT: record.meanMotionDot,
  MEAN_MOTION_DDOT: record.meanMotionDdot,
})

const normalizedLongitude = (longitude) =>
  ((longitude + 540) % 360) - 180

const summarize = (counts) => {
  const sorted = [...counts].sort((left, right) => left - right)
  return {
    mean:
      counts.reduce((total, count) => total + count, 0) /
      counts.length,
    median: sorted[Math.floor(sorted.length / 2)],
    p90: sorted[Math.floor((sorted.length - 1) * 0.9)],
    maximum: sorted.at(-1),
    emptyFraction:
      counts.filter((count) => count === 0).length / counts.length,
  }
}

const replay = async (path) => {
  const snapshot = JSON.parse(await readFile(path, 'utf8'))
  const satellites = snapshot.records.map((record) =>
    json2satrec(toOmm(record)),
  )
  const counts = Object.fromEntries(
    Object.keys(regions).map((region) => [region, []]),
  )

  for (let step = 0; step < stepCount; step += 1) {
    const date = new Date(sourceTimeMs + step * stepMs)
    const positions = satellites.flatMap((satellite) => {
      const propagated = propagate(satellite, date, {
        communityDecayCheckEnabled: true,
      })
      if (!propagated) return []
      const geodetic = eciToGeodetic(
        propagated.position,
        gstime(date),
      )
      return [
        {
          latitude: (geodetic.latitude * 180) / Math.PI,
          longitude: normalizedLongitude(
            (geodetic.longitude * 180) / Math.PI,
          ),
        },
      ]
    })

    for (const [name, region] of Object.entries(regions)) {
      counts[name].push(
        positions.filter(
          ({ latitude, longitude }) =>
            latitude >= region.minimumLatitude &&
            latitude <= region.maximumLatitude &&
            longitude >= region.minimumLongitude &&
            longitude <= region.maximumLongitude,
        ).length,
      )
    }
  }

  return Object.fromEntries(
    Object.entries(counts).map(([name, regionCounts]) => [
      name,
      summarize(regionCounts),
    ]),
  )
}

describe('Starlink northern-density replay', () => {
  it('materially improves Baltic and northern-European coverage with the fixed schema-2 sample', async () => {
    const [schema1, schema2] = await Promise.all([
      replay(
        'public/orbital-data/starlink-2026-10-02-v1/catalog.json',
      ),
      replay(
        'public/orbital-data/starlink-shell-balanced-2026-10-02-v1/catalog.json',
      ),
    ])

    expect(schema1.baltic).toMatchObject({
      median: 0,
      p90: 1,
      maximum: 3,
    })
    expect(schema1.baltic.mean).toBeCloseTo(0.268_965, 5)
    expect(schema1.baltic.emptyFraction).toBeCloseTo(
      0.758_621,
      5,
    )
    expect(schema2.baltic).toMatchObject({
      median: 2,
      p90: 4,
      maximum: 6,
    })
    expect(schema2.baltic.mean).toBeCloseTo(2.110_345, 5)
    expect(schema2.baltic.emptyFraction).toBeCloseTo(
      0.075_862,
      5,
    )

    expect(schema1.northernEurope.mean).toBeCloseTo(0.655_172, 5)
    expect(schema1.northernEurope.emptyFraction).toBeCloseTo(
      0.503_448,
      5,
    )
    expect(schema2.northernEurope).toMatchObject({
      median: 6,
      p90: 9,
      maximum: 11,
    })
    expect(schema2.northernEurope.mean).toBeCloseTo(
      5.613_793,
      5,
    )
    expect(schema2.northernEurope.emptyFraction).toBeCloseTo(
      0.006_897,
      5,
    )

    expect(schema2.baltic.mean).toBeGreaterThan(
      schema1.baltic.mean * 7,
    )
    expect(schema2.northernEurope.mean).toBeGreaterThan(
      schema1.northernEurope.mean * 8,
    )
  })
})
