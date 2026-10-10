import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AirportBoardState } from '../domain/airportBoard'
import { AIRPORT_BOARD_TEST_NOW as now, airportBoardFixture } from '../providers/airportBoards/airportBoardFixtures'
import { AirportBoard, AirportBoardContent, AirportBoardRows } from './AirportBoard'

const render = (state: AirportBoardState, options: Partial<{
  airportIcao: string
  online: boolean
  historical: boolean
  retryAt: number
}> = {}) => renderToStaticMarkup(
  <AirportBoardContent
    airportIcao="EETN" state={state} now={now} online historical={false}
    visible retryAt={0} onRequest={() => undefined} {...options}
  />,
)

describe('airport board presentation', () => {
  it('starts with an explicit load and no provider request', () => {
    const lookup = vi.fn()
    const html = renderToStaticMarkup(
      <AirportBoard airportIcao="EETN" provider={{ lookup, retryAt: 0 }} now={now} online historical={false} />,
    )
    expect(html).toContain('Load board')
    expect(html).toContain('shared across the app')
    expect(lookup).not.toHaveBeenCalled()
  })

  it('discloses retrieval, unknown source age, local offsets, codeshares and separate provider attribution', () => {
    const html = render({ phase: 'ready', airportIcao: 'EETN', snapshot: airportBoardFixture() })
    expect(html).toContain('Arrivals (1)')
    expect(html).toContain('Departures (1)')
    expect(html).toContain('UTC+03:00')
    expect(html).toContain('Source update time is not supplied')
    expect(html).toContain('estimated or actual')
    expect(html).toContain('Codeshares may appear separately')
    expect(html).toContain('No link to live map aircraft')
    expect(html).toContain('rel="noopener"')
    expect(html).toContain('referrerPolicy="origin"')
    expect(html).not.toContain('noreferrer')
    expect(html).toContain('AeroDataBox')
    expect(html).not.toContain('X-RapidAPI')
  })

  it('does not convert unknown coverage to successful empty', () => {
    expect(renderToStaticMarkup(<AirportBoardRows flights={null} direction="arrivals" />)).toContain('No arrivals board is available')
    expect(renderToStaticMarkup(<AirportBoardRows flights={[]} direction="arrivals" />)).toContain('No arrivals were returned')
  })

  it('keeps a full long airport name behind a code-led native disclosure', () => {
    const row = airportBoardFixture().arrivals![0]!
    const name = 'A deliberately long fictional international airport name'
    const html = renderToStaticMarkup(<AirportBoardRows flights={[{
      ...row, otherAirport: { name, iata: 'HEL' },
    }]} direction="arrivals" />)
    expect(html).toContain('<summary>From <bdi>HEL</bdi></summary>')
    expect(html).toContain(`<p>From <bdi>${name}</bdi> (HEL)</p>`)
    expect(html).not.toContain(' open=""')
  })

  it('anchors a cached board window to the original request rather than the current viewer time', () => {
    const snapshot = airportBoardFixture(now - 4 * 60_000)
    const html = render({ phase: 'ready', airportIcao: 'EETN', snapshot })
    expect(html).toContain('2026-10-08 16:56</time> UTC')
    expect(html).toContain('relative to that request')
    expect(html).toContain('Retrieval time describes when this app fetched the board')
    expect(html).not.toContain('before loading')
    expect(html).not.toContain('2026-10-08 17:00</time> UTC')
  })

  it('keeps uncertain cancellation, approximate data and missing times explicit', () => {
    const row = airportBoardFixture().arrivals![0]!
    const html = renderToStaticMarkup(<AirportBoardRows flights={[{
      ...row, status: 'CanceledUncertain', codeshare: 'unknown', scheduled: undefined,
      revised: undefined, quality: ['schedule', 'approximate'],
    }]} direction="departures" />)
    expect(html).toContain('Possibly cancelled')
    expect(html).toContain('Not reported')
    expect(html).toContain('codeshare status unknown')
    expect(html).toContain('Schedule only')
    expect(html).toContain('includes approximate data')
    expect(html).toContain('To ')
  })

  it('hides current boards in HISTORY while retaining truthful static/provider context', () => {
    const html = render({ phase: 'ready', airportIcao: 'EETN', snapshot: airportBoardFixture() }, { historical: true })
    expect(html).toContain('Return to Live')
    expect(html).not.toContain('TS100')
    expect(html).toContain('AeroDataBox')
    expect(html).toContain('disabled=""')
  })

  it('explains offline, loading, error, expiry and unsupported-airport states', () => {
    expect(render({ phase: 'idle' }, { online: false })).toContain('Connect to load')
    expect(render({ phase: 'loading', airportIcao: 'EETN' })).toContain('Loading arrivals and departures')
    expect(render({ phase: 'error', airportIcao: 'EETN', message: 'Quota exhausted' }, { retryAt: now + 60_000 })).toContain('Next attempt after')
    expect(render({ phase: 'expired', airportIcao: 'EETN' })).toContain('board expired')
    expect(render({ phase: 'idle' }, { airportIcao: 'TLL' })).toContain('four-letter ICAO')
  })
})
