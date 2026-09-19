import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HistoryControls } from './HistoryControls'

const baseProps: Parameters<typeof HistoryControls>[0] = {
  trailPreferences: { visible: true, durationMinutes: 15 },
  onTrailPreferencesChange: () => undefined,
  historySettings: { version: 1, enabled: false, retentionHours: 1 },
  historyStatus: {
    phase: 'disabled',
    recordCount: 0,
    logicalBytes: 0,
  },
  historyRecordCount: 0,
  playback: { mode: 'live' },
  onHistoryEnabledChange: () => undefined,
  onHistoryRetentionChange: () => undefined,
  onClearHistory: () => undefined,
  onRetryHistory: () => undefined,
  onEnterHistory: () => undefined,
  onPlayHistory: () => undefined,
  onPauseHistory: () => undefined,
  onScrubHistory: () => undefined,
  onPlaybackSpeedChange: () => undefined,
}

describe('HistoryControls', () => {
  it('renders bounded selected-object trail controls', () => {
    const html = renderToStaticMarkup(
      <HistoryControls {...baseProps} />,
    )

    expect(html).toContain('<legend>Trail</legend>')
    expect(html).toContain('aria-pressed="true">SHOW')
    expect(html).toContain('Selected trail duration')
    expect(html).toContain('<option value="5">5 MIN</option>')
    expect(html).toContain('<option value="15" selected="">15 MIN</option>')
    expect(html).toContain('<option value="60">60 MIN</option>')
    expect(html).toContain('Session provider observations only')
  })

  it('keeps hidden state explicit without disabling collection settings', () => {
    const html = renderToStaticMarkup(
      <HistoryControls
        {...baseProps}
        trailPreferences={{ visible: false, durationMinutes: 60 }}
      />,
    )

    expect(html).toContain('aria-pressed="true">HIDE')
    expect(html).toContain('<option value="60" selected="">60 MIN</option>')
  })

  it('renders opt-in persistence and historical playback controls', () => {
    const html = renderToStaticMarkup(
      <HistoryControls
        {...baseProps}
        historySettings={{ version: 1, enabled: true, retentionHours: 6 }}
        historyStatus={{
          phase: 'ready',
          recordCount: 12,
          logicalBytes: 2_048,
        }}
        historyRecordCount={20}
        historyRange={{ oldest: 1_000, newest: 10_000 }}
        playback={{
          mode: 'history-paused',
          cursor: 5_000,
          range: { oldest: 1_000, newest: 10_000 },
          speed: 2,
        }}
      />,
    )

    expect(html).toContain('<legend>History</legend>')
    expect(html).toContain('DISABLE &amp; DELETE')
    expect(html).toContain('6 HOURS')
    expect(html).toContain('type="range" min="1000" max="10000" step="1"')
    expect(html).toContain(
      'This is the actual retained range, not the requested maximum.',
    )
    expect(html).toContain('>PLAY<')
    expect(html).toContain('aria-pressed="true">2×')
  })
})
