import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DISCOVERY_CONFIG } from '../src/config/discoveryConfig.js'
import { handleObjectLookup } from './objectLookup.js'
import type { AircraftProxyFetch } from './aircraftProxy.js'

const request = (path = '/api/find/ships', body: unknown = { by: 'name', q: 'TEST' }, init: RequestInit = {}) =>
  new Request(`https://app.example${path}`, {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }, ...init,
  })

  describe('explicit newest ship report Worker operation', () => {
    const mmsi = '230123456'
    const to = Date.UTC(2026, 9, 24, 20)
    const from = to - DISCOVERY_CONFIG.shipPositionWindowMs
    const input = () => request('/api/find/ships', { by: 'position', q: mmsi })
    const track = (points: 0 | 1 = 1) => ({
      type: 'Feature', id: Number(mmsi),
      geometry: points ? { type: 'Point', coordinates: [24.75, 59.44] } : null,
      properties: {
        mmsi: Number(mmsi), from: new Date(from).toISOString(), to: new Date(to).toISOString(),
        points, interval: 0, truncated: points === 1, times: points ? [new Date(to - 5_000).toISOString()] : [],
      },
      attribution: points ? { digitraffic: 'Fintraffic · CC BY 4.0' } : {},
    })
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(to + 789) })

    it.each(['application/geo+json', 'application/json'])('makes one exact newest-point request and accepts %s', async (contentType) => {
      const fetchImpl = vi.fn<AircraftProxyFetch>(async () => Response.json(track(), { headers: { 'Content-Type': contentType } }))
      const response = await handleObjectLookup(input(), { fetchImpl })
      expect(response.status).toBe(200)
      expect(fetchImpl).toHaveBeenCalledOnce()
      const url = new URL(String(fetchImpl.mock.calls[0][0]))
      expect(url.origin).toBe('https://ais.openwaters.io')
      expect(url.pathname).toBe(`/v1/vessels/${mmsi}/track`)
      expect(Object.fromEntries(url.searchParams)).toEqual({
        from: new Date(from).toISOString(), to: new Date(to).toISOString(), interval: '0', limit: '1', format: 'geojson',
      })
      expect(fetchImpl.mock.calls[0][1]).toMatchObject({
        method: 'GET', cache: 'no-store', redirect: 'manual',
        headers: { Accept: 'application/geo+json', 'User-Agent': 'LiveTrafficStan (+https://github.com/vasilyevstan/LiveTrafficStan)' },
      })
      expect(await response.json()).toMatchObject({
        matches: [{
          identifiers: { mmsi }, metadataReportedAt: null,
          location: { latitude: 59.44, longitude: 24.75, reportedAt: to - 5_000 },
          source: { code: 'open-waters-track', credit: 'Fintraffic · CC BY 4.0' },
        }],
        truncated: false, rejectedRecords: 0,
      })
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
    })
    it('reserves successful empty for a valid 200 with zero points, not even the identity endpoint documented 404', async () => {
      const empty = await handleObjectLookup(input(), { fetchImpl: async () => shipResponse(track(0)) })
      expect(empty.status).toBe(200)
      expect(await empty.json()).toMatchObject({ matches: [] })
      const unavailable = await handleObjectLookup(input(), {
        fetchImpl: async () => Response.json({ error: 'unknown vessel' }, { status: 404 }),
      })
      expect(unavailable.status).toBe(502)
    })
    it.each([403, 429, 503, 500, 302])('preserves a position HTTP %i failure rather than a false missing report', async (status) => {
      const fetchImpl = vi.fn<AircraftProxyFetch>(async () => new Response('source error', {
        status, headers: { 'Retry-After': '45', Location: 'https://evil.example' },
      }))
      const response = await handleObjectLookup(input(), { fetchImpl })
      expect(response.status).toBe([403, 429, 503].includes(status) ? status : 502)
      expect(response.headers.get('Retry-After')).toBe('45')
      expect(response.headers.has('Location')).toBe(false)
      expect(fetchImpl).toHaveBeenCalledOnce()
    })
    it.each(['001234567', '23012345', '230123456/track', '000000000'])('rejects unsupported position identity %s before contact', async (q) => {
      const fetchImpl = vi.fn<AircraftProxyFetch>()
      expect((await handleObjectLookup(request(undefined, { by: 'position', q }), { fetchImpl })).status).toBe(400)
      expect(fetchImpl).not.toHaveBeenCalled()
    })
    it('enforces the small position byte cap and rejects malformed or crossed-identity tracks', async () => {
      for (const body of [
        { ...track(), id: 230123457 },
        { ...track(), properties: { ...track().properties, points: 2 } },
        { ...track(), extra: 'x'.repeat(DISCOVERY_CONFIG.shipPositionMaximumBytes) },
        collection(),
      ]) {
        const response = await handleObjectLookup(input(), { fetchImpl: async () => shipResponse(body) })
        expect(response.status).toBe(502)
      }
    })
    it('bounds a stalled position body and incoming cancellation with the existing total deadline', async () => {
      const pending = handleObjectLookup(input(), {
        fetchImpl: async () => new Response(new ReadableStream(), { headers: { 'Content-Type': 'application/json' } }),
        timeoutMs: 100,
      })
      await vi.advanceTimersByTimeAsync(100)
      expect((await pending).status).toBe(504)
      const controller = new AbortController()
      const canceled = handleObjectLookup(request(undefined, { by: 'position', q: mmsi }, { signal: controller.signal }), {
        fetchImpl: async () => new Response(new ReadableStream(), { headers: { 'Content-Type': 'application/json' } }),
      })
      controller.abort()
      expect((await canceled).status).toBe(499)
    })
  })
const collection = () => ({
  type: 'FeatureCollection', attribution: { digitraffic: 'Fintraffic · CC BY 4.0' },
  features: [{
    type: 'Feature', id: 230123456, geometry: { type: 'Point', coordinates: [24.75, 59.44] },
    properties: {
      kind: 'vessel', mmsi: 230123456, name: 'TEST SHIP', source: 'digitraffic:station', seen: new Date(Date.now()).toISOString(),
    },
  }],
})
const shipResponse = (body: unknown = collection()) => Response.json(body, { headers: { 'Content-Type': 'application/geo+json' } })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('fixed object lookup Worker boundary', () => {
  it('projects identities from the fixed upstream and forwards no browser context or credentials', async () => {
    const fetchImpl = vi.fn<AircraftProxyFetch>(async () => shipResponse())
    const response = await handleObjectLookup(request(undefined, undefined, {
      headers: {
        'Content-Type': 'application/json', Origin: 'https://app.example', Cookie: 'private=true',
        Authorization: 'browser-test', 'X-Forwarded-For': '192.0.2.1',
      },
    }), { fetchImpl })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ objectClass: 'ships', matches: [{ location: null, identifiers: { mmsi: '230123456' } }] })
    expect(JSON.stringify(body)).not.toContain('geometry')
    expect(fetchImpl).toHaveBeenCalledWith('https://ais.openwaters.io/v1/vessels?q=TEST&kind=vessel', expect.objectContaining({
      method: 'GET', redirect: 'manual', cache: 'no-store',
      headers: { Accept: 'application/geo+json', 'User-Agent': 'LiveTrafficStan (+https://github.com/vasilyevstan/LiveTrafficStan)' },
    }))
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
  })
  it('uses the existing aircraft transport with exact canonical identifier only', async () => {
    const aircraftFetchImpl = vi.fn<AircraftProxyFetch>(async () => Response.json({
      ac: [{ hex: 'abc123', seen: 1, lat: 59.44, lon: 24.75, seen_pos: 10 }], now: Date.now(), total: 1,
    }))
    const fetchImpl = vi.fn<AircraftProxyFetch>()
    const response = await handleObjectLookup(request('/api/find/aircraft', { by: 'hex', q: 'ABC123' }), { aircraftFetchImpl, fetchImpl })
    expect(response.status).toBe(200)
    expect(aircraftFetchImpl).toHaveBeenCalledWith('https://api.adsb.lol/v2/hex/abc123', expect.objectContaining({ method: 'GET' }))
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await response.json()).toMatchObject({ matches: [{ key: 'adsb-lol:abc123', location: { latitude: 59.44 } }] })
  })
  it('keeps a shared-aircraft admission response busy and preserves Retry-After', async () => {
    const aircraftFetchImpl = vi.fn<AircraftProxyFetch>(async () => new Response('wait', { status: 503, headers: { 'Retry-After': '20' } }))
    const response = await handleObjectLookup(request('/api/find/aircraft', { by: 'reg', q: 'G-ABCD' }), { aircraftFetchImpl })
    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('20')
    expect(aircraftFetchImpl).toHaveBeenCalledOnce()
  })
  it.each([
    [{ by: 'imo', q: '8919805' }, 400],
    [{ by: 'name', q: 'A' }, 400],
    [{ by: 'name', q: 'X'.repeat(101) }, 400],
    [{ by: 'name', q: 'TEST', url: 'https://evil.example' }, 400],
    [{ by: 'name', q: 'TEST\nSHIP' }, 400],
    [{ by: 'mmsi', q: '123' }, 400],
    [[], 400],
    [{ by: 'name', q: 'X'.repeat(3_000) }, 400],
  ])('rejects invalid or oversized submitted bodies before upstream work', async (body, status) => {
    const fetchImpl = vi.fn<AircraftProxyFetch>()
    expect((await handleObjectLookup(request(undefined, body), { fetchImpl })).status).toBe(status)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it.each([
    ['/api/find/ships?by=name&q=TEST', 400],
    ['/api/find/ships?', 400],
    ['/api/find/ships/extra', 404],
    ['/api/find/unknown', 404],
  ])('rejects URL %s', async (path, status) => {
    const fetchImpl = vi.fn<AircraftProxyFetch>()
    expect((await handleObjectLookup(request(path), { fetchImpl })).status).toBe(status)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it.each(['GET', 'HEAD', 'PUT', 'OPTIONS'])('permits POST only, not %s', async (method) => {
    const fetchImpl = vi.fn<AircraftProxyFetch>()
    const response = await handleObjectLookup(new Request('https://app.example/api/find/ships', { method }), { fetchImpl })
    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('POST')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it.each([['Origin', 'https://evil.example'], ['Sec-Fetch-Site', 'cross-site']])('rejects a cross-origin browser operation', async (header, value) => {
    const fetchImpl = vi.fn<AircraftProxyFetch>()
    expect((await handleObjectLookup(request(undefined, undefined, { headers: { 'Content-Type': 'application/json', [header]: value } }), { fetchImpl })).status).toBe(403)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('preserves leading zero MMSI and accepts only the documented unknown-vessel 404 as empty', async () => {
    const fetchImpl = vi.fn<AircraftProxyFetch>(async () => Response.json({ error: 'unknown vessel' }, { status: 404 }))
    const response = await handleObjectLookup(request(undefined, { by: 'mmsi', q: '001234567' }), { fetchImpl })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ matches: [], truncated: false })
    expect(fetchImpl.mock.calls[0][0]).toBe('https://ais.openwaters.io/v1/vessels/001234567')
    const invalid = await handleObjectLookup(request(undefined, { by: 'mmsi', q: '001234567' }), {
      fetchImpl: async () => Response.json({ error: 'other error' }, { status: 404 }),
    })
    expect(invalid.status).toBe(502)
  })
  it.each([429, 503, 403, 500, 302])('does not turn HTTP %i into successful empty or retry it', async (status) => {
    const fetchImpl = vi.fn<AircraftProxyFetch>(async () => new Response('source error', {
      status, headers: { 'Retry-After': '30', Location: 'https://evil.example' },
    }))
    const response = await handleObjectLookup(request(), { fetchImpl })
    expect(response.status).toBe([429, 503, 403].includes(status) ? status : 502)
    expect(response.headers.get('Retry-After')).toBe('30')
    expect(response.headers.has('Location')).toBe(false)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
  it.each([
    new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('invalid', { headers: { 'Content-Type': 'application/geo+json' } }),
    new Response(Uint8Array.from([0xff]), { headers: { 'Content-Type': 'application/geo+json' } }),
    new Response('x'.repeat(DISCOVERY_CONFIG.maximumBytes + 1), { headers: { 'Content-Type': 'application/geo+json' } }),
  ])('rejects invalid/oversized upstream data without exposing it', async (source) => {
    const response = await handleObjectLookup(request(), { fetchImpl: async () => source.clone() })
    expect(response.status).toBe(502)
    expect(await response.text()).toContain('unavailable or invalid')
  })
  it('includes inbound request-body reading in its total deadline', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const input = request()
    Object.defineProperty(input, 'body', { value: new ReadableStream({ cancel }) })
    const fetchImpl = vi.fn<AircraftProxyFetch>()
    const pending = handleObjectLookup(input, { fetchImpl, timeoutMs: 100 })
    await vi.advanceTimersByTimeAsync(100)
    expect((await pending).status).toBe(504)
    expect(cancel).toHaveBeenCalledOnce()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it.each(['ships', 'aircraft'])('bounds stalled %s response bodies including shared forwarding', async (kind) => {
    vi.useFakeTimers()
    const fetchImpl: AircraftProxyFetch = async () => new Response(new ReadableStream(), {
      headers: { 'Content-Type': kind === 'ships' ? 'application/geo+json' : 'application/json' },
    })
    const pending = handleObjectLookup(request(`/api/find/${kind}`, kind === 'ships' ? { by: 'name', q: 'TEST' } : { by: 'hex', q: 'abc123' }), { fetchImpl, timeoutMs: 100 })
    await vi.advanceTimersByTimeAsync(100)
    expect((await pending).status).toBe(504)
  })
  it('reports explicit cancellation separately from invalid input or a timeout', async () => {
    const controller = new AbortController()
    const input = request(undefined, undefined, { signal: controller.signal })
    Object.defineProperty(input, 'body', { value: new ReadableStream() })
    const pending = handleObjectLookup(input, { fetchImpl: vi.fn() })
    controller.abort()
    expect((await pending).status).toBe(499)
  })
})
