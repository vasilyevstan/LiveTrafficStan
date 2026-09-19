import { gzipSync } from 'node:zlib'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sourceSettings from '../src/config/airportsSource.json' with {
  type: 'json',
}
import {
  parseProjectedAirports,
  sha256,
} from './airports-projection.mjs'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const outputDirectory = path.join(
  repositoryRoot,
  'public',
  'airports',
  sourceSettings.projection.outputVersion,
)

const fail = (message) => {
  throw new Error(`Airport data integrity check failed: ${message}`)
}

const rootFiles = (await readdir(outputDirectory)).sort()
if (JSON.stringify(rootFiles) !== JSON.stringify(['airports.geojson'])) {
  fail('versioned directory contains unexpected files')
}

const contents = await readFile(path.join(outputDirectory, 'airports.geojson'))
const expected = sourceSettings.projection.expected
if (contents.byteLength !== expected.rawBytes) {
  fail(`raw bytes expected ${expected.rawBytes}, received ${contents.byteLength}`)
}
if (sha256(contents) !== expected.sha256) {
  fail('generated SHA-256 does not match the source manifest')
}
const gzipBytes = gzipSync(contents, { level: 9, mtime: 0 }).byteLength
if (gzipBytes !== expected.gzipBytes) {
  fail(`gzip bytes expected ${expected.gzipBytes}, received ${gzipBytes}`)
}

const airports = parseProjectedAirports(
  JSON.parse(contents.toString('utf8')),
)
if (airports.length !== expected.projectedRecords) {
  fail(
    `records expected ${expected.projectedRecords}, received ${airports.length}`,
  )
}

const kindCounts = {}
for (const airport of airports) {
  kindCounts[airport.kind] = (kindCounts[airport.kind] ?? 0) + 1
}
if (
  JSON.stringify(kindCounts) !== JSON.stringify(expected.kindCounts)
) {
  fail('kind distribution does not match the source manifest')
}

const tallinn = airports.find(({ id }) => id === '2301')
if (
  tallinn?.name !== 'Lennart Meri Tallinn Airport' ||
  tallinn.icaoCode !== 'EETN' ||
  tallinn.iataCode !== 'TLL'
) {
  fail('Tallinn fixture does not match the pinned source')
}

console.log(
  `Airports ${sourceSettings.projection.outputVersion}: ${airports.length} points, ${contents.byteLength} raw bytes, ${gzipBytes} gzip-9 bytes`,
)
