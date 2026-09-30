import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  ORBITAL_MAX_AGGREGATE_BYTES,
  ORBITAL_MAX_UPSTREAM_BYTES,
  ORBITAL_SOURCES,
  createOrbitalCatalogSnapshot,
  serializeOrbitalCatalogSnapshot,
} from '../worker/orbitalCatalog.ts'
import { readBoundedJsonFile } from './read-bounded-json-file.mjs'

const options = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index]
  const value = process.argv[index + 1]
  if (!name?.startsWith('--') || !value) {
    throw new Error(
      'Usage: node scripts/update-orbital-catalog.mjs ' +
        '--source-dir <path> --summary <path> ' +
        '--published-at <iso> --output <path>',
    )
  }
  options.set(name.slice(2), value)
}

const required = (name) => {
  const value = options.get(name)
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

const sourceDirectory = resolve(required('source-dir'))
const summaryPath = resolve(required('summary'))
const outputPath = resolve(required('output'))
const publishedAt = required('published-at')
const { value: summary } = await readBoundedJsonFile(
  summaryPath,
  ORBITAL_MAX_UPSTREAM_BYTES,
  'Orbital probe summary',
)

if (
  JSON.stringify(summary.groups) !==
  JSON.stringify(ORBITAL_SOURCES.map((source) => source.group))
) {
  throw new Error('Probe summary does not use the fixed source order')
}
if (
  !Number.isSafeInteger(summary.totalBytes) ||
  summary.totalBytes > ORBITAL_MAX_AGGREGATE_BYTES
) {
  throw new Error('Probe summary aggregate byte count is invalid')
}
if (
  !Array.isArray(summary.groupReports) ||
  summary.groupReports.length !== ORBITAL_SOURCES.length
) {
  throw new Error('Probe summary group reports are invalid')
}

const sha256 = (value) =>
  createHash('sha256').update(value).digest('hex')

let aggregateBytes = 0
const sourceValues = []
for (const [index, source] of ORBITAL_SOURCES.entries()) {
  const report = summary.groupReports[index]
  if (
    report?.group !== source.group ||
    report.gp?.url !== source.gpSourceUrl ||
    report.satcat?.url !== source.satcatSourceUrl ||
    report.gp?.duplicates?.length !== 0 ||
    report.satcat?.duplicates?.length !== 0 ||
    report.missingSatcat?.length !== 0
  ) {
    throw new Error(`Probe report for ${source.group} is invalid`)
  }

  const gpPath = resolve(sourceDirectory, `${source.group}-gp.json`)
  const satcatPath = resolve(
    sourceDirectory,
    `${source.group}-satcat.json`,
  )
  const gpBytes = await readFile(gpPath)
  const satcatBytes = await readFile(satcatPath)
  if (
    gpBytes.byteLength > ORBITAL_MAX_UPSTREAM_BYTES ||
    satcatBytes.byteLength > ORBITAL_MAX_UPSTREAM_BYTES
  ) {
    throw new Error(`${source.group} source response is oversized`)
  }
  aggregateBytes += gpBytes.byteLength + satcatBytes.byteLength

  const { value: gp } = await readBoundedJsonFile(
    gpPath,
    ORBITAL_MAX_UPSTREAM_BYTES,
    `${source.group} GP source`,
  )
  const { value: satcat } = await readBoundedJsonFile(
    satcatPath,
    ORBITAL_MAX_UPSTREAM_BYTES,
    `${source.group} SATCAT source`,
  )
  if (
    !Array.isArray(gp) ||
    !Array.isArray(satcat) ||
    gp.length !== report.gp.records ||
    satcat.length !== report.satcat.records ||
    gpBytes.byteLength !== report.gp.bytes ||
    satcatBytes.byteLength !== report.satcat.bytes ||
    sha256(gpBytes) !== report.gp.sha256 ||
    sha256(satcatBytes) !== report.satcat.sha256
  ) {
    throw new Error(`Probe evidence for ${source.group} changed`)
  }
  sourceValues.push({
    group: source.group,
    gpValue: gp,
    satcatValue: satcat,
  })
}

if (
  aggregateBytes !== summary.totalBytes ||
  aggregateBytes > ORBITAL_MAX_AGGREGATE_BYTES
) {
  throw new Error('Probe aggregate byte count does not match')
}

const snapshot = await createOrbitalCatalogSnapshot(
  sourceValues,
  summary.retrievedAt,
  publishedAt,
)
if (snapshot.recordCount !== summary.union?.records) {
  throw new Error('Probe union record count does not match')
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
  JSON.stringify(summary.union?.typeCounts)
) {
  throw new Error('Probe union type counts do not match')
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(
  outputPath,
  serializeOrbitalCatalogSnapshot(snapshot),
)

console.log(
  `Wrote ${snapshot.recordCount} orbital records to ${outputPath} ` +
    `(${snapshot.sha256})`,
)
