import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TRAFFIC_MODEL_CONFIG } from '../../config/appConfig'
import { TrafficModelLayer, loadTrafficModelLayer } from './trafficModelRuntime'

const committed = readFileSync(new URL('../../assets/models/traffic-models-v1.glb', import.meta.url))

const glbResponse = (body: BodyInit = new Uint8Array(committed), init: ResponseInit = {}) =>
  new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'model/gltf-binary' },
    ...init,
  })

const load = (fetchImpl: typeof fetch, signal = new AbortController().signal) =>
  loadTrafficModelLayer({ signal, onFailure: vi.fn(), fetchImpl, url: '/assets/models.glb' })

afterEach(() => {
  vi.useRealTimers()
})

describe('loadTrafficModelLayer', () => {
  it('fetches the bundled asset without credentials or referrer and returns a layer', async () => {
    const fetchImpl = vi.fn(async () => glbResponse())
    const layer = await load(fetchImpl)
    expect(layer).toBeInstanceOf(TrafficModelLayer)
    expect(fetchImpl).toHaveBeenCalledWith('/assets/models.glb', {
      method: 'GET',
      signal: expect.any(AbortSignal),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
  })

  it('defaults to the hashed bundled asset URL', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL) => glbResponse())
    await loadTrafficModelLayer({ signal: new AbortController().signal, onFailure: vi.fn(), fetchImpl })
    expect(fetchImpl.mock.calls[0][0]).toMatch(/traffic-models-v1(-[\w-]+)?\.glb$/)
  })

  it('accepts a generic binary content type', async () => {
    const response = glbResponse(undefined, { headers: { 'Content-Type': 'application/octet-stream' } })
    await expect(load(vi.fn(async () => response))).resolves.toBeInstanceOf(TrafficModelLayer)
  })

  it('rejects HTTP failures and cancels their bodies', async () => {
    const cancel = vi.fn(async () => undefined)
    const response = new Response('missing', { status: 404 })
    vi.spyOn(response.body!, 'cancel').mockImplementation(cancel)
    await expect(load(vi.fn(async () => response))).rejects.toThrow('HTTP 404')
    expect(cancel).toHaveBeenCalled()
  })

  it('rejects an HTML fallback, oversized bodies and malformed models', async () => {
    const html = new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } })
    await expect(load(vi.fn(async () => html))).rejects.toThrow()
    const oversized = glbResponse(new Uint8Array(TRAFFIC_MODEL_CONFIG.maximumAssetBytes + 1))
    await expect(load(vi.fn(async () => oversized))).rejects.toThrow()
    const malformed = glbResponse(new Uint8Array(committed).slice(0, 400))
    await expect(load(vi.fn(async () => malformed))).rejects.toThrow()
  })

  it('reports caller cancellation as an AbortError', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(load(vi.fn(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    const pending = new AbortController()
    const fetchImpl = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const loading = load(fetchImpl, pending.signal)
    pending.abort()
    await expect(loading).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('stops a stalled request at the asset deadline', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const loading = load(fetchImpl)
    const assertion = expect(loading).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(TRAFFIC_MODEL_CONFIG.assetDeadlineMs)
    await assertion
  })
})
