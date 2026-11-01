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
  it('keeps the temporary ruler actions reachable, center reticle passive and desktop compact bodies hidden', () => {
    expect(styles).toMatch(/\.ruler-reticle\s*\{[^}]*top: 50%;[^}]*left: 50%;[^}]*pointer-events: none;/)
    expect(styles).toMatch(/\.ruler-placement-strip \.ruler-placement-actions button,[^}]*min-width: 44px;[^}]*min-height: 44px;/)
    expect(styles).toMatch(/\.details-panel__body\[hidden\]\s*\{\s*display: none;/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.ruler-placement-strip\s*\{[^}]*top: 64px;[^}]*transform: none;/)
  })
  it('keeps the native scale noninteractive, themed and wholly hidden in cramped layouts', () => {
    expect(styles).toMatch(/\.maplibregl-ctrl\.local-map-scale\s*\{[^}]*pointer-events: none;[^}]*color: var\(--panel-text\)/)
    expect(styles).toMatch(/\.local-map-scale\[hidden\]\s*\{\s*display: none;/)
    expect(styles).toContain('@container workspace (max-width: 132px) or (max-height: 360px)')
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.local-map-scale\s*\{\s*margin-bottom: calc\(var\(--mobile-surface-bottom\) \+ 8px\)/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace:has\([^}]*\.workspace-north,[^}]*\.workspace-fullscreen-exit,[^}]*\.maplibregl-compact-show[^}]*\) \.local-map-scale\s*\{\s*display: none;/)
  })

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

  it('keeps floating close and header actions over only a compact header and one full-width body scroller', () => {
    expect(styles).toMatch(
      /\.details-panel__heading\s*\{[^}]*padding: 0 44px 8px 0;/,
    )
    expect(styles).toMatch(
      /\.details-panel__body\s*\{[^}]*min-height: 0;[^}]*overflow: auto;/,
    )
    expect(styles).toMatch(
      /\.details-panel__close,\s*\.details-panel__share,\s*\.details-panel__save\s*\{[^}]*position: absolute;[^}]*width: 44px;[^}]*height: 44px;/,
    )
    expect(styles).toMatch(/\.details-panel__header-action\s*\{[^}]*position: absolute;[^}]*display: flex;/)
    expect(styles).not.toMatch(/\.object-share__feedback\s*\{[^}]*(?:overflow|max-height):/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.details-panel--action \.details-panel__identity\s*\{\s*flex-wrap: nowrap;/)
    expect(styles).not.toContain('margin-right: 58px')
    expect(styles).not.toContain('.details-panel__close-anchor')
  })

  it('gives opted-in traffic details one 44px desktop action row and responsive compact placement', () => {
    expect(styles).toMatch(/\.details-panel__action-row,\s*\.details-panel__body-actions\s*\{[^}]*min-height: 44px;/)
    expect(styles).toMatch(/\.details-panel__action-row\s*\{[^}]*flex: 0 0 44px;/)
    expect(styles).toMatch(/\.details-panel__action-row \.details-panel__close\s*\{[^}]*position: static;/)
    expect(styles).toMatch(/\.details-panel--traffic-actions \.details-panel__heading\s*\{\s*padding-right: 0;/)
    expect(styles).toMatch(/\.details-panel--traffic-actions\s*\{\s*width: min\(430px, calc\(var\(--app-visual-viewport-width\) - 32px\)\);/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.details-panel__body-actions\s*\{[^}]*margin-bottom: 8px;/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.details-panel__mobile-actions\s*\{[^}]*right: 96px;[^}]*display: flex;/)
    expect(styles).toMatch(/\.traffic-details__icon-action\s*\{[^}]*width: 44px;[^}]*height: 44px;[^}]*border-radius: 50%;/)
  })

  it('caps nonmobile traffic details and keeps utility actions in the header', () => {
    expect(styles).toMatch(
      /@container workspace \(min-width: 761px\)\s*\{[\s\S]*?\.app-shell:not\(\.app-shell--mobile-workspace\)\s+\.details-panel--traffic-actions\s*\{[^}]*--details-panel-padding: 12px;[^}]*width: clamp\(340px, 19cqw, 380px\);[^}]*max-height: min\(\s*clamp\(320px, 46cqh, 420px\),/,
    )
    expect(styles).toMatch(
      /details-panel--traffic-actions\s+\.details-panel__heading\s*\{[^}]*min-height: 44px;[^}]*padding-right: 240px;/,
    )
    expect(styles).toMatch(
      /details-panel--traffic-actions\s+\.details-panel__action-row\s*\{[^}]*position: absolute;[^}]*top: var\(--details-panel-padding\);[^}]*right: var\(--details-panel-padding\);[^}]*margin: 0;/,
    )
    expect(styles).toMatch(
      /details-panel--traffic-actions\s+\.detail-row\s*\{\s*padding-block: 7px;/,
    )
  })

  it('sizes shared overlays from the visual workspace with clamped panel spacing and landscape width', () => {
    expect(styles).toContain('--details-panel-padding: clamp(12px, 2cqh, 18px)')
    expect(styles).toMatch(/\.details-panel\s*\{[^}]*max-height: min\(\s*620px,\s*calc\(var\(--app-visual-viewport-height\) - var\(--workspace-header-bottom\) - 32px\)/)
    expect(styles).toContain('--mobile-safe-left: max(8px, env(safe-area-inset-left))')
    expect(styles).toContain('--mobile-safe-right: max(8px, env(safe-area-inset-right))')
    expect(styles).toMatch(/--mobile-surface-width: min\(\s*460px,\s*calc\(\s*var\(--app-visual-viewport-width\) -\s*var\(--mobile-safe-left\) -\s*var\(--mobile-safe-right\)/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.brand-panel\s*\{[^}]*left: var\(--mobile-safe-left\);[^}]*width: min\(\s*280px,[^}]*var\(--mobile-safe-right\)/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace\[data-mobile-landscape\]\s*\{[^}]*--mobile-surface-width: min\(\s*460px,\s*calc\(var\(--app-visual-viewport-width\) \* 0\.52\),\s*calc\(\s*var\(--app-visual-viewport-width\) -\s*var\(--mobile-safe-left\) -\s*var\(--mobile-safe-right\)/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace\[data-mobile-landscape\] \.brand-panel\s*\{[^}]*width: clamp\(\s*0px,[^}]*280px\s*\);[^}]*overflow: hidden;/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace\[data-mobile-landscape\] :is\(\.viewport-notice, \.map-error\)\s*\{\s*right: calc\(var\(--mobile-safe-right\) \+ var\(--mobile-surface-width\) \+ 8px\);/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace\[data-mobile-landscape\] \.control-panel__in-view\s*\{[^}]*--in-view-landscape-width: min\(\s*272px,/)
    expect(styles).toMatch(/\[data-mobile-landscape\][\s\S]*?\.control-panel__surface--in-view\s*\{\s*width: var\(--in-view-landscape-width\);/)
    expect(styles).toMatch(/\[data-mobile-landscape\][\s\S]*?\.control-panel__in-view\s+\.control-panel__more-body\s*\{[^}]*height: auto;[^}]*max-height: min\(var\(--mobile-body-height\), 132px\);[^}]*padding: 6px 8px;/)
    expect(styles).toMatch(/\.control-panel__in-view\s+\.in-view__tabs\s*\{\s*margin: 0 44px 6px 0;/)
    expect(styles).toMatch(/\.control-panel__surface--in-view\s*\{[^}]*width: min\(420px, var\(--mobile-surface-width\)\);[^}]*max-height:/)
    expect(styles).toMatch(/\.details-panel--traffic-actions\s*\{\s*width: min\(400px, var\(--mobile-surface-width\)\);/)
    expect(styles).toMatch(/\.app-shell:not\(\.app-shell--mobile-workspace\)[\s\S]*?\.control-panel__in-view\s+\.control-panel__more-body\s*\{\s*bottom: auto;[^}]*max-height:/)
    expect(styles).toMatch(/\.in-view-body:not\(:has\(#in-view-orbits-tab\[aria-selected='true'\]\)\)\s+\.in-view__more\s*\{\s*display: none;/)
  })

  it('pairs depth and relief in the two-column grid with at least 44px targets', () => {
    expect(styles).toMatch(/#depths-layer-toggle,\s*#relief-layer-toggle\s*\{[^}]*min-height: 44px;/)
    expect(styles).not.toMatch(/#depths-layer-toggle[^{}]*\{[^}]*grid-column:/)
  })

  it('reserves captured-title Save and Share clearance without squeezing the playback and Return row', () => {
    expect(styles).toMatch(/\.details-panel--orbital-view\.details-panel--action \.details-panel__heading\s*\{\s*padding-right: 0;/)
    expect(styles).toMatch(/\.details-panel--orbital-view\.details-panel--action h2\s*\{\s*padding-right: 88px;/)
    expect(styles).toMatch(/\.details-panel--orbital-view\.details-panel--action:has\(\.details-panel__save\):has\(\.details-panel__share\)\s*h2\s*\{\s*padding-right: 132px;/)
    expect(styles).toMatch(/\.details-panel--orbital-view\.details-panel--action \.orbital-view-heading\s*\{\s*grid-template-rows: minmax\(40px, auto\) auto;/)
    expect(styles).toMatch(/\.details-panel--orbital-view\.details-panel--action\[data-force-compact\] h2\s*\{\s*padding-right: 148px;/)
    expect(styles).toMatch(/\.details-panel--orbital-view\.details-panel--action\[data-force-compact\]:has\(\.details-panel__save\):has\(\.details-panel__share\)\s*h2\s*\{\s*padding-right: 192px;/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.details-panel--orbital-view\.details-panel--action \.details-panel__heading\s*\{\s*padding-right: 12px;/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.details-panel--orbital-view\.details-panel--action h2\s*\{\s*padding-right: 128px;/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace\s+\.details-panel--orbital-view\.details-panel--action:has\(\.details-panel__save\):has\(\.details-panel__share\)\s+h2\s*\{\s*padding-right: 172px;/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.details-panel--orbital-view\.details-panel--action \.details-panel__body\s*\{\s*max-height: max\(44px, calc\(var\(--mobile-body-height\) - 20px\)\);\s*padding-block: 0;/)
  })

  it('shares one mobile surface budget and keeps the compact body noninteractive', () => {
    expect(styles).toMatch(/--mobile-body-height: max\(44px, min\(\s*clamp\(180px,[^;]*340px\)/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.control-panel__more-body\s*\{[^}]*height: var\(--mobile-body-height\)/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.details-panel__body\s*\{[^}]*height: auto;[^}]*max-height: var\(--mobile-body-height\)/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.details-panel__body\[hidden\]\s*\{\s*display: none;/)
    expect(styles).not.toMatch(/\.interface-layer:has\(\.details-panel\[data-compact\]\) \.mobile-task-heading\s*\{\s*display: none;/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.details-panel\[hidden\],[^}]*display: none;/)
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
    expect(styles).toContain('bottom: calc(78px + var(--workspace-note-height) + var(--workspace-fullscreen-clearance))')
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

  it('fits the five task-first actions into the mobile dock without changing desktop controls', () => {
    expect(styles).toMatch(/\.workspace-center\s*\{[^}]*min-width: 0;[^}]*min-height: 44px;/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.workspace-dock\s*\{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/)
    for (const [selector, column] of [
      ['.workspace-orientation', 1], ['#traffic-controls-map-tools-summary', 2],
      ['.workspace-find', 3], ['#in-view-summary', 4], ['#traffic-controls-settings-summary', 5],
    ]) {
      expect(styles).toContain(`${selector} {\n  grid-column: ${column};`)
    }
    expect(styles).toContain('--mobile-dock-height: 58px')
    expect(styles).toContain('min-height: 56px')
  })

  it('keeps HISTORY ownership and reachable orientation controls without showing the ordinary dock', () => {
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.interface-layer:has\(\.history-mode-notice\) \.workspace-dock\s*\{\s*visibility: hidden;/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.interface-layer:has\(\.history-mode-notice\) > \*\s*\{[^}]*--mobile-surface-bottom:/)
    expect(styles).toContain(".interface-layer:has(.details-panel:not([data-compact]))")
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.history-mode-notice__actions\s*\{\s*grid-template-columns: 44px minmax\(0, 1fr\);/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.history-mode-notice__speeds\s*\{\s*grid-column: 1 \/ -1;\s*grid-row: 2;/)
    expect(styles).toContain('var(--mobile-surface-bottom) - var(--mobile-dock-bottom) + 52px')
  })

  it('gives fullscreen actions 44px targets and presence-only mobile flyout clearance', () => {
    expect(styles).toMatch(/\.workspace-north,\s*\.workspace-fullscreen-exit\s*\{[^}]*width: 44px;[^}]*height: 44px;/)
    expect(styles).toMatch(/#enter-fullscreen-button\s*\{[^}]*min-width: 44px;[^}]*min-height: 44px;/)
    const mobile = styles.split('@container workspace (max-width: 760px) {')[1]
    expect(mobile).toMatch(/\.control-stack:has\(\.workspace-fullscreen-exit\)\s*\{\s*--workspace-fullscreen-clearance: 52px;/)
    expect(mobile).toMatch(/\.workspace-orientation:has\(\.workspace-north\) \.workspace-fullscreen-exit\s*\{\s*right: auto;\s*left: 46px;/)
    expect(styles).toMatch(/@container workspace \(min-width: 761px\) and \(max-height: 500px\)[\s\S]*?\.control-stack:has\(\.workspace-fullscreen-exit\) :is\([^}]*min-height: 44px;/)
  })

  it('gives In view search, result and paging controls 44 px minimum targets', () => {
    expect(styles).toMatch(/\.in-view-body \.control-options button,[^{]*\{\s*min-height: 44px;/)
    expect(styles).toMatch(/\.in-view input\[type='search'\]\s*\{\s*min-height: 44px;/)
    expect(styles).toMatch(/\.in-view__close\s*\{[^}]*width: 44px;/)
    expect(styles).toMatch(/\.close-button\s*\{\s*min-height: 44px;/)
  })

  it('keeps edited mobile history selects and the flattened vessel checkbox at 44px', () => {
    const mobile = styles.split('@container workspace (max-width: 760px) {')[1]
    expect(mobile).toMatch(/\.control-panel__more-body \.history-controls select,\s*\.control-panel__more-body \.playback-controls select,\s*\.control-panel__more-body \.vessel-discovery__checkbox\s*\{\s*min-height: 44px;/)
  })

  it('wraps magnified dock actions and bounds credits independently of the layout viewport', () => {
    expect(styles).toContain('@container workspace (max-width: 280px)')
    expect(styles).toContain('--mobile-dock-height: 116px')
    expect(styles).toMatch(/\.workspace-dock\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[^}]*grid-template-rows: repeat\(2, minmax\(0, 1fr\)\)/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.maplibregl-ctrl-attrib\.maplibregl-compact-show \.maplibregl-ctrl-attrib-inner\s*\{[^}]*position: absolute;[^}]*width: var\(--mobile-surface-width\);[^}]*overflow: auto;/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.maplibregl-ctrl-attrib-button\s*\{[^}]*background-repeat: no-repeat;/)
    expect(styles).toContain('.control-panel__more-body button, .details-panel button, .history-mode-notice button')
  })

  it('recovers the dock gutter without overlapping attribution or action controls', () => {
    expect(styles).toContain('--mobile-dock-bottom: max(8px, env(safe-area-inset-bottom))')
    expect(styles).toContain('--mobile-dock-right: max(60px, calc(env(safe-area-inset-right) + 52px))')
    expect(styles).toMatch(/\.app-shell--mobile-workspace\s+\.details-panel--action:has\(\.details-panel__save\):has\(\.details-panel__share\)\s+\.details-panel__presentation\s*\{\s*right: 132px;/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace \.details-panel__header-action\s*\{\s*top: 0;/)
    expect(styles).toMatch(/\.app-shell--mobile-workspace\[data-mobile-landscape\][^{]*\{[^}]*--mobile-surface-width:/)
    expect(styles).toContain('@container workspace (max-height: 420px)')
    expect(styles).toMatch(/\.traffic-pause-notice\s*\{[^}]*display: grid;/)
    expect(styles).not.toMatch(/\.traffic-pause-notice\s*\{[^}]*(?:overflow|height|position):/)
  })
})
