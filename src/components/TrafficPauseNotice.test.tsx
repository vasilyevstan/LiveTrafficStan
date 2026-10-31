import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { inspectorStartsExpanded, trafficPausePlacement, type MobileWorkspaceTask } from './mobileWorkspace'
import { TrafficPauseNotice } from './TrafficPauseNotice'

describe('compact workspace presentation', () => {
  it.each([
    [false, false, false, true],
    [false, false, true, true],
    [true, false, false, false],
    [true, false, true, true],
    [true, true, false, false],
    [true, true, true, false],
  ])('starts expanded for mobile=%s captured=%s result=%s: %s', (mobile, captured, fromResult, expanded) => {
    expect(inspectorStartsExpanded(mobile, captured, fromResult)).toBe(expanded)
  })

  it.each([
    [false, null, false, 'map'],
    [false, 'find', true, 'map'],
    [true, null, false, 'map'],
    [true, null, true, 'inspector'],
    [true, 'find', true, 'task'],
    [true, 'settings', false, 'task'],
    [true, 'in-view', false, 'task'],
  ] as const)('chooses one notice owner for mobile=%s task=%s expanded=%s', (mobile, task, expanded, owner) => {
    expect(trafficPausePlacement(mobile, task, expanded)).toBe(owner)
  })

  it.each<MobileWorkspaceTask>(['layers', 'find', 'context', 'orbits', 'sources', 'settings', 'places', 'in-view'])(
    'lets the active %s task own the notice ahead of retained details',
    task => expect(trafficPausePlacement(true, task, true)).toBe('task'),
  )

  it('moves the complete pause explanation into the open provider disclosure only on phones', () => {
    expect(trafficPausePlacement(true, null, false, true)).toBe('providers')
    expect(trafficPausePlacement(false, null, false, true)).toBe('map')
    expect(trafficPausePlacement(true, 'find', false, true)).toBe('task')
  })

  it.each([false, true])('preserves complete context and the existing action when inline=%s', inline => {
    const html = renderToStaticMarkup(<TrafficPauseNotice inline={inline} retainedSample
      message="Zoom in or reduce tilt to see live traffic" onResume={() => undefined} />)
    expect(html).toContain(inline ? 'class="traffic-pause-notice"' : 'class="viewport-notice"')
    expect(html).toContain('Last local sample; not wider live coverage.')
    expect(html).toContain('Zoom in or reduce tilt to see live traffic')
    expect(html.match(/>RESUME LIVE<\/button>/g)).toHaveLength(1)
    expect(html).not.toContain('role="status"')
    expect(html).not.toContain('aria-live')
  })

  it('does not offer Resume without a safe assessed viewport', () => {
    const html = renderToStaticMarkup(<TrafficPauseNotice retainedSample={false}
      message="Zoom in to see live traffic" />)
    expect(html).toContain('Aircraft and ships paused')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('Last local sample')
  })
})
