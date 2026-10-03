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
    expect(html).toContain(
      '<span class="live-status__error">Disconnected</span>',
    )
    expect(html).toContain(
      '<details class="live-status__disclosure"><summary>',
    )
    expect(html).toContain('Provider details')
    expect(html).not.toContain(' hidden=')
  })

  it('keeps counts and update age outside the collapsed provider body', () => {
    const html = renderToStaticMarkup(
      <LiveStatus
        aircraftCount={0}
        vesselCount={0}
        aircraftStatus={{
          phase: 'live',
          paused: false,
          lastDataAt: 1_800_000_000_000,
        }}
        marineStatus={{ phase: 'live', paused: false }}
        marineCapabilities={DIGITRAFFIC_MARINE_CAPABILITIES}
        now={1_800_000_005_000}
        online
      />,
    )
    const summary = html.slice(0, html.indexOf('</summary>'))
    expect(summary).toContain('<strong>LIVE</strong>')
    expect(summary).toContain('0 aircraft')
    expect(summary).toContain('0 ships shown · regional source')
    expect(summary).toContain('updated 5 sec ago')
    expect(html).toContain('Marine stream connected')
    expect(html).toContain('Digitraffic regional source; exact coverage unknown')
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

  it('states that live traffic is unavailable while offline', () => {
    const html = renderToStaticMarkup(
      <LiveStatus
        aircraftCount={0}
        vesselCount={0}
        aircraftStatus={{ phase: 'live', paused: true }}
        marineStatus={{ phase: 'live', paused: true }}
        marineCapabilities={DIGITRAFFIC_MARINE_CAPABILITIES}
        now={1_800_000_000_000}
        online={false}
      />,
    )

    expect(html).toContain('<strong>OFFLINE</strong>')
    expect(html).toContain(
      'Live traffic is unavailable while the browser is offline',
    )
  })

  it('adds modeled orbital context without changing traffic health', () => {
    const html = renderToStaticMarkup(
      <LiveStatus
        aircraftCount={0}
        vesselCount={36}
        aircraftStatus={{
          phase: 'error',
          paused: false,
          error: 'Unavailable',
        }}
        marineStatus={{ phase: 'live', paused: false }}
        marineCapabilities={DIGITRAFFIC_MARINE_CAPABILITIES}
        now={1_800_000_000_000}
        online
        orbitalSummary="ORBITS · 0 IN VIEW · 1 PASS ≤90M"
      />,
    )

    expect(html).toContain('<strong>PARTIAL</strong>')
    expect(html).toContain('0 aircraft')
    expect(html).toContain('36 ships shown · regional source')
    expect(html).toContain('Aircraft unavailable')
    expect(html).toContain('Marine stream connected')
    expect(html).toContain(
      'class="live-status__orbital" aria-hidden="true">ORBITS · 0 IN VIEW · 1 PASS ≤90M',
    )
  })
})
