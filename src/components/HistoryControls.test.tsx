import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HistoryControls } from './HistoryControls'

describe('HistoryControls', () => {
  it('renders bounded selected-object trail controls', () => {
    const html = renderToStaticMarkup(
      <HistoryControls
        trailPreferences={{ visible: true, durationMinutes: 15 }}
        onTrailPreferencesChange={() => undefined}
      />,
    )

    expect(html).toContain('<legend>Trail</legend>')
    expect(html).toContain('aria-pressed="true">SHOW')
    expect(html).toContain('Selected trail duration')
    expect(html).toContain('<option value="5">5 MIN</option>')
    expect(html).toContain('<option value="15" selected="">15 MIN</option>')
    expect(html).toContain('<option value="60">60 MIN</option>')
    expect(html).toContain('Session-only provider observations')
  })

  it('keeps hidden state explicit without disabling collection settings', () => {
    const html = renderToStaticMarkup(
      <HistoryControls
        trailPreferences={{ visible: false, durationMinutes: 60 }}
        onTrailPreferencesChange={() => undefined}
      />,
    )

    expect(html).toContain('aria-pressed="true">HIDE')
    expect(html).toContain('<option value="60" selected="">60 MIN</option>')
    expect(html).not.toContain('disabled=""')
  })
})
