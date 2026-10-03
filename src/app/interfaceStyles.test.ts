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
    expect(styles).toContain('--app-visual-viewport-height')
    expect(styles).toContain('--app-visual-viewport-58')
    expect(styles).toMatch(/\.orbital-results\s*\{\s*max-height: none;\s*overflow: visible;/)
    expect(styles).toMatch(/\.control-panel__more-body\s*\{[^}]*overflow-y: auto;/)
    expect(styles).not.toMatch(/\.control-panel__tasks\s*\{[^}]*position: sticky;/)
    expect(styles).toContain('outline: 3px solid var(--focus-ring)')
  })

  it('uses an edge-to-edge masthead and a responsive rail rather than corner cards', () => {
    expect(styles).toMatch(/\.brand-panel\s*\{[^}]*top: 0;[^}]*right: 0;[^}]*left: 0;/)
    expect(styles).toContain("grid-template-areas: 'brand navigation status'")
    expect(styles).toContain('.workspace-dock {')
    expect(styles).toContain('top: calc(var(--workspace-masthead-height) + 16px)')
    expect(styles).toContain('top: calc(var(--app-visual-viewport-height) - var(--control-stack-height) - 30px)')
    expect(styles).toContain('bottom: calc(78px + var(--workspace-note-height))')
    expect(styles).not.toContain('--mobile-controls-top')
    expect(styles).toContain('.interface-layer:has(.viewport-notice)')
    expect(styles).toContain('var(--workspace-notice-height) - var(--mobile-detail-height)')
  })
})
