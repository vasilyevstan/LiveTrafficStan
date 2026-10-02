import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sourceSettings from '../src/config/starlinkCatalogSource.json' with {
  type: 'json',
}
import {
  STARLINK_BOOTSTRAP_PATH,
  STARLINK_BOOTSTRAP_VERSION,
  STARLINK_CATALOG_ID,
  STARLINK_GP_SOURCE_URL,
  STARLINK_MAX_AGGREGATE_BYTES,
  STARLINK_MAX_SNAPSHOT_BYTES,
  STARLINK_MAX_UPSTREAM_BYTES,
  STARLINK_MAX_UPSTREAM_RECORDS,
  STARLINK_NOTICE_PATH,
  STARLINK_SAMPLE_ALGORITHM,
  STARLINK_SAMPLE_LIMIT,
  STARLINK_SATCAT_SOURCE_URL,
  serializeStarlinkCatalogSnapshot,
  validateStarlinkCatalogSnapshot,
} from '../worker/starlinkCatalog.ts'
import { verifyImmutableStarlinkCatalogHistory } from './starlink-catalog-history.mjs'

const requireBootstrap =
  process.argv.length === 3 &&
  process.argv[2] === '--require-bootstrap'
if (
  process.argv.length > (requireBootstrap ? 3 : 2) ||
  (process.argv.length === 3 && !requireBootstrap)
) {
  throw new Error(
    'Usage: node scripts/check-starlink-catalog.mjs [--require-bootstrap]',
  )
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const fail = (message) => {
  throw new Error(`Starlink catalog integrity check failed: ${message}`)
}
const sha256 = (value) =>
  createHash('sha256').update(value).digest('hex')
const publicPath = (assetPath) =>
  path.join(repositoryRoot, 'public', assetPath.slice(1))

if (
  sourceSettings.schemaVersion !== 1 ||
  sourceSettings.catalogId !== STARLINK_CATALOG_ID ||
  sourceSettings.bootstrapVersion !== STARLINK_BOOTSTRAP_VERSION ||
  sourceSettings.bootstrapPath !== STARLINK_BOOTSTRAP_PATH ||
  sourceSettings.noticePath !== STARLINK_NOTICE_PATH
) {
  fail('source manifest does not match the runtime contract')
}
const probe = sourceSettings.probe
if (
  !/^\d{4}-\d{2}-\d{2}$/.test(probe?.reviewedAt ?? '') ||
  probe.gp?.url !== STARLINK_GP_SOURCE_URL ||
  probe.satcat?.url !== STARLINK_SATCAT_SOURCE_URL ||
  !Number.isSafeInteger(probe.gp.records) ||
  !Number.isSafeInteger(probe.satcat.records) ||
  probe.gp.records < 1 ||
  probe.gp.records > STARLINK_MAX_UPSTREAM_RECORDS ||
  probe.satcat.records < probe.gp.records ||
  probe.satcat.records > STARLINK_MAX_UPSTREAM_RECORDS ||
  !Number.isSafeInteger(probe.gp.bytes) ||
  !Number.isSafeInteger(probe.satcat.bytes) ||
  probe.gp.bytes < 1 ||
  probe.satcat.bytes < 1 ||
  probe.gp.bytes > STARLINK_MAX_UPSTREAM_BYTES ||
  probe.satcat.bytes > STARLINK_MAX_UPSTREAM_BYTES ||
  probe.aggregateDecodedBytes !==
    probe.gp.bytes + probe.satcat.bytes ||
  probe.aggregateDecodedBytes > STARLINK_MAX_AGGREGATE_BYTES
) {
  fail('bounded provider evidence is invalid')
}

await verifyImmutableStarlinkCatalogHistory({
  base: process.env.STARLINK_CATALOG_IMMUTABLE_BASE,
  repositoryRoot,
  manifest: sourceSettings,
})

const catalogPath = publicPath(sourceSettings.bootstrapPath)
const noticePath = publicPath(sourceSettings.noticePath)
const directoryFiles = (
  await readdir(path.dirname(catalogPath))
).sort()

if (sourceSettings.status === 'pending-source-artifacts') {
  if (
    probe.reviewedAt !== '2026-10-01' ||
    probe.gp.records !== 11_127 ||
    probe.gp.bytes !== 4_700_510 ||
    probe.satcat.records !== 11_127 ||
    probe.satcat.bytes !== 3_684_991 ||
    probe.aggregateDecodedBytes !== 8_385_501 ||
    sourceSettings.expected !== null ||
    probe.gp.retrievedAt !== null ||
    probe.satcat.retrievedAt !== null ||
    probe.gp.sha256 !== null ||
    probe.satcat.sha256 !== null ||
    JSON.stringify(directoryFiles) !== JSON.stringify(['.gitkeep'])
  ) {
    fail('pending bootstrap placeholder is not pristine')
  }
  if (requireBootstrap) {
    fail(
      'the immutable bootstrap must be generated from a later permitted provider probe',
    )
  }
  console.log(
    'Validated pending Starlink contract; immutable bootstrap generation remains blocked on a later permitted provider probe',
  )
  process.exit(0)
}

if (sourceSettings.status !== 'published') {
  fail('source manifest status is invalid')
}
if (
  !/^[0-9a-f]{64}$/.test(probe.gp.sha256) ||
  !/^[0-9a-f]{64}$/.test(probe.satcat.sha256) ||
  typeof probe.gp.retrievedAt !== 'string' ||
  typeof probe.satcat.retrievedAt !== 'string' ||
  JSON.stringify(directoryFiles) !==
    JSON.stringify(['NOTICE.txt', 'catalog.json'])
) {
  fail('published provider evidence is incomplete')
}

const catalogBytes = await readFile(catalogPath)
const expected = sourceSettings.expected
if (
  !expected ||
  catalogBytes.byteLength !== expected.snapshotBytes ||
  catalogBytes.byteLength > STARLINK_MAX_SNAPSHOT_BYTES ||
  sha256(catalogBytes) !== expected.snapshotFileSha256
) {
  fail('bootstrap bytes do not match the source manifest')
}
const catalogText = new TextDecoder('utf-8', {
  fatal: true,
}).decode(catalogBytes)
const snapshot = await validateStarlinkCatalogSnapshot(
  JSON.parse(catalogText),
)
if (
  catalogText !== serializeStarlinkCatalogSnapshot(snapshot) ||
  snapshot.digest !== expected.canonicalDigest ||
  snapshot.populationCount !== expected.populationCount ||
  snapshot.extraSatcatCount !== expected.extraSatcatCount ||
  snapshot.recordCount !== expected.records ||
  snapshot.recordCount !==
    Math.min(snapshot.populationCount, STARLINK_SAMPLE_LIMIT) ||
  snapshot.sampleAlgorithm !== STARLINK_SAMPLE_ALGORITHM
) {
  fail('bootstrap identity does not match the source manifest')
}
for (const [source, evidence] of [
  [snapshot.sources.gp, probe.gp],
  [snapshot.sources.satcat, probe.satcat],
]) {
  if (
    source.url !== evidence.url ||
    source.retrievedAt !== evidence.retrievedAt ||
    source.recordCount !== evidence.records ||
    source.decodedBytes !== evidence.bytes ||
    source.sha256 !== evidence.sha256
  ) {
    fail('published source metadata changed')
  }
}

const noticeBytes = await readFile(noticePath)
if (
  noticeBytes.byteLength !== expected.noticeBytes ||
  sha256(noticeBytes) !== expected.noticeSha256
) {
  fail('bootstrap notice does not match the source manifest')
}
const notice = noticeBytes.toString('utf8')
for (const required of [
  snapshot.catalogId,
  snapshot.publishedAt,
  snapshot.digest,
  snapshot.sampleAlgorithm,
  String(snapshot.populationCount),
  String(snapshot.recordCount),
  snapshot.sources.gp.url,
  snapshot.sources.gp.retrievedAt,
  snapshot.sources.gp.sha256,
  snapshot.sources.satcat.url,
  snapshot.sources.satcat.retrievedAt,
  snapshot.sources.satcat.sha256,
  'systematic sample',
  'not live telemetry',
]) {
  if (!notice.includes(required)) {
    fail(`bootstrap notice is missing: ${required}`)
  }
}
if (/representative/i.test(notice)) {
  fail('bootstrap notice makes an unsupported representative claim')
}

console.log(
  `Validated ${snapshot.recordCount} sampled Starlink records from ` +
    `${snapshot.populationCount} GP rows ` +
    `(${snapshot.digest}, ${catalogBytes.byteLength} bytes)`,
)
