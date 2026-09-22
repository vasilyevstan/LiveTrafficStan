import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

const ISO2_PATTERN = /^[A-Z]{2}$/
const MID_PATTERN = /^[2-7][0-9]{2}$/
const HEX_ADDRESS_PATTERN = /^[0-9A-F]{6}$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const WIKIDATA_ITEM_PATTERN = /^https?:\/\/www\.wikidata\.org\/entity\/Q[1-9][0-9]*$/

const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const validText = (value, maximumLength) =>
  typeof value === 'string' &&
  value === value.trim() &&
  value.length > 0 &&
  value.length <= maximumLength &&
  !Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })

const compareText = (first, second) =>
  first < second ? -1 : first > second ? 1 : 0

export const sha256 = (value) =>
  createHash('sha256').update(value).digest('hex')

export const assertSha256Digest = (value, label) => {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} SHA-256 is invalid`)
  }
}

export const verifySha256 = (value, expected, label) => {
  assertSha256Digest(expected, label)
  const actual = sha256(value)
  if (actual !== expected) {
    throw new Error(
      `${label} SHA-256 mismatch; expected ${expected}, received ${actual}`,
    )
  }
}

const bindingValue = (binding, name, optional = false) => {
  const field = binding[name]
  if (field === undefined && optional) return null
  if (!isRecord(field) || !validText(field.value, 200)) {
    throw new Error(`Wikidata binding ${name} is invalid`)
  }
  return field.value
}

const canonicalizeWikidataResults = (input, fields) => {
  const value = JSON.parse(
    Buffer.isBuffer(input) ? input.toString('utf8') : input,
  )
  if (
    !isRecord(value) ||
    !isRecord(value.results) ||
    !Array.isArray(value.results.bindings)
  ) {
    throw new Error('Wikidata response is invalid')
  }

  const rows = value.results.bindings.map((binding) => {
    if (!isRecord(binding)) throw new Error('Wikidata binding is invalid')
    return Object.fromEntries(
      fields.map(({ name, optional = false }) => [
        name,
        bindingValue(binding, name, optional),
      ]),
    )
  })
  rows.sort((first, second) =>
    compareText(JSON.stringify(first), JSON.stringify(second)),
  )

  return {
    rows,
    contents: Buffer.from(`${JSON.stringify(rows)}\n`, 'utf8'),
  }
}

export const canonicalizeWikidataMidResults = (input) => {
  const result = canonicalizeWikidataResults(input, [
    { name: 'item' },
    { name: 'itemLabel' },
    { name: 'mid' },
    { name: 'iso2', optional: true },
  ])
  for (const row of result.rows) {
    if (
      !WIKIDATA_ITEM_PATTERN.test(row.item) ||
      !validText(row.itemLabel, 160) ||
      !/^[0-9]{3}$/.test(row.mid) ||
      (row.iso2 !== null && !ISO2_PATTERN.test(row.iso2))
    ) {
      throw new Error('Wikidata MID row is invalid')
    }
  }
  return result
}

export const canonicalizeWikidataIsoResults = (input) => {
  const result = canonicalizeWikidataResults(input, [
    { name: 'item' },
    { name: 'itemLabel' },
    { name: 'iso2' },
  ])
  for (const row of result.rows) {
    if (
      !WIKIDATA_ITEM_PATTERN.test(row.item) ||
      !validText(row.itemLabel, 160) ||
      !ISO2_PATTERN.test(row.iso2)
    ) {
      throw new Error('Wikidata ISO row is invalid')
    }
  }
  return result
}

const parseMidSource = (input) => {
  const value = JSON.parse(
    Buffer.isBuffer(input) ? input.toString('utf8') : input,
  )
  if (!isRecord(value)) throw new Error('MID source must be an object')

  return Object.entries(value)
    .map(([mid, record]) => {
      if (
        !MID_PATTERN.test(mid) ||
        !Array.isArray(record) ||
        record.length !== 4 ||
        !ISO2_PATTERN.test(record[0]) ||
        !/^[A-Z]{3}$/.test(record[1]) ||
        typeof record[2] !== 'string' ||
        !validText(record[3], 120)
      ) {
        throw new Error(`MID source record ${mid} is invalid`)
      }
      return {
        mid,
        iso2: record[0],
        name: record[3],
      }
    })
    .sort((first, second) => Number(first.mid) - Number(second.mid))
}

const parseAircraftSource = (input) => {
  const text = (
    Buffer.isBuffer(input) ? input.toString('utf8') : input
  ).replace(/^\uFEFF/, '')
  const lines = text.trim().split(/\r?\n/)
  if (lines.shift() !== 'state,noOfAddr,startAddr,endAddr') {
    throw new Error('ICAO24 source header is invalid')
  }

  return lines.map((line, index) => {
    if (line.includes('"')) {
      throw new Error(`ICAO24 source row ${index + 2} contains quoting`)
    }
    const values = line.split(',')
    if (values.length !== 4) {
      throw new Error(`ICAO24 source row ${index + 2} is invalid`)
    }
    const [state, noOfAddr, startAddr, endAddr] = values
    if (
      !validText(state, 120) ||
      !HEX_ADDRESS_PATTERN.test(noOfAddr) ||
      !HEX_ADDRESS_PATTERN.test(startAddr) ||
      !HEX_ADDRESS_PATTERN.test(endAddr)
    ) {
      throw new Error(`ICAO24 source row ${index + 2} is invalid`)
    }
    const start = Number.parseInt(startAddr, 16)
    const end = Number.parseInt(endAddr, 16)
    const claimedCount = Number.parseInt(noOfAddr, 16)
    if (start > end) {
      throw new Error(`ICAO24 source row ${index + 2} has a reversed range`)
    }
    return {
      state,
      noOfAddr,
      startAddr,
      endAddr,
      start,
      end,
      claimedCount,
    }
  })
}

const assertNonOverlappingRanges = (ranges, label) => {
  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1]
    const current = ranges[index]
    if (current[0] <= previous[1]) {
      throw new Error(`${label} contains overlapping ranges`)
    }
  }
}

export const parseProjectedCountryAllocations = (value) => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !validText(value.outputVersion, 80) ||
    !isRecord(value.mids) ||
    !Array.isArray(value.aircraftRanges)
  ) {
    throw new Error('Country allocation projection is invalid')
  }

  const mids = {}
  for (const [mid, record] of Object.entries(value.mids)) {
    if (
      !MID_PATTERN.test(mid) ||
      !Array.isArray(record) ||
      record.length !== 2 ||
      !validText(record[0], 120) ||
      !ISO2_PATTERN.test(record[1])
    ) {
      throw new Error(`Country allocation MID ${mid} is invalid`)
    }
    mids[mid] = [record[0], record[1]]
  }

  const aircraftRanges = value.aircraftRanges.map((record) => {
    if (
      !Array.isArray(record) ||
      record.length !== 4 ||
      !Number.isSafeInteger(record[0]) ||
      !Number.isSafeInteger(record[1]) ||
      record[0] < 0 ||
      record[1] > 0xffffff ||
      record[0] > record[1] ||
      !validText(record[2], 120) ||
      !ISO2_PATTERN.test(record[3])
    ) {
      throw new Error('Country allocation aircraft range is invalid')
    }
    return [record[0], record[1], record[2], record[3]]
  })
  assertNonOverlappingRanges(aircraftRanges, 'Country allocation projection')

  return {
    schemaVersion: value.schemaVersion,
    outputVersion: value.outputVersion,
    mids,
    aircraftRanges,
  }
}

export const buildCountryAllocationsProjection = ({
  midSource,
  midCrosscheck,
  aircraftSource,
  isoCrosswalk,
  stateIsoAliases,
  outputVersion,
}) => {
  const midRecords = parseMidSource(midSource)
  const midRows = canonicalizeWikidataMidResults(midCrosscheck).rows
  const isoRows = canonicalizeWikidataIsoResults(isoCrosswalk).rows

  const midRowsByMid = new Map()
  for (const row of midRows) {
    const rows = midRowsByMid.get(row.mid) ?? []
    rows.push(row)
    midRowsByMid.set(row.mid, rows)
  }
  if (
    midRowsByMid.size !== midRecords.length ||
    midRecords.some(({ mid }) => !midRowsByMid.has(mid))
  ) {
    throw new Error('MID source and Wikidata cross-check keys differ')
  }

  const mids = {}
  const excludedMids = []
  for (const record of midRecords) {
    const rows = midRowsByMid.get(record.mid)
    const isoCodes = new Set(rows.map(({ iso2 }) => iso2))
    if (
      rows.some(({ iso2 }) => iso2 === null) ||
      isoCodes.size !== 1 ||
      !isoCodes.has(record.iso2)
    ) {
      excludedMids.push(Number(record.mid))
      continue
    }
    mids[record.mid] = [record.name, record.iso2]
  }

  const isoCodes = new Set(isoRows.map(({ iso2 }) => iso2))
  const isoCodesByLabel = new Map()
  for (const row of isoRows) {
    const codes = isoCodesByLabel.get(row.itemLabel) ?? new Set()
    codes.add(row.iso2)
    isoCodesByLabel.set(row.itemLabel, codes)
  }
  if (!isRecord(stateIsoAliases)) {
    throw new Error('ICAO24 state aliases are invalid')
  }
  for (const [state, iso2] of Object.entries(stateIsoAliases)) {
    if (!validText(state, 120) || !ISO2_PATTERN.test(iso2) || !isoCodes.has(iso2)) {
      throw new Error(`ICAO24 state alias ${state} is invalid`)
    }
  }

  const aircraftRecords = parseAircraftSource(aircraftSource)
  const sortedSourceRanges = aircraftRecords
    .map(({ start, end, state }) => [start, end, state])
    .sort((first, second) => first[0] - second[0])
  assertNonOverlappingRanges(sortedSourceRanges, 'ICAO24 source')

  const aircraftRanges = []
  const excludedAircraftRows = []
  for (const record of aircraftRecords) {
    let reason
    if (/^ICAO\([12]\)$/.test(record.state)) {
      reason = 'special-use'
    } else if (record.end - record.start + 1 !== record.claimedCount) {
      reason = 'count-mismatch'
    }

    const exactCodes = isoCodesByLabel.get(record.state)
    const exactIso2 =
      exactCodes?.size === 1 ? [...exactCodes][0] : undefined
    const iso2 = exactIso2 ?? stateIsoAliases[record.state]
    if (!reason && (!iso2 || !isoCodes.has(iso2))) {
      reason = 'unresolved-iso'
    }

    if (reason) {
      excludedAircraftRows.push({
        state: record.state,
        startAddr: record.startAddr,
        reason,
      })
      continue
    }
    aircraftRanges.push([
      record.start,
      record.end,
      record.state,
      iso2,
    ])
  }
  aircraftRanges.sort((first, second) => first[0] - second[0])
  assertNonOverlappingRanges(aircraftRanges, 'Projected ICAO24 data')
  excludedAircraftRows.sort((first, second) =>
    compareText(first.startAddr, second.startAddr),
  )

  const projected = {
    schemaVersion: 1,
    outputVersion,
    mids,
    aircraftRanges,
  }
  parseProjectedCountryAllocations(projected)
  const contents = Buffer.from(`${JSON.stringify(projected)}\n`, 'utf8')

  return {
    contents,
    counts: {
      midSourceRecords: midRecords.length,
      midCrosscheckRows: midRows.length,
      projectedMids: Object.keys(mids).length,
      excludedMids,
      aircraftSourceRecords: aircraftRecords.length,
      projectedAircraftRanges: aircraftRanges.length,
      excludedAircraftRows,
      rawBytes: contents.byteLength,
      gzipBytes: gzipSync(contents, { level: 9, mtime: 0 }).byteLength,
      sha256: sha256(contents),
    },
  }
}
