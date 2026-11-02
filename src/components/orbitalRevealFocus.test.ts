import { describe, expect, it, vi } from 'vitest'
import { focusOrbitalRevealTarget } from './orbitalRevealFocus'

describe('orbital reveal focus', () => {
  it('keeps focus inside the panel while lazy results are not present', () => {
    const panel = { focus: vi.fn() } as unknown as HTMLElement
    const querySelector = vi.fn((selector: string) =>
      selector === '#map-tools-panel-orbits' ? panel : null,
    )
    const details = { querySelector } as unknown as HTMLDetailsElement

    const focusedResult = focusOrbitalRevealTarget(details)

    expect(querySelector).toHaveBeenCalledWith('.orbital-results button')
    expect(querySelector).toHaveBeenCalledWith('#map-tools-panel-orbits')
    expect(panel.focus).toHaveBeenCalledOnce()
    expect(focusedResult).toBe(false)
  })

  it('focuses the first orbital result when it is already rendered', () => {
    const resultButton = { focus: vi.fn() } as unknown as HTMLElement
    const panel = { focus: vi.fn() } as unknown as HTMLElement
    const querySelector = vi.fn((selector: string) =>
      selector === '.orbital-results button' ? resultButton : panel,
    )
    const details = { querySelector } as unknown as HTMLDetailsElement

    const focusedResult = focusOrbitalRevealTarget(details)

    expect(resultButton.focus).toHaveBeenCalledOnce()
    expect(panel.focus).not.toHaveBeenCalled()
    expect(focusedResult).toBe(true)
  })
})
