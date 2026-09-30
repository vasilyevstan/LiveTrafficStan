import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sourceSettings from '../src/config/orbitalCatalogSource.json' with {
  type: 'json',
}
import {
  ORBITAL_BOOTSTRAP_PATH,
  ORBITAL_BOOTSTRAP_VERSION,
  ORBITAL_CATALOG_ID,
  ORBITAL_MAX_AGGREGATE_BYTES,
  ORBITAL_MAX_GROUPS,
  ORBITAL_MAX_RECORDS,
  ORBITAL_MAX_SNAPSHOT_BYTES,
  ORBITAL_MAX_UPSTREAM_BYTES,
  ORBITAL_MAX_UPSTREAM_RECORDS,
  ORBITAL_SOURCES,
  serializeOrbitalCatalogSnapshot,
  validateOrbitalCatalogSnapshot,
} from '../worker/orbitalCatalog.ts'
import { verifyImmutableOrbitalCatalogHistory } from './orbital-catalog-history.mjs'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const fail = (message) => {
  throw new Error(`Orbital catalog integrity check failed: ${message}`)
}
const sha256 = (value) =>
  createHash('sha256').update(value).digest('hex')
const publicPath = (assetPath) =>
  path.join(repositoryRoot, 'public', assetPath.slice(1))

if (
  sourceSettings.schemaVersion !== 1 ||
  sourceSettings.catalogId !== ORBITAL_CATALOG_ID ||
  sourceSettings.bootstrapVersion !== ORBITAL_BOOTSTRAP_VERSION ||
  sourceSettings.bootstrapPath !== ORBITAL_BOOTSTRAP_PATH ||
  sourceSettings.noticePath !==
    ORBITAL_BOOTSTRAP_PATH.replace(/catalog\.json$/, 'NOTICE.txt')
) {
  fail('source manifest does not match the runtime contract')
}
if (
  ORBITAL_SOURCES.length > ORBITAL_MAX_GROUPS ||
  sourceSettings.probe.sources.length !== ORBITAL_SOURCES.length
) {
  fail('fixed source group count is invalid')
}

let sourceBytes = 0
for (const [index, source] of ORBITAL_SOURCES.entries()) {
  const evidence = sourceSettings.probe.sources[index]
  if (
    evidence?.group !== source.group ||
    evidence.gp?.url !== source.gpSourceUrl ||
    evidence.satcat?.url !== source.satcatSourceUrl ||
    !Number.isSafeInteger(evidence.gp.records) ||
    !Number.isSafeInteger(evidence.satcat.records) ||
    evidence.gp.records < 1 ||
    evidence.satcat.records < evidence.gp.records ||
    evidence.gp.records > ORBITAL_MAX_UPSTREAM_RECORDS ||
    evidence.satcat.records > ORBITAL_MAX_UPSTREAM_RECORDS ||
    !Number.isSafeInteger(evidence.gp.bytes) ||
    !Number.isSafeInteger(evidence.satcat.bytes) ||
    evidence.gp.bytes > ORBITAL_MAX_UPSTREAM_BYTES ||
    evidence.satcat.bytes > ORBITAL_MAX_UPSTREAM_BYTES ||
    !/^[0-9a-f]{64}$/.test(evidence.gp.sha256) ||
    !/^[0-9a-f]{64}$/.test(evidence.satcat.sha256)
  ) {
    fail(`source evidence for ${source.group} is invalid`)
  }
  sourceBytes += evidence.gp.bytes + evidence.satcat.bytes
}
if (
  sourceBytes !== sourceSettings.probe.aggregateDecodedBytes ||
  sourceBytes !== 353281 ||
  sourceBytes > ORBITAL_MAX_AGGREGATE_BYTES
) {
  fail('aggregate decoded source bytes are invalid')
}

const catalogPath = publicPath(sourceSettings.bootstrapPath)
const noticePath = publicPath(sourceSettings.noticePath)
const directoryFiles = (
  await readdir(path.dirname(catalogPath))
).sort()
if (
  JSON.stringify(directoryFiles) !==
  JSON.stringify(['NOTICE.txt', 'catalog.json'])
) {
  fail('immutable bootstrap directory contains unexpected files')
}

const catalogBytes = await readFile(catalogPath)
if (
  catalogBytes.byteLength !== sourceSettings.expected.snapshotBytes ||
  catalogBytes.byteLength > ORBITAL_MAX_SNAPSHOT_BYTES ||
  sha256(catalogBytes) !==
    sourceSettings.expected.snapshotFileSha256
) {
  fail('curated bootstrap bytes do not match the source manifest')
}
const catalogText = new TextDecoder('utf-8', { fatal: true }).decode(
  catalogBytes,
)
const snapshot = await validateOrbitalCatalogSnapshot(
  JSON.parse(catalogText),
)
if (catalogText !== serializeOrbitalCatalogSnapshot(snapshot)) {
  fail('curated bootstrap is not canonical serialized JSON')
}
if (
  snapshot.retrievedAt !== sourceSettings.retrievedAt ||
  snapshot.publishedAt !== sourceSettings.publishedAt ||
  snapshot.recordCount !== sourceSettings.expected.records ||
  snapshot.recordCount > ORBITAL_MAX_RECORDS ||
  snapshot.sha256 !== sourceSettings.expected.canonicalSha256
) {
  fail('curated bootstrap identity does not match the source manifest')
}

const typeCounts = snapshot.records.reduce(
  (counts, record) => {
    counts[record.objectType] += 1
    return counts
  },
  { PAY: 0, 'R/B': 0, DEB: 0, UNK: 0 },
)
if (
  JSON.stringify(typeCounts) !==
    JSON.stringify(sourceSettings.expected.typeCounts) ||
  typeCounts.PAY < 130
) {
  fail('curated bootstrap type counts do not match')
}
const overlapCount = snapshot.records.filter(
  (record) => record.sourceGroups.length > 1,
).length
if (overlapCount !== sourceSettings.expected.overlapCount) {
  fail('curated bootstrap overlap count does not match')
}
for (const [index, source] of snapshot.sources.entries()) {
  const evidence = sourceSettings.probe.sources[index]
  if (
    source.group !== evidence.group ||
    source.gpSourceUrl !== evidence.gp.url ||
    source.satcatSourceUrl !== evidence.satcat.url ||
    source.gpRecordCount !== evidence.gp.records ||
    source.satcatRecordCount !== evidence.satcat.records
  ) {
    fail(`published source metadata for ${source.group} changed`)
  }
}

const noticeBytes = await readFile(noticePath)
if (
  noticeBytes.byteLength !== sourceSettings.expected.noticeBytes ||
  sha256(noticeBytes) !== sourceSettings.expected.noticeSha256
) {
  fail('curated bootstrap notice does not match the source manifest')
}
const notice = noticeBytes.toString('utf8')
for (const required of [
  snapshot.catalogId,
  snapshot.retrievedAt,
  snapshot.publishedAt,
  snapshot.sha256,
  String(sourceSettings.probe.aggregateDecodedBytes),
  'CelesTrak GP/OMM and SATCAT',
  'not live telemetry',
  ...snapshot.sources.flatMap((source) => [
    source.group,
    source.gpSourceUrl,
    source.satcatSourceUrl,
  ]),
]) {
  if (!notice.includes(required)) {
    fail(`curated bootstrap notice is missing: ${required}`)
  }
}

const validateRetainedV1 = (value) => {
  if (
    value?.schemaVersion !== 1 ||
    value.sourceContractVersion !== 1 ||
    value.group !== 'visual' ||
    value.gpSourceUrl !==
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json' ||
    value.satcatSourceUrl !==
      'https://celestrak.org/satcat/records.php?GROUP=visual&FORMAT=json' ||
    !Array.isArray(value.records) ||
    value.records.length === 0 ||
    value.records.length !== value.recordCount ||
    value.records.some(
      (record, index) =>
        !/^(?:[1-9]\d{0,8})$/.test(record?.noradCatalogId) ||
        !['PAY', 'R/B', 'DEB', 'UNK'].includes(
          record?.objectType,
        ) ||
        (index > 0 &&
          Number(value.records[index - 1].noradCatalogId) >=
            Number(record.noradCatalogId)),
    )
  ) {
    fail('retained schema-v1 bootstrap is invalid')
  }
  const digestInput = {
    schemaVersion: value.schemaVersion,
    sourceContractVersion: value.sourceContractVersion,
    group: value.group,
    gpSourceUrl: value.gpSourceUrl,
    satcatSourceUrl: value.satcatSourceUrl,
    retrievedAt: value.retrievedAt,
    recordCount: value.recordCount,
    records: value.records,
  }
  if (sha256(JSON.stringify(digestInput)) !== value.sha256) {
    fail('retained schema-v1 digest does not match')
  }
}

for (const retained of sourceSettings.retainedRollbackContracts) {
  const retainedCatalogBytes = await readFile(
    publicPath(retained.bootstrapPath),
  )
  if (
    retainedCatalogBytes.byteLength !== retained.snapshotBytes ||
    sha256(retainedCatalogBytes) !== retained.snapshotFileSha256
  ) {
    fail(`${retained.label} bootstrap bytes changed`)
  }
  const retainedText = retainedCatalogBytes.toString('utf8')
  const retainedSnapshot = JSON.parse(retainedText)
  validateRetainedV1(retainedSnapshot)
  if (
    retainedText !== `${JSON.stringify(retainedSnapshot)}\n` ||
    retainedSnapshot.schemaVersion !== retained.schemaVersion ||
    retainedSnapshot.sourceContractVersion !==
      retained.sourceContractVersion ||
    retainedSnapshot.recordCount !== retained.recordCount ||
    retainedSnapshot.sha256 !== retained.canonicalSha256
  ) {
    fail(`${retained.label} bootstrap contract changed`)
  }

  const retainedNotice = await readFile(
    publicPath(retained.noticePath),
  )
  if (
    retainedNotice.byteLength !== retained.noticeBytes ||
    sha256(retainedNotice) !== retained.noticeSha256
  ) {
    fail(`${retained.label} notice changed`)
  }
}

await verifyImmutableOrbitalCatalogHistory({
  base: process.env.ORBITAL_CATALOG_IMMUTABLE_BASE,
  repositoryRoot,
  manifest: sourceSettings,
})

console.log(
  `Validated ${snapshot.recordCount} curated orbital records ` +
    `(${snapshot.sha256}, ${catalogBytes.byteLength} bytes) and ` +
    `${sourceSettings.retainedRollbackContracts.length} retained v1 contracts`,
)
