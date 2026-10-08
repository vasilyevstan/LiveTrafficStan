import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AIRPORT_BOARD_CONFIG as config } from '../../config/airportBoardConfig'
import { SameOriginAirportBoardProvider } from './airportBoardProvider'
import { AIRPORT_BOARD_TEST_NOW as now, airportBoardFixture } from './airportBoardFixtures'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now) })
afterEach(() => vi.useRealTimers())

describe('same-origin airport-board provider', () => {
  it('makes zero construction requests and uses only the fixed credential-free route on explicit lookup', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(airportBoardFixture()))
    const provider = new SameOriginAirportBoardProvider({ fetchImpl })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await provider.lookup('EETN', new AbortController().signal)).toEqual(airportBoardFixture())
    expect(fetchImpl).toHaveBeenCalledWith('/api/airports/board?icao=EETN', expect.objectContaining({
      method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer',
      redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' },
    }))
  })

  it('refuses invalid identifiers before requesting anything', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const provider = new SameOriginAirportBoardProvider({ fetchImpl })
    for (const code of ['eetn', 'TLL', 'EETN&other=EFHK', '../EETN']) {
      await expect(provider.lookup(code, new AbortController().signal)).rejects.toMatchObject({ status: 400 })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('preserves provider Retry-After across different airport lookups', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(
      { error: 'The shared free airport-board allowance is exhausted' },
      { status: 429, headers: { 'Retry-After': '120' } },
    ))
    const provider = new SameOriginAirportBoardProvider({ fetchImpl })
    await expect(provider.lookup('EETN', new AbortController().signal)).rejects.toMatchObject({ status: 429, retryAfterMs: 120_000 })
    expect(provider.retryAt).toBe(now + 120_000)
    await expect(provider.lookup('EFHK', new AbortController().signal)).rejects.toMatchObject({ status: 429 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(120_000)
    fetchImpl.mockResolvedValue(Response.json(airportBoardFixture(Date.now(), 'EFHK')))
    await expect(provider.lookup('EFHK', new AbortController().signal)).resolves.toMatchObject({ airportIcao: 'EFHK' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('handles HTTP-date retry deadlines without a retry timer or automatic request', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(
      { error: 'Temporarily unavailable' },
      { status: 503, headers: { 'Retry-After': new Date(now + 60_000).toUTCString() } },
    ))
    const provider = new SameOriginAirportBoardProvider({ fetchImpl })
    await expect(provider.lookup('EETN', new AbortController().signal)).rejects.toMatchObject({ retryAfterMs: 60_000 })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it.each([
    () => Response.json({ ...airportBoardFixture(), airportIcao: 'EFHK' }),
    () => Response.json({ ...airportBoardFixture(), schemaVersion: 2 }),
    () => Response.json(airportBoardFixture(now - config.maximumDisplayAgeMs)),
    () => Response.json(airportBoardFixture(now + config.maximumClockSkewMs + 1)),
    () => new Response('x'.repeat(config.maximumClientBytes + 1), { headers: { 'Content-Type': 'application/json' } }),
    () => new Response('{}', { headers: { 'Content-Type': 'text/html' } }),
  ])('rejects wrong-identity, malformed, expired or unbounded data rather than showing it', async makeResponse => {
    const provider = new SameOriginAirportBoardProvider({ fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(makeResponse()) })
    await expect(provider.lookup('EETN', new AbortController().signal)).rejects.toThrow()
  })

  it('cancels an active lookup without returning late data', async () => {
    let resolve!: (response: Response) => void
    const fetchImpl = vi.fn<typeof fetch>().mockReturnValue(new Promise<Response>(done => { resolve = done }))
    const provider = new SameOriginAirportBoardProvider({ fetchImpl })
    const controller = new AbortController()
    const result = provider.lookup('EETN', controller.signal)
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    resolve(Response.json(airportBoardFixture()))
    await rejected
  })

  it('enforces one total request/body deadline', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    const provider = new SameOriginAirportBoardProvider({ fetchImpl })
    const result = expect(provider.lookup('EETN', new AbortController().signal)).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(config.clientTimeoutMs)
    await result
  })
})
