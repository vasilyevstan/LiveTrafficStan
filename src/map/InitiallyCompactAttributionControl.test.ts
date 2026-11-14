import { describe, expect, it, vi } from 'vitest'
import { Map } from 'maplibre-gl'
import { InitiallyCompactAttributionControl } from './InitiallyCompactAttributionControl'

const updateAttributions = vi.hoisted(() => vi.fn())

vi.mock('maplibre-gl', () => ({
  Map: class {},
  AttributionControl: class {
    options: { compact?: boolean; customAttribution?: string[] }
    constructor(options: { compact?: boolean; customAttribution?: string[] } = {}) {
      this.options = options
    }
    _updateAttributions() {
      updateAttributions()
    }
    onAdd() {
      const summary = new EventTarget()
      const classes = new Set(['maplibregl-compact-show'])
      const attributes = new Set(['open'])
      return {
        classList: {
          contains: (name: string) => classes.has(name),
          add: (name: string) => classes.add(name),
          remove: (name: string) => classes.delete(name),
        },
        removeAttribute: (name: string) => attributes.delete(name),
        setAttribute: (name: string) => attributes.add(name),
        hasAttribute: (name: string) => attributes.has(name),
        querySelector: (selector: string) => selector === 'summary' ? summary : null,
      }
    }
    onRemove() {}
  },
}))

describe('once-only native attribution compaction', () => {
  it('closes an initially mobile native disclosure without deleting its contents/control', () => {
    const control = new InitiallyCompactAttributionControl({ compact: true }, true)
    const element = control.onAdd(new Map({ container: 'unused' }))
    expect(element.hasAttribute('open')).toBe(false)
    expect(element.classList.contains('maplibregl-compact-show')).toBe(false)
    expect(element.querySelector('summary')).not.toBeNull()
  })
  it('does not alter the desktop default and compacts only on the first mobile transition', () => {
    const control = new InitiallyCompactAttributionControl({ compact: true }, false)
    const element = control.onAdd(new Map({ container: 'unused' }))
    expect(element.hasAttribute('open')).toBe(true)
    control.compactOnce()
    expect(element.hasAttribute('open')).toBe(false)
    element.setAttribute('open', '')
    element.classList.add('maplibregl-compact-show')
    control.compactOnce()
    expect(element.hasAttribute('open')).toBe(true)
    expect(element.classList.contains('maplibregl-compact-show')).toBe(true)
  })
  it('respects a user choice made before the first mobile presentation', () => {
    const control = new InitiallyCompactAttributionControl({ compact: true }, false)
    const element = control.onAdd(new Map({ container: 'unused' }))
    element.querySelector('summary')?.dispatchEvent(new Event('click'))
    control.compactOnce()
    expect(element.hasAttribute('open')).toBe(true)
  })
  it('removes the summary listener with its own control', () => {
    const control = new InitiallyCompactAttributionControl({ compact: true }, true)
    const element = control.onAdd(new Map({ container: 'unused' }))
    const summary = element.querySelector('summary')!
    const remove = vi.spyOn(summary, 'removeEventListener')
    control.onRemove()
    expect(remove).toHaveBeenCalledWith('click', expect.any(Function))
  })
})

describe('replaceable custom credits', () => {
  it('replaces only the custom credits and refreshes a mounted control once', () => {
    updateAttributions.mockClear()
    const control = new InitiallyCompactAttributionControl(
      { compact: true, customAttribution: ['Data credits'] },
      false,
    )
    control.onAdd(new Map({ container: 'unused' }))
    control.setCustomAttribution(['Data credits', 'Trains: Fintraffic'])
    expect(control.options).toEqual({
      compact: true,
      customAttribution: ['Data credits', 'Trains: Fintraffic'],
    })
    expect(updateAttributions).toHaveBeenCalledTimes(1)
  })
  it('records credits without a refresh before mount and after removal', () => {
    updateAttributions.mockClear()
    const control = new InitiallyCompactAttributionControl({ compact: true }, false)
    control.setCustomAttribution(['early'])
    expect(control.options.customAttribution).toEqual(['early'])
    control.onAdd(new Map({ container: 'unused' }))
    control.onRemove()
    control.setCustomAttribution(['late'])
    expect(control.options.customAttribution).toEqual(['late'])
    expect(updateAttributions).not.toHaveBeenCalled()
  })
})
