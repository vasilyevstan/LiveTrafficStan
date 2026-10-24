import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ObjectShareControl } from './ObjectShareControl'

describe('ObjectShareControl', () => {
  it('renders a labeled share arrow without creating a link or a duplicate text action', () => {
    const capture = vi.fn()
    const html = renderToStaticMarkup(
      <ObjectShareControl identityKey="selected:test" capture={capture} now={0} />,
    )
    expect(capture).not.toHaveBeenCalled()
    expect(html).toContain('class="close-button details-panel__share"')
    expect(html).toContain('aria-label="Share object"')
    expect(html).toContain('aria-busy="false"')
    expect(html).toContain('Public identity and dated position; link lasts 24 hours.')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('>Share object</button>')
    expect(html).not.toContain('journey-actions')
    expect(html).not.toContain('object-share__url')
  })
})
