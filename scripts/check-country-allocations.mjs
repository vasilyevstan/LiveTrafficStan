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

const flagContents = await readFile(
  path.join(repositoryRoot, 'src/config/vesselFlags.generated.json'),
)
const flagAsset = JSON.parse(flagContents.toString('utf8'))
if (
  flagAsset.width !== 28 ||
  flagAsset.height !== 22 ||
  flagAsset.pixelRatio !== 2 ||
  flagAsset.source.repository !== 'https://github.com/lipis/flag-icons' ||
  flagAsset.source.directory !== 'flags/4x3' ||
  !/^[0-9a-f]{40}$/.test(flagAsset.source.commit) ||
  flagAsset.source.license !== 'MIT'
) {
  fail('vessel flag artwork contract is invalid')
}
assertSha256Digest(flagAsset.source.sourceSha256, 'Flag source artwork')
assertSha256Digest(flagAsset.sha256, 'Flag pixels')
const expectedCountries = [
  ...new Set(Object.values(projected.mids).map((record) => record[1])),
].sort()
if (JSON.stringify(Object.keys(flagAsset.flags)) !== JSON.stringify(expectedCountries)) {
  fail('vessel flag countries differ from the existing MID allocation')
}
for (const [iso2, encoded] of Object.entries(flagAsset.flags)) {
  const pixels = Buffer.from(encoded, 'base64')
  if (
    pixels.byteLength !== flagAsset.width * flagAsset.height * 4 ||
    pixels.toString('base64') !== encoded
  ) {
    fail(`incomplete or invalid flag raster: ${iso2}`)
  }
}
if (sha256(JSON.stringify(flagAsset.flags)) !== flagAsset.sha256) {
  fail('vessel flag pixel checksum does not match')
}
const flagLicense = await readFile(
  path.join(repositoryRoot, 'public/licenses/vessel-flags-MIT.txt'),
)
if (sha256(flagLicense) !== flagAsset.source.licenseSha256) {
  fail('the complete vessel flag artwork license is missing or changed')
}
const flagGzipBytes = gzipSync(flagContents, { level: 9, mtime: 0 }).byteLength
if (flagContents.byteLength > 1024 * 1024 || flagGzipBytes > 64 * 1024) {
  fail('vessel flag artwork exceeds its one-MiB raw / 64-KiB gzip budget')
}
console.log(
  `Vessel flags: ${expectedCountries.length} bundled 14x11 CSS-pixel badges, ` +
    `${flagContents.byteLength} raw bytes, ${flagGzipBytes} gzip-9 bytes`,
)
