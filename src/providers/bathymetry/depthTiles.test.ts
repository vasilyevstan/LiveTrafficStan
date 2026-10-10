import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BATHYMETRY_CONFIG } from '../../config/appConfig'
import { composeDepthTile, DepthTiles, depthTileUrls, parseDepthTile, validateDepthPng } from './depthTiles'

const pngHeader = () => {
  const bytes = new Uint8Array(33)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, 256)
  view.setUint32(20, 256)
  return bytes
}
const response = () => new Response(pngHeader(), { headers: { 'Content-Type': 'image/png' } })
const composed = () => new Uint8Array([137, 80, 78, 71]).buffer
const tile = 'modeled-depths://2/1/2'
const flush = () => vi.advanceTimersByTimeAsync(0)

describe('matched water-only depth tiles', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('permits only canonical bounded tiles and a matched fixed-origin release pair', () => {
    expect(parseDepthTile(tile)).toEqual({ z: 2, x: 1, y: 2 })
    expect(depthTileUrls(parseDepthTile(tile))).toEqual([
      'https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/2/1/2.png',
      'https://tiles.emodnet-bathymetry.eu/2020/baselayer_land/web_mercator/2/1/2.png',
    ])
    for (const url of [
      'https://example.test/tile', 'modeled-depths://13/0/0', 'modeled-depths://2/4/0',
      'modeled-depths://02/1/2', 'modeled-depths://2/-1/0', `${tile}?origin=other`,
    ]) expect(() => parseDepthTile(url)).toThrow()
    expect(() => validateDepthPng(pngHeader())).not.toThrow()
    expect(() => validateDepthPng(new TextEncoder().encode('<ServiceException>not PNG</ServiceException>'))).toThrow()
    const oversized = pngHeader()
    new DataView(oversized.buffer).setUint32(16, 65_535)
    expect(() => validateDepthPng(oversized)).toThrow()
  })

  it('subtracts actual land alpha, preserves ocean colors and closes decoded images', async () => {
    const images = [0, 1].map(() => ({ width: 256, height: 256, close: vi.fn() }))
    const decode = vi.fn().mockResolvedValueOnce(images[0]).mockResolvedValueOnce(images[1])
    const context = { drawImage: vi.fn(), globalCompositeOperation: 'source-over' }
    vi.stubGlobal('createImageBitmap', decode)
    vi.stubGlobal('OffscreenCanvas', class {
      getContext() { return context }
      async convertToBlob() { return new Blob([composed()], { type: 'image/png' }) }
    })
    await expect(composeDepthTile(pngHeader(), pngHeader(), new AbortController().signal)).resolves.toEqual(composed())
    expect(context.globalCompositeOperation).toBe('destination-out')
    expect(context.drawImage.mock.calls.map(([image]) => image)).toEqual(images)
    expect(images.every(image => image.close.mock.calls.length === 1)).toBe(true)
    expect(decode).toHaveBeenCalledTimes(2)
  })

  it('closes an image that finishes decoding after cancellation and fails unsupported browsers explicitly', async () => {
    const image = { width: 256, height: 256, close: vi.fn() }
    let finish: (value: typeof image) => void = () => undefined
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise(resolve => { finish = resolve })))
    vi.stubGlobal('OffscreenCanvas', class {})
    const controller = new AbortController()
    const pending = composeDepthTile(pngHeader(), pngHeader(), controller.signal)
    controller.abort()
    finish(image)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(image.close).toHaveBeenCalledOnce()
    vi.stubGlobal('OffscreenCanvas', undefined)
    await expect(composeDepthTile(pngHeader(), pngHeader(), new AbortController().signal))
      .rejects.toThrow('unavailable in this browser')
  })

  it('makes two anonymous reads per uncached tile and protects cached buffer ownership', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response())
    const compose = vi.fn<typeof composeDepthTile>().mockResolvedValue(composed())
    const loader = new DepthTiles(vi.fn(), fetchImpl, compose)
    const signal = new AbortController().signal
    await expect(loader.load(tile, signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchImpl).not.toHaveBeenCalled()
    loader.setEnabled(true)
    const first = await loader.load(tile, signal)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    for (const [, options] of fetchImpl.mock.calls) expect(options).toEqual({
      signal: expect.any(AbortSignal), credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
    })
    structuredClone(first.data, { transfer: [first.data] })
    expect(first.data.byteLength).toBe(0)
    loader.setEnabled(false)
    loader.setEnabled(true)
    expect((await loader.load(tile, signal)).data).toEqual(composed())
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(await loader.load(tile, signal)).not.toHaveProperty('cacheControl')
    await vi.advanceTimersByTimeAsync(BATHYMETRY_CONFIG.tileCacheMs)
    await loader.load(tile, signal)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    loader.dispose()
  })

  it('does not invoke the native window fetch with the tile loader as its receiver', async () => {
    const nativeFetch = vi.fn<typeof fetch>(async function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation')
      return response()
    })
    vi.stubGlobal('fetch', nativeFetch)
    const loader = new DepthTiles(vi.fn(), undefined, vi.fn<typeof composeDepthTile>().mockResolvedValue(composed()))
    loader.setEnabled(true)
    await expect(loader.load(tile, new AbortController().signal)).resolves.toEqual({ data: composed() })
    expect(nativeFetch).toHaveBeenCalledTimes(2)
    loader.dispose()
  })

  it('does not cache failed pairs or late compositions from a paused generation', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<ServiceException/>', { headers: { 'Content-Type': 'text/xml' } }))
      .mockImplementation(async () => response())
    let finish: (data: ArrayBuffer) => void = () => undefined
    const compose = vi.fn<typeof composeDepthTile>(() => new Promise(resolve => { finish = resolve }))
    const loader = new DepthTiles(vi.fn(), fetchImpl, compose)
    loader.setEnabled(true)
    const signal = new AbortController().signal
    await expect(loader.load(tile, signal)).rejects.toThrow()
    expect(compose).not.toHaveBeenCalled()
    const late = loader.load(tile, signal)
    await flush()
    loader.setEnabled(false)
    finish(composed())
    await expect(late).rejects.toMatchObject({ name: 'AbortError' })
    loader.setEnabled(true)
    compose.mockResolvedValue(composed())
    await loader.load(tile, signal)
    expect(fetchImpl).toHaveBeenCalledTimes(6)
    loader.dispose()
  })

  it('bounds fulfilled LRU entries without a timer-driven refresh', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response())
    const loader = new DepthTiles(vi.fn(), fetchImpl, vi.fn<typeof composeDepthTile>().mockResolvedValue(composed()))
    loader.setEnabled(true)
    const signal = new AbortController().signal
    for (let index = 0; index <= BATHYMETRY_CONFIG.tileCacheEntries; index += 1) {
      await loader.load(`modeled-depths://6/${index}/1`, signal)
    }
    const reads = fetchImpl.mock.calls.length
    await loader.load('modeled-depths://6/1/1', signal)
    expect(fetchImpl).toHaveBeenCalledTimes(reads)
    await loader.load('modeled-depths://6/0/1', signal)
    expect(fetchImpl).toHaveBeenCalledTimes(reads + 2)
    await vi.advanceTimersByTimeAsync(BATHYMETRY_CONFIG.tileCacheMs)
    expect(fetchImpl).toHaveBeenCalledTimes(reads + 2)
    loader.dispose()
  })

  it('honors source backoff after toggle and enforces the total fetch deadline', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('', {
      status: 429, headers: { 'Retry-After': '120' },
    }))
    const state = vi.fn()
    const loader = new DepthTiles(state, fetchImpl, vi.fn<typeof composeDepthTile>().mockResolvedValue(composed()))
    loader.setEnabled(true)
    const signal = new AbortController().signal
    await expect(loader.load(tile, signal)).rejects.toThrow('rate limited')
    loader.setEnabled(false)
    loader.setEnabled(true)
    await expect(loader.load(tile, signal)).rejects.toThrow('rate limited')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(120_000)
    fetchImpl.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    const timed = expect(loader.load(tile, signal)).rejects.toMatchObject({ name: 'BathymetryTileError' })
    await vi.advanceTimersByTimeAsync(BATHYMETRY_CONFIG.requestTimeoutMs)
    await timed
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    expect(state).toHaveBeenLastCalledWith({ phase: 'unavailable', message: expect.any(String) })
    loader.dispose()
  })
})
