import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OBJECT_SHARE_CONFIG as config } from '../config/objectShareConfig'
import type { ObjectShareContext } from '../domain/objectShare'
import { requestObjectShare } from './objectShareRequest'
import { ObjectShareStartup, startObjectShare } from './objectShareStartup'

const now = Date.UTC(2026, 9, 23, 12)
const token = 'Ab9_-1234567'
const context: ObjectShareContext = { version: 1, kind: 'aircraft', identifier: 'abcdef', label: 'PUBLIC', source: 'ADSB.lol' }
const receipt = { token, context, createdAt: now, expiresAt: now + config.lifetimeMs, serverNow: now }
const response = (body: unknown = receipt, status = 200, headers = {}) => Response.json(body, { status, headers })

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('bounded same-origin sharing transport', () => {
  it('uses fixed POST bodies with no credentials, referrer, redirect or cache', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(receipt, 201))
    expect(await requestObjectShare('create', context, new AbortController().signal, fetchImpl)).toEqual(receipt)
    expect(fetchImpl).toHaveBeenCalledWith('/api/share/create', expect.objectContaining({
      method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store',
      body: JSON.stringify(context),
    }))
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    { token: 'different123' }, { expiresAt: now + 1 }, { createdAt: -1 },
    { createdAt: now + 0.5, expiresAt: now + 0.5 + config.lifetimeMs, serverNow: now + 1 },
    { serverNow: now + 0.5 },
    { serverNow: now + config.lifetimeMs }, { context: { ...context, identifier: 'ABCDEF' } },
    { privateField: 'not permitted' },
  ])('rejects mismatched or malformed receipts: %j', async override => {
    await expect(requestObjectShare('resolve', token, new AbortController().signal,
      vi.fn<typeof fetch>().mockResolvedValue(response({ ...receipt, ...override })))).rejects.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('will not copy a creation receipt for another exact object', async () => {
    await expect(requestObjectShare('create', context, new AbortController().signal,
      vi.fn<typeof fetch>().mockResolvedValue(response({ ...receipt, context: { ...context, identifier: '123456' } }, 201))))
      .rejects.toThrow('could not be loaded or created')
  })

  it('distinguishes global opening limits, missing links and storage failures', async () => {
    for (const [status, message] of [[404, 'expired or is unavailable'], [429, 'daily shared-link opening limit'], [503, 'currently unavailable']] as const) {
      const operation = requestObjectShare('resolve', token, new AbortController().signal,
        vi.fn<typeof fetch>().mockResolvedValue(response({ error: 'ignored server text' }, status, { 'Retry-After': '120' })))
      await expect(operation).rejects.toMatchObject({ message: expect.stringContaining(message), retryAfterMs: 120_000 })
    }
  })

  it('bounds bytes and total time without retrying or leaking transport diagnostics', async () => {
    const oversized = vi.fn<typeof fetch>().mockResolvedValue(response({ text: 'x'.repeat(config.maximumResponseBytes) }))
    await expect(requestObjectShare('resolve', token, new AbortController().signal, oversized)).rejects.toThrow('could not')
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('private URL')), { once: true })))
    const operation = requestObjectShare('resolve', token, new AbortController().signal, fetchImpl)
    const checked = expect(operation).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(config.timeoutMs)
    await checked
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('one document-owned startup transaction', () => {
  it('adds no request or timer and preserves the whole legacy hash without an object intent', () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const history = { state: { retained: true }, replaceState: vi.fn() }
    expect(startObjectShare({ hash: '#v=1&lat=59', pathname: '/', search: '' }, history, fetchImpl)).toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(history.replaceState).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('removes token and appended preferences before analytics, but makes no malformed-link request', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const history = { state: { retained: true }, replaceState: vi.fn() }
    const startup = startObjectShare({
      hash: `#object=${token}&lat=12&ships=0`, pathname: '/', search: '?retained=1',
    }, history, fetchImpl)
    expect(history.replaceState).toHaveBeenCalledWith(history.state, '', '/?retained=1')
    expect(await startup?.result).toMatchObject({ error: expect.stringContaining('invalid') })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('resolves once for repeated StrictMode subscribers and consumes only once', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response())
    const startup = new ObjectShareStartup(token, fetchImpl)
    const results = await Promise.all([startup.result, startup.result, startup.result])
    expect(results.every(result => 'receipt' in result)).toBe(true)
    expect(results[1]).toBe(results[0])
    expect(results[2]).toBe(results[0])
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(startup.pending).toBe(false)
    expect(startup.consume()).toBe(true)
    expect(startup.consume()).toBe(false)
  })

  it('anchors remaining link lifetime before transport so late delivery cannot extend selection', async () => {
    const requestedAt = performance.now()
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 2_000))
      return response({ ...receipt, createdAt: now + 4_000 - config.lifetimeMs,
        expiresAt: now + 4_000, serverNow: now + 1_000 })
    })
    const startup = new ObjectShareStartup(token, fetchImpl)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await startup.result).toMatchObject({ linkDeadline: requestedAt + 3_000 })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(startup.consume()).toBe(true)
  })

  it('cannot be consumed after newer manual intent, even when a transport ignores cancellation', async () => {
    let finish: (value: Response) => void = () => undefined
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const first = new ObjectShareStartup(token, fetchImpl)
    expect(first.pending).toBe(true)
    expect(first.consume()).toBe(false)
    first.cancel()
    finish(response())
    expect(await first.result).toMatchObject({ error: expect.any(String) })
    expect(first.current).toBe(false)
    expect(first.consume()).toBe(false)
    const next = new ObjectShareStartup(token, vi.fn<typeof fetch>().mockResolvedValue(response()))
    await next.result
    expect(next.consume()).toBe(true)
    expect(first.consume()).toBe(false)
  })
})
