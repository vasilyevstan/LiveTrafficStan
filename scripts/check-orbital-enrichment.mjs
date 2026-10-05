import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import manifest from '../src/config/orbitalEnrichmentManifest.json' with {
  type: 'json',
}
import catalog from '../public/orbital-data/v2/visual-catalog.json' with {
  type: 'json',
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const publicRoot = path.join(repositoryRoot, 'public')
const versionDirectory = path.join(
  publicRoot,
  'orbital-enrichment',
  manifest.manifestVersion,
)
const MAX_RECORDS = 16
const MAX_ASSET_BYTES = 512 * 1024
const MAX_TOTAL_BYTES = 1024 * 1024
const execFile = promisify(execFileCallback)

const fail = (message) => {
  throw new Error(`Orbital enrichment integrity check failed: ${message}`)
}

const requiredString = (value, label, maximum = 2_000) => {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value === '' ||
    value.length > maximum
  ) {
    fail(`${label} must be a non-empty trimmed string within ${maximum} characters`)
  }
  return value
}

const requiredPositiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(`${label} must be a positive integer`)
  }
  return value
}

const requiredSha256 = (value, label) => {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    fail(`${label} must be a lowercase SHA-256`)
  }
  return value
}

const requiredDate = (value, label) => {
  if (
    typeof value !== 'string' ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  ) {
    fail(`${label} must be a valid YYYY-MM-DD date`)
  }
  return value
}

const requiredHttpsUrl = (value, label) => {
  const url = new URL(requiredString(value, label))
  if (url.protocol !== 'https:') fail(`${label} must use HTTPS`)
  return url
}

const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex')

const verifyPurposeSource = (purpose, label) => {
  requiredString(purpose?.shortLabel, `${label} purpose label`, 80)
  requiredString(purpose?.description, `${label} purpose`, 600)
  requiredString(purpose?.sourceName, `${label} purpose source`, 120)
  requiredString(purpose?.sourceTitle, `${label} purpose title`, 240)
  requiredHttpsUrl(purpose?.sourceUrl, `${label} purpose URL`)
  if (purpose?.sourcePublishedAt !== undefined) {
    requiredDate(purpose.sourcePublishedAt, `${label} purpose publication date`)
  }
  requiredDate(purpose?.sourceRetrievedAt, `${label} purpose retrieval date`)
  requiredSha256(purpose?.sourceSha256, `${label} purpose source digest`)
}

const imageDimensions = (bytes, mediaType) => {
  if (mediaType === 'image/png') {
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      fail('PNG signature is invalid')
    }
    if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
      fail('PNG IHDR chunk is missing')
    }
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    }
  }

  if (
    mediaType !== 'image/jpeg' ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8
  ) {
    fail('JPEG signature is invalid')
  }

  let offset = 2
  while (offset + 8 < bytes.length) {
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd8 || marker === 0xd9) continue
    const length = bytes.readUInt16BE(offset)
    if (length < 2 || offset + length > bytes.length) {
      fail('JPEG segment length is invalid')
    }
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      }
    }
    offset += length
  }

  fail('JPEG dimensions are missing')
}

const gitObjectExists = async (object) => {
  try {
    await execFile('git', ['cat-file', '-e', object], {
      cwd: repositoryRoot,
    })
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 128) {
      return false
    }
    throw error
  }
}

const verifyImmutableVersion = async () => {
  const base = process.env.ORBITAL_ENRICHMENT_IMMUTABLE_BASE
  if (base === undefined || /^0{40}$/.test(base)) return
  if (!/^[0-9a-f]{40}$/.test(base)) {
    fail(
      'ORBITAL_ENRICHMENT_IMMUTABLE_BASE must be a full lowercase commit SHA',
    )
  }
  if (!(await gitObjectExists(`${base}^{commit}`))) {
    fail('immutable comparison base is unavailable')
  }

  const manifestPath = 'src/config/orbitalEnrichmentManifest.json'
  const versionPath = `public/orbital-enrichment/${manifest.manifestVersion}`
  if (await gitObjectExists(`${base}:${manifestPath}`)) {
    const { stdout } = await execFile(
      'git',
      ['show', `${base}:${manifestPath}`],
      { cwd: repositoryRoot },
    )
    const previousManifest = JSON.parse(stdout)
    if (previousManifest.manifestVersion === manifest.manifestVersion) {
      try {
        await execFile(
          'git',
          ['diff', '--quiet', base, '--', manifestPath, versionPath],
          { cwd: repositoryRoot },
        )
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 1) {
          fail(
            'published orbital enrichment version changed; choose a new manifest version',
          )
        }
        throw error
      }
      return
    }
  }

  const { stdout } = await execFile(
    'git',
    ['log', '-1', '--format=%H', base, '--', versionPath],
    { cwd: repositoryRoot },
  )
  if (stdout.trim() !== '') {
    fail(
      'manifest version reuses an orbital enrichment path from repository history',
    )
  }
}

if (manifest.schemaVersion !== 1) fail('schemaVersion must be 1')
if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}-v[0-9]+$/.test(manifest.manifestVersion)) {
  fail('manifestVersion is invalid')
}
requiredDate(manifest.reviewedAt, 'reviewedAt')
requiredString(manifest.sourcePolicy?.name, 'source policy name')
requiredString(manifest.sourcePolicy?.identityRule, 'identity rule')
requiredString(manifest.sourcePolicy?.purposeRule, 'purpose rule')
requiredString(manifest.sourcePolicy?.imageRule, 'image rule')
requiredString(
  manifest.sourcePolicy?.takedownProcedure,
  'takedown procedure',
)
if (
  !Array.isArray(manifest.records) ||
  manifest.records.length < 1 ||
  manifest.records.length > MAX_RECORDS
) {
  fail(`records must contain 1-${MAX_RECORDS} reviewed objects`)
}
await verifyImmutableVersion()
verifyPurposeSource(manifest.constellationContext?.starlink, 'Starlink general context')

const catalogById = new Map(
  catalog.records.map((record) => [record.noradCatalogId, record]),
)
const seenIds = new Set()
const expectedFiles = new Set(['LICENSES.md'])
let imageCount = 0
let totalBytes = 0
let previousId = 0
const licenseText = await readFile(
  path.join(versionDirectory, 'LICENSES.md'),
  'utf8',
)
const headersText = await readFile(
  path.join(publicRoot, '_headers'),
  'utf8',
)
if (
  !headersText.includes(
    '/orbital-enrichment/*\n  Cache-Control: public, max-age=31536000, immutable',
  )
) {
  fail('orbital enrichment assets must use one-year immutable caching')
}

for (const [index, record] of manifest.records.entries()) {
  const label = `record ${index + 1}`
  const id = requiredString(
    record.noradCatalogId,
    `${label} NORAD catalog ID`,
    9,
  )
  if (!/^[1-9][0-9]{0,8}$/.test(id)) {
    fail(`${label} NORAD catalog ID is invalid`)
  }
  const numericId = Number(id)
  if (numericId <= previousId) fail('records must be sorted by NORAD ID')
  previousId = numericId
  if (seenIds.has(id)) fail(`duplicate NORAD catalog ID ${id}`)
  seenIds.add(id)

  const catalogRecord = catalogById.get(id)
  if (!catalogRecord) fail(`NORAD ${id} is absent from the visual catalog`)
  for (const [field, actual, expected] of [
    ['object name', record.objectNameAtReview, catalogRecord.name],
    [
      'international designator',
      record.internationalDesignatorAtReview,
      catalogRecord.internationalDesignator,
    ],
    ['catalog type', record.catalogTypeAtReview, catalogRecord.objectType],
  ]) {
    requiredString(actual, `${id} ${field}`, 120)
    if (actual !== expected) {
      fail(`${id} ${field} does not match the reviewed visual catalog`)
    }
  }

  verifyPurposeSource(record.purpose, id)
  requiredString(
    record.purpose?.identityEvidence,
    `${id} purpose identity evidence`,
    1_000,
  )

  const image = record.image
  if (!image) continue
  imageCount += 1
  if (!['photograph', 'illustration'].includes(image.kind)) {
    fail(`${id} image kind is invalid`)
  }
  requiredString(image.alt, `${id} image alt`, 240)
  requiredString(
    image.identityEvidence?.sourceId,
    `${id} image source ID`,
    120,
  )
  requiredString(
    image.identityEvidence?.sourceTitle,
    `${id} image source title`,
    240,
  )
  requiredHttpsUrl(
    image.identityEvidence?.sourcePageUrl,
    `${id} image source page`,
  )
  requiredHttpsUrl(
    image.identityEvidence?.sourceRevisionUrl,
    `${id} image source revision`,
  )
  requiredSha256(
    image.identityEvidence?.sourceRevisionSha256,
    `${id} image source revision digest`,
  )
  requiredString(
    image.identityEvidence?.reviewNote,
    `${id} image identity evidence`,
    1_000,
  )

  requiredHttpsUrl(
    image.source?.canonicalOriginalUrl,
    `${id} canonical original image URL`,
  )
  requiredHttpsUrl(image.source?.reviewedUrl, `${id} reviewed image URL`)
  if (!['image/jpeg', 'image/png'].includes(image.source?.reviewedMediaType)) {
    fail(`${id} reviewed media type is invalid`)
  }
  requiredPositiveInteger(image.source?.reviewedBytes, `${id} reviewed bytes`)
  requiredPositiveInteger(image.source?.reviewedWidth, `${id} reviewed width`)
  requiredPositiveInteger(
    image.source?.reviewedHeight,
    `${id} reviewed height`,
  )
  requiredSha256(
    image.source?.reviewedSha256,
    `${id} reviewed image digest`,
  )
  if (image.source?.capturedAt !== undefined) {
    requiredDate(image.source.capturedAt, `${id} capture date`)
  }
  requiredDate(
    image.source?.sourceRetrievedAt,
    `${id} image retrieval date`,
  )

  requiredString(image.rights?.owner, `${id} rights owner`, 160)
  requiredString(image.rights?.sourceName, `${id} image source`, 120)
  requiredString(
    image.rights?.usagePolicyName,
    `${id} usage policy name`,
    160,
  )
  requiredHttpsUrl(
    image.rights?.usagePolicyUrl,
    `${id} usage policy URL`,
  )
  requiredString(image.rights?.creditLine, `${id} credit line`, 240)
  if (typeof image.rights?.publicDomain !== 'boolean') {
    fail(`${id} publicDomain must be boolean`)
  }
  requiredString(image.rights?.restrictions, `${id} restrictions`, 600)

  const assetPath = requiredString(image.asset?.path, `${id} asset path`, 240)
  const expectedPrefix =
    `/orbital-enrichment/${manifest.manifestVersion}/norad-${id}.`
  if (!assetPath.startsWith(expectedPrefix)) {
    fail(`${id} asset path must use the immutable version and NORAD ID`)
  }
  if (!['image/jpeg', 'image/png'].includes(image.asset?.mediaType)) {
    fail(`${id} asset media type is invalid`)
  }
  if (image.asset.mediaType !== image.source.reviewedMediaType) {
    fail(`${id} asset media type differs from the reviewed source`)
  }
  const expectedExtension =
    image.asset.mediaType === 'image/png' ? '.png' : '.jpg'
  if (!assetPath.endsWith(expectedExtension)) {
    fail(`${id} asset extension does not match media type`)
  }
  const fileName = path.basename(assetPath)
  expectedFiles.add(fileName)
  const bytes = await readFile(path.join(versionDirectory, fileName))
  if (bytes.byteLength > MAX_ASSET_BYTES) {
    fail(`${id} asset exceeds ${MAX_ASSET_BYTES} bytes`)
  }
  totalBytes += bytes.byteLength
  if (bytes.byteLength !== image.asset.bytes) {
    fail(`${id} asset byte count does not match`)
  }
  if (image.asset.bytes !== image.source.reviewedBytes) {
    fail(`${id} asset byte count differs from the reviewed source`)
  }
  const assetSha256 = requiredSha256(image.asset.sha256, `${id} digest`)
  if (assetSha256 !== image.source.reviewedSha256) {
    fail(`${id} asset digest differs from the reviewed source`)
  }
  if (sha256(bytes) !== assetSha256) {
    fail(`${id} asset digest does not match`)
  }
  const dimensions = imageDimensions(bytes, image.asset.mediaType)
  if (
    dimensions.width !== image.asset.width ||
    dimensions.height !== image.asset.height
  ) {
    fail(`${id} asset dimensions do not match`)
  }
  if (
    dimensions.width !== image.source.reviewedWidth ||
    dimensions.height !== image.source.reviewedHeight
  ) {
    fail(`${id} asset dimensions differ from the reviewed source`)
  }
  requiredString(
    image.asset?.modificationNotice,
    `${id} modification notice`,
    400,
  )
  for (const requiredNotice of [
    id,
    image.rights.creditLine,
    image.rights.usagePolicyUrl,
  ]) {
    if (!licenseText.includes(requiredNotice)) {
      fail(`LICENSES.md is missing ${requiredNotice}`)
    }
  }
}

if (imageCount < 1) fail('at least one reviewed image is required')
if (totalBytes > MAX_TOTAL_BYTES) {
  fail(`assets exceed the ${MAX_TOTAL_BYTES}-byte total limit`)
}
const actualFiles = new Set(
  (await readdir(versionDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name),
)
if (
  actualFiles.size !== expectedFiles.size ||
  [...actualFiles].some((file) => !expectedFiles.has(file))
) {
  fail('version directory contains missing or unreviewed files')
}

console.log(
  `Orbital enrichment ${manifest.manifestVersion}: ${manifest.records.length} records, ${imageCount} images, ${totalBytes} bytes`,
)
