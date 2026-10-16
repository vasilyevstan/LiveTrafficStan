import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Map } from 'maplibre-gl'
import { LocalScaleControl, type LocalScalePresentation } from './LocalScaleControl'

const native = vi.hoisted(() => ({
  constructions: 0,
  removals: 0,
  distanceFactor: 1,
  widthOverride: undefined as number | undefined,
  labelOverride: undefined as string | undefined,
  renderedWidthOffset: 0,
  cssHidden: false,
  moving: false,
  styleReady: true,
}))

vi.mock('maplibre-gl', async () => {
  const { LngLat } = await vi.importActual<typeof import('maplibre-gl')>('maplibre-gl')
  class MockMap {
    listeners = new globalThis.Map<string, Set<() => void>>()
    canvas = { clientWidth: 800, clientHeight: 600 }
    on(type: string, listener: () => void) {
      const listeners = this.listeners.get(type) ?? new Set()
      listeners.add(listener)
      this.listeners.set(type, listeners)
      return this
    }
    off(type: string, listener: () => void) {
      this.listeners.get(type)?.delete(listener)
      return this
    }
    fire(type: string) { this.listeners.get(type)?.forEach(listener => listener()); return this }
    getCanvas() { return this.canvas }
    getCenter() { return { lat: 59, lng: 24 } }
    getPitch() { return 0 }
    getProjection() { return { type: 'mercator' } }
    getStyle() { return native.styleReady ? { version: 8, sources: {}, layers: [] } : undefined }
    isMoving() { return native.moving }
    getBounds() {
      return { getNorth: () => 59.03, getSouth: () => 58.97, getEast: () => 24.04, getWest: () => 23.96 }
    }
    project() { return { x: 0, y: 0 } }
    unproject([x, y]: [number, number]) {
      const lat = 59 + (300 - y) / 10_000, lng = 24 + (x - 400) / 10_000
      const point = new LngLat(lng, lat)
      const distance = point.distanceTo.bind(point)
      point.distanceTo = other => distance(other) * native.distanceFactor
      return point
    }
  }
  class MockScaleControl {
    private options: { maxWidth: number; unit: string }
    map?: MockMap
    element = {
      hidden: false,
      style: { width: '' },
      textContent: '',
      title: '',
      classList: { add: vi.fn() },
      setAttribute: vi.fn(),
      getBoundingClientRect: () => ({
        width: native.cssHidden ? 0 : Number.parseFloat(this.element.style.width) + native.renderedWidthOffset,
      }),
    }
    constructor(options: { maxWidth: number; unit: string }) {
      this.options = options
      native.constructions += 1
    }
    onAdd(map: MockMap) {
      this.map = map
      map.on('move', this.update)
      this.update()
      return this.element
    }
    setUnit(unit: string) { this.options.unit = unit; this.update() }
    onRemove() { this.map?.off('move', this.update); native.removals += 1 }
    update = () => {
      const map = this.map!
      const maximum = map.unproject([350, 300]).distanceTo(map.unproject([450, 300]))
      const factor = this.options.unit === 'nautical' ? 1_852 : maximum >= 1_000 ? 1_000 : 1
      const value = maximum / factor, power = 10 ** Math.floor(Math.log10(value))
      const round = Number(([1, 2, 3, 5, 10].filter(n => n * power <= value).at(-1)! * power).toPrecision(3))
      this.element.style.width = `${native.widthOverride ?? this.options.maxWidth * round * factor / maximum}px`
      this.element.textContent = native.labelOverride ??
        `${round}\u00a0${this.options.unit === 'nautical' ? 'nm' : factor === 1_000 ? 'km' : 'm'}`
    }
  }
  return { Map: MockMap, ScaleControl: MockScaleControl }
})

const presentation: LocalScalePresentation = { projection: 'flat', units: 'metric', suppressed: false }
const setup = (initial = presentation) => {
  const map = new Map({ container: 'unused' })
  const control = new LocalScaleControl({ coordinatePrecision: 3, maximumRadiusKm: 100 }, initial)
  return { map, control, element: control.onAdd(map) }
}

beforeEach(() => {
  Object.assign(native, {
    constructions: 0, removals: 0, distanceFactor: 1, widthOverride: undefined,
    labelOverride: undefined, renderedWidthOffset: 0, cssHidden: false, moving: false, styleReady: true,
  })
})

describe('one bounded native center scale', () => {
  it('does not ask an unstyled map for its projection during control installation', () => {
    native.styleReady = false
    const { map, control, element } = setup()
    const projection = vi.spyOn(map, 'getProjection')
    control.setPresentation(presentation)
    expect(element.hidden).toBe(true)
    expect(projection).not.toHaveBeenCalled()
    native.styleReady = true
    map.fire('style.load')
    expect(element.hidden).toBe(false)
    expect(native.constructions).toBe(1)
  })

  it('uses one native control and validates its actual metric and nautical label/bar', () => {
    const { control, element } = setup()
    expect(element.hidden).toBe(false)
    expect(element.textContent).toBe('500\u00a0m')
    control.setPresentation({ ...presentation, units: 'aviation-nautical' })
    expect(element.hidden).toBe(false)
    expect(element.textContent).toBe('0.3\u00a0nm')
    expect(native.constructions).toBe(1)
  })

  it('hides during movement and revalidates only the settled surface', () => {
    const { map, element } = setup()
    native.moving = true
    map.fire('movestart')
    expect(element.hidden).toBe(true)
    map.fire('move')
    expect(element.hidden).toBe(true)
    map.fire('resize')
    expect(element.hidden).toBe(true)
    native.moving = false
    map.fire('moveend')
    expect(element.hidden).toBe(false)
  })

  it('composes layout/history suppression, units, projection and style without recreating the control', () => {
    const { map, control, element } = setup()
    control.setPresentation({ ...presentation, suppressed: true })
    expect(element.hidden).toBe(true)
    control.setPresentation({ ...presentation, projection: 'auto' })
    expect(element.hidden).toBe(true)
    control.setPresentation(presentation)
    map.fire('style.load')
    map.fire('projectiontransition')
    expect(element.hidden).toBe(false)
    expect(native.constructions).toBe(1)
  })

  it('rejects a collapsed canvas before any application sampling or native refresh', () => {
    const { map, control, element } = setup()
    Object.assign(map.getCanvas(), { clientWidth: 0 })
    const sample = vi.spyOn(map, 'unproject')
    control.setPresentation(presentation)
    expect(element.hidden).toBe(true)
    expect(sample).not.toHaveBeenCalled()
  })

  it.each([0, NaN, Infinity, 1.0051, 0.9949])('hides native spherical precision failure %s', (factor) => {
    native.distanceFactor = factor
    const { element } = setup()
    expect(element.hidden).toBe(true)
  })

  it('accepts spherical agreement inside the explicit half-percent bound', () => {
    native.distanceFactor = 1.004
    expect(setup().element.hidden).toBe(false)
  })

  it.each(['0 m', 'NaN m', 'Infinity m', '0.3 nm', '3 km', '-500 m', '500 ft', '500m'])(
    'rejects a missing, false or mismatched native label %s', (label) => {
      native.labelOverride = label
      expect(setup().element.hidden).toBe(true)
    },
  )

  it.each([0, NaN, Infinity, 100.1, 40])('rejects an invalid or untruthful styled width %s', (width) => {
    native.widthOverride = width
    expect(setup().element.hidden).toBe(true)
  })

  it('allows a single CSS pixel for native rounding/stroke, but not a distorted rendered bar', () => {
    native.renderedWidthOffset = 0.9
    expect(setup().element.hidden).toBe(false)
    native.renderedWidthOffset = 2
    expect(setup().element.hidden).toBe(true)
  })

  it('lets responsive CSS hide the whole bar without freezing its current accessible value', () => {
    native.cssHidden = true
    const { control, element } = setup()
    control.setPresentation({ ...presentation, units: 'aviation-nautical' })
    expect(element.hidden).toBe(false)
    expect(element.setAttribute).toHaveBeenLastCalledWith(
      'aria-label', 'Approximate horizontal distance at map center: 0.3\u00a0nm',
    )
  })

  it('removes every wrapper and native listener once and ignores late presentation changes', () => {
    const { map, control } = setup()
    const off = vi.spyOn(map, 'off')
    control.onRemove()
    expect(off.mock.calls.map(([type]) => type).sort()).toEqual([
      'move', 'moveend', 'movestart', 'projectiontransition', 'resize', 'style.load',
    ])
    expect(native.removals).toBe(1)
    control.setPresentation(presentation)
    map.fire('moveend')
    expect(native.constructions).toBe(1)
    expect(native.removals).toBe(1)
  })
})
