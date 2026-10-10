import { afterEach, describe, expect, it, vi } from 'vitest'
import { JOURNEY_CONFIG as config } from '../../config/appConfig'
import { OpenWatersJourneyProvider } from './marineJourneyProvider'
import { JOURNEY_TEST_MMSI as mmsi, JOURNEY_TEST_NOW as now, marineHistoryFixture } from './marineJourneyFixtures'

const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/geo+json' } })
afterEach(() => vi.useRealTimers())

describe('on-demand bounded Open Waters history', () => {
  it('rejects invalid identities and report clocks before requesting', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const provider = new OpenWatersJourneyProvider({ fetchImpl, now: () => now })
    for (const [identity, time] of [[23, now], [NaN, now], [mmsi, NaN], [mmsi, now + 1_000], [mmsi, now - 86_401_000]]) {
      await expect(provider.lookup(identity!, time!, new AbortController().signal)).rejects.toThrow('invalid')
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('makes zero startup requests and one explicit credential-free 24h request ending at report time', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(marineHistoryFixture()))
    const provider = new OpenWatersJourneyProvider({ fetchImpl, now: () => now + 1_000 })
    expect(fetchImpl).not.toHaveBeenCalled()
    const history = await provider.lookup(mmsi, now + 123, new AbortController().signal)
    const [input, init] = fetchImpl.mock.calls[0]!
    const url = new URL(String(input))
    expect(url.origin).toBe(config.marineHistoryOrigin)
    expect(url.pathname).toBe(`/v1/vessels/${mmsi}/track`)
    expect([...url.searchParams.keys()].sort()).toEqual(['format', 'from', 'limit', 'to'])
    expect(url.searchParams.get('to')).toBe(new Date(now).toISOString())
    expect(url.searchParams.get('from')).toBe(new Date(now - 86_400_000).toISOString())
    expect(url.searchParams.get('limit')).toBe('1000')
    expect(init).toMatchObject({
      method: 'GET', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
      cache: 'no-store', headers: { Accept: 'application/geo+json' },
    })
    expect(await provider.lookup(mmsi, now, new AbortController().signal)).toBe(history)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('honors Retry-After across identity changes, without polling or cached errors', async () => {
    let clock = now
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '120' } }))
      .mockResolvedValueOnce(response(marineHistoryFixture()))
    const provider = new OpenWatersJourneyProvider({ fetchImpl, now: () => clock })
    await expect(provider.lookup(mmsi, now, new AbortController().signal)).rejects.toThrow('rate-limited')
    clock += 60_000
    await expect(provider.lookup(mmsi + 1, now, new AbortController().signal)).rejects.toThrow('rate-limited')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    clock += 60_000
    await expect(provider.lookup(mmsi, now, new AbortController().signal)).resolves.toMatchObject({ mmsi })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('rejects redirects, wrong MIME and streamed byte overflow without caching', async () => {
    for (const bad of [
      new Response('', { status: 302 }),
      new Response('{}', { headers: { 'Content-Type': 'text/html' } }),
      new Response('x'.repeat(config.marineHistoryMaximumBytes + 1), { headers: { 'Content-Type': 'application/geo+json' } }),
      response({ ...marineHistoryFixture(), id: mmsi + 1 }),
    ]) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(bad).mockResolvedValueOnce(response(marineHistoryFixture()))
      const provider = new OpenWatersJourneyProvider({ fetchImpl, now: () => now })
      await expect(provider.lookup(mmsi, now, new AbortController().signal)).rejects.toThrow()
      await expect(provider.lookup(mmsi, now, new AbortController().signal)).resolves.toMatchObject({ mmsi })
      expect(fetchImpl).toHaveBeenCalledTimes(2)
    }
  })

  it('bounds cache entries and never admits an aborted late result', async () => {
    let complete!: (value: Response) => void
    const fetchImpl = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
      .mockImplementation(async input => {
        const url = new URL(String(input))
        return response(marineHistoryFixture(Number(url.pathname.split('/')[3])))
      })
    const provider = new OpenWatersJourneyProvider({ fetchImpl, now: () => now })
    const controller = new AbortController()
    const first = provider.lookup(mmsi, now, controller.signal)
    controller.abort()
    complete(response(marineHistoryFixture()))
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await provider.lookup(mmsi, now, new AbortController().signal)
    for (let i = 1; i <= config.marineHistoryCacheEntries; i += 1) {
      await provider.lookup(mmsi + i, now, new AbortController().signal)
    }
    await provider.lookup(mmsi, now, new AbortController().signal)
    expect(fetchImpl).toHaveBeenCalledTimes(config.marineHistoryCacheEntries + 3)
  })

  it('aborts at the total deadline and issues no retry by itself', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    const provider = new OpenWatersJourneyProvider({ fetchImpl, now: () => now })
    const pending = provider.lookup(mmsi, now, new AbortController().signal)
    const expectation = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(config.marineHistoryTimeoutMs)
    await expectation
    expect(vi.getTimerCount()).toBe(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
