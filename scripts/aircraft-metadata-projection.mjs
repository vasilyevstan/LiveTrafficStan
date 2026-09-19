import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

const HEX_ADDRESS = /^[0-9A-F]{6}$/
const HEX_SUFFIX = /^[0-9A-F]{4}$/
const REGISTRATION = /^[\x21-\x7e](?:[\x20-\x7e]{0,30}[\x21-\x7e])?$/
const TYPE_CODE = /^[A-Z0-9]{1,8}$/
const CONFIGURATION = /^[A-Z0-9-]{1,8}$/
const WAKE_CATEGORY = /^[LMHJ]$/
const hasControlCharacter = (value) =>
  [...value].some((character) => {
    const code = character.codePointAt(0)
    return code !== undefined && (code <= 0x1f || code === 0x7f)
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

const normalizedText = (value, maximumLength) => {
  if (typeof value !== 'string') return undefined
  if (hasControlCharacter(value)) return undefined
  const normalized = value.trim()
  if (
    !normalized ||
    normalized.length > maximumLength
  ) {
    return undefined
  }
  return normalized
}

const normalizedCode = (value, pattern, maximumLength) => {
  const text = normalizedText(value, maximumLength)?.toUpperCase()
  return text && pattern.test(text) ? text : undefined
}

export const normalizeAircraftSourceRow = (hex, value) => {
  const normalizedHex = normalizedCode(hex, HEX_ADDRESS, 6)
  if (!normalizedHex || !Array.isArray(value) || value.length < 2) {
    return undefined
  }

  const registration = normalizedCode(value[0], REGISTRATION, 32)
  const typeCode = normalizedCode(value[1], TYPE_CODE, 8)
  if (!registration) return undefined

  return {
    hex: normalizedHex,
    registration,
    typeCode,
  }
}

export const projectAircraftTypes = (sourceTypes) => {
  if (
    typeof sourceTypes !== 'object' ||
    sourceTypes === null ||
    Array.isArray(sourceTypes)
  ) {
    throw new Error('Aircraft type source must be an object')
  }

  const projected = {}
  for (const typeCode of Object.keys(sourceTypes).sort()) {
    const normalizedTypeCode = normalizedCode(typeCode, TYPE_CODE, 8)
    const source = sourceTypes[typeCode]
    if (!normalizedTypeCode || !Array.isArray(source) || source.length < 3) {
      continue
    }

    const modelDescription = normalizedText(source[0], 160)
    if (!modelDescription) continue
    const configuration = normalizedCode(source[1], CONFIGURATION, 8)
    const wakeCategory = normalizedCode(source[2], WAKE_CATEGORY, 1)
    projected[normalizedTypeCode] = [
      modelDescription,
      configuration ?? '',
      wakeCategory ?? '',
    ]
  }

  return projected
}

const gzipBytes = (value) =>
  gzipSync(value, { level: 9, mtime: 0 }).byteLength

const median = (values) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((first, second) => first - second)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return Math.floor((sorted[middle - 1] + sorted[middle]) / 2)
}

export const buildAircraftMetadataProjection = (
  sourceAircraft,
  sourceTypes,
) => {
  if (
    typeof sourceAircraft !== 'object' ||
    sourceAircraft === null ||
    Array.isArray(sourceAircraft)
  ) {
    throw new Error('Aircraft source must be an object')
  }

  const types = projectAircraftTypes(sourceTypes)
  const sourceRows = []
  const registrationCounts = new Map()

  for (const [hex, value] of Object.entries(sourceAircraft)) {
    const row = normalizeAircraftSourceRow(hex, value)
    if (!row) continue
    sourceRows.push(row)
    registrationCounts.set(
      row.registration,
      (registrationCounts.get(row.registration) ?? 0) + 1,
    )
  }

  const duplicateRegistrations = new Set(
    [...registrationCounts]
      .filter(([, count]) => count > 1)
      .map(([registration]) => registration),
  )
  const shardRows = new Map()
  let availableRecords = 0
  let ambiguousRecords = 0

  for (const row of sourceRows) {
    if (!row.typeCode || !types[row.typeCode]) continue
    const prefix = row.hex.slice(0, 2)
    const suffix = row.hex.slice(2)
    const ambiguous = duplicateRegistrations.has(row.registration)
    const lines = shardRows.get(prefix) ?? []
    lines.push({
      suffix,
      registration: row.registration,
      typeCode: row.typeCode,
      ambiguous,
    })
    shardRows.set(prefix, lines)
    if (ambiguous) ambiguousRecords += 1
    else availableRecords += 1
  }

  const shards = {}
  const shardMetrics = []
  for (const prefix of [...shardRows.keys()].sort()) {
    const rows = shardRows.get(prefix)
    rows.sort((first, second) => first.suffix.localeCompare(second.suffix))
    const duplicateSuffix = rows.find(
      (row, index) => index > 0 && row.suffix === rows[index - 1].suffix,
    )
    if (duplicateSuffix) {
      throw new Error(`Duplicate ICAO24 suffix in ${prefix}: ${duplicateSuffix.suffix}`)
    }

    const contents = Buffer.from(
      rows
        .map(
          ({ suffix, registration, typeCode, ambiguous }) =>
            `${suffix}\t${registration}\t${typeCode}${ambiguous ? '\tA' : ''}\n`,
        )
        .join(''),
      'utf8',
    )
    const ambiguousCount = rows.filter((row) => row.ambiguous).length
    const metrics = {
      path: `shards/${prefix}.tsv`,
      records: rows.length,
      ambiguousRecords: ambiguousCount,
      bytes: contents.byteLength,
      gzipBytes: gzipBytes(contents),
      sha256: sha256(contents),
    }
    shards[prefix] = { contents, metrics }
    shardMetrics.push(metrics)
  }

  const rawSizes = shardMetrics.map(({ bytes }) => bytes)
  const gzipSizes = shardMetrics.map(({ gzipBytes: bytes }) => bytes)
  return {
    types,
    shards,
    counts: {
      sourceAircraftRecords: Object.keys(sourceAircraft).length,
      sourceTypeRecords: Object.keys(sourceTypes).length,
      projectedTypeRecords: Object.keys(types).length,
      availableRecords,
      ambiguousRecords,
      duplicateRegistrations: duplicateRegistrations.size,
      shardCount: shardMetrics.length,
      shardRawBytes: rawSizes.reduce((total, value) => total + value, 0),
      shardGzipBytes: gzipSizes.reduce((total, value) => total + value, 0),
      largestShardRawBytes: Math.max(0, ...rawSizes),
      largestShardGzipBytes: Math.max(0, ...gzipSizes),
      medianShardGzipBytes: median(gzipSizes),
    },
  }
}

export const parseProjectedShard = (contents, types) => {
  if (typeof contents !== 'string') {
    throw new Error('Aircraft metadata shard must be text')
  }
  if (!contents.endsWith('\n')) {
    throw new Error('Aircraft metadata shard must end with a newline')
  }

  const records = new Map()
  let previousSuffix = ''
  for (const line of contents.slice(0, -1).split('\n')) {
    const fields = line.split('\t')
    if (fields.length !== 3 && fields.length !== 4) {
      throw new Error('Aircraft metadata shard has an invalid column count')
    }

    const [suffix, registration, typeCode, status] = fields
    if (!HEX_SUFFIX.test(suffix)) {
      throw new Error(`Invalid aircraft metadata suffix: ${suffix}`)
    }
    if (!REGISTRATION.test(registration) || registration.length > 32) {
      throw new Error(`Invalid aircraft metadata registration: ${registration}`)
    }
    if (!TYPE_CODE.test(typeCode) || !types[typeCode]) {
      throw new Error(`Invalid aircraft metadata type: ${typeCode}`)
    }
    if (fields.length === 4 && status !== 'A') {
      throw new Error(`Invalid aircraft metadata status: ${status}`)
    }
    if (previousSuffix && suffix <= previousSuffix) {
      throw new Error('Aircraft metadata shard is not uniquely sorted')
    }

    previousSuffix = suffix
    records.set(suffix, {
      registration,
      typeCode,
      ambiguous: status === 'A',
    })
  }

  return records
}
