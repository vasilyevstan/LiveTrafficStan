import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sourceSettings from '../src/config/aircraftMetadataSource.json' with {
  type: 'json',
}
import {
  buildAircraftMetadataProjection,
  verifySha256,
} from './aircraft-metadata-projection.mjs'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const metadataRoot = path.join(repositoryRoot, 'public', 'aircraft-metadata')
const outputDirectory = path.join(
  metadataRoot,
  sourceSettings.projection.outputVersion,
)

const fetchBytes = async (url, label, maximumBytes) => {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'LiveTrafficStan metadata maintainer (+https://github.com/vasilyevstan/LiveTrafficStan)',
    },
  })
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`)
  }
  const contentLength = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Error(`${label} exceeded the ${maximumBytes}-byte limit`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength > maximumBytes) {
    throw new Error(`${label} exceeded the ${maximumBytes}-byte limit`)
  }
  return bytes
}

const readZipEntry = (archivePath, entry) =>
  execFileSync('unzip', ['-p', archivePath, entry], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })

const readZipEntryBytes = (archivePath, entry) =>
  execFileSync('unzip', ['-p', archivePath, entry], {
    maxBuffer: 64 * 1024 * 1024,
  })

const assertExpectedCounts = (actual, expected) => {
  for (const [name, expectedValue] of Object.entries(expected)) {
    if (actual[name] !== expectedValue) {
      throw new Error(
        `Projection ${name} mismatch; expected ${expectedValue}, received ${actual[name]}`,
      )
    }
  }
}

const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), 'livetrafficstan-aircraft-metadata-'),
)

try {
  const [archive, license] = await Promise.all([
    fetchBytes(
      sourceSettings.source.archiveUrl,
      'Metadata archive',
      16 * 1_024 * 1_024,
    ),
    fetchBytes(
      sourceSettings.source.licenseUrl,
      'Metadata license',
      128 * 1_024,
    ),
  ])
  verifySha256(
    archive,
    sourceSettings.source.archiveSha256,
    'Metadata archive',
  )
  verifySha256(
    license,
    sourceSettings.source.licenseSha256,
    'Metadata license',
  )

  const archivePath = path.join(temporaryDirectory, 'indexedDB.zip')
  await writeFile(archivePath, archive)
  const sourceAircraft = JSON.parse(
    readZipEntry(archivePath, 'aircrafts.json'),
  )
  const sourceTypes = JSON.parse(readZipEntry(archivePath, 'types.json'))
  const embeddedLicense = readZipEntryBytes(archivePath, 'LICENSE')
  verifySha256(
    embeddedLicense,
    sourceSettings.source.licenseSha256,
    'Embedded metadata license',
  )
  if (!embeddedLicense.equals(license)) {
    throw new Error(
      'Pinned archive license differs from the separately pinned license',
    )
  }
  const databaseVersion = JSON.parse(
    readZipEntry(archivePath, 'dbversion.json'),
  ).version
  if (databaseVersion !== sourceSettings.source.databaseVersion) {
    throw new Error(
      `Database version mismatch; expected ${sourceSettings.source.databaseVersion}, received ${databaseVersion}`,
    )
  }

  const projection = buildAircraftMetadataProjection(
    sourceAircraft,
    sourceTypes,
  )
  assertExpectedCounts(
    projection.counts,
    sourceSettings.projection.expected,
  )

  const resolvedMetadataRoot = path.resolve(metadataRoot)
  const resolvedOutputDirectory = path.resolve(outputDirectory)
  if (
    path.dirname(resolvedOutputDirectory) !== resolvedMetadataRoot ||
    path.basename(resolvedOutputDirectory) !==
      sourceSettings.projection.outputVersion
  ) {
    throw new Error('Refusing to replace an unsafe metadata output path')
  }

  await rm(resolvedOutputDirectory, { recursive: true, force: true })
  await mkdir(path.join(resolvedOutputDirectory, 'shards'), {
    recursive: true,
  })

  const shardIndex = {}
  for (const prefix of Object.keys(projection.shards).sort()) {
    const { contents, metrics } = projection.shards[prefix]
    await writeFile(
      path.join(resolvedOutputDirectory, metrics.path),
      contents,
    )
    shardIndex[prefix] = metrics
  }

  const index = {
    schemaVersion: sourceSettings.projection.schemaVersion,
    outputVersion: sourceSettings.projection.outputVersion,
    source: {
      name: sourceSettings.source.name,
      repositoryUrl: sourceSettings.source.repositoryUrl,
      commit: sourceSettings.source.commit,
      publishedAt: sourceSettings.source.publishedAt,
      databaseVersion: sourceSettings.source.databaseVersion,
      licenseName: sourceSettings.source.licenseName,
      licenseUrl: sourceSettings.source.licenseCanonicalUrl,
      archiveSha256: sourceSettings.source.archiveSha256,
    },
    policy: {
      staleAfterDays: sourceSettings.projection.staleAfterDays,
      futureToleranceHours:
        sourceSettings.projection.futureToleranceHours,
      notice:
        'Contains a derivative database from Mictronics aircraft-database, made available under ODC-By 1.0. Source publication date is not per-record verification.',
    },
    counts: projection.counts,
    types: projection.types,
    shards: shardIndex,
  }

  await Promise.all([
    writeFile(
      path.join(resolvedOutputDirectory, 'index.json'),
      `${JSON.stringify(index)}\n`,
    ),
    writeFile(path.join(resolvedOutputDirectory, 'LICENSE'), license),
  ])

  console.log(
    JSON.stringify(
      {
        outputDirectory: path.relative(repositoryRoot, resolvedOutputDirectory),
        ...projection.counts,
      },
      null,
      2,
    ),
  )
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
