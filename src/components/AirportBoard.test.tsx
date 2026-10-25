import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AirportBoardState } from '../domain/airportBoard'
import { AIRPORT_BOARD_TEST_NOW as now, airportBoardFixture } from '../providers/airportBoards/airportBoardFixtures'
import { AirportBoard, AirportBoardContent, AirportBoardRows } from './AirportBoard'

const render = (state: AirportBoardState, options: Partial<{
  airportIcao: string
  online: boolean
  historical: boolean
  visible: boolean
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
    expect(html).toContain('Source update unknown.')
    expect(html).toContain('Retrieval is not the source update time.')
    expect(html).toContain('estimated/actual, gate/runway')
    expect(html).toContain('codeshares listed separately')
    expect(html).toContain('window -1h/+5h')
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

  it('offers a labelled, bounded, local-only filter only while a valid board is displayed', () => {
    const html = render({ phase: 'ready', airportIcao: 'EETN', snapshot: airportBoardFixture() })
    expect(html).toContain('for="airport-board-search"')
    expect(html).toContain('Search loaded flights')
    expect(html).toContain('type="search"')
    expect(html).toContain('maxLength="100"')
    expect(html).toContain('autoComplete="off"')
    expect(html).toContain('Clear airport board search')
    expect(html).toContain('Filter loaded flight numbers or airport names/codes.')
    expect(html).toContain('No extra requests.')
    expect(html).toContain('No match does not mean cancelled.')

    for (const state of [
      { phase: 'idle' },
      { phase: 'loading', airportIcao: 'EETN' },
      { phase: 'expired', airportIcao: 'EETN' },
      { phase: 'error', airportIcao: 'EETN', message: 'Quota exhausted' },
    ] satisfies AirportBoardState[]) {
      expect(render(state)).not.toContain('id="airport-board-search"')
    }
    for (const options of [{ historical: true }, { online: false }, { visible: false }]) {
      expect(render({ phase: 'ready', airportIcao: 'EETN', snapshot: airportBoardFixture() }, options))
        .not.toContain('id="airport-board-search"')
    }
    expect(render({
      phase: 'ready', airportIcao: 'EETN', snapshot: airportBoardFixture(now - 31 * 60_000),
    })).not.toContain('id="airport-board-search"')
  })

  it('reports matches without changing loaded totals, statuses or separate codeshares', () => {
    const row = airportBoardFixture().arrivals![0]!
    const records = [
      row, { ...row, number: 'OTHER200' },
      { ...row, codeshare: 'codeshare' as const, status: 'CanceledUncertain' as const },
    ]
    const html = renderToStaticMarkup(
      <AirportBoardRows flights={records} direction="arrivals" query=" ts 100 " />,
    )
    expect(html).toContain('2 of 3 loaded arrivals match.')
    expect(html).not.toContain('OTHER200')
    expect(html).toContain('Possibly cancelled')
    expect(html).toContain('operating flight')
    expect(html).toContain('codeshare')
    const content = render({
      phase: 'ready', airportIcao: 'EETN',
      snapshot: { ...airportBoardFixture(), arrivals: records },
    })
    expect(content).toContain('Arrivals (3)')
    expect(content).toContain('Departures (1)')
  })

  it('labels zero matches without claiming cancellation, absence or unknown coverage', () => {
    const row = airportBoardFixture().arrivals![0]!
    const html = renderToStaticMarkup(
      <AirportBoardRows flights={[row]} direction="departures" query="no-such-flight" />,
    )
    expect(html).toContain('role="status">No matching loaded flights.</p>')
    expect(html).not.toContain('<ul')
    expect(html).not.toContain('Cancelled')
    expect(html).not.toContain('No departures were returned')
    expect(html).not.toContain('No departures board is available')
    expect(renderToStaticMarkup(<AirportBoardRows flights={null} direction="arrivals" query="TS100" />))
      .toContain('No arrivals board is available')
    expect(renderToStaticMarkup(<AirportBoardRows flights={[]} direction="departures" query="TS100" />))
      .toContain('No departures were returned')
  })

  it('retains filtering controls with a valid held board during reload or failure', () => {
    for (const state of [
      { phase: 'loading', airportIcao: 'EETN', snapshot: airportBoardFixture() },
      { phase: 'error', airportIcao: 'EETN', snapshot: airportBoardFixture(), message: 'Reload failed' },
    ] satisfies AirportBoardState[]) {
      const html = render(state)
      expect(html).toContain('id="airport-board-search"')
      expect(html).toContain('TS100')
    }
    expect(render({
      phase: 'error', airportIcao: 'EETN', snapshot: airportBoardFixture(), message: 'Reload failed',
    })).toContain('Reload failed')
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
    expect(html).toContain('window -1h/+5h')
    expect(html).toContain('Retrieval is not the source update time.')
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
