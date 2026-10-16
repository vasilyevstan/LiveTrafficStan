import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_LOCAL_RULER, reduceLocalRuler, type LocalRulerAvailability } from '../domain/localRuler'
import { LocalRulerPlacement } from './LocalRulerPlacement'

const state = reduceLocalRuler(EMPTY_LOCAL_RULER, { type: 'start' })
const render = (availability: LocalRulerAvailability, complete = false) =>
  renderToStaticMarkup(<LocalRulerPlacement
    state={complete ? { ...state, points: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }] } : state}
    availability={availability} distance={complete ? '0 m' : undefined} panelRef={null}
    onCenter={vi.fn()} onCancel={vi.fn()} onDone={vi.fn()}
  />)

describe('temporary accessible ruler strip', () => {
  it('exposes explicit center placement, bounded progress and a reachable Cancel before completion', () => {
    const html = render('available')
    expect(html).toContain('aria-label="Distance ruler"')
    expect(html).toContain('role="status"')
    expect(html).toContain('Set point 1 of 2.')
    expect(html).toContain('aria-label="Set point at map center"')
    expect(html).toMatch(/<button type="button" disabled="">DONE/)
    expect(html).toContain('<button type="button">CANCEL</button>')
    expect(html).not.toContain('role="dialog"')
  })
  it('uses a surface-distance label and requires Done rather than silently retaining point two', () => {
    const html = render('available', true)
    expect(html).toContain('Approximate surface distance: 0 m')
    expect(html).toMatch(/aria-describedby="ruler-placement-status" disabled=""/)
    expect(html).toContain('<button type="button">DONE</button>')
  })
  it.each<LocalRulerAvailability>(['unsupported', 'updating', 'moving', 'obscured'])(
    'reports %s explicitly without disabling Cancel', availability => {
      const html = render(availability)
      expect(html).toMatch(/aria-describedby="ruler-placement-status" disabled=""/)
      expect(html).toContain('<button type="button">CANCEL</button>')
      expect(html).not.toContain('Set point 1')
    },
  )
})
