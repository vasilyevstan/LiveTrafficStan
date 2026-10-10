import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const palette = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../App.css', import.meta.url), 'utf8')
const luminance = (hex: string) => {
  const channels = hex.match(/[a-f\d]{2}/gi)!.map((channel) => {
    const value = parseInt(channel, 16) / 255
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}
const contrast = (a: string, b: string) => {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

describe('interface presentation contracts', () => {
  for (const theme of ['light', 'dark']) {
    const block = palette.split(`:root[data-theme='${theme}'] {`)[1].split('}')[0]
    const tokens = Object.fromEntries(
      [...block.matchAll(/--([\w-]+): (#[a-f\d]{6});/gi)].map((match) => [
        match[1],
        match[2],
      ]),
    )

    it(`${theme} has readable small text and an opaque panel`, () => {
      for (const text of [
        'panel-text', 'heading-text', 'subtle-text', 'summary-text',
        'provider-text', 'legend-text', 'note-text', 'note-muted',
        'detail-label', 'detail-text', 'error-text', 'status-live',
        'status-warning', 'status-error', 'accent-line',
      ]) {
        expect(contrast(tokens[text], tokens['panel-background']), text)
          .toBeGreaterThanOrEqual(4.5)
      }
      for (const state of ['', '-active']) {
        expect(contrast(tokens[`button${state}-text`], tokens[`button${state}-background`]))
          .toBeGreaterThanOrEqual(4.5)
      }
      expect(contrast(tokens['placeholder-text'], tokens['button-background']))
        .toBeGreaterThanOrEqual(4.5)
    })

    it(`${theme} gives keyboard focus a solid contrasting ring`, () => {
      for (const background of ['panel-background', 'button-background', 'button-active-background']) {
        expect(contrast(tokens['focus-ring'], tokens[background]))
          .toBeGreaterThanOrEqual(3)
      }
    })
  }

  it('retains the visual-viewport cap and the sole orbital scroll owner', () => {
    expect(styles).toContain('--app-visual-viewport-width')
    expect(styles).toContain('--app-visual-viewport-height')
    expect(styles).toContain('--app-visual-viewport-58')
    expect(styles).toMatch(/\.orbital-results,\s*\.in-view-results\s*\{\s*max-height: none;\s*overflow: visible;/)
    expect(styles).toMatch(/\.control-panel__more-body\s*\{[^}]*overflow-y: auto;/)
    expect(styles).not.toMatch(/\.control-panel__tasks\s*\{[^}]*position: sticky;/)
    expect(styles).toContain('outline: 3px solid var(--focus-ring)')
  })

  it('keeps the floating close over only a compact header and one full-width body scroller', () => {
    expect(styles).toMatch(
      /\.details-panel__heading\s*\{[^}]*padding: 0 44px 8px 0;/,
    )
    expect(styles).toMatch(
      /\.details-panel__body\s*\{[^}]*min-height: 0;[^}]*overflow: auto;/,
    )
    expect(styles).toMatch(
      /\.details-panel__close\s*\{[^}]*position: absolute;[^}]*width: 44px;[^}]*height: 44px;/,
    )
    expect(styles).not.toContain('margin-right: 58px')
    expect(styles).not.toContain('.details-panel__close-anchor')
  })

  it('keeps the depth toggle full-width and at least a 44px target', () => {
    expect(styles).toMatch(/#depths-layer-toggle\s*\{[^}]*grid-column: 1 \/ -1;[^}]*min-height: 44px;/)
  })

  it('preserves the previous mobile body and photo budget beneath the fixed identity row', () => {
    expect(styles).toMatch(/--mobile-detail-height: clamp\(\s*184px,\s*calc\(var\(--app-visual-viewport-height\) - 564px\),\s*256px/)
    expect(styles).toMatch(/@container workspace \(max-width: 340px\)[\s\S]*--mobile-detail-height: 160px;/)
    expect(styles).toMatch(/\.vessel-photo__image\s*\{[^}]*max-height: min\(160px, calc\(var\(--mobile-detail-height\) - 84px\)\);/)
    expect(styles).toMatch(/:has\(\.details-panel--airport-board\)[\s\S]*--mobile-detail-height: clamp\(\s*104px,/)
  })

  it('anchors interface and native map controls to the visual viewport, not the canvas', () => {
    expect(styles).toMatch(
      /\.interface-layer,\s*\.maplibregl-control-container\s*\{[^}]*top: var\(--app-visual-viewport-top\);[^}]*left: var\(--app-visual-viewport-left\);[^}]*width: var\(--app-visual-viewport-width\);[^}]*height: var\(--app-visual-viewport-height\);[^}]*container: workspace \/ size;/,
    )
    expect(styles).toMatch(/\.traffic-map\s*\{\s*position: absolute;\s*inset: 0;\s*\}/)
    expect(styles).not.toMatch(/@media \(max-width:/)
    expect(styles).toContain('@container workspace (max-width: 760px) and (max-height: 650px)')
    expect(styles).toContain('.interface-layer:has(.viewport-notice) > *')
  })

  it('protects compact controls without disabling magnification in open panels', () => {
    expect(styles).toContain('.brand-panel:not(:has(details[open]))')
    expect(styles).toContain('.workspace-dock:not(:has(details[open]))')
    expect(styles).toContain('touch-action: pan-x pan-y')
    expect(styles).toContain('touch-action: pan-y pinch-zoom')
    expect(styles).not.toContain('touch-action: none')
  })

  it('floats a compact status card and preserves the mobile bottom dock', () => {
    expect(styles).toMatch(/\.brand-panel\s*\{[^}]*top: 16px;[^}]*left: 16px;/)
    expect(styles).toMatch(/\.brand-panel\s*\{[^}]*width: min\(280px, calc\(var\(--app-visual-viewport-width\) - 24px\)\);/)
    expect(styles).not.toMatch(/\.brand-panel\s*\{[^}]*width: 100%;/)
    expect(styles).not.toContain("grid-template-areas: 'brand navigation status'")
    expect(styles).toContain('--workspace-header-bottom: 104px')
    expect(styles).toContain('--workspace-header-bottom: 100px')
    expect(styles).not.toContain('--workspace-masthead-height')
    expect(styles).toMatch(/\.live-status__providers\s*\{[^}]*top: calc\(100% \+ 8px\);[^}]*left: 0;/)
    expect(styles).toContain('.workspace-dock {')
    expect(styles).toContain('top: calc(var(--workspace-header-bottom) + 16px)')
    expect(styles).toContain('top: calc(var(--app-visual-viewport-height) - var(--control-stack-height) - 30px)')
    expect(styles).toContain('bottom: calc(78px + var(--workspace-note-height))')
    expect(styles).not.toContain('--mobile-controls-top')
    expect(styles).toContain('.interface-layer:has(.viewport-notice)')
    expect(styles).toContain('var(--workspace-notice-height) - var(--mobile-detail-height)')
    expect(styles).not.toMatch(/\.viewport-notice\s*\{[^}]*border-left:/)
  })

  it('anchors desktop controls right, opens panels inward and keeps details opposite', () => {
    expect(styles).toMatch(/\.control-stack\s*\{[^}]*top: 16px;[^}]*right: 16px;[^}]*left: auto;/)
    expect(styles).toMatch(/\.control-panel__more-body\s*\{[^}]*right: calc\(100% \+ 12px\);[^}]*left: auto;/)
    expect(styles).toMatch(/\.control-panel__urgent\s*\{[^}]*right: calc\(100% \+ 12px\);[^}]*left: auto;/)
    expect(styles).toMatch(/\.details-panel\s*\{[^}]*right: auto;[^}]*left: 16px;/)
  })

  it('fits Center into the existing six-slot mobile dock', () => {
    expect(styles).toMatch(/\.workspace-center\s*\{[^}]*min-width: 0;[^}]*min-height: 44px;/)
    const mobile = styles.split('@container workspace (max-width: 760px) {')[1]
    expect(mobile).toMatch(/\.workspace-center\s*\{[^}]*flex: 1 1 0;/)
    expect(mobile).toMatch(/\.control-panel--operations\s*\{[^}]*flex: 4 1 0;/)
    expect(mobile).toMatch(/\.control-panel--settings\s*\{[^}]*flex: 1 1 0;/)
    expect(mobile).toMatch(/\.workspace-center,[\s\S]*?min-height: 56px;/)
    expect(mobile).toMatch(
      /\.control-panel--in-view,\s*\.control-panel__in-view\s*\{\s*display: contents;/,
    )
    expect(mobile).toMatch(/\.control-panel__in-view > summary\s*\{\s*display: none;/)
    expect(mobile).toMatch(/\.in-view-mobile-entry\s*\{\s*display: block;/)
  })

  it('reserves the hidden dock row only for a useful historical compass', () => {
    const mobile = styles.split('@container workspace (max-width: 760px) {')[1]
    expect(mobile).toMatch(/\.details-panel--historical\s*\{[^}]*--historical-compass-height: 0px;[^}]*var\(--historical-compass-height\)/)
    expect(mobile).toMatch(/\.interface-layer:has\(\.workspace-north\) \.details-panel--historical\s*\{\s*--historical-compass-height: 70px;/)
    expect(mobile).toMatch(/\.interface-layer:has\(\.details-panel--historical\) \.control-stack\s*\{\s*visibility: hidden;/)
    expect(mobile).toMatch(/\.interface-layer:has\(\.details-panel--historical\) \.workspace-north\s*\{\s*bottom: 0;\s*visibility: visible;/)
  })

  it('gives In view search, result and paging controls 44 px minimum targets', () => {
    expect(styles).toMatch(/\.in-view-body \.control-options button,[^{]*\{\s*min-height: 44px;/)
    expect(styles).toMatch(/\.in-view input\[type='search'\]\s*\{\s*min-height: 44px;/)
    expect(styles).toMatch(/\.in-view__close\s*\{[^}]*width: 44px;/)
    expect(styles).toMatch(/\.close-button\s*\{\s*min-height: 44px;/)
  })
})
