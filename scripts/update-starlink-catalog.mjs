import { createHash } from 'node:crypto'
import {
  mkdir,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sourceSettings from '../src/config/starlinkCatalogSource.json' with {
  type: 'json',
}
import {
  STARLINK_CATALOG_V2_ID,
  STARLINK_GP_SOURCE_URL,
  STARLINK_MAX_AGGREGATE_BYTES,
  STARLINK_V2_MAX_SNAPSHOT_BYTES,
  STARLINK_MAX_UPSTREAM_BYTES,
  STARLINK_MAX_UPSTREAM_RECORDS,
  STARLINK_V2_SAMPLE_ALGORITHM,
  STARLINK_SATCAT_SOURCE_URL,
  createStarlinkCatalogSnapshotV2,
  serializeStarlinkCatalogSnapshotV2,
} from '../worker/starlinkCatalog.ts'
import { readBoundedJsonFile } from './read-bounded-json-file.mjs'

const options = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index]
  const value = process.argv[index + 1]
  if (!name?.startsWith('--') || !value) {
    throw new Error(
      'Usage: node scripts/update-starlink-catalog.mjs ' +
        '--source-dir <path> --summary <path> --published-at <iso>',
    )
  }
  options.set(name.slice(2), value)
}
const required = (name) => {
  const value = options.get(name)
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const sourceDirectory = path.resolve(required('source-dir'))
const summaryPath = path.resolve(required('summary'))
const publishedAt = required('published-at')
const { value: summary } = await readBoundedJsonFile(
  summaryPath,
  64 * 1_024,
  'Starlink probe summary',
)
const sha256 = (value) =>
  createHash('sha256').update(value).digest('hex')

if (
  sourceSettings.schemaVersion !== 2 ||
  sourceSettings.catalogId !== STARLINK_CATALOG_V2_ID ||
  sourceSettings.status !== 'pending-source-artifacts'
) {
  throw new Error(
    'Starlink source manifest is not ready for first publication',
  )
}
if (
  summary?.gp?.url !== STARLINK_GP_SOURCE_URL ||
  summary?.satcat?.url !== STARLINK_SATCAT_SOURCE_URL ||
  !Number.isSafeInteger(summary.gp.records) ||
  !Number.isSafeInteger(summary.satcat.records) ||
  summary.gp.records < 1 ||
  summary.gp.records > STARLINK_MAX_UPSTREAM_RECORDS ||
  summary.satcat.records < summary.gp.records ||
  summary.satcat.records > STARLINK_MAX_UPSTREAM_RECORDS ||
  !Number.isSafeInteger(summary.gp.bytes) ||
  !Number.isSafeInteger(summary.satcat.bytes) ||
  summary.gp.bytes < 1 ||
  summary.satcat.bytes < 1 ||
  summary.gp.bytes > STARLINK_MAX_UPSTREAM_BYTES ||
  summary.satcat.bytes > STARLINK_MAX_UPSTREAM_BYTES ||
  summary.aggregateDecodedBytes !==
    summary.gp.bytes + summary.satcat.bytes ||
  summary.aggregateDecodedBytes > STARLINK_MAX_AGGREGATE_BYTES ||
  !/^\d{4}-\d{2}-\d{2}$/.test(summary.reviewedAt ?? '') ||
  typeof summary.gp.retrievedAt !== 'string' ||
  typeof summary.satcat.retrievedAt !== 'string' ||
  !/^[0-9a-f]{64}$/.test(summary.gp.sha256) ||
  !/^[0-9a-f]{64}$/.test(summary.satcat.sha256)
) {
  throw new Error('Starlink probe summary is invalid')
}

const gpPath = path.join(sourceDirectory, 'starlink-gp.json')
const satcatPath = path.join(
  sourceDirectory,
  'starlink-satcat.json',
)
const gpBytes = await readFile(gpPath)
const satcatBytes = await readFile(satcatPath)
if (
  gpBytes.byteLength !== summary.gp.bytes ||
  satcatBytes.byteLength !== summary.satcat.bytes ||
  sha256(gpBytes) !== summary.gp.sha256 ||
  sha256(satcatBytes) !== summary.satcat.sha256
) {
  throw new Error('Starlink source bytes do not match the probe summary')
}
const [{ value: gpValue }, { value: satcatValue }] =
  await Promise.all([
    readBoundedJsonFile(
      gpPath,
      STARLINK_MAX_UPSTREAM_BYTES,
      'Starlink GP source',
    ),
    readBoundedJsonFile(
      satcatPath,
      STARLINK_MAX_UPSTREAM_BYTES,
      'Starlink SATCAT source',
    ),
  ])
if (
  !Array.isArray(gpValue) ||
  !Array.isArray(satcatValue) ||
  gpValue.length !== summary.gp.records ||
  satcatValue.length !== summary.satcat.records
) {
  throw new Error(
    'Starlink source record counts do not match the probe summary',
  )
}

const snapshot = await createStarlinkCatalogSnapshotV2(
  {
    gpValue,
    satcatValue,
    gpRetrievedAt: summary.gp.retrievedAt,
    satcatRetrievedAt: summary.satcat.retrievedAt,
    gpDecodedBytes: summary.gp.bytes,
    satcatDecodedBytes: summary.satcat.bytes,
    gpSha256: summary.gp.sha256,
    satcatSha256: summary.satcat.sha256,
  },
  publishedAt,
)
const catalogText = serializeStarlinkCatalogSnapshotV2(snapshot)
const catalogBytes = new TextEncoder().encode(catalogText)
if (catalogBytes.byteLength > STARLINK_V2_MAX_SNAPSHOT_BYTES) {
  throw new Error('Generated Starlink snapshot is oversized')
}

const notice = [
  'LiveTrafficStan CelesTrak Starlink shell-balanced sample',
  '',
  `Catalog: ${snapshot.catalogId}`,
  `Published: ${snapshot.publishedAt}`,
  `Digest: ${snapshot.digest}`,
  `Sample algorithm: ${snapshot.sampleAlgorithm}`,
  `Sampling reference time: ${snapshot.samplingReferenceTime}`,
  `Population count: ${snapshot.populationCount}`,
  `Sample record count: ${snapshot.recordCount}`,
  `Extra validated SATCAT rows: ${snapshot.extraSatcatCount}`,
  ...snapshot.shells.flatMap((shell) => [
    '',
    `Shell: ${shell.id}`,
    `Inclination minimum: ${shell.inclinationMinimumDegrees}`,
    `Inclination maximum exclusive: ${shell.inclinationMaximumDegreesExclusive ?? 'none'}`,
    `Population count: ${shell.populationCount}`,
    `Sample count: ${shell.sampleCount}`,
  ]),
  '',
  `GP URL: ${snapshot.sources.gp.url}`,
  `GP retrieved: ${snapshot.sources.gp.retrievedAt}`,
  `GP records: ${snapshot.sources.gp.recordCount}`,
  `GP decoded bytes: ${snapshot.sources.gp.decodedBytes}`,
  `GP SHA-256: ${snapshot.sources.gp.sha256}`,
  '',
  `SATCAT URL: ${snapshot.sources.satcat.url}`,
  `SATCAT retrieved: ${snapshot.sources.satcat.retrievedAt}`,
  `SATCAT records: ${snapshot.sources.satcat.recordCount}`,
  `SATCAT decoded bytes: ${snapshot.sources.satcat.decodedBytes}`,
  `SATCAT SHA-256: ${snapshot.sources.satcat.sha256}`,
  '',
  'This is a deterministic shell-balanced RAAN/phase-grid sample of the validated source population.',
  'It is not the complete constellation and is not live telemetry.',
  'CelesTrak data use remains subject to the provider terms and attribution.',
  '',
].join('\n')
if (
  snapshot.sampleAlgorithm !== STARLINK_V2_SAMPLE_ALGORITHM ||
  /representative/i.test(notice)
) {
  throw new Error('Generated Starlink notice is invalid')
}
const noticeBytes = new TextEncoder().encode(notice)

const manifest = {
  ...sourceSettings,
  status: 'published',
  probe: {
    reviewedAt: summary.reviewedAt,
    gp: summary.gp,
    satcat: summary.satcat,
    aggregateDecodedBytes: summary.aggregateDecodedBytes,
  },
  expected: {
    populationCount: snapshot.populationCount,
    extraSatcatCount: snapshot.extraSatcatCount,
    records: snapshot.recordCount,
    samplingReferenceTime: snapshot.samplingReferenceTime,
    shells: snapshot.shells,
    snapshotBytes: catalogBytes.byteLength,
    snapshotFileSha256: sha256(catalogBytes),
    canonicalDigest: snapshot.digest,
    noticeBytes: noticeBytes.byteLength,
    noticeSha256: sha256(noticeBytes),
  },
}

const outputDirectory = path.join(
  repositoryRoot,
  'public',
  sourceSettings.bootstrapPath
    .slice(1)
    .replace(/\/catalog\.json$/, ''),
)
await mkdir(outputDirectory, { recursive: true })
await Promise.all([
  writeFile(
    path.join(outputDirectory, 'catalog.json'),
    catalogBytes,
  ),
  writeFile(
    path.join(outputDirectory, 'NOTICE.txt'),
    noticeBytes,
  ),
])
await unlink(path.join(outputDirectory, '.gitkeep')).catch(
  (error) => {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    ) {
      throw error
    }
  },
)
await writeFile(
  path.join(
    repositoryRoot,
    'src/config/starlinkCatalogSource.json',
  ),
  `${JSON.stringify(manifest, null, 2)}\n`,
)

console.log(
  `Wrote ${snapshot.recordCount} sampled Starlink records from ` +
    `${snapshot.populationCount} GP rows to ` +
    `${sourceSettings.bootstrapPath} (${snapshot.digest})`,
)
