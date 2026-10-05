import { describe, expect, it, vi } from 'vitest'
import { VESSEL_PHOTO_CONFIG } from '../config/vesselPhotoConfig'
import type { PhotoLookupResult } from '../domain/photo'
import {
  vesselPhotoIdentityKey,
  type DynamicVesselPhoto,
  type VesselPhotoIdentity,
  type VesselPhotoViewState,
} from '../domain/vesselPhoto'
import { PhotoProviderError, type PhotoProvider } from '../providers/photo'
import { VesselPhotoController } from './VesselPhotoController'

const imo: VesselPhotoIdentity = { entityId: 'vessel:230123456', kind: 'IMO', number: '8919805' }
const mmsi: VesselPhotoIdentity = { entityId: imo.entityId, kind: 'MMSI', number: '230123456' }
const available = (identity: VesselPhotoIdentity): PhotoLookupResult<DynamicVesselPhoto> => ({
  kind: 'available',
  photo: {
    lookupKind: identity.kind,
    lookupNumber: identity.number,
    thumbnailUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Test.jpg',
    pageUrl: 'https://commons.wikimedia.org/wiki/File:Test.jpg',
    width: 640,
    height: 480,
    artist: 'Test photographer',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
})
type Provider = PhotoProvider<VesselPhotoIdentity, DynamicVesselPhoto>
const deferred = () => {
  let resolve!: (result: PhotoLookupResult<DynamicVesselPhoto>) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<PhotoLookupResult<DynamicVesselPhoto>>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe('VesselPhotoController', () => {
  it('fences MMSI-to-IMO-to-MMSI revisions for the same selected vessel', async () => {
    const pending = [deferred(), deferred(), deferred()]
    const signals: AbortSignal[] = []
    const provider: Provider = {
      lookup: vi.fn((_identity, signal) => {
        signals.push(signal)
        return pending[signals.length - 1].promise
      }),
    }
    const controller = new VesselPhotoController(provider, VESSEL_PHOTO_CONFIG)
    const states: VesselPhotoViewState[] = []
    controller.subscribe(state => states.push(state))
    controller.select(mmsi)
    expect(provider.lookup).not.toHaveBeenCalled()
    controller.requestIfMissing(mmsi)
    controller.requestIfMissing(imo)
    controller.requestIfMissing(mmsi)
    expect(signals.map(signal => signal.aborted)).toEqual([true, true, false])
    pending[0].resolve(available(mmsi))
    pending[1].reject(new PhotoProviderError('throttled', 60_000))
    await Promise.resolve()
    expect(states.at(-1)).toEqual({ phase: 'loading', identityKey: vesselPhotoIdentityKey(mmsi) })
    pending[2].resolve(available(mmsi))
    await Promise.resolve()
    expect(states.at(-1)).toMatchObject({
      phase: 'available', identityKey: vesselPhotoIdentityKey(mmsi),
      photo: { lookupKind: 'MMSI', lookupNumber: mmsi.number },
    })
    controller.dispose()
  })

  it('shares completed hover photos without confusing changed IMO or another vessel', async () => {
    const provider: Provider = { lookup: vi.fn(async identity => available(identity)) }
    const hover = new VesselPhotoController(provider, VESSEL_PHOTO_CONFIG)
    const details = new VesselPhotoController(provider, VESSEL_PHOTO_CONFIG)
    const states: VesselPhotoViewState[] = []
    hover.subscribe(() => undefined)
    details.subscribe(state => states.push(state))
    hover.requestIfMissing(imo)
    await Promise.resolve()
    details.requestIfMissing(imo)
    expect(provider.lookup).toHaveBeenCalledTimes(1)
    expect(states.at(-1)?.phase).toBe('available')
    details.select({ ...imo, number: '8917601' })
    expect(states.at(-1)?.phase).toBe('idle')
    details.select({ ...imo, entityId: 'vessel:230123457' })
    expect(states.at(-1)?.phase).toBe('idle')
    hover.dispose()
    details.dispose()
  })

  it('honors provider failure Retry-After across controllers without caching the failure', async () => {
    let now = 1_000
    const provider: Provider = {
      lookup: vi.fn<Provider['lookup']>()
        .mockRejectedValueOnce(new PhotoProviderError('provider-error', 900_000))
        .mockResolvedValueOnce(available(imo)),
    }
    const first = new VesselPhotoController(provider, VESSEL_PHOTO_CONFIG, { now: () => now })
    const second = new VesselPhotoController(provider, VESSEL_PHOTO_CONFIG, { now: () => now })
    const states: VesselPhotoViewState[] = []
    first.subscribe(state => states.push(state))
    first.request(imo)
    await Promise.resolve()
    expect(states.at(-1)).toMatchObject({ phase: 'error', reason: 'provider-error', retryAt: 901_000 })
    second.request(mmsi)
    expect(provider.lookup).toHaveBeenCalledTimes(1)
    now = 901_000
    first.request(imo)
    await Promise.resolve()
    expect(provider.lookup).toHaveBeenCalledTimes(2)
    expect(states.at(-1)?.phase).toBe('available')
    first.dispose()
    second.dispose()
  })

  it('aborts paused or disposed work and never caches its late result', async () => {
    const request = deferred()
    const signals: AbortSignal[] = []
    const provider: Provider = {
      lookup: vi.fn((_identity, signal) => {
        signals.push(signal)
        return request.promise
      }),
    }
    const controller = new VesselPhotoController(provider, VESSEL_PHOTO_CONFIG)
    const states: VesselPhotoViewState[] = []
    controller.subscribe(state => states.push(state))
    controller.requestIfMissing(imo)
    controller.select(undefined)
    expect(signals[0].aborted).toBe(true)
    request.resolve(available(imo))
    await Promise.resolve()
    expect(states.at(-1)).toEqual({ phase: 'idle' })
    controller.select(imo)
    expect(states.at(-1)?.phase).toBe('idle')
    controller.requestIfMissing(imo)
    controller.dispose()
    expect(signals[1].aborted).toBe(true)
  })
})
