import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HistoryModeNotice } from './HistoryModeNotice'

describe('HistoryModeNotice', () => {
  it('keeps historical state and return to live directly visible', () => {
    const html = renderToStaticMarkup(
      <HistoryModeNotice
        playback={{
          mode: 'history-paused',
          cursor: Date.UTC(2026, 8, 19, 12),
          range: {
            oldest: Date.UTC(2026, 8, 19, 11),
            newest: Date.UTC(2026, 8, 19, 12),
          },
          speed: 1,
        }}
        entityCount={3}
        onReturnToLive={() => undefined}
      />,
    )

    expect(html).toContain('HISTORY PAUSED')
    expect(html).toContain('3 recorded objects')
    expect(html).toContain('RETURN TO LIVE')
    expect(html).not.toContain('aria-live')
  })
})
