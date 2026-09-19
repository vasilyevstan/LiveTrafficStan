import { gzipSync } from 'node:zlib'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sourceSettings from '../src/config/countryAllocationsSource.json' with {
  type: 'json',
}
import {
  assertSha256Digest,
  parseProjectedCountryAllocations,
  sha256,
} from './country-allocations-projection.mjs'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const outputPath = path.join(
  repositoryRoot,
  'src',
  'config',
  'countryAllocations.generated.json',
)

const fail = (message) => {
  throw new Error(`Country allocation integrity check failed: ${message}`)
}

for (const [label, value] of [
  ['MID source', sourceSettings.sources.mids.sourceSha256],
  ['ICAO24 source', sourceSettings.sources.icao24.sourceSha256],
  [
    'Canonical Wikidata MID cross-check',
    sourceSettings.sources.wikidataMidCrosscheck.canonicalSha256,
  ],
  [
    'Canonical Wikidata ISO crosswalk',
    sourceSettings.sources.wikidataIsoCrosswalk.canonicalSha256,
  ],
  ['Generated country allocations', sourceSettings.projection.expected.sha256],
]) {
  assertSha256Digest(value, label)
}

const contents = await readFile(outputPath)
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

const projected = parseProjectedCountryAllocations(
  JSON.parse(contents.toString('utf8')),
)
if (projected.outputVersion !== sourceSettings.projection.outputVersion) {
  fail('output version does not match the source manifest')
}
if (Object.keys(projected.mids).length !== expected.projectedMids) {
  fail('MID count does not match the source manifest')
}
if (projected.aircraftRanges.length !== expected.projectedAircraftRanges) {
  fail('aircraft range count does not match the source manifest')
}
if (
  JSON.stringify(projected.mids['230']) !==
    JSON.stringify(['Finland', 'FI']) ||
  JSON.stringify(projected.mids['276']) !==
    JSON.stringify(['Estonia', 'EE']) ||
  Object.hasOwn(projected.mids, '306')
) {
  fail('MID fixtures do not match the reviewed projection')
}

const aircraftAt = (hex) => {
  const address = Number.parseInt(hex, 16)
  return projected.aircraftRanges.find(
    ([start, end]) => address >= start && address <= end,
  )
}
if (
  JSON.stringify(aircraftAt('511000')?.slice(2)) !==
    JSON.stringify(['Estonia', 'EE']) ||
  JSON.stringify(aircraftAt('5117FF')?.slice(2)) !==
    JSON.stringify(['Estonia', 'EE']) ||
  aircraftAt('035000') !== undefined ||
  aircraftAt('F00000') !== undefined
) {
  fail('aircraft range fixtures do not match the reviewed projection')
}

console.log(
  `Country allocations ${projected.outputVersion}: ${
    Object.keys(projected.mids).length
  } MIDs, ${projected.aircraftRanges.length} aircraft ranges, ${
    contents.byteLength
  } raw bytes, ${gzipBytes} gzip-9 bytes`,
)
