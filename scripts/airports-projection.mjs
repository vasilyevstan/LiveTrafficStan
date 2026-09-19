import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

const REQUIRED_COLUMNS = [
  'id',
  'ident',
  'type',
  'name',
  'latitude_deg',
  'longitude_deg',
  'iso_country',
  'municipality',
  'icao_code',
  'iata_code',
]
const SELECTED_TYPES = new Set(['large_airport', 'medium_airport'])
const ALLOWED_PROPERTIES = new Set([
  'name',
  'kind',
  'ident',
  'municipality',
  'isoCountry',
  'icaoCode',
  'iataCode',
])
const REQUIRED_PROPERTIES = ['name', 'kind', 'ident', 'isoCountry']

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

export const parseCsv = (input) => {
  const text = input.startsWith('\uFEFF') ? input.slice(1) : input
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  const finishField = () => {
    row.push(field)
    field = ''
  }
  const finishRow = () => {
    finishField()
    rows.push(row)
    row = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += character
      }
      continue
    }

    if (character === '"') {
      if (field.length > 0) throw new Error('CSV quote is invalid')
      quoted = true
    } else if (character === ',') {
      finishField()
    } else if (character === '\n') {
      finishRow()
    } else if (character === '\r') {
      if (text[index + 1] === '\n') index += 1
      finishRow()
    } else {
      field += character
    }
  }

  if (quoted) throw new Error('CSV quoted field is unterminated')
  if (field.length > 0 || row.length > 0) finishRow()
  return rows
}

const validText = (value, maximumLength) =>
  typeof value === 'string' &&
  value === value.trim() &&
  value.length > 0 &&
  value.length <= maximumLength &&
  !hasControlCharacter(value)

const optionalText = (value, maximumLength) =>
  value === undefined || validText(value, maximumLength)

const rowRecord = (headers, values) => {
  if (values.length !== headers.length) {
    throw new Error('OurAirports CSV row has an invalid column count')
  }
  return Object.fromEntries(
    headers.map((header, index) => [header, values[index]]),
  )
}

const projectedFeature = (row) => {
  if (!/^[1-9][0-9]*$/.test(row.id)) {
    throw new Error(`OurAirports airport ID ${row.id} is invalid`)
  }
  const id = Number(row.id)
  const name = row.name.trim()
  const ident = row.ident.trim().toUpperCase()
  const isoCountry = row.iso_country.trim().toUpperCase()
  const municipality = row.municipality.trim()
  const icaoCode = row.icao_code.trim().toUpperCase()
  const iataCode = row.iata_code.trim().toUpperCase()
  const longitude = Number(row.longitude_deg)
  const latitude = Number(row.latitude_deg)
  const kind = row.type === 'large_airport' ? 'large' : 'medium'

  if (
    !Number.isSafeInteger(id) ||
    !validText(name, 160) ||
    !validText(ident, 16) ||
    !/^[A-Z]{2}$/.test(isoCountry) ||
    (municipality && !validText(municipality, 120)) ||
    (icaoCode && !/^[A-Z0-9]{4}$/.test(icaoCode)) ||
    (iataCode && !/^[A-Z0-9]{3}$/.test(iataCode)) ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new Error(`OurAirports airport ${row.id} is invalid`)
  }

  const properties = { name, kind, ident, isoCountry }
  if (municipality) properties.municipality = municipality
  if (icaoCode) properties.icaoCode = icaoCode
  if (iataCode) properties.iataCode = iataCode

  return {
    type: 'Feature',
    id: row.id,
    properties,
    geometry: {
      type: 'Point',
      coordinates: [
        Number(longitude.toFixed(6)),
        Number(latitude.toFixed(6)),
      ],
    },
  }
}

export const parseProjectedAirports = (value) => {
  if (
    typeof value !== 'object' ||
    value === null ||
    value.type !== 'FeatureCollection' ||
    !Array.isArray(value.features)
  ) {
    throw new Error('Airport projection must be a GeoJSON FeatureCollection')
  }

  const airports = []
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
      Array.isArray(feature.properties) ||
      typeof feature.geometry !== 'object' ||
      feature.geometry === null ||
      feature.geometry.type !== 'Point' ||
      !Array.isArray(feature.geometry.coordinates) ||
      feature.geometry.coordinates.length !== 2
    ) {
      throw new Error('Airport projection contains an invalid feature')
    }

    const propertyKeys = Object.keys(feature.properties)
    if (
      propertyKeys.some((key) => !ALLOWED_PROPERTIES.has(key)) ||
      REQUIRED_PROPERTIES.some(
        (key) => !Object.hasOwn(feature.properties, key),
      )
    ) {
      throw new Error('Airport projection contains invalid properties')
    }

    const numericId = Number(feature.id)
    const {
      name,
      kind,
      ident,
      municipality,
      isoCountry,
      icaoCode,
      iataCode,
    } = feature.properties
    const [longitude, latitude] = feature.geometry.coordinates
    if (
      !Number.isSafeInteger(numericId) ||
      numericId <= previousId ||
      !validText(name, 160) ||
      (kind !== 'large' && kind !== 'medium') ||
      !validText(ident, 16) ||
      !optionalText(municipality, 120) ||
      typeof isoCountry !== 'string' ||
      !/^[A-Z]{2}$/.test(isoCountry) ||
      (icaoCode !== undefined &&
        (typeof icaoCode !== 'string' ||
          !/^[A-Z0-9]{4}$/.test(icaoCode))) ||
      (iataCode !== undefined &&
        (typeof iataCode !== 'string' ||
          !/^[A-Z0-9]{3}$/.test(iataCode))) ||
      typeof longitude !== 'number' ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      typeof latitude !== 'number' ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new Error(`Airport projection feature ${feature.id} is invalid`)
    }

    previousId = numericId
    airports.push({
      id: feature.id,
      name,
      kind,
      ident,
      municipality,
      isoCountry,
      icaoCode,
      iataCode,
      longitude,
      latitude,
    })
  }
  return airports
}

export const buildAirportsProjection = (sourceText) => {
  const rows = parseCsv(sourceText)
  if (rows.length < 2) throw new Error('OurAirports CSV is empty')

  const headers = rows[0]
  if (
    new Set(headers).size !== headers.length ||
    REQUIRED_COLUMNS.some((column) => !headers.includes(column))
  ) {
    throw new Error('OurAirports CSV header is invalid')
  }

  const sourceRows = rows
    .slice(1)
    .filter((row) => row.length > 1 || row[0] !== '')
    .map((row) => rowRecord(headers, row))
  const features = sourceRows
    .filter((row) => SELECTED_TYPES.has(row.type))
    .map(projectedFeature)
    .sort((first, second) => Number(first.id) - Number(second.id))
  const projected = {
    type: 'FeatureCollection',
    features,
  }
  parseProjectedAirports(projected)

  const contents = Buffer.from(`${JSON.stringify(projected)}\n`, 'utf8')
  const kindCounts = {}
  for (const feature of features) {
    const kind = feature.properties.kind
    kindCounts[kind] = (kindCounts[kind] ?? 0) + 1
  }

  return {
    contents,
    counts: {
      sourceRecords: sourceRows.length,
      projectedRecords: features.length,
      rawBytes: contents.byteLength,
      gzipBytes: gzipSync(contents, { level: 9, mtime: 0 }).byteLength,
      sha256: sha256(contents),
      kindCounts,
    },
  }
}
