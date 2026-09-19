import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sourceSettings from '../src/config/countryAllocationsSource.json' with {
  type: 'json',
}
import {
  assertSha256Digest,
  buildCountryAllocationsProjection,
  canonicalizeWikidataIsoResults,
  canonicalizeWikidataMidResults,
  verifySha256,
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

const fetchBytes = async (url, maximumBytes, accept) => {
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      'User-Agent':
        'LiveTrafficStan country-allocation maintainer (+https://github.com/vasilyevstan/LiveTrafficStan)',
    },
  })
  if (!response.ok) {
    throw new Error(`Country allocation source returned HTTP ${response.status}`)
  }
  const contentLength = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Error(`Country allocation source exceeded ${maximumBytes} bytes`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength > maximumBytes) {
    throw new Error(`Country allocation source exceeded ${maximumBytes} bytes`)
  }
  return bytes
}

const fetchWikidata = async (settings, maximumBytes) => {
  const url = new URL(settings.endpoint)
  url.searchParams.set('query', settings.query)
  const bytes = await fetchBytes(
    url,
    maximumBytes,
    'application/sparql-results+json',
  )
  return bytes
}

const assertExpected = (actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Country allocation projection mismatch:\nexpected ${JSON.stringify(
        expected,
        null,
        2,
      )}\nreceived ${JSON.stringify(actual, null, 2)}`,
    )
  }
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

const midSource = await fetchBytes(
  sourceSettings.sources.mids.sourceUrl,
  128 * 1_024,
  'application/json',
)
if (midSource.byteLength !== sourceSettings.sources.mids.sourceBytes) {
  throw new Error('MID source byte count does not match the manifest')
}
verifySha256(
  midSource,
  sourceSettings.sources.mids.sourceSha256,
  'MID source',
)

const aircraftSource = await fetchBytes(
  sourceSettings.sources.icao24.sourceUrl,
  64 * 1_024,
  'text/csv',
)
if (aircraftSource.byteLength !== sourceSettings.sources.icao24.sourceBytes) {
  throw new Error('ICAO24 source byte count does not match the manifest')
}
verifySha256(
  aircraftSource,
  sourceSettings.sources.icao24.sourceSha256,
  'ICAO24 source',
)

const midCrosscheck = await fetchWikidata(
  sourceSettings.sources.wikidataMidCrosscheck,
  512 * 1_024,
)
const canonicalMids = canonicalizeWikidataMidResults(midCrosscheck)
if (
  canonicalMids.rows.length !==
  sourceSettings.sources.wikidataMidCrosscheck.canonicalRows
) {
  throw new Error('Wikidata MID row count does not match the manifest')
}
verifySha256(
  canonicalMids.contents,
  sourceSettings.sources.wikidataMidCrosscheck.canonicalSha256,
  'Canonical Wikidata MID cross-check',
)

const isoCrosswalk = await fetchWikidata(
  sourceSettings.sources.wikidataIsoCrosswalk,
  512 * 1_024,
)
const canonicalIso = canonicalizeWikidataIsoResults(isoCrosswalk)
if (
  canonicalIso.rows.length !==
  sourceSettings.sources.wikidataIsoCrosswalk.canonicalRows
) {
  throw new Error('Wikidata ISO row count does not match the manifest')
}
verifySha256(
  canonicalIso.contents,
  sourceSettings.sources.wikidataIsoCrosswalk.canonicalSha256,
  'Canonical Wikidata ISO crosswalk',
)

const projection = buildCountryAllocationsProjection({
  midSource,
  midCrosscheck,
  aircraftSource,
  isoCrosswalk,
  stateIsoAliases: sourceSettings.projection.stateIsoAliases,
  outputVersion: sourceSettings.projection.outputVersion,
})
assertExpected(projection.counts, sourceSettings.projection.expected)

let existing
try {
  existing = await readFile(outputPath)
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}
if (existing && !existing.equals(projection.contents)) {
  const existingValue = JSON.parse(existing.toString('utf8'))
  if (
    existingValue.outputVersion === sourceSettings.projection.outputVersion
  ) {
    throw new Error(
      'Configured immutable country-allocation version has different bytes; choose a new outputVersion',
    )
  }
}

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, projection.contents)

console.log(
  JSON.stringify(
    {
      output: path.relative(repositoryRoot, outputPath),
      ...projection.counts,
    },
    null,
    2,
  ),
)
