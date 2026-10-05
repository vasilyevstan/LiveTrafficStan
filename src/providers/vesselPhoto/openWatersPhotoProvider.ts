import { VESSEL_PHOTO_CONFIG } from '../../config/vesselPhotoConfig'
import {
  isValidVesselPhotoNumber,
  type DynamicVesselPhoto,
  type VesselPhotoIdentity,
} from '../../domain/vesselPhoto'
import type { PhotoLookupResult } from '../../domain/photo'
import { isRecord } from '../guards'
import { parseRetryAfterMs } from '../errors'
import { PhotoProviderError, readBoundedPhotoJson, type PhotoProvider } from '../photo'

const text = (value: unknown, maximum: number) =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    value === value.trim() && !/\p{Cc}/u.test(value)
    ? value : undefined

const webUrl = (value: unknown, hosts: readonly string[], prefix: string) => {
  const candidate = text(value, 2_048)
  if (!candidate) return undefined
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' && hosts.includes(url.hostname) &&
      !url.port && !url.username && !url.password &&
      url.pathname.startsWith(prefix)
      ? candidate : undefined
  } catch {
    return undefined
  }
}

export const parseOpenWatersPhotoResponse = (
  value: unknown,
  identity: VesselPhotoIdentity,
): PhotoLookupResult<DynamicVesselPhoto> => {
  if (!isRecord(value) || !Array.isArray(value.photos) ||
    value.photos.length > VESSEL_PHOTO_CONFIG.maximumPhotos) {
    throw new PhotoProviderError('invalid-response')
  }
  if (value.photos.length === 0) return { kind: 'unavailable', reason: 'not-found' }

  for (const entry of value.photos) {
    if (!isRecord(entry)) continue
    const thumbnailUrl = webUrl(
      entry.thumb, ['thumb.wikimedia.org', 'upload.wikimedia.org'], '/wikipedia/commons/',
    )
    const pageUrl = webUrl(entry.page, ['commons.wikimedia.org'], '/wiki/File:')
    const artist = text(entry.artist, 500)
    const license = text(entry.license, 100)
    const licenseUrl = entry.licenseUrl === undefined ? undefined
      : webUrl(entry.licenseUrl, ['creativecommons.org'], '/')
    const supportedLicense = license !== undefined &&
      (/^CC (?:BY|BY-SA) (?:1\.0|2\.0|2\.5|3\.0|4\.0)$/.test(license) ||
        /^(?:CC0 1\.0|Public domain|PDM 1\.0)$/.test(license))
    if (!thumbnailUrl || !pageUrl || !artist || !license || !supportedLicense ||
      (license?.startsWith('CC ') && !licenseUrl) ||
      typeof entry.width !== 'number' || !Number.isSafeInteger(entry.width) ||
      entry.width < 1 || entry.width > 1_024 ||
      typeof entry.height !== 'number' || !Number.isSafeInteger(entry.height) ||
      entry.height < 1 || entry.height > 4_096) continue

    return {
      kind: 'available',
      photo: {
        lookupKind: identity.kind,
        lookupNumber: identity.number,
        thumbnailUrl,
        width: entry.width,
        height: entry.height,
        pageUrl,
        artist,
        license,
        licenseUrl,
        description: text(entry.description, 2_000),
      },
    }
  }
  throw new PhotoProviderError('invalid-response')
}

type PhotoFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export class OpenWatersPhotoProvider implements PhotoProvider<VesselPhotoIdentity, DynamicVesselPhoto> {
  private readonly fetchImpl: PhotoFetch

  constructor(
    fetchImpl: PhotoFetch = (input, init) => fetch(input, init),
  ) {
    this.fetchImpl = fetchImpl
  }

  async lookup(identity: VesselPhotoIdentity, signal: AbortSignal) {
    if (!isValidVesselPhotoNumber(identity.number) ||
      (identity.kind === 'IMO' ? identity.number.length !== 7 : identity.number.length !== 9)) {
      return { kind: 'unavailable', reason: 'invalid-identity' } as const
    }
    signal.throwIfAborted()
    const controller = new AbortController()
    const abort = () => controller.abort(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, VESSEL_PHOTO_CONFIG.timeoutMs)
    try {
      const response = await this.fetchImpl(
        `${VESSEL_PHOTO_CONFIG.path}/${identity.number}`,
        {
          method: 'GET', signal: controller.signal, redirect: 'error',
          credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
          headers: { Accept: 'application/json' },
        },
      )
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => undefined)
        throw new PhotoProviderError(
          response.status === 429 ? 'throttled' :
            response.status === 403 ? 'forbidden' :
              response.status === 504 ? 'timeout' : 'provider-error',
          parseRetryAfterMs(response.headers.get('Retry-After')),
        )
      }
      const value = await readBoundedPhotoJson(response, VESSEL_PHOTO_CONFIG.maximumBytes)
      signal.throwIfAborted()
      if (timedOut) throw new PhotoProviderError('timeout')
      return parseOpenWatersPhotoResponse(value, identity)
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof PhotoProviderError) throw error
      throw new PhotoProviderError(timedOut ? 'timeout' : error instanceof TypeError ? 'network' : 'provider-error')
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
    }
  }
}
