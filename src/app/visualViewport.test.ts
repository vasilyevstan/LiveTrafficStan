import { describe, expect, it } from 'vitest'
import { visualViewportCssValues } from './visualViewport'

describe('visual viewport CSS values', () => {
  const viewport = {
    width: 390,
    height: 517,
    offsetLeft: 0,
    offsetTop: 0,
  }

  it('derives the control budget from the visible mobile viewport', () => {
    expect(visualViewportCssValues(viewport)).toEqual({
      width: '390px',
      height: '517px',
      left: '0px',
      top: '0px',
      controlBudget: '299.86px',
    })
  })

  it('anchors magnified controls to the visible rectangle without undoing zoom', () => {
    expect(visualViewportCssValues({
      width: 640,
      height: 450,
      offsetLeft: 320,
      offsetTop: 225,
    })).toEqual({
      width: '640px',
      height: '450px',
      left: '320px',
      top: '225px',
      controlBudget: '261px',
    })
  })

  it('keeps fractional pinch dimensions and offsets at CSS pixel precision', () => {
    expect(visualViewportCssValues({
      width: 639.9997,
      height: 449.9998,
      offsetLeft: 75.125,
      offsetTop: 12.345,
    })).toEqual({
      width: '640px',
      height: '450px',
      left: '75.13px',
      top: '12.35px',
      controlBudget: '261px',
    })
  })

  it('accepts layout-viewport fallback dimensions with zero offsets', () => {
    expect(visualViewportCssValues({
      width: 1280,
      height: 900,
      offsetLeft: 0,
      offsetTop: 0,
    })).toEqual({
      width: '1280px',
      height: '900px',
      left: '0px',
      top: '0px',
      controlBudget: '522px',
    })
  })

  it.each([
    { width: 0 },
    { width: -1 },
    { width: Number.NaN },
    { height: 0 },
    { height: -1 },
    { height: Number.POSITIVE_INFINITY },
    { offsetLeft: Number.NaN },
    { offsetTop: Number.POSITIVE_INFINITY },
  ])('rejects invalid viewport measurements %j', (invalid) => {
    expect(visualViewportCssValues({
      ...viewport,
      ...invalid,
    })).toBeUndefined()
  })
})
