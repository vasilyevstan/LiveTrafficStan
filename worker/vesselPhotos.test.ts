import { afterEach, describe, expect, it, vi } from 'vitest'
import { VESSEL_PHOTO_CONFIG } from '../src/config/vesselPhotoConfig.js'
import { handleVesselPhotos } from './vesselPhotos.js'
import worker from './index.js'

const request = (suffix = '8919805', init?: RequestInit) =>
  new Request(`https://app.example/api/vessel-photos/${suffix}`, init)

describe('vessel photo boundary', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uses only Open Waters with necessary headers and no browser information', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ photos: [], links: {} }, { headers: { 'Cache-Control': 'public, max-age=86400' } }))
    const result = await handleVesselPhotos(request('8919805', { headers: {
      Cookie: 'private=true', Authorization: 'private', Referer: 'https://app.example/?location=private',
    } }), { fetchImpl })
    expect(result.status).toBe(200)
    expect(result.headers.get('Cache-Control')).toBe('no-store')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openwaters.io/ais/vessels/media/8919805',
      expect.objectContaining({
        redirect: 'manual', cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LiveTrafficStan (+https://github.com/vasilyevstan/LiveTrafficStan)',
        },
      }),
    )
    expect(result.headers.has('Access-Control-Allow-Origin')).toBe(false)
  })

  it.each(['8919806', '970000000', '123', '08919805', '8919805?url=https://example.org', '%38%39%31%39%38%30%35', '8919805/extra'])('rejects noncanonical input %s without upstream work', async (number) => {
    const fetchImpl = vi.fn()
    expect((await handleVesselPhotos(request(number), { fetchImpl })).status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('allows exact ordinary MMSI fallback, and rejects writes and foreign origins', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ photos: [] }))
    expect((await handleVesselPhotos(request('368168720'), { fetchImpl })).status).toBe(200)
    expect((await handleVesselPhotos(request('8919805', { method: 'POST' }), { fetchImpl })).status).toBe(405)
    expect((await handleVesselPhotos(request('8919805', { headers: { Origin: 'https://other.example' } }), { fetchImpl })).status).toBe(403)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('preserves Retry-After and rejects redirects instead of following a new host', async () => {
    const limited = await handleVesselPhotos(request(), { fetchImpl: async () => new Response(null, { status: 429, headers: { 'Retry-After': '45' } }) })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe('45')
    const redirected = await handleVesselPhotos(request(), { fetchImpl: async () => new Response(null, { status: 302, headers: { Location: 'https://other.example' } }) })
    expect(redirected.status).toBe(502)
  })

  it('does not call a cached upstream failure a successful empty lookup', async () => {
    const result = await handleVesselPhotos(request(), { fetchImpl: async () =>
      Response.json({ photos: [], links: {} }, { headers: { 'Cache-Control': 'public, max-age=900' } }) })
    expect(result.status).toBe(503)
    expect(result.headers.get('Retry-After')).toBe('900')
  })

  it('rejects malformed, HTML and oversized responses', async () => {
    for (const response of [
      new Response('<html>Error</html>', { headers: { 'Content-Type': 'text/html' } }),
      Response.json({ wrong: [] }),
      new Response(new Uint8Array(VESSEL_PHOTO_CONFIG.maximumBytes + 1), { headers: { 'Content-Type': 'application/json' } }),
    ]) {
      expect((await handleVesselPhotos(request(), { fetchImpl: async () => response })).status).toBe(502)
    }
  })

  it('cancels slow upstream work at its total deadline', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const pending = handleVesselPhotos(request(), {
      timeoutMs: 20,
      fetchImpl: (_input, init) => {
        signal = init?.signal ?? undefined
        return new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))))
      },
    })
    await vi.advanceTimersByTimeAsync(20)
    expect((await pending).status).toBe(504)
    expect(signal?.aborted).toBe(true)
  })

  it('routes photos independently of aircraft delivery, marine credentials, and assets', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ photos: [] }))
    const assets = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const sha = 'a'.repeat(40)
    const response = await worker.fetch(request(), {
      ASSETS: { fetch: assets }, AIRCRAFT_DELIVERY: 'oci-private-relay', RELEASE_SHA: sha,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('X-LiveTrafficStan-Release')).toBe(sha)
    expect(assets).not.toHaveBeenCalled()
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
