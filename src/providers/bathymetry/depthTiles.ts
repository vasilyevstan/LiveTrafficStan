import { BATHYMETRY_CONFIG } from '../../config/appConfig'
import { readBoundedBytes } from '../boundedResponse'
import { parseRetryAfterMs, ProviderError } from '../errors'

export class BathymetryTileError extends Error {
  constructor(message = 'Some depth shading is unavailable. Switch DEPTHS off and on to retry.') {
    super(message)
    this.name = 'BathymetryTileError'
  }
}

export interface DepthTile {
  z: number
  x: number
  y: number
}

export const parseDepthTile = (url: string): DepthTile => {
  const match = /^modeled-depths:\/\/(0|[1-9]\d*)\/(0|[1-9]\d*)\/(0|[1-9]\d*)$/.exec(url)
  if (!match) throw new BathymetryTileError()
  const [z, x, y] = match.slice(1).map(Number)
  if (![z, x, y].every(Number.isSafeInteger) || z > BATHYMETRY_CONFIG.maximumTileZoom ||
      x >= 2 ** z || y >= 2 ** z) throw new BathymetryTileError()
  return { z, x, y }
}

export const depthTileUrls = ({ z, x, y }: DepthTile) =>
  ['baselayer', 'baselayer_land'].map(layer =>
    `${BATHYMETRY_CONFIG.tileOrigin}/${BATHYMETRY_CONFIG.tileVersion}/${layer}/web_mercator/${z}/${x}/${y}.png`,
  )

export const validateDepthPng = (bytes: Uint8Array): void => {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 33 || signature.some((value, index) => bytes[index] !== value) ||
      bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) {
    throw new BathymetryTileError()
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(16) !== BATHYMETRY_CONFIG.tileSize ||
      view.getUint32(20) !== BATHYMETRY_CONFIG.tileSize) throw new BathymetryTileError()
}

export const composeDepthTile = async (
  color: Uint8Array<ArrayBuffer>,
  land: Uint8Array<ArrayBuffer>,
  signal: AbortSignal,
): Promise<ArrayBuffer> => {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    throw new BathymetryTileError('Depth shading is unavailable in this browser. Model numbers may still be available.')
  }
  const images: ImageBitmap[] = []
  try {
    for (const bytes of [color, land]) {
      signal.throwIfAborted()
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      images.push(image)
      if (image.width !== BATHYMETRY_CONFIG.tileSize || image.height !== BATHYMETRY_CONFIG.tileSize) {
        throw new BathymetryTileError()
      }
    }
    signal.throwIfAborted()
    const canvas = new OffscreenCanvas(BATHYMETRY_CONFIG.tileSize, BATHYMETRY_CONFIG.tileSize)
    const context = canvas.getContext('2d')
    if (!context) throw new BathymetryTileError()
    context.drawImage(images[0], 0, 0)
    // The matched published land alpha is a mask, not an elevation/color heuristic.
    context.globalCompositeOperation = 'destination-out'
    context.drawImage(images[1], 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    signal.throwIfAborted()
    return await blob.arrayBuffer()
  } finally {
    for (const image of images) image.close()
  }
}

export type DepthTileState = {
  phase: 'loading' | 'ready' | 'unavailable'
  message?: string
}

export class DepthTiles {
  private enabled = false
  private revision = 0
  private retryAt = 0
  private requests = new Map<AbortController, number>()
  private cache = new Map<string, { data: ArrayBuffer; expiresAt: number }>()
  private failed = false
  private state: DepthTileState = { phase: 'loading' }
  private readonly onChange: (state: DepthTileState) => void
  private readonly fetchImpl: typeof fetch
  private readonly compose: typeof composeDepthTile

  constructor(
    onChange: (state: DepthTileState) => void,
    fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    compose: typeof composeDepthTile = composeDepthTile,
  ) {
    this.onChange = onChange
    this.fetchImpl = fetchImpl
    this.compose = compose
  }

  setEnabled(enabled: boolean) {
    if (enabled === this.enabled) return
    this.enabled = enabled
    this.revision += 1
    if (!enabled) {
      for (const controller of this.requests.keys()) controller.abort()
    } else if (this.retryAt <= Date.now()) {
      this.failed = false
    }
  }

  dispose() {
    this.setEnabled(false)
    this.cache.clear()
  }

  async load(url: string, signal: AbortSignal): Promise<{ data: ArrayBuffer }> {
    const tile = parseDepthTile(url)
    signal.throwIfAborted()
    if (!this.enabled) throw new DOMException('Depths paused', 'AbortError')
    const cached = this.cache.get(url)
    if (cached && cached.expiresAt > Date.now()) {
      this.cache.delete(url)
      this.cache.set(url, cached)
      if (!this.failed && this.requests.size === 0) this.publish({ phase: 'ready' })
      return { data: cached.data.slice(0) }
    }
    this.cache.delete(url)
    if (this.retryAt > Date.now()) throw new BathymetryTileError('Depth shading is rate limited. Retry later.')
    const revision = this.revision
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    this.requests.set(controller, revision)
    if (!this.failed) this.publish({ phase: 'loading' })
    const timeout = setTimeout(abort, BATHYMETRY_CONFIG.requestTimeoutMs)
    try {
      const [color, land] = await Promise.all(depthTileUrls(tile).map(async tileUrl => {
        const response = await this.fetchImpl(tileUrl, {
          signal: controller.signal, credentials: 'omit',
          referrerPolicy: 'no-referrer', redirect: 'error',
        })
        if (response.status !== 200) {
          void response.body?.cancel().catch(() => undefined)
          throw new ProviderError('Depth tile request failed', response.status,
            parseRetryAfterMs(response.headers.get('Retry-After')))
        }
        const bytes = await readBoundedBytes(response, BATHYMETRY_CONFIG.maximumTileBytes, ['image/png'])
        validateDepthPng(bytes)
        return bytes
      }))
      const data = await this.compose(color, land, controller.signal)
      controller.signal.throwIfAborted()
      if (!this.enabled || revision !== this.revision) throw new DOMException('Depths paused', 'AbortError')
      this.cache.set(url, { data, expiresAt: Date.now() + BATHYMETRY_CONFIG.tileCacheMs })
      while (this.cache.size > BATHYMETRY_CONFIG.tileCacheEntries) {
        this.cache.delete(this.cache.keys().next().value!)
      }
      return { data: data.slice(0) }
    } catch (error) {
      if (signal.aborted || !this.enabled || revision !== this.revision) {
        throw new DOMException('Depths paused', 'AbortError')
      }
      if (error instanceof ProviderError && error.status === 429) {
        this.retryAt = Date.now() + (error.retryAfterMs ?? BATHYMETRY_CONFIG.rateLimitFallbackMs)
      }
      this.failed = true
      const problem = error instanceof BathymetryTileError ? error : new BathymetryTileError(
        this.retryAt > Date.now() ? 'Depth shading is rate limited. Retry later.' : undefined,
      )
      this.publish({ phase: 'unavailable', message: problem.message })
      throw problem
    } finally {
      controller.abort()
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      this.requests.delete(controller)
      if (this.enabled && revision === this.revision && !this.failed &&
          ![...this.requests.values()].includes(this.revision)) {
        this.publish({ phase: 'ready' })
      }
    }
  }

  private publish(state: DepthTileState) {
    if (state.phase === this.state.phase && state.message === this.state.message) return
    this.state = state
    this.onChange(state)
  }
}
