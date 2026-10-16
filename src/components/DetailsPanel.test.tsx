import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DetailsPanel } from './DetailsPanel'
import { closeDetailsOnEscape } from './detailsKeyboard'
import { MobileInspectorContext } from './mobileWorkspace'

describe('DetailsPanel', () => {
  it('supports narrowly forced desktop compaction without unmounting selected content', () => {
    const html = renderToStaticMarkup(
      <MobileInspectorContext.Provider value={{
        mobile: false, compact: true, forceCompact: true, identity: 'captured:test', returnToTask: false,
        onExpand: vi.fn(), onCollapse: vi.fn(),
      }}>
        <DetailsPanel titleId="test-title" closeLabel="Close captured overview" onClose={vi.fn()} heading={<h2>Captured overview</h2>}>
          <button>Retained captured context</button>
        </DetailsPanel>
      </MobileInspectorContext.Provider>,
    )
    expect(html).toContain('data-force-compact="true"')
    expect(html).toContain('data-compact="true"')
    expect(html).toMatch(/class="details-panel__body" hidden="" inert=""/)
    expect(html).toContain('Retained captured context')
    expect(html).toContain('>Details</button>')
  })
  it('retains body content behind native hidden/inert while exposing real deselection and Details', () => {
    const html = renderToStaticMarkup(
      <MobileInspectorContext.Provider value={{
        mobile: true, compact: true, identity: 'test:one', returnToTask: false,
        onExpand: vi.fn(), onCollapse: vi.fn(),
      }}>
        <DetailsPanel titleId="test-title" closeLabel="Close ship details" onClose={vi.fn()} heading={<h2>Test ship</h2>}>
          <button type="button">Same mounted data action</button>
        </DetailsPanel>
      </MobileInspectorContext.Provider>,
    )
    expect(html).toContain('data-compact="true"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('>Details</button>')
    expect(html).toMatch(/class="details-panel__body" hidden="" inert=""/)
    expect(html).toContain('Same mounted data action')
    expect(html).toContain('aria-label="Close ship details"')
  })
  it('exposes Back for a suspended task and ignores compact intent on desktop', () => {
    for (const mobile of [true, false]) {
      const html = renderToStaticMarkup(
        <MobileInspectorContext.Provider value={{
          mobile, compact: !mobile, identity: 'test:one', returnToTask: true,
          onExpand: vi.fn(), onCollapse: vi.fn(),
        }}>
          <DetailsPanel titleId="test-title" closeLabel="Close details" onClose={vi.fn()} heading={<h2>Test</h2>}>Content</DetailsPanel>
        </MobileInspectorContext.Provider>,
      )
      expect(html).not.toContain('hidden=""')
      expect(html.includes('>Back</button>')).toBe(mobile)
    }
  })
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

  it('leaves Escape to native workspace fullscreen without clearing details', () => {
    const onClose = vi.fn()
    const event = {
      key: 'Escape', defaultPrevented: false,
      preventDefault: vi.fn(), stopPropagation: vi.fn(),
    }
    closeDetailsOnEscape(event, onClose, true)
    expect(onClose).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })
})
