import { ScaleControl, type IControl, type Map } from 'maplibre-gl'
import { LOCAL_MAP_TOOLS_CONFIG } from '../config/appConfig'
import { distanceKm } from '../domain/geo'
import type { MapProjectionPreference } from '../domain/preferences'
import type { UnitSystem } from '../domain/units'
import { supportsLocalMapGeometry, type LocalGeometryLimits } from './localMapGeometry'

export interface LocalScalePresentation {
  projection: MapProjectionPreference
  units: UnitSystem
  suppressed: boolean
}

const coordinates = (point: { lat: number; lng: number }) => ({
  latitude: point.lat,
  longitude: point.lng,
})

const labelMeters = (label: string, units: UnitSystem) => {
  const match = /^(\d+(?:\.\d+)?)\s+(m|km|nm)$/.exec(label)
  if (!match) return undefined
  const [, value, unit] = match
  if ((unit === 'nm') !== (units === 'aviation-nautical')) return undefined
  const meters = Number(value) * (unit === 'nm' ? 1_852 : unit === 'km' ? 1_000 : 1)
  return Number.isFinite(meters) && meters > 0 ? meters : undefined
}

export class LocalScaleControl implements IControl {
  private readonly native: ScaleControl
  private readonly limits: LocalGeometryLimits
  private presentation: LocalScalePresentation
  private map?: Map
  private element?: HTMLElement

  constructor(
    limits: LocalGeometryLimits,
    presentation: LocalScalePresentation,
  ) {
    this.limits = limits
    this.presentation = presentation
    this.native = new ScaleControl({
      maxWidth: LOCAL_MAP_TOOLS_CONFIG.scaleMaximumWidthPx,
      unit: presentation.units === 'metric' ? 'metric' : 'nautical',
    })
  }

  onAdd(map: Map): HTMLElement {
    this.map = map
    const element = this.native.onAdd(map)
    this.element = element
    element.classList.add('local-map-scale')
    element.setAttribute('role', 'img')
    element.title = 'Approximate horizontal distance at map center'
    map.on('movestart', this.hide)
    map.on('moveend', this.update)
    map.on('resize', this.update)
    map.on('projectiontransition', this.update)
    map.on('style.load', this.update)
    this.update()
    return element
  }

  onRemove(): void {
    this.map?.off('movestart', this.hide)
    this.map?.off('moveend', this.update)
    this.map?.off('resize', this.update)
    this.map?.off('projectiontransition', this.update)
    this.map?.off('style.load', this.update)
    this.native.onRemove()
    this.map = undefined
    this.element = undefined
  }

  setPresentation(presentation: LocalScalePresentation): void {
    this.presentation = presentation
    this.update()
  }

  private readonly hide = (): void => {
    if (this.element) this.element.hidden = true
  }

  private readonly update = (): void => {
    this.hide()
    const { map, element, presentation } = this
    const {
      scaleMaximumWidthPx: maximumWidth,
      scaleMaximumRelativeError: maximumRelativeError,
      scalePixelAllowancePx: pixelAllowance,
    } = LOCAL_MAP_TOOLS_CONFIG
    if (
      !map || !element || presentation.suppressed || map.isMoving() || !map.getStyle() ||
      map.getCanvas().clientWidth < maximumWidth ||
      !supportsLocalMapGeometry(map, presentation.projection, this.limits)
    ) return

    this.native.setUnit(presentation.units === 'metric' ? 'metric' : 'nautical')
    const { clientWidth: width, clientHeight: height } = map.getCanvas()
    const left = map.unproject([width / 2 - maximumWidth / 2, height / 2])
    const right = map.unproject([width / 2 + maximumWidth / 2, height / 2])
    const nativeMeters = left.distanceTo(right)
    const applicationMeters = distanceKm(coordinates(left), coordinates(right)) * 1_000
    const meters = labelMeters(element.textContent ?? '', presentation.units)
    const styledWidth = Number.parseFloat(element.style.width)
    if (
      !Number.isFinite(nativeMeters) || nativeMeters <= 0 ||
      !Number.isFinite(applicationMeters) || applicationMeters <= 0 ||
      Math.abs(nativeMeters - applicationMeters) / applicationMeters > maximumRelativeError ||
      meters === undefined || !Number.isFinite(styledWidth) || styledWidth <= 0 ||
      styledWidth > maximumWidth + 1 / 64
    ) return

    element.hidden = false
    element.setAttribute('aria-label', `${element.title}: ${element.textContent}`)
    const renderedWidth = element.getBoundingClientRect().width
    // A container query can hide the whole bar in a cramped visible viewport.
    if (renderedWidth === 0) return
    const barLeft = map.unproject([width / 2 - renderedWidth / 2, height / 2])
    const barRight = map.unproject([width / 2 + renderedWidth / 2, height / 2])
    const measuredMeters = distanceKm(coordinates(barLeft), coordinates(barRight)) * 1_000
    const allowance = applicationMeters * pixelAllowance / maximumWidth +
      meters * maximumRelativeError
    if (
      !Number.isFinite(renderedWidth) ||
      Math.abs(renderedWidth - styledWidth) > pixelAllowance ||
      !Number.isFinite(measuredMeters) ||
      Math.abs(measuredMeters - meters) > allowance
    ) {
      this.hide()
      return
    }
  }
}
