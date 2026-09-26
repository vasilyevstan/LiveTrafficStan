import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import manifest from '../src/config/vesselPhotoManifest.json' with {
  type: 'json',
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const publicRoot = path.join(repositoryRoot, 'public')
const versionDirectory = path.join(
  publicRoot,
  'vessel-photos',
  manifest.manifestVersion,
)
const LICENSE_URLS = new Map([
  ['CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0/'],
  ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'],
  ['CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
])
const MAX_ASSET_BYTES = 512 * 1024
const MAX_TOTAL_BYTES = 1024 * 1024
const execFile = promisify(execFileCallback)

const fail = (message) => {
  throw new Error(`Vessel photo integrity check failed: ${message}`)
}

const requiredString = (value, label) => {
  if (typeof value !== 'string' || value.trim() !== value || value === '') {
    fail(`${label} must be a non-empty trimmed string`)
  }
  return value
}

const requiredPositiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(`${label} must be a positive integer`)
  }
  return value
}

const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex')

const isValidImo = (value) => {
  if (!/^[0-9]{7}$/.test(value)) return false
  const weights = [7, 6, 5, 4, 3, 2]
  const checksum = weights.reduce(
    (total, weight, index) =>
      total + Number(value[index]) * weight,
    0,
  )
  return checksum % 10 === Number(value[6])
}

const imageDimensions = (bytes, mediaType) => {
  if (mediaType === 'image/png') {
    const signature = bytes.subarray(0, 8).toString('hex')
    if (signature !== '89504e470d0a1a0a') fail('PNG signature is invalid')
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

const requireHttpsUrl = (value, label, host) => {
  const url = new URL(requiredString(value, label))
  if (url.protocol !== 'https:' || url.hostname !== host) {
    fail(`${label} must use https://${host}`)
  }
  return url
}

const gitObjectExists = async (object) => {
  try {
    await execFile('git', ['cat-file', '-e', object], {
      cwd: repositoryRoot,
    })
    return true
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 128
    ) {
      return false
    }
    throw error
  }
}

const verifyImmutableVersion = async () => {
  const base = process.env.VESSEL_PHOTO_IMMUTABLE_BASE
  if (base === undefined || /^0{40}$/.test(base)) return
  if (!/^[0-9a-f]{40}$/.test(base)) {
    fail('VESSEL_PHOTO_IMMUTABLE_BASE must be a full lowercase commit SHA')
  }
  if (!(await gitObjectExists(`${base}^{commit}`))) {
    fail('immutable comparison base is unavailable')
  }

  const manifestPath = 'src/config/vesselPhotoManifest.json'
  const versionPath = `public/vessel-photos/${manifest.manifestVersion}`
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
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 1
        ) {
          fail(
            'published vessel-photo version changed; choose a new manifest version',
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
      'manifest version reuses a vessel-photo path from repository history',
    )
  }
}

if (manifest.schemaVersion !== 1) fail('schemaVersion must be 1')
if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}-v[0-9]+$/.test(manifest.manifestVersion)) {
  fail('manifestVersion is invalid')
}
if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(manifest.reviewedAt)) {
  fail('reviewedAt is invalid')
}
requiredString(manifest.sourcePolicy?.name, 'source policy name')
requiredString(manifest.sourcePolicy?.identityRule, 'identity rule')
requiredString(
  manifest.sourcePolicy?.takedownProcedure,
  'takedown procedure',
)
if (!Array.isArray(manifest.photos)) fail('photos must be an array')
await verifyImmutableVersion()

const seenImos = new Set()
const expectedFiles = new Set(['LICENSES.md'])
let totalBytes = 0
const headersText = await readFile(
  path.join(publicRoot, '_headers'),
  'utf8',
)
if (
  !headersText.includes(
    '/vessel-photos/*\n  Cache-Control: public, max-age=31536000, immutable',
  )
) {
  fail('vessel-photo assets must use one-year immutable caching')
}
const licenseText = await readFile(
  path.join(versionDirectory, 'LICENSES.md'),
  'utf8',
)

for (const [index, photo] of manifest.photos.entries()) {
  const label = `photo ${index + 1}`
  const imo = requiredString(photo.imo, `${label} IMO`)
  if (!isValidImo(imo)) fail(`${label} IMO checksum is invalid`)
  if (seenImos.has(imo)) fail(`duplicate IMO ${imo}`)
  seenImos.add(imo)

  const vesselName = requiredString(
    photo.vesselNameAtReview,
    `${imo} vessel name`,
  )
  requiredString(photo.alt, `${imo} alt text`)
  if (!/^[0-9]{9}$/.test(photo.digitrafficEvidence?.mmsiAtReview)) {
    fail(`${imo} review MMSI is invalid`)
  }
  if (
    !Number.isFinite(
      Date.parse(photo.digitrafficEvidence?.metadataObservedAt),
    )
  ) {
    fail(`${imo} Digitraffic observation timestamp is invalid`)
  }
  requiredString(
    photo.digitrafficEvidence?.destinationAtReview,
    `${imo} review destination`,
  )
  requiredString(
    photo.digitrafficEvidence?.operatingAreaAtReview,
    `${imo} review operating area`,
  )

  const qid = requiredString(
    photo.identityEvidence?.wikidataQid,
    `${imo} Wikidata QID`,
  )
  if (!/^Q[1-9][0-9]*$/.test(qid)) fail(`${imo} Wikidata QID is invalid`)
  const wikidataUrl = requireHttpsUrl(
    photo.identityEvidence?.wikidataItemUrl,
    `${imo} Wikidata URL`,
    'www.wikidata.org',
  )
  if (wikidataUrl.pathname !== `/wiki/${qid}`) {
    fail(`${imo} Wikidata URL does not match its QID`)
  }
  const fileTitle = requiredString(
    photo.identityEvidence?.commonsFileTitle,
    `${imo} Commons file title`,
  )
  if (!fileTitle.startsWith('File:')) {
    fail(`${imo} Commons file title must start with File:`)
  }
  const commonsPageUrl = requireHttpsUrl(
    photo.identityEvidence?.commonsPageUrl,
    `${imo} Commons page URL`,
    'commons.wikimedia.org',
  )
  if (
    decodeURIComponent(commonsPageUrl.pathname.slice('/wiki/'.length))
      .replaceAll('_', ' ') !== fileTitle
  ) {
    fail(`${imo} Commons page URL does not match its file title`)
  }
  const revisionId = requiredPositiveInteger(
    photo.identityEvidence?.commonsRevisionId,
    `${imo} Commons revision ID`,
  )
  const revisionUrl = requireHttpsUrl(
    photo.identityEvidence?.commonsRevisionUrl,
    `${imo} Commons revision URL`,
    'commons.wikimedia.org',
  )
  const revisionTitle = revisionUrl.searchParams
    .get('title')
    ?.replaceAll('_', ' ')
  if (
    revisionUrl.pathname !== '/w/index.php' ||
    revisionTitle !== fileTitle ||
    revisionUrl.searchParams.get('oldid') !== String(revisionId)
  ) {
    fail(`${imo} Commons revision URL is not pinned to its declared revision`)
  }
  const reviewNote = requiredString(
    photo.identityEvidence?.reviewNote,
    `${imo} identity review note`,
  )
  if (!reviewNote.includes(imo) || !reviewNote.includes(vesselName)) {
    fail(`${imo} identity review note must name the IMO and vessel`)
  }

  if (
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(
      requiredString(photo.source?.photoTakenAt, `${imo} photo date`),
    )
  ) {
    fail(`${imo} photo date is invalid`)
  }
  const originalUrl = requireHttpsUrl(
    photo.source?.originalUrl,
    `${imo} original URL`,
    'upload.wikimedia.org',
  )
  const commonsFilename = fileTitle.slice('File:'.length)
  const originalFilename = decodeURIComponent(
    path.posix.basename(originalUrl.pathname),
  ).replaceAll('_', ' ')
  if (originalFilename !== commonsFilename) {
    fail(`${imo} original URL does not match its Commons file title`)
  }
  if (!['image/jpeg', 'image/png'].includes(photo.source?.originalMediaType)) {
    fail(`${imo} original media type is unsupported`)
  }
  requiredPositiveInteger(photo.source?.originalBytes, `${imo} original bytes`)
  requiredPositiveInteger(photo.source?.originalWidth, `${imo} original width`)
  requiredPositiveInteger(
    photo.source?.originalHeight,
    `${imo} original height`,
  )
  if (!/^[0-9a-z]{40}$/.test(photo.source?.originalSha1 ?? '')) {
    fail(`${imo} original SHA-1 is invalid`)
  }
  const reviewedThumbnailUrl = requireHttpsUrl(
    photo.source?.reviewedThumbnailUrl,
    `${imo} reviewed thumbnail URL`,
    'thumb.wikimedia.org',
  )
  const thumbnailSourceFilename = decodeURIComponent(
    reviewedThumbnailUrl.pathname.split('/').at(-2) ?? '',
  ).replaceAll('_', ' ')
  if (thumbnailSourceFilename !== commonsFilename) {
    fail(`${imo} thumbnail URL does not match its Commons file title`)
  }
  requiredPositiveInteger(
    photo.source?.reviewedThumbnailBytes,
    `${imo} reviewed thumbnail bytes`,
  )
  requiredPositiveInteger(
    photo.source?.reviewedThumbnailWidth,
    `${imo} reviewed thumbnail width`,
  )
  requiredPositiveInteger(
    photo.source?.reviewedThumbnailHeight,
    `${imo} reviewed thumbnail height`,
  )
  if (!/^[0-9a-f]{64}$/.test(photo.source?.reviewedThumbnailSha256 ?? '')) {
    fail(`${imo} reviewed thumbnail SHA-256 is invalid`)
  }

  const author = requiredString(photo.rights?.author, `${imo} author`)
  if (photo.rights?.sourceName !== 'Wikimedia Commons') {
    fail(`${imo} source name must be Wikimedia Commons`)
  }
  const licenseName = requiredString(
    photo.rights?.licenseName,
    `${imo} license`,
  )
  const expectedLicenseUrl = LICENSE_URLS.get(licenseName)
  if (
    expectedLicenseUrl === undefined ||
    photo.rights?.licenseUrl !== expectedLicenseUrl
  ) {
    fail(`${imo} license metadata is unsupported`)
  }
  const creditLine = requiredString(
    photo.rights?.creditLine,
    `${imo} credit line`,
  )
  if (
    creditLine !== `${author} / Wikimedia Commons / ${licenseName}`
  ) {
    fail(`${imo} credit line must use the reviewed author and license`)
  }
  if (typeof photo.rights?.attributionRequired !== 'boolean') {
    fail(`${imo} attribution requirement must be boolean`)
  }
  if (
    photo.rights.attributionRequired !==
    (licenseName !== 'CC0 1.0')
  ) {
    fail(`${imo} attribution requirement does not match its license`)
  }

  const assetPath = requiredString(photo.asset?.path, `${imo} asset path`)
  const expectedPrefix = `/vessel-photos/${manifest.manifestVersion}/`
  if (
    !assetPath.startsWith(expectedPrefix) ||
    assetPath.includes('..') ||
    assetPath.includes('\\')
  ) {
    fail(`${imo} asset path is outside the manifest version`)
  }
  const mediaType = photo.asset?.mediaType
  const expectedExtension =
    mediaType === 'image/jpeg'
      ? '.jpg'
      : mediaType === 'image/png'
        ? '.png'
        : undefined
  if (
    expectedExtension === undefined ||
    path.posix.extname(assetPath).toLowerCase() !== expectedExtension
  ) {
    fail(`${imo} asset media type or extension is unsupported`)
  }
  if (
    path.posix.basename(assetPath) !== `imo-${imo}${expectedExtension}`
  ) {
    fail(`${imo} asset filename must use its exact IMO`)
  }

  const relativeAssetPath = assetPath.slice(1)
  const absoluteAssetPath = path.resolve(publicRoot, relativeAssetPath)
  if (
    path.relative(publicRoot, absoluteAssetPath).startsWith('..')
  ) {
    fail(`${imo} asset resolves outside public`)
  }
  const bytes = await readFile(absoluteAssetPath)
  const expectedBytes = requiredPositiveInteger(
    photo.asset?.bytes,
    `${imo} asset bytes`,
  )
  if (expectedBytes > MAX_ASSET_BYTES) {
    fail(`${imo} asset exceeds ${MAX_ASSET_BYTES} bytes`)
  }
  if (bytes.byteLength !== expectedBytes) {
    fail(`${imo} asset bytes do not match the manifest`)
  }
  if (
    !/^[0-9a-f]{64}$/.test(photo.asset?.sha256 ?? '') ||
    sha256(bytes) !== photo.asset.sha256
  ) {
    fail(`${imo} asset SHA-256 does not match the manifest`)
  }
  const dimensions = imageDimensions(bytes, mediaType)
  if (
    dimensions.width !== photo.asset?.width ||
    dimensions.height !== photo.asset?.height
  ) {
    fail(`${imo} asset dimensions do not match the manifest`)
  }
  if (Math.max(dimensions.width, dimensions.height) > 640) {
    fail(`${imo} asset exceeds the 640-pixel dimension limit`)
  }
  requiredString(
    photo.asset?.modificationNotice,
    `${imo} modification notice`,
  )

  const basename = path.basename(absoluteAssetPath)
  expectedFiles.add(basename)
  totalBytes += bytes.byteLength
  for (const requiredText of [
    imo,
    author,
    licenseName,
    photo.identityEvidence.commonsRevisionUrl,
    photo.asset.sha256,
  ]) {
    if (!licenseText.includes(requiredText)) {
      fail(`LICENSES.md is missing ${requiredText}`)
    }
  }
}

if (totalBytes > MAX_TOTAL_BYTES) {
  fail(`assets exceed the ${MAX_TOTAL_BYTES}-byte total budget`)
}

const actualEntries = await readdir(versionDirectory, {
  withFileTypes: true,
})
if (actualEntries.some((entry) => !entry.isFile())) {
  fail('version directory must contain files only')
}
const actualFiles = new Set(actualEntries.map((entry) => entry.name))
if (
  actualFiles.size !== expectedFiles.size ||
  [...actualFiles].some((file) => !expectedFiles.has(file))
) {
  fail('version directory contains an orphaned or missing file')
}

console.log(
  `Vessel photos ${manifest.manifestVersion}: ${manifest.photos.length} exact IMO entries, ${totalBytes} bytes`,
)
