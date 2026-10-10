import { BATHYMETRY_CONFIG } from '../../config/appConfig'
import { depthGridStep, type DepthCandidate, type DepthValueSource } from '../../domain/bathymetry'
import { normalizeLongitude } from '../../domain/viewport'
import { readBoundedJson } from '../boundedJson'
import { readBoundedBytes } from '../boundedResponse'
import { parseRetryAfterMs, ProviderError } from '../errors'

const invalidDepth = () => new ProviderError('The depth source returned an invalid grid value.')
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const elevationToDepth = (value: unknown): number | null => {
  if (value === null || value === 'NaN') return null
  if (typeof value !== 'number' || !Number.isFinite(value) ||
      Math.abs(value) > BATHYMETRY_CONFIG.maximumDepthMeters) throw invalidDepth()
  return value < 0 ? -value : null
}

export const normalizeEmodnetDepth = (value: unknown): number | null => {
  if (!isRecord(value) || value.type !== 'FeatureCollection' ||
      !Array.isArray(value.features) || value.features.length > 1 ||
      value.numberReturned !== value.features.length) throw invalidDepth()
  if (value.features.length === 0) return null
  const feature: unknown = value.features[0]
  if (!isRecord(feature) || feature.type !== 'Feature' ||
      !isRecord(feature.properties) || !('Depth' in feature.properties)) throw invalidDepth()
  return elevationToDepth(feature.properties.Depth)
}

export const normalizeGebcoDepth = (text: string, point: DepthCandidate): number | null => {
  if (/^GetFeatureInfo results:\s*$/.test(text.trim())) return null
  const match = /^GetFeatureInfo results:\s+Layer 'GEBCO_LATEST_2'\s+Feature 0:\s+x = '(-?\d+(?:\.\d+)?)'\s+y = '(-?\d+(?:\.\d+)?)'\s+value_list = '(-?\d+(?:\.\d+)?|nan)'\s*$/i.exec(text.trim())
  if (!match) throw invalidDepth()
  const longitude = Number(match[1]), latitude = Number(match[2])
  const tolerance = depthGridStep('gebco')
  if (
    !Number.isFinite(longitude) || !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 || Math.abs(latitude) > 90 ||
    Math.abs(normalizeLongitude(longitude - point.longitude)) > tolerance ||
    Math.abs(latitude - point.latitude) > tolerance
  ) throw invalidDepth()
  return elevationToDepth(match[3].toLowerCase() === 'nan' ? 'NaN' : Number(match[3]))
}

export const depthValueUrl = (source: DepthValueSource, point: DepthCandidate): string => {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) ||
      Math.abs(point.latitude) >= 90 || Math.abs(point.longitude) > 180) throw invalidDepth()
  const half = depthGridStep(source) / 2
  const bbox = [
    point.longitude - half, point.latitude - half,
    point.longitude + half, point.latitude + half,
  ].map(value => value.toFixed(BATHYMETRY_CONFIG.coordinatePrecision)).join(',')
  const layer = source === 'emodnet' ? 'emodnet:mean' : 'GEBCO_LATEST_2'
  const params = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetFeatureInfo',
    LAYERS: layer, QUERY_LAYERS: layer,
    STYLES: source === 'emodnet' ? 'atlas_land' : 'default',
    SRS: 'EPSG:4326', BBOX: bbox, WIDTH: '1', HEIGHT: '1', X: '0', Y: '0',
    FORMAT: 'image/png', INFO_FORMAT: source === 'emodnet' ? 'application/json' : 'text/plain',
    FEATURE_COUNT: '1',
  })
  return `${source === 'emodnet' ? BATHYMETRY_CONFIG.regionalValueUrl : BATHYMETRY_CONFIG.globalValueUrl}?${params}`
}

export const fetchDepthValue = async (
  source: DepthValueSource,
  point: DepthCandidate,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> => {
  const response = await fetchImpl(depthValueUrl(source, point), {
    signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
  })
  if (response.status !== 200) {
    void response.body?.cancel().catch(() => undefined)
    throw new ProviderError(
      `The depth source returned HTTP ${response.status}.`,
      response.status, parseRetryAfterMs(response.headers.get('Retry-After')),
    )
  }
  const depth = source === 'emodnet'
    ? normalizeEmodnetDepth(await readBoundedJson(response, BATHYMETRY_CONFIG.maximumValueBytes))
    : normalizeGebcoDepth(new TextDecoder('utf-8', { fatal: true }).decode(
      await readBoundedBytes(response, BATHYMETRY_CONFIG.maximumValueBytes, ['text/plain']),
    ), point)
  signal.throwIfAborted()
  return depth
}
