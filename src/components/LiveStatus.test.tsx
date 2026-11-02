import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DIGITRAFFIC_MARINE_CAPABILITIES } from '../providers/marine/digitrafficCapabilities'
import { MULTI_SOURCE_MARINE_CAPABILITIES } from '../providers/marine/multiSourceCapabilities'
import { LiveStatus } from './LiveStatus'

describe('LiveStatus', () => {
  it('keeps the view pause visible and supplies an explicit phone disclosure dismissal', () => {
    const html = renderToStaticMarkup(<LiveStatus compact viewportPaused trafficContext
      aircraftCount={0} vesselCount={0} aircraftStatus={{ phase: 'live', paused: true }}
      marineStatus={{ phase: 'error', paused: true, error: 'Retained provider error' }}
      marineCapabilities={DIGITRAFFIC_MARINE_CAPABILITIES} online now={1_800_000_000_000} />)
    const summary = html.slice(0, html.indexOf('</summary>'))
    expect(summary).toContain('VIEW PAUSED')
    expect(summary).toContain('Last local sample')
    expect(summary).not.toContain('Live updates paused')
    expect(html).not.toContain('aria-live')
    expect(html).toContain('aria-label="Close provider details"')
    expect(html).toContain('Retained provider error')
  })

  it.each([
    [false, undefined, 'OFFLINE'],
    [true, 1_800_000_000_000, 'HISTORY'],
  ] as const)('does not hide offline/history behind a view pause', (online, historicalAt, mode) => {
    const html = renderToStaticMarkup(<LiveStatus compact viewportPaused online={online} historicalAt={historicalAt}
      aircraftCount={0} vesselCount={0} aircraftStatus={{ phase: 'live', paused: true }}
      marineStatus={{ phase: 'live', paused: true }}
      marineCapabilities={DIGITRAFFIC_MARINE_CAPABILITIES} now={1_800_000_000_000} />)
    expect(html).toContain(`<strong>${mode}</strong>`)
    expect(html).not.toContain('VIEW PAUSED')
  })

  it('scopes retained-area reports without claiming spacecraft-visible counts or paused updates', () => {
    const html = renderToStaticMarkup(
      <LiveStatus compact scopeLabel="Previous local area"
        aircraftCount={12} vesselCount={3}
        aircraftStatus={{ phase: 'live', paused: false }}
        marineStatus={{ phase: 'error', paused: false, error: 'Marine unavailable' }}
        marineCapabilities={DIGITRAFFIC_MARINE_CAPABILITIES}
        now={1_800_000_000_000} online />,
    )
    const summary = html.slice(0, html.indexOf('</summary>'))
    expect(summary).toContain('>Previous local area</span>')
    expect(summary).toContain('<strong>PARTIAL</strong>')
    expect(summary).not.toContain('Last local sample')
    expect(summary).not.toContain('Live updates paused')
    expect(html).toContain('Previous local area: 12 aircraft · 3 ships shown in enabled layers.')
    expect(html).toContain('Marine stream unavailable')
    expect(html).toContain('Aircraft current')
  })

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

  it('reports partial operation when aircraft remain live and marine is view-paused', () => {
    const html = renderToStaticMarkup(
      <LiveStatus
        compact
        aircraftCount={18}
        vesselCount={0}
        aircraftStatus={{ phase: 'live', paused: false }}
        marineStatus={{ phase: 'live', paused: true }}
        marineCapabilities={DIGITRAFFIC_MARINE_CAPABILITIES}
        now={1_800_000_000_000}
        online
      />,
    )
    expect(html).toContain('<strong>PARTIAL</strong>')
    expect(html).toContain('Aircraft current')
    expect(html).toContain('Marine stream paused')
    expect(html).not.toContain('VIEW PAUSED')
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
    expect(html).not.toContain('Each image carries its own artist and licence.')
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

  it('does not call an online two-source failure browser offline', () => {
    const html = renderToStaticMarkup(<LiveStatus
      aircraftCount={0} vesselCount={0}
      aircraftStatus={{ phase: 'error', paused: false, error: 'Aircraft source failed.' }}
      marineStatus={{ phase: 'error', paused: false, error: 'Marine source failed.' }}
      marineCapabilities={MULTI_SOURCE_MARINE_CAPABILITIES}
      now={1_800_000_000_000} online />)
    expect(html).toContain('<strong>UNAVAILABLE</strong>')
    expect(html).toContain('live-status--unavailable')
    expect(html).not.toContain('<strong>OFFLINE</strong>')
    expect(html).toContain('Aircraft source failed.')
    expect(html).toContain('Marine source failed.')
    expect(html).toContain('ODbL 1.0')
    expect(html).toContain('CC 4.0 BY')
    expect(html).toContain('Norwegian licence for Open Government data')
  })

  it('keeps traffic health without repeating the separate primary orbital summary', () => {
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
      />,
    )

    expect(html).toContain('<strong>PARTIAL</strong>')
    expect(html).toContain('0 aircraft')
    expect(html).toContain('36 ships shown · regional source')
    expect(html).toContain('Aircraft unavailable')
    expect(html).toContain('Marine stream connected')
    expect(html).not.toContain('live-status__orbital')
  })
})
