import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_VESSEL_FILTERS } from '../domain/vesselFilters'
import { TrafficControls } from './TrafficControls'

const renderControls = (
  overrides: Partial<Parameters<typeof TrafficControls>[0]> = {},
) =>
  renderToStaticMarkup(
    <TrafficControls
      aircraftQuery=""
      aircraftResults={[]}
      totalAircraft={0}
      aircraftEmptyMessage="No current aircraft are shown in this view."
      onAircraftQueryChange={() => undefined}
      onAircraftSelect={() => undefined}
      vesselFilters={DEFAULT_VESSEL_FILTERS}
      vesselResults={[]}
      totalVessels={0}
      vesselEmptyMessage="No current ships are shown in this view."
      onVesselFiltersChange={() => undefined}
      onVesselSelect={() => undefined}
      aircraftVisible
      onAircraftVisibleChange={() => undefined}
      vesselsVisible
      onVesselsVisibleChange={() => undefined}
      portsVisible={false}
      portsLoading={false}
      onPortsVisibleChange={() => undefined}
      onRetryPorts={() => undefined}
      airportsVisible={false}
      airportsLoading={false}
      airportsReady={false}
      airportsInView={[]}
      selectedAirportId={null}
      airportsEmptyMessage="No large or medium airports are shown in this view."
      onAirportsVisibleChange={() => undefined}
      onAirportSelect={() => undefined}
      onRetryAirports={() => undefined}
      centerDisabled={false}
      onCenter={() => undefined}
      locationAvailable
      locationLoading={false}
      onUseLocation={() => undefined}
      themePreference="light"
      onThemePreferenceChange={() => undefined}
      locationNavigationDisabled={false}
      activeLocationLabel="Home: Tallinn, Estonia"
      coordinatePrecision={3}
      maximumLocationQueryLength={100}
      placeSearchState={{ phase: 'idle' }}
      onPlaceSearch={() => undefined}
      onLocationNavigate={() => undefined}
      onPlaceResultSelect={() => undefined}
      onPlaceSearchCancel={() => undefined}
      {...overrides}
    />,
  )

describe('TrafficControls', () => {
  it('renders Auto, Light, and Dark as explicit theme preferences', () => {
    const html = renderControls({ themePreference: 'auto' })
    expect(html).toContain('>AUTO<')
    expect(html).toContain('>LIGHT<')
    expect(html).toContain('>DARK<')
    expect(html).toContain('aria-pressed="true">AUTO')
  })

  it('keeps optional port loading, failure, retry, and source limits local', () => {
    const loading = renderControls({
      portsVisible: true,
      portsLoading: true,
    })
    expect(loading).toContain('PORTS...')
    expect(loading).toContain('aria-busy="true"')

    const failed = renderControls({
      portsVisible: true,
      portsError: 'Port data timed out after 5000 ms',
    })
    expect(failed).toContain('Ports unavailable')
    expect(failed).toContain('RETRY PORTS')
    expect(failed).toContain('Natural Earth')
    expect(failed).toContain('public domain')
    expect(failed).toContain('generalized and incomplete')
    expect(failed).not.toContain('Map unavailable')

    const disabled = renderControls({
      portsVisible: false,
      portsLoading: true,
      portsError: 'Port data timed out after 5000 ms',
    })
    expect(disabled).toContain('>PORTS<')
    expect(disabled).not.toContain('PORTS...')
    expect(disabled).not.toContain('Ports unavailable')
  })

  it('keeps optional airport loading, failure, retry, and source limits local', () => {
    const loading = renderControls({
      airportsVisible: true,
      airportsLoading: true,
    })
    expect(loading).toContain('AIRPORTS...')
    expect(loading).toContain('aria-busy="true"')

    const failed = renderControls({
      airportsVisible: true,
      airportsError: 'Airport data timed out after 5000 ms',
    })
    expect(failed).toContain('Airports unavailable')
    expect(failed).toContain('RETRY AIRPORTS')
    expect(failed).toContain('OurAirports')
    expect(failed).toContain('public domain')
    expect(failed).toContain('not operational data')
    expect(failed).not.toContain('Map unavailable')

    const ready = renderControls({
      airportsVisible: true,
      airportsReady: true,
      airportsInView: [
        {
          id: '2301',
          name: 'Lennart Meri Tallinn Airport',
          kind: 'large',
          ident: 'EETN',
          icaoCode: 'EETN',
          iataCode: 'TLL',
          municipality: 'Tallinn',
          isoCountry: 'EE',
          longitude: 24.83264,
          latitude: 59.413246,
        },
      ],
    })
    expect(ready).toContain('Airports in this view')
    expect(ready).toContain('Lennart Meri Tallinn Airport')

    const disabled = renderControls({
      airportsVisible: false,
      airportsLoading: true,
      airportsError: 'Airport data timed out after 5000 ms',
    })
    expect(disabled).toContain('>AIRPORTS<')
    expect(disabled).not.toContain('AIRPORTS...')
    expect(disabled).not.toContain('Airports unavailable')
  })
})
