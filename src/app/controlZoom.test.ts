import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { preventCompactControlWheelZoom } from './controlZoom'

class ControlTarget extends EventTarget {
  private readonly compact: boolean

  constructor(compact: boolean) {
    super()
    this.compact = compact
  }

  closest = vi.fn(() => this.compact ? this : null)
}

describe('compact control zoom protection', () => {
  beforeEach(() => vi.stubGlobal('Element', ControlTarget))
  afterEach(() => vi.unstubAllGlobals())

  const wheel = (
    overrides: Partial<Pick<
      WheelEvent,
      'ctrlKey' | 'cancelable' | 'defaultPrevented' | 'target'
    >> = {},
  ) => ({
    ctrlKey: true,
    cancelable: true,
    defaultPrevented: false,
    target: new ControlTarget(true),
    preventDefault: vi.fn(),
    ...overrides,
  })

  it('blocks page-pinch wheel events only over closed compact controls', () => {
    const target = new ControlTarget(true)
    const event = wheel({ target })
    preventCompactControlWheelZoom(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(target.closest).toHaveBeenCalledWith(
      '.brand-panel:not(:has(details[open])), .workspace-dock:not(:has(details[open]))',
    )
  })

  it('leaves map, information-panel, and other noncompact targets alone', () => {
    const event = wheel({ target: new ControlTarget(false) })
    preventCompactControlWheelZoom(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it.each([
    { ctrlKey: false },
    { cancelable: false },
    { defaultPrevented: true },
    { target: null },
    { target: new EventTarget() },
  ])('preserves ordinary, handled, or non-element wheel events %j', (overrides) => {
    const event = wheel(overrides)
    preventCompactControlWheelZoom(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})
