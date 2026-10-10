import { addProtocol, removeProtocol, type GeoJSONSource, type Map as MapLibreMap, type RasterTileSource } from 'maplibre-gl'
import { DepthValuesController } from '../app/DepthValuesController'
import type { Theme } from '../app/theme'
import { BATHYMETRY_CONFIG } from '../config/appConfig'
import {
  depthCandidates, depthValueSource, INITIAL_BATHYMETRY_STATUS,
  type BathymetryStatus, type DepthCandidate,
} from '../domain/bathymetry'
import type { OrbitalViewport } from '../domain/orbitalViewport'
import { unwrapLongitude } from '../domain/viewport'
import { BathymetryTileError, DepthTiles } from '../providers/bathymetry/depthTiles'
import {
  DEPTH_TILE_TEMPLATE, depthFeatures, installBathymetryStyle, isBathymetryError,
  setBathymetryVisibility, SOURCE_DEPTH_RASTER, SOURCE_DEPTH_VALUES,
} from './bathymetryStyle'

export class BathymetryRuntime {
  private readonly map: MapLibreMap
  private readonly onChange: (status: BathymetryStatus) => void
  private readonly tiles: DepthTiles
  private readonly values: DepthValuesController
  private status: BathymetryStatus = INITIAL_BATHYMETRY_STATUS
  private visible: boolean
  private online: boolean
  private active = false
  private moving = false
  private dirty = true
  private disposed = false
  private viewport: OrbitalViewport | undefined
  private zoom = 0

  constructor(map: MapLibreMap, visible: boolean, online: boolean, onChange: (status: BathymetryStatus) => void) {
    this.map = map
    this.visible = visible
    this.online = online
    this.onChange = onChange
    this.values = new DepthValuesController(values => {
      this.status = { ...this.status, values }
      this.map.getSource<GeoJSONSource>(SOURCE_DEPTH_VALUES)?.setData(depthFeatures(values))
      this.publish()
    })
    this.tiles = new DepthTiles(state => {
      this.status = { ...this.status, imagery: state.phase, imageryMessage: state.message }
      this.publish()
    })
    addProtocol('modeled-depths', (request, controller) => this.tiles.load(request.url, controller.signal))
    map.on('idle', this.refreshValues)
    document.addEventListener('visibilitychange', this.updateActive)
    this.updateActive()
  }

  install(theme: Theme) {
    installBathymetryStyle(this.map, theme, this.values.getState(), this.active)
    this.dirty = true
  }

  setEnabled(visible: boolean, online: boolean) {
    this.visible = visible
    this.online = online
    this.updateActive()
  }

  setViewport(viewport: OrbitalViewport, zoom: number | undefined) {
    this.viewport = viewport
    this.zoom = zoom ?? 0
    this.moving = false
    this.dirty = true
    setBathymetryVisibility(this.map, this.active)
    this.refreshValues()
  }

  moveStarted() {
    this.moving = true
    this.dirty = true
    this.values.pause('paused', 'Depth numbers resume after the map settles.')
    setBathymetryVisibility(this.map, this.active, false)
  }

  handleError(event: unknown) {
    if (!isBathymetryError(event)) return false
    if (this.active && typeof event === 'object' && event !== null &&
        'error' in event && event.error instanceof Error && event.error.name !== 'AbortError') {
      if ('sourceId' in event && event.sourceId === SOURCE_DEPTH_VALUES) {
        this.values.pause('unavailable', 'Depth labels could not be drawn. Switch DEPTHS off and on to retry.')
      } else {
        this.status = {
          ...this.status, imagery: 'unavailable',
          imageryMessage: event.error instanceof BathymetryTileError ? event.error.message :
            this.status.imageryMessage ?? 'Some depth shading is unavailable. Switch DEPTHS off and on to retry.',
        }
        this.publish()
      }
    }
    return true
  }

  dispose() {
    this.disposed = true
    this.map.off('idle', this.refreshValues)
    document.removeEventListener('visibilitychange', this.updateActive)
    this.values.dispose()
    this.tiles.dispose()
    removeProtocol('modeled-depths')
  }

  private updateActive = () => {
    const active = this.visible && this.online && !document.hidden
    if (active === this.active || this.disposed) return
    this.active = active
    this.tiles.setEnabled(active)
    setBathymetryVisibility(this.map, active, active && !this.moving)
    this.dirty = true
    if (!active) this.values.pause('paused', 'Depth requests are paused while hidden or offline.')
    else {
      this.map.getSource<RasterTileSource>(SOURCE_DEPTH_RASTER)?.setTiles([DEPTH_TILE_TEMPLATE])
      this.refreshValues()
    }
    this.publish()
  }

  private refreshValues = () => {
    if (this.disposed || !this.active || this.moving || !this.dirty || !this.viewport) return
    if (this.zoom < BATHYMETRY_CONFIG.minimumLabelZoom) {
      this.dirty = false
      this.values.pause('zoom-in', undefined, depthValueSource(this.viewport))
      return
    }
    if (this.viewport.kind !== 'local') {
      this.dirty = false
      this.values.pause('unavailable', 'Depth numbers are unavailable for this map geometry.')
      return
    }
    const waterLayers = this.map.getStyle()?.layers.filter(layer =>
      layer.type === 'fill' && layer['source-layer'] === 'water',
    ) ?? []
    if (!waterLayers.length) {
      this.values.pause('unavailable', 'Depth numbers need the vector map to identify ocean cells.')
      return
    }
    if (waterLayers.some(layer => 'source' in layer && !this.map.isSourceLoaded(layer.source))) {
      this.values.pause('paused', 'Depth numbers are waiting for the vector map.', depthValueSource(this.viewport))
      return
    }
    const canvas = this.map.getCanvas()
    const points: DepthCandidate[] = []
    const pixels: { x: number; y: number }[] = []
    for (const candidate of depthCandidates(this.viewport, this.zoom, canvas.clientWidth, canvas.clientHeight)) {
      const point = this.map.project([
        unwrapLongitude(candidate.longitude, this.map.getCenter().lng), candidate.latitude,
      ])
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
          point.x < 0 || point.y < 0 || point.x > canvas.clientWidth || point.y > canvas.clientHeight ||
          pixels.some(previous => Math.hypot(previous.x - point.x, previous.y - point.y) <
            BATHYMETRY_CONFIG.minimumLabelSeparationPx)) continue
      const ocean = this.map.queryRenderedFeatures(point, { layers: waterLayers.map(layer => layer.id) })
        .some(feature => feature.properties?.class === 'ocean')
      if (!ocean) continue
      pixels.push(point)
      points.push(candidate)
    }
    this.dirty = false
    this.values.load(depthValueSource(this.viewport), points)
  }

  private publish() {
    if (!this.disposed) this.onChange({
      ...this.status, imagery: this.active ? this.status.imagery : 'paused',
    })
  }
}
