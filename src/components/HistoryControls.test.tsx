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
    expect(html).not.toContain('Session observations only')
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

  it('keeps duration settings without duplicating promoted trail visibility', () => {
    const html = renderToStaticMarkup(
      <HistoryControls {...baseProps} trailVisibilityPromoted />,
    )

    expect(html).toContain('<legend>Trail</legend>')
    expect(html).not.toContain('>SHOW<')
    expect(html).not.toContain('>HIDE<')
    expect(html).toContain('Selected trail duration')
  })

  it('renders opt-in persistence without duplicating active playback controls', () => {
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
    expect(html).toContain('Retained')
    expect(html).not.toContain('type="range"')
    expect(html).not.toContain('>PLAY<')
    expect(html).not.toContain('ENTER HISTORY')
  })

  it('does not repeat the promoted failure but explains disabled playback', () => {
    const html = renderToStaticMarkup(
      <HistoryControls
        {...baseProps}
        historyStatus={{
          phase: 'error',
          recordCount: 0,
          logicalBytes: 0,
          message: 'History database unavailable',
        }}
        retryPromoted
      />,
    )

    expect(html).not.toContain('History database unavailable')
    expect(html).toContain('Restore local history to check saved observations.')
    expect(html).not.toContain('RETRY LOCAL HISTORY')
  })

  it('shows the pending deletion message exactly once', () => {
    const message = 'Clearing session and private local history.'
    const html = renderToStaticMarkup(
      <HistoryControls
        {...baseProps}
        historyStatus={{
          ...baseProps.historyStatus,
          phase: 'deletion-pending',
          message,
        }}
      />,
    )

    expect(html.split(message)).toHaveLength(2)
    expect(html).toContain(`role="status">${message}`)
    expect(html).toContain('0 observations available')
  })

  it('retains a distinct supplementary history message', () => {
    const message = 'Older observations were removed.'
    const html = renderToStaticMarkup(
      <HistoryControls
        {...baseProps}
        historyStatus={{
          ...baseProps.historyStatus,
          phase: 'ready',
          message,
        }}
      />,
    )

    expect(html).not.toContain('Private local history is ready.')
    expect(html.split(message)).toHaveLength(2)
  })

  it.each(['disabled', 'ready', 'writing'] as const)('does not narrate ordinary %s history state', (phase) => {
    const html = renderToStaticMarkup(
      <HistoryControls {...baseProps} historyStatus={{ ...baseProps.historyStatus, phase }} />,
    )
    expect(html).not.toContain('Private local history is')
    expect(html).not.toContain('Saving provider observations')
    expect(html).toContain('Private on-device records; no upload or sync.')
    expect(html).toContain('No recorded observations yet.')
    expect(html).toMatch(/id="history-enter-button"[^>]*disabled=""[^>]*aria-describedby="history-entry-status"/)
  })

  it.each([1, 6, 24] as const)('distinguishes the session buffer from %s-hour saved retention', (retentionHours) => {
    const html = renderToStaticMarkup(<HistoryControls {...baseProps}
      historySettings={{ version: 1, enabled: true, retentionHours }} />)
    expect(html).toContain(`Saved history: up to ${retentionHours} ${retentionHours === 1 ? 'hour' : 'hours'}.`)
    expect(html).toContain('Session buffer: up to 60 min.')
    expect(html).not.toContain('Local history: up to 60 min')
    expect(html).toContain('This browser may evict saved data.')
  })

  it.each(['initializing', 'blocked', 'error', 'deletion-pending'] as const)(
    'does not diagnose missing recordings while storage is %s', (phase) => {
      const html = renderToStaticMarkup(<HistoryControls {...baseProps}
        historyStatus={{ ...baseProps.historyStatus, phase }} />)
      expect(html).not.toContain('No recorded observations yet.')
      expect(html).toContain('id="history-entry-status"')
    },
  )
})
