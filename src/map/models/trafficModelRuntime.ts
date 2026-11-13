import modelAssetUrl from '../../assets/models/traffic-models-v1.glb?url'
import { TRAFFIC_MODEL_CONFIG as config } from '../../config/appConfig'
import { readBoundedBytes } from '../../providers/boundedResponse'
import { TrafficModelLayer } from './TrafficModelLayer'
import { parseTrafficModelAsset } from './trafficModelAsset'

export { TRAFFIC_MODEL_LAYER_ID, TrafficModelLayer } from './TrafficModelLayer'

export const TRAFFIC_MODEL_ASSET_CONTENT_TYPES = [
  'model/gltf-binary',
  'application/octet-stream',
] as const

export interface TrafficModelLoadOptions {
  signal: AbortSignal
  /** Called once, after the current frame, if the layer later fails on the GPU. */
  onFailure: (error: unknown) => void
  fetchImpl?: typeof fetch
  url?: string
}

const cancelled = () => new DOMException('Traffic model load cancelled', 'AbortError')

/** Fetches and validates the bundled model asset, returning an unattached layer. */
export const loadTrafficModelLayer = async (options: TrafficModelLoadOptions) => {
  const { signal } = options
  if (signal.aborted) throw cancelled()
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, config.assetDeadlineMs)
  try {
    const response = await (options.fetchImpl ?? fetch)(options.url ?? modelAssetUrl, {
      method: 'GET',
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
    if (response.status !== 200) {
      void response.body?.cancel().catch(() => undefined)
      throw new Error(`Traffic model asset is unavailable (HTTP ${response.status})`)
    }
    const bytes = await readBoundedBytes(
      response,
      config.maximumAssetBytes,
      TRAFFIC_MODEL_ASSET_CONTENT_TYPES,
      controller.signal,
    )
    if (controller.signal.aborted) throw cancelled()
    const meshes = parseTrafficModelAsset(bytes.buffer, {
      maximumBytes: config.maximumAssetBytes,
      maximumTrianglesPerModel: config.maximumTrianglesPerModel,
    })
    return new TrafficModelLayer(meshes, options.onFailure)
  } catch (error) {
    if (signal.aborted) throw cancelled()
    if (timedOut) throw new Error('Traffic model asset timed out')
    throw error
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', abort)
  }
}
