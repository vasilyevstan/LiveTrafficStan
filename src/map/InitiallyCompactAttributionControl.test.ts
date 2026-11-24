import { describe, expect, it, vi } from 'vitest'
import { Map } from 'maplibre-gl'
import { InitiallyCompactAttributionControl } from './InitiallyCompactAttributionControl'

vi.mock('maplibre-gl', () => {
  const createContainer = () => {
    const summary = new EventTarget()
    const classes = new Set(['maplibregl-attrib-empty'])
    const attributes = new Set<string>()
    return {
      classList: {
        contains: (name: string) => classes.has(name),
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name),
      },
      removeAttribute: (name: string) => attributes.delete(name),
      setAttribute: (name: string, _value: string) => attributes.add(name),
      hasAttribute: (name: string) => attributes.has(name),
      querySelector: (selector: string) => selector === 'summary' ? summary : null,
    }
  }
  return {
    Map: class {},
    AttributionControl: class {
      private container?: ReturnType<typeof createContainer>
      constructor(_options: { compact?: boolean } = {}) {}
      onAdd() {
        this.container = createContainer()
        return this.container
      }
      _updateAttributions() {
        const container = this.container!
        container.classList.remove('maplibregl-attrib-empty')
        if (!container.classList.contains('maplibregl-compact')) {
          container.classList.add('maplibregl-compact')
          container.classList.add('maplibregl-compact-show')
          container.setAttribute('open', '')
        }
      }
    },
  }
})

describe('native attribution compaction', () => {
  it('starts collapsed without deleting the native attribution or control', () => {
    const control = new InitiallyCompactAttributionControl({ compact: true })
    const element = control.onAdd(new Map({ container: 'unused' }))
    expect(element.hasAttribute('open')).toBe(false)
    expect(element.classList.contains('maplibregl-compact')).toBe(true)
    expect(element.classList.contains('maplibregl-compact-show')).toBe(false)
    expect(element.querySelector('summary')).not.toBeNull()
  })

  it('stays collapsed when native source credits arrive after mount', () => {
    const control = new InitiallyCompactAttributionControl({ compact: true })
    const element = control.onAdd(new Map({ container: 'unused' }))
    control._updateAttributions()
    expect(element.classList.contains('maplibregl-attrib-empty')).toBe(false)
    expect(element.classList.contains('maplibregl-compact-show')).toBe(false)
    expect(element.hasAttribute('open')).toBe(false)
  })

  it('preserves an explicit open or closed choice when source credits change', () => {
    const control = new InitiallyCompactAttributionControl({ compact: true })
    const element = control.onAdd(new Map({ container: 'unused' }))
    element.classList.add('maplibregl-compact-show')
    element.setAttribute('open', '')
    control._updateAttributions()
    expect(element.classList.contains('maplibregl-compact-show')).toBe(true)
    expect(element.hasAttribute('open')).toBe(true)
    element.classList.remove('maplibregl-compact-show')
    element.removeAttribute('open')
    control._updateAttributions()
    expect(element.classList.contains('maplibregl-compact-show')).toBe(false)
    expect(element.hasAttribute('open')).toBe(false)
  })
})
