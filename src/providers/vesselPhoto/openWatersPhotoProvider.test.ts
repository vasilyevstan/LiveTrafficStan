import { afterEach, describe, expect, it, vi } from 'vitest'
import { VESSEL_PHOTO_CONFIG } from '../../config/vesselPhotoConfig'
import { vesselPhotoIdentity, type VesselPhotoIdentity } from '../../domain/vesselPhoto'
import { OpenWatersPhotoProvider, parseOpenWatersPhotoResponse } from './openWatersPhotoProvider'

const identity: VesselPhotoIdentity = { entityId: 'vessel:230172000', kind: 'IMO', number: '8919805' }
const image = {
  thumb: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Ship.jpg/960px-Ship.jpg?source=imageinfo',
  width: 960,
  height: 640,
  page: 'https://commons.wikimedia.org/wiki/File:Ship.jpg',
  artist: 'Example photographer',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  description: 'A historical vessel photograph',
}

describe('Open Waters vessel photos', () => {
  afterEach(() => vi.useRealTimers())

  it('prefers the reported valid IMO and otherwise uses only an ordinary MMSI', () => {
    expect(vesselPhotoIdentity({ id: identity.entityId, mmsi: 230172000, imo: 8919805 })).toEqual(identity)
    expect(vesselPhotoIdentity({ id: identity.entityId, mmsi: 230172000, imo: 8919806 }))
      .toEqual({ entityId: identity.entityId, kind: 'MMSI', number: '230172000' })
    expect(vesselPhotoIdentity({ id: 'vessel:970000000', mmsi: 970000000 })).toBeUndefined()
    expect(vesselPhotoIdentity({ id: 'vessel:NaN', mmsi: NaN })).toBeUndefined()
  })

  it('loads one fixed same-origin number route without credentials, referrer, or URL rewriting', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ photos: [image], links: {} }))
    const result = await new OpenWatersPhotoProvider(fetchImpl).lookup(identity, new AbortController().signal)
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledWith('/api/vessel-photos/8919805', expect.objectContaining({
      credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store',
      headers: { Accept: 'application/json' },
    }))
    expect(result).toMatchObject({ kind: 'available', photo: {
      lookupKind: 'IMO', lookupNumber: '8919805', thumbnailUrl: image.thumb,
      pageUrl: image.page, artist: image.artist, license: image.license,
    } })
  })

  it('does not restrict coverage to the bundled eight ships', () => {
    expect(parseOpenWatersPhotoResponse({ photos: [image] }, identity)).toMatchObject({
      kind: 'available', photo: { lookupNumber: '8919805' },
    })
    expect(parseOpenWatersPhotoResponse({ photos: [image] }, {
      entityId: 'vessel:368168720', kind: 'MMSI', number: '368168720',
    })).toMatchObject({ kind: 'available', photo: { lookupKind: 'MMSI' } })
  })

  it('distinguishes a successful empty response from malformed or unsupported images', () => {
    expect(parseOpenWatersPhotoResponse({ photos: [] }, identity)).toEqual({ kind: 'unavailable', reason: 'not-found' })
    for (const body of [{}, { photos: null }, { photos: Array(9).fill(image) }, { photos: [{ ...image, artist: '' }] }, { photos: [{ ...image, license: 'All rights reserved' }] }]) {
      expect(() => parseOpenWatersPhotoResponse(body, identity)).toThrow('invalid-response')
    }
  })

  it.each([
    { thumb: 'https://thumb.wikimedia.org.evil.example/image.jpg' },
    { thumb: 'https://user:password@thumb.wikimedia.org/wikipedia/commons/a.jpg' },
    { page: 'javascript:alert(1)' },
    { page: 'https://example.org/wiki/File:Ship.jpg' },
    { licenseUrl: 'https://example.org/license' },
    { width: 0 },
    { height: 100000 },
  ])('rejects unsafe or unbounded photo metadata: %j', (change) => {
    expect(() => parseOpenWatersPhotoResponse({ photos: [{ ...image, ...change }] }, identity)).toThrow('invalid-response')
  })

  it('does not issue a request for an invalid or type-conflicting identifier', async () => {
    const fetchImpl = vi.fn()
    const provider = new OpenWatersPhotoProvider(fetchImpl)
    for (const invalid of [{ ...identity, number: '8919806' }, { ...identity, number: '230172000' }]) {
      await expect(provider.lookup(invalid, new AbortController().signal))
        .resolves.toEqual({ kind: 'unavailable', reason: 'invalid-identity' })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('preserves throttling and enforces a streamed byte cap', async () => {
    const throttled = new OpenWatersPhotoProvider(async () => new Response(null, { status: 429, headers: { 'Retry-After': '30' } }))
    await expect(throttled.lookup(identity, new AbortController().signal))
      .rejects.toMatchObject({ reason: 'throttled', retryAfterMs: 30000 })
    const oversized = new OpenWatersPhotoProvider(async () => new Response(new Uint8Array(VESSEL_PHOTO_CONFIG.maximumBytes + 1), { headers: { 'Content-Type': 'application/json' } }))
    await expect(oversized.lookup(identity, new AbortController().signal)).rejects.toMatchObject({ reason: 'invalid-response' })
  })

  it('distinguishes timeout, caller cancellation, and provider error without retries', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))))
    const provider = new OpenWatersPhotoProvider(fetchImpl)
    const pending = provider.lookup(identity, new AbortController().signal)
    const assertion = expect(pending).rejects.toMatchObject({ reason: 'timeout' })
    await vi.advanceTimersByTimeAsync(VESSEL_PHOTO_CONFIG.timeoutMs)
    await assertion
    const controller = new AbortController()
    const canceled = provider.lookup(identity, controller.signal)
    const cancelAssertion = expect(canceled).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await cancelAssertion
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
