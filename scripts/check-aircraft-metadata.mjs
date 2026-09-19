import { gzipSync } from 'node:zlib'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sourceSettings from '../src/config/aircraftMetadataSource.json' with {
  type: 'json',
}
import {
  parseProjectedShard,
  sha256,
  verifySha256,
} from './aircraft-metadata-projection.mjs'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const outputDirectory = path.join(
  repositoryRoot,
  'public',
  'aircraft-metadata',
  sourceSettings.projection.outputVersion,
)

const fail = (message) => {
  throw new Error(`Aircraft metadata integrity check failed: ${message}`)
}

const indexBytes = await readFile(path.join(outputDirectory, 'index.json'))
const index = JSON.parse(indexBytes.toString('utf8'))
const license = await readFile(path.join(outputDirectory, 'LICENSE'))
verifySha256(
  license,
  sourceSettings.source.licenseSha256,
  'Committed metadata license',
)

if (
  index.schemaVersion !== sourceSettings.projection.schemaVersion ||
  index.outputVersion !== sourceSettings.projection.outputVersion
) {
  fail('schema or output version does not match configured asset base')
}
if (
  index.source?.commit !== sourceSettings.source.commit ||
  index.source?.publishedAt !== sourceSettings.source.publishedAt ||
  index.source?.databaseVersion !== sourceSettings.source.databaseVersion ||
  index.source?.archiveSha256 !== sourceSettings.source.archiveSha256
) {
  fail('source provenance does not match the pinned source manifest')
}
if (
  index.policy?.staleAfterDays !==
    sourceSettings.projection.staleAfterDays ||
  index.policy?.futureToleranceHours !==
    sourceSettings.projection.futureToleranceHours
) {
  fail('runtime publication-age policy does not match configuration')
}

for (const [name, expected] of Object.entries(
  sourceSettings.projection.expected,
)) {
  if (index.counts?.[name] !== expected) {
    fail(`${name} expected ${expected}, received ${index.counts?.[name]}`)
  }
}

const publishedAt = Date.parse(index.source.publishedAt)
const now = Date.now()
const staleAfterMs =
  sourceSettings.projection.staleAfterDays * 24 * 60 * 60 * 1_000
const futureToleranceMs =
  sourceSettings.projection.futureToleranceHours * 60 * 60 * 1_000
if (!Number.isFinite(publishedAt)) fail('publication date is invalid')
if (publishedAt > now + futureToleranceMs) {
  fail('publication date is materially future-dated')
}
if (now > publishedAt + staleAfterMs) {
  fail(
    `snapshot is older than ${sourceSettings.projection.staleAfterDays} days; run npm run update:aircraft-metadata`,
  )
}

if (
  typeof index.types !== 'object' ||
  index.types === null ||
  Array.isArray(index.types)
) {
  fail('type dictionary is invalid')
}
if (
  Object.keys(index.types).length !==
  sourceSettings.projection.expected.projectedTypeRecords
) {
  fail('type dictionary count is invalid')
}

const shardDirectory = path.join(outputDirectory, 'shards')
const actualShardFiles = (await readdir(shardDirectory)).sort()
const expectedShardFiles = Object.keys(index.shards)
  .sort()
  .map((prefix) => `${prefix}.tsv`)
if (JSON.stringify(actualShardFiles) !== JSON.stringify(expectedShardFiles)) {
  fail('shard file inventory does not match the index')
}

let availableRecords = 0
let ambiguousRecords = 0
let rawBytes = 0
let gzipBytes = 0
let largestRawBytes = 0
let largestGzipBytes = 0

for (const prefix of Object.keys(index.shards).sort()) {
  if (!/^[0-9A-F]{2}$/.test(prefix)) fail(`invalid shard prefix ${prefix}`)
  const metadata = index.shards[prefix]
  if (metadata.path !== `shards/${prefix}.tsv`) {
    fail(`invalid shard path for ${prefix}`)
  }

  const filePath = path.join(outputDirectory, metadata.path)
  const contents = await readFile(filePath)
  const fileStat = await stat(filePath)
  if (fileStat.size !== metadata.bytes || contents.byteLength !== metadata.bytes) {
    fail(`byte count mismatch for ${prefix}`)
  }
  if (sha256(contents) !== metadata.sha256) {
    fail(`SHA-256 mismatch for ${prefix}`)
  }
  const compressedBytes = gzipSync(contents, {
    level: 9,
    mtime: 0,
  }).byteLength
  if (compressedBytes !== metadata.gzipBytes) {
    fail(`gzip byte count mismatch for ${prefix}`)
  }

  const records = parseProjectedShard(contents.toString('utf8'), index.types)
  const actualAmbiguous = [...records.values()].filter(
    ({ ambiguous }) => ambiguous,
  ).length
  if (
    records.size !== metadata.records ||
    actualAmbiguous !== metadata.ambiguousRecords
  ) {
    fail(`record count mismatch for ${prefix}`)
  }

  availableRecords += records.size - actualAmbiguous
  ambiguousRecords += actualAmbiguous
  rawBytes += contents.byteLength
  gzipBytes += compressedBytes
  largestRawBytes = Math.max(largestRawBytes, contents.byteLength)
  largestGzipBytes = Math.max(largestGzipBytes, compressedBytes)
}

const aggregate = {
  availableRecords,
  ambiguousRecords,
  shardCount: actualShardFiles.length,
  shardRawBytes: rawBytes,
  shardGzipBytes: gzipBytes,
  largestShardRawBytes: largestRawBytes,
  largestShardGzipBytes: largestGzipBytes,
}
for (const [name, value] of Object.entries(aggregate)) {
  if (value !== index.counts[name]) {
    fail(`${name} aggregate mismatch; expected ${index.counts[name]}, received ${value}`)
  }
}

const rootFiles = (await readdir(outputDirectory)).sort()
if (JSON.stringify(rootFiles) !== JSON.stringify(['LICENSE', 'index.json', 'shards'])) {
  fail('versioned metadata directory contains unexpected files')
}

console.log(
  `Aircraft metadata ${index.outputVersion}: ${availableRecords} available, ${ambiguousRecords} ambiguous, ${actualShardFiles.length} shards, ${rawBytes} raw bytes`,
)
