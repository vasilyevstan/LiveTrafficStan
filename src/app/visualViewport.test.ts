import { describe, expect, it } from 'vitest'
import { visualViewportCssValues } from './visualViewport'

describe('visual viewport CSS values', () => {
  it('derives the control budget from the visible mobile viewport', () => {
    expect(visualViewportCssValues(517)).toEqual({
      height: '517px',
      controlBudget: '299.86px',
    })
  })

  it('rejects invalid viewport heights', () => {
    expect(visualViewportCssValues(0)).toBeUndefined()
    expect(visualViewportCssValues(Number.NaN)).toBeUndefined()
  })
})
