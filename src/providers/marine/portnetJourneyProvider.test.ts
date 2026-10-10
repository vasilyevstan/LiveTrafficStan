import { afterEach, describe, expect, it, vi } from 'vitest'
import { JOURNEY_CONFIG as config } from '../../config/appConfig'
import { DigitrafficJourneyProvider } from './portnetJourneyProvider'
import { JOURNEY_TEST_MMSI as mmsi, JOURNEY_TEST_NOW as now, portCallsFixture, portCoordinateFixture } from './marineJourneyFixtures'

const vessel = { mmsi, imo: 8919805, position: { latitude: 59.6, longitude: 24.7, observedAt: now } }
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
afterEach(() => vi.useRealTimers())

describe('explicit bounded Portnet context', () => {
  it('rejects invalid MMSI and report clocks before constructing any request', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const provider = new DigitrafficJourneyProvider({ fetchImpl, now: () => now })
    for (const [identity, observedAt] of [[23, now], [NaN, now], [mmsi, NaN], [mmsi, now + 1_000], [mmsi, now - 86_401_000]]) {
      await expect(provider.lookup({
        ...vessel, mmsi: identity!, position: { ...vessel.position, observedAt: observedAt! },
      }, new AbortController().signal)).rejects.toThrow('invalid')
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('makes one exact call and at most two coded reference reads, with fulfilled-only reuse', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async input => {
      const url = new URL(String(input))
      return response(url.pathname.endsWith('port-calls') ? portCallsFixture()
        : portCoordinateFixture(url.pathname.split('/').at(-1), 'VUOS'))
    })
    const provider = new DigitrafficJourneyProvider({ fetchImpl, now: () => now })
    expect(fetchImpl).not.toHaveBeenCalled()
    const context = await provider.lookup(vessel, new AbortController().signal)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(new URL(String(fetchImpl.mock.calls[0]![0])).searchParams.get('mmsi')).toBe(String(mmsi))
    expect(fetchImpl.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/api/port-call/v1/port-calls', '/api/port-call/v1/ports/FIHEL', '/api/port-call/v1/ports/FIKTK',
    ])
    for (const [input, init] of fetchImpl.mock.calls) {
      expect(new URL(String(input)).origin).toBe(config.portnetOrigin)
      expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store' })
    }
    expect(context.departure?.areaCode).toBe('VUOS')
    expect(await provider.lookup(vessel, new AbortController().signal)).toBe(context)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('honors the shared retry deadline, treating overflow as invalid guidance rather than an infinite lock', async () => {
    let clock = now
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '1e308' } }))
      .mockResolvedValueOnce(response({ dataUpdatedTime: new Date(now).toISOString(), portCalls: [] }))
    const provider = new DigitrafficJourneyProvider({ fetchImpl, now: () => clock })
    await expect(provider.lookup(vessel, new AbortController().signal)).rejects.toThrow('HTTP 429')
    clock += config.marineHistoryRetryMs - 1
    await expect(provider.lookup({ ...vessel, mmsi: mmsi + 1 }, new AbortController().signal)).rejects.toThrow('rate-limited')
    clock++
    await expect(provider.lookup(vessel, new AbortController().signal)).resolves.toMatchObject({ departure: undefined })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('fences late aborted results and keeps the total deadline across reference work', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(portCallsFixture()))
      .mockImplementation((_url, init) => new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })))
    const provider = new DigitrafficJourneyProvider({ fetchImpl, now: () => now })
    const expectation = expect(provider.lookup(vessel, new AbortController().signal)).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(config.portnetTimeoutMs)
    await expectation
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
  })
})
