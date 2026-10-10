import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DIGITRAFFIC_MARINE_CAPABILITIES } from '../providers/marine/digitrafficCapabilities'
import { MULTI_SOURCE_MARINE_CAPABILITIES } from '../providers/marine/multiSourceCapabilities'
import { LiveStatus } from './LiveStatus'

describe('LiveStatus', () => {
  it('labels a paused context sample without claiming zero shown or wider live counts', () => {
    const html = renderToStaticMarkup(
      <LiveStatus
        aircraftCount={0}
        vesselCount={0}
        aircraftStatus={{ phase: 'live', paused: true }}
        marineStatus={{ phase: 'live', paused: true }}
        marineCapabilities={MULTI_SOURCE_MARINE_CAPABILITIES}
        now={1_800_000_000_000}
        online
        trafficContext
      />,
    )
    const summary = html.slice(0, html.indexOf('</summary>'))
    expect(summary).toContain('<strong>PAUSED</strong>')
    expect(summary).toContain('Last local sample')
    expect(summary).toContain('Live updates paused')
    expect(summary).not.toContain('0 ships shown')
    expect(summary).not.toContain('0 aircraft')
    expect(html).toContain('Aircraft paused')
    expect(html).toContain('Marine stream paused')
    expect(html).toContain('https://www.adsb.lol/')
    expect(html).toContain('https://www.digitraffic.fi/en/marine-traffic/')
  })

  it('describes an empty global-source view without promising complete coverage', () => {
    const html = renderToStaticMarkup(
      <LiveStatus
        aircraftCount={3}
        vesselCount={0}
        aircraftStatus={{ phase: 'live', paused: false }}
        marineStatus={{ phase: 'live', paused: false }}
        marineCapabilities={MULTI_SOURCE_MARINE_CAPABILITIES}
        now={1_800_000_000_000}
        online
      />,
    )

    expect(html).toContain('<strong>LIVE</strong>')
    expect(html).toContain('0 ships shown · global sources')
    expect(html).toContain('reception is not guaranteed')
    expect(html).toContain('Marine stream connected')
    expect(html).not.toContain('0 ships shown · regional source')
    for (const source of ['ADSB.lol', 'Digitraffic', 'AISStream', 'Open Waters AIS', 'AISHub', 'Kystverket', 'BarentsWatch']) {
      expect(html).toContain(source)
    }
    expect(html).toContain('https://aisstream.io/')
    expect(html).toContain('https://openwaters.io/ais/')
    expect(html).toContain('Wikimedia Commons')
    expect(html).toContain('Norwegian licence for Open Government data')
    expect(html).toContain('Data delivered by BarentsWatch')
  })

  it('reports partial operation when one marine source fails but others remain live', () => {
    const html = renderToStaticMarkup(
      <LiveStatus
        aircraftCount={3}
        vesselCount={12}
        aircraftStatus={{ phase: 'live', paused: false }}
        marineStatus={{
          phase: 'live',
          paused: false,
          error: 'AISStream: disconnected',
        }}
        marineCapabilities={MULTI_SOURCE_MARINE_CAPABILITIES}
        now={1_800_000_000_000}
        online
      />,
    )

    expect(html).toContain('<strong>PARTIAL</strong>')
    expect(html).toContain('12 ships shown · global sources')
    expect(html).toContain('Marine stream connected')
    expect(html).toContain('AISStream: disconnected')
    expect(html).not.toContain('Marine stream unavailable')
  })

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
    expect(html).not.toContain('https://aisstream.io/')
    expect(html).not.toContain('Open Waters network inputs')
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
      'Browser offline; live updates unavailable.',
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
