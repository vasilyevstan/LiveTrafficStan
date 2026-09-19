import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

const hasControlCharacter = (value) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })

export const sha256 = (value) =>
  createHash('sha256').update(value).digest('hex')

export const verifySha256 = (value, expected, label) => {
  const actual = sha256(value)
  if (actual !== expected) {
    throw new Error(
      `${label} SHA-256 mismatch; expected ${expected}, received ${actual}`,
    )
  }
}

const validName = (value) =>
  typeof value === 'string' &&
  value === value.trim() &&
  value.length > 0 &&
  value.length <= 160 &&
  !hasControlCharacter(value)

const normalizePortFeature = (feature) => {
  if (
    typeof feature !== 'object' ||
    feature === null ||
    feature.type !== 'Feature' ||
    typeof feature.properties !== 'object' ||
    feature.properties === null ||
    typeof feature.geometry !== 'object' ||
    feature.geometry === null ||
    feature.geometry.type !== 'Point' ||
    !Array.isArray(feature.geometry.coordinates) ||
    feature.geometry.coordinates.length !== 2
  ) {
    throw new Error('Natural Earth port feature has an invalid shape')
  }

  const id = feature.properties.ne_id
  const name = feature.properties.name
  const rank = feature.properties.scalerank
  const [longitude, latitude] = feature.geometry.coordinates
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !validName(name) ||
    !Number.isInteger(rank) ||
    rank < 3 ||
    rank > 8 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new Error(`Natural Earth port feature ${String(id)} is invalid`)
  }

  return {
    type: 'Feature',
    id: String(id),
    properties: {
      name,
      rank,
    },
    geometry: {
      type: 'Point',
      coordinates: [longitude, latitude],
    },
  }
}

export const parseProjectedPorts = (value) => {
  if (
    typeof value !== 'object' ||
    value === null ||
    value.type !== 'FeatureCollection' ||
    !Array.isArray(value.features)
  ) {
    throw new Error('Port projection must be a GeoJSON FeatureCollection')
  }

  const ports = []
  const ids = new Set()
  let previousId = 0
  for (const feature of value.features) {
    if (
      typeof feature !== 'object' ||
      feature === null ||
      feature.type !== 'Feature' ||
      typeof feature.id !== 'string' ||
      !/^[1-9][0-9]*$/.test(feature.id) ||
      typeof feature.properties !== 'object' ||
      feature.properties === null ||
      Object.keys(feature.properties).sort().join(',') !== 'name,rank' ||
      typeof feature.geometry !== 'object' ||
      feature.geometry === null ||
      feature.geometry.type !== 'Point' ||
      !Array.isArray(feature.geometry.coordinates) ||
      feature.geometry.coordinates.length !== 2
    ) {
      throw new Error('Port projection contains an invalid feature')
    }

    const numericId = Number(feature.id)
    const { name, rank } = feature.properties
    const [longitude, latitude] = feature.geometry.coordinates
    if (
      !Number.isSafeInteger(numericId) ||
      numericId <= previousId ||
      ids.has(feature.id) ||
      !validName(name) ||
      !Number.isInteger(rank) ||
      rank < 3 ||
      rank > 8 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new Error(`Port projection feature ${feature.id} is invalid`)
    }

    previousId = numericId
    ids.add(feature.id)
    ports.push({
      id: feature.id,
      name,
      rank,
      longitude,
      latitude,
    })
  }

  return ports
}

export const buildPortsProjection = (source) => {
  if (
    typeof source !== 'object' ||
    source === null ||
    source.type !== 'FeatureCollection' ||
    !Array.isArray(source.features)
  ) {
    throw new Error('Natural Earth port source must be a FeatureCollection')
  }

  const features = source.features
    .map(normalizePortFeature)
    .sort((first, second) => Number(first.id) - Number(second.id))
  const projected = {
    type: 'FeatureCollection',
    features,
  }
  parseProjectedPorts(projected)

  const contents = Buffer.from(`${JSON.stringify(projected)}\n`, 'utf8')
  const rankCounts = {}
  for (const feature of features) {
    const rank = feature.properties.rank
    rankCounts[rank] = (rankCounts[rank] ?? 0) + 1
  }

  return {
    contents,
    counts: {
      sourceRecords: source.features.length,
      projectedRecords: features.length,
      rawBytes: contents.byteLength,
      gzipBytes: gzipSync(contents, { level: 9, mtime: 0 }).byteLength,
      sha256: sha256(contents),
      rankCounts,
    },
  }
}
