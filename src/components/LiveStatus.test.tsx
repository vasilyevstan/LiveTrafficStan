import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DIGITRAFFIC_MARINE_CAPABILITIES } from '../providers/marine/digitrafficCapabilities'
import { LiveStatus } from './LiveStatus'

describe('LiveStatus', () => {
  it('keeps connected transport, regional coverage, and shown counts distinct', () => {
    const html = renderToStaticMarkup(
      <LiveStatus
        aircraftCount={3}
        vesselCount={0}
        aircraftStatus={{ phase: 'live', paused: false }}
        marineStatus={{ phase: 'live', paused: false }}
        marineCapabilities={DIGITRAFFIC_MARINE_CAPABILITIES}
        now={1_800_000_000_000}
        online
      />,
    )

    expect(html).toContain('0 ships shown · regional source')
    expect(html).toContain('Marine stream connected')
    expect(html).toContain(
      'Digitraffic regional source; exact coverage unknown',
    )
    expect(html).not.toContain('0 ships</span>')
  })

  it('does not label an unavailable stream as connected', () => {
    const html = renderToStaticMarkup(
      <LiveStatus
        aircraftCount={3}
        vesselCount={2}
        aircraftStatus={{ phase: 'live', paused: false }}
        marineStatus={{
          phase: 'error',
          paused: false,
          error: 'Disconnected',
        }}
        marineCapabilities={DIGITRAFFIC_MARINE_CAPABILITIES}
        now={1_800_000_000_000}
        online
      />,
    )

    expect(html).toContain('Marine stream unavailable')
    expect(html).not.toContain('Marine stream connected')
  })

  it('labels historical and offline display without live cursor announcements', () => {
    const html = renderToStaticMarkup(
      <LiveStatus
        aircraftCount={1}
        vesselCount={2}
        aircraftStatus={{ phase: 'live', paused: true }}
        marineStatus={{ phase: 'live', paused: true }}
        marineCapabilities={DIGITRAFFIC_MARINE_CAPABILITIES}
        now={1_800_000_000_000}
        online={false}
        historicalAt={1_700_000_000_000}
      />,
    )

    expect(html).toContain('<strong>HISTORY</strong>')
    expect(html).toContain('Browser offline; local playback remains available')
    expect(html).not.toContain('aria-live')
  })
})
