import { BATHYMETRY_CONFIG } from '../config/appConfig'
import { orbitalPointInPolygon, type OrbitalViewport } from './orbitalViewport'
import { normalizeLongitude } from './viewport'

export type DepthValueSource = 'emodnet' | 'gebco'

export interface DepthCandidate {
  id: string
  latitude: number
  longitude: number
}

export interface DepthSample extends DepthCandidate {
  depthMeters: number
}

export interface DepthValuesState {
  phase: 'zoom-in' | 'loading' | 'ready' | 'empty' | 'partial' | 'unavailable' | 'paused'
  source: DepthValueSource
  samples: readonly DepthSample[]
  message?: string
}

export interface BathymetryStatus {
  imagery: 'loading' | 'ready' | 'unavailable' | 'paused'
  imageryMessage?: string
  values: DepthValuesState
}

export const INITIAL_BATHYMETRY_STATUS: BathymetryStatus = {
  imagery: 'loading',
  values: { phase: 'zoom-in', source: 'gebco', samples: [] },
}

export const depthGridStep = (source: DepthValueSource) =>
  source === 'emodnet' ? 1 / 960 : 1 / 240

export const depthValueSource = (viewport: OrbitalViewport): DepthValueSource =>
  viewport.kind === 'local' &&
  BATHYMETRY_CONFIG.regionalAreas.some(area =>
    viewport.polygon.every(point =>
      point.latitude >= area.south && point.latitude <= area.north &&
      point.longitude >= area.west && point.longitude <= area.east,
    ),
  ) ? 'emodnet' : 'gebco'

export const depthLabel = (meters: number) =>
  meters < 1 ? '~<1 m' : `~${Math.round(meters).toLocaleString('en-US')} m`

export const depthSourceDescription = (source: DepthValueSource) =>
  source === 'emodnet'
    ? 'EMODnet grid · metres below LAT (Lowest Astronomical Tide)'
    : 'GEBCO grid · metres below nominal mean sea level; coastal datums can differ'

export const depthCandidates = (
  viewport: OrbitalViewport,
  zoom: number,
  width: number,
  height: number,
): DepthCandidate[] => {
  if (
    viewport.kind !== 'local' || !Number.isFinite(zoom) ||
    zoom < BATHYMETRY_CONFIG.minimumLabelZoom ||
    !Number.isFinite(width) || !Number.isFinite(height) ||
    width <= 0 || height <= 0 || viewport.polygon.length < 4
  ) return []

  const source = depthValueSource(viewport)
  const step = depthGridStep(source)
  const latitudes = viewport.polygon.map(point => point.latitude)
  const longitudes = viewport.polygon.map(point => point.longitude)
  const west = Math.min(...longitudes), east = Math.max(...longitudes)
  const south = Math.min(...latitudes), north = Math.max(...latitudes)
  if (
    ![west, east, south, north].every(Number.isFinite) ||
    east <= west || east - west >= 180 || north <= south ||
    south < -90 || north > 90
  ) return []
  const columns = Math.min(4, Math.max(1, Math.floor(width / BATHYMETRY_CONFIG.minimumLabelSeparationPx)))
  const rows = Math.min(3, Math.max(1, Math.floor(height / BATHYMETRY_CONFIG.minimumLabelSeparationPx)))
  // Coordinate subtraction can straddle an exact power of two by floating-point round-off.
  const block = (span: number, count: number) =>
    2 ** Math.max(0, Math.ceil(Math.log2(span / count / step) - 1e-10))
  const xBlock = block(east - west, columns), yBlock = block(north - south, rows)
  const firstX = Math.floor((west + 180) / step / xBlock)
  const lastX = Math.floor((east + 180) / step / xBlock)
  const firstY = Math.floor((south + 90) / step / yBlock)
  const lastY = Math.floor((north + 90) / step / yBlock)
  const candidates: DepthCandidate[] = []
  for (let y = firstY; y <= lastY; y += 1) {
    for (let x = firstX; x <= lastX; x += 1) {
      const cellX = x * xBlock + Math.floor(xBlock / 2)
      const cellY = y * yBlock + Math.floor(yBlock / 2)
      const longitude = (cellX + 0.5) * step - 180
      const latitude = (cellY + 0.5) * step - 90
      if (!orbitalPointInPolygon(latitude, longitude, viewport.polygon)) continue
      const worldCells = Math.round(360 / step)
      candidates.push({
        id: `${source}:${((cellX % worldCells) + worldCells) % worldCells}:${cellY}`,
        latitude: Number(latitude.toFixed(BATHYMETRY_CONFIG.coordinatePrecision)),
        longitude: Number(normalizeLongitude(longitude).toFixed(BATHYMETRY_CONFIG.coordinatePrecision)),
      })
    }
  }
  return candidates.slice(0, BATHYMETRY_CONFIG.maximumLabels)
}
