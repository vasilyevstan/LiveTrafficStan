import { afterEach, describe, expect, it, vi } from 'vitest'
import { SameOriginObjectLookupProvider } from './objectLookupProvider'
import { DISCOVERY_CONFIG } from '../../config/discoveryConfig'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
const request = { objectClass: 'ships', by: 'name', query: 'TEST PRIVATE QUERY' } as const
const result = { objectClass: 'ships', retrievedAt: Date.now(), matches: [], truncated: false, rejectedRecords: 0 }

describe('same-origin explicit lookup', () => {
  it('sends submitted text only in a fixed POST body, without browser identity or URL attribution', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json(result))
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal
    expect(await new SameOriginObjectLookupProvider().lookup(request, signal)).toEqual(result)
    expect(fetchMock).toHaveBeenCalledWith('/api/find/ships', {
      method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store',
      signal, headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: '{"by":"name","q":"TEST PRIVATE QUERY"}',
    })
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(request.query)
  })
  it('uses the separate fixed aircraft path', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ ...result, objectClass: 'aircraft' }))
    vi.stubGlobal('fetch', fetchMock)
    await new SameOriginObjectLookupProvider().lookup({ objectClass: 'aircraft', by: 'hex', query: 'abc123' }, new AbortController().signal)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/find/aircraft')
  })
  it('sends a position operation in the same fixed POST body, never an MMSI-bearing browser URL', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json(result))
    vi.stubGlobal('fetch', fetchMock)
    await new SameOriginObjectLookupProvider().lookup(
      { objectClass: 'ships', by: 'position', query: '230123456' }, new AbortController().signal,
    )
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/find/ships', expect.objectContaining({
      method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store',
      body: '{"by":"position","q":"230123456"}',
    }))
  })
  it.each([429, 503])('shares actual %i backoff between identity and position operations, not with aircraft', async (status) => {
    vi.useFakeTimers()
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('limited', { status, headers: { 'Retry-After': '45' } }))
      .mockImplementation(async (input) => Response.json({
        ...result, retrievedAt: Date.now(), objectClass: input === '/api/find/aircraft' ? 'aircraft' : 'ships',
      }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new SameOriginObjectLookupProvider()
    const signal = new AbortController().signal
    const position = { objectClass: 'ships', by: 'position', query: '230123456' } as const
    await expect(provider.lookup(request, signal)).rejects.toMatchObject({ status })
    await expect(provider.lookup(position, signal)).rejects.toMatchObject({ status: 429, retryAfterMs: 45_000 })
    expect(fetchMock).toHaveBeenCalledOnce()
    await provider.lookup({ objectClass: 'aircraft', by: 'hex', query: 'abc123' }, signal)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(45_000)
    await provider.lookup(position, signal)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
  it('retains an observed late source limit even if the old consumer aborted', async () => {
    vi.useFakeTimers()
    let resolve: ((response: Response) => void) | undefined
    const fetchMock = vi.fn<typeof fetch>(() => new Promise((done) => { resolve = done }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new SameOriginObjectLookupProvider()
    const controller = new AbortController()
    const pending = provider.lookup(request, controller.signal)
    controller.abort()
    resolve?.(new Response('limited', { status: 429 }))
    await expect(pending).rejects.toMatchObject({ status: 429 })
    await expect(provider.lookup({ objectClass: 'ships', by: 'position', query: '230123456' }, new AbortController().signal))
      .rejects.toMatchObject({ status: 429, retryAfterMs: DISCOVERY_CONFIG.rateLimitFallbackMs })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
  it('uses the smaller one-point response byte cap', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...result, extra: 'x'.repeat(DISCOVERY_CONFIG.shipPositionMaximumBytes) })))
    await expect(new SameOriginObjectLookupProvider().lookup(
      { objectClass: 'ships', by: 'position', query: '230123456' }, new AbortController().signal,
    )).rejects.toThrow()
  })
  it.each([429, 503])('preserves %i Retry-After without an automatic retry', async (status) => {
    const fetchMock = vi.fn(async () => new Response('limited', { status, headers: { 'Retry-After': '45' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(new SameOriginObjectLookupProvider().lookup(request, new AbortController().signal))
      .rejects.toMatchObject({ status, retryAfterMs: 45_000 })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
  it.each([
    new Response('<html>app</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('invalid', { headers: { 'Content-Type': 'application/json' } }),
    new Response('[]', { headers: { 'Content-Type': 'application/json' } }),
    new Response('x'.repeat(DISCOVERY_CONFIG.maximumBytes + 1), { headers: { 'Content-Type': 'application/json' } }),
    new Response(Uint8Array.from([0xff]), { headers: { 'Content-Type': 'application/json' } }),
  ])('rejects malformed, non-owned or oversized responses', async (response) => {
    vi.stubGlobal('fetch', vi.fn(async () => response.clone()))
    await expect(new SameOriginObjectLookupProvider().lookup(request, new AbortController().signal)).rejects.toThrow()
  })
})
