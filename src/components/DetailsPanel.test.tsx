import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DetailsPanel } from './DetailsPanel'
import { closeDetailsOnEscape } from './detailsKeyboard'

describe('DetailsPanel', () => {
  it('keeps the identity and icon-only close outside the scrollable body', () => {
    const html = renderToStaticMarkup(
      <DetailsPanel
        titleId="selected-test-title"
        closeLabel="Close ship details"
        className="details-panel--historical"
        onClose={() => undefined}
        heading={<h2 id="selected-test-title">Selected ship</h2>}
      >
        <p>Existing details and attribution</p>
      </DetailsPanel>,
    )

    expect(html).toContain('class="details-panel details-panel--historical"')
    expect(html).toContain('aria-labelledby="selected-test-title"')
    expect(html).toContain('aria-label="Close ship details"')
    expect(html).toContain('class="close-button details-panel__close"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('>Close</button>')
    expect(html.indexOf('details-panel__heading')).toBeLessThan(
      html.indexOf('details-panel__body'),
    )
    expect(html.indexOf('details-panel__close')).toBeLessThan(html.indexOf('details-panel__body'))
    expect(html).not.toContain('details-panel__close-anchor')
    expect(html).toContain('Existing details and attribution')
  })

  it('closes only on an unhandled Escape and stops it reaching other panels', () => {
    const onClose = vi.fn()
    const event = {
      key: 'Escape',
      defaultPrevented: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }

    closeDetailsOnEscape(event, onClose)

    expect(onClose).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
  })

  it.each([
    { key: 'Enter', defaultPrevented: false },
    { key: 'Tab', defaultPrevented: false },
    { key: 'Escape', defaultPrevented: true },
  ])('preserves other keys and already-handled events: %j', (keyEvent) => {
    const onClose = vi.fn()
    const event = {
      ...keyEvent,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }

    closeDetailsOnEscape(event, onClose)

    expect(onClose).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })
})
