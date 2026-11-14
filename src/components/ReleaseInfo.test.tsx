import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReleaseInfo } from './ReleaseInfo'

describe('release information display', () => {
  it('shows the application version, short exact SHA and UTC timestamp', () => {
    const html = renderToStaticMarkup(
      <ReleaseInfo
        info={{
          version: '1.6.0',
          sha: '20289a98aa41a8bfd700ebf2af9da61373db44e4',
          timestamp: '2026-11-14T12:03:49.000Z',
        }}
      />,
    )

    expect(html).toContain('aria-label="Release information"')
    expect(html).toContain('title="Release v1.6.0 at 20289a98aa41a8bfd700ebf2af9da61373db44e4"')
    expect(html).toContain('v1.6.0 · 20289a9')
    expect(html).toContain('dateTime="2026-11-14T12:03:49.000Z"')
    expect(html).toContain('2026-11-14 12:03 UTC')
  })
})
