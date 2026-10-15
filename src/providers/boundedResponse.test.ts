import { describe, expect, it, vi } from 'vitest'
import { readBoundedBytes } from './boundedResponse'

describe('bounded response streaming', () => {
  it('counts actual streamed bytes without trusting an absent or small length', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(Uint8Array.from([1, 2]))
        controller.enqueue(Uint8Array.from([3, 4]))
        controller.close()
      },
    })
    const response = new Response(body, { headers: { 'Content-Type': 'application/json', 'Content-Length': '1' } })
    await expect(readBoundedBytes(response, 3, ['application/json'])).rejects.toThrow('oversized')
  })
  it('accepts a complete exactly bounded body', async () => {
    expect(await readBoundedBytes(new Response('{}', { headers: { 'Content-Type': 'application/json; charset=utf-8' } }), 2, ['application/json']))
      .toEqual(Uint8Array.from([123, 125]))
  })
  it('cancels a stalled body under the caller total deadline', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    const controller = new AbortController()
    const pending = readBoundedBytes(new Response(body, { headers: { 'Content-Type': 'application/json' } }), 100, ['application/json'], controller.signal)
    controller.abort(new Error('total deadline'))
    await expect(pending).rejects.toThrow('total deadline')
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })
  it('handles an already aborted operation without leaving a locked reader', async () => {
    const controller = new AbortController()
    controller.abort(new Error('canceled'))
    const response = new Response('{}', { headers: { 'Content-Type': 'application/json' } })
    await expect(readBoundedBytes(response, 100, ['application/json'], controller.signal)).rejects.toThrow('canceled')
    expect(response.body?.locked).toBe(false)
  })
})
