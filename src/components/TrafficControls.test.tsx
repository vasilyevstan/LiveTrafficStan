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
      units="metric"
      marineStaleAfterMs={120_000}
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
      weatherVisible={false}
      weatherLoading={false}
      weatherWaiting={false}
      weatherReady={false}
      now={Date.UTC(2026, 2, 12, 12)}
      weatherObservations={[]}
      selectedWeatherId={null}
      weatherEmptyMessage="No current METAR observations are shown."
      weatherCanRefresh
      weatherRetryUsesAirports={false}
      onWeatherVisibleChange={() => undefined}
      onWeatherSelect={() => undefined}
      onRetryWeather={() => undefined}
      onRefreshWeather={() => undefined}
      clusteringEnabled={false}
      onClusteringEnabledChange={() => undefined}
      trailPreferences={{ visible: true, durationMinutes: 15 }}
      onTrailPreferencesChange={() => undefined}
      historySettings={{ version: 1, enabled: false, retentionHours: 1 }}
      historyStatus={{
        phase: 'disabled',
        recordCount: 0,
        logicalBytes: 0,
      }}
      historyRecordCount={0}
      playback={{ mode: 'live' }}
      onHistoryEnabledChange={() => undefined}
      onHistoryRetentionChange={() => undefined}
      onClearHistory={() => undefined}
      onRetryHistory={() => undefined}
      onEnterHistory={() => undefined}
      centerDisabled={false}
      onCenter={() => undefined}
      locationAvailable
      locationLoading={false}
      onUseLocation={() => undefined}
      themePreference="light"
      onThemePreferenceChange={() => undefined}
      onUnitsChange={() => undefined}
      shareDisabled={false}
      onShare={() => undefined}
      onResetPreferences={() => undefined}
      appUpdateAvailable={false}
      appUpdateActivating={false}
      onRefreshApp={() => undefined}
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
  it('separates operations and location/settings without duplicating controls', () => {
    const html = renderControls()
    const mapDetailsIndex = html.indexOf(
      '<details id="traffic-controls-map-tools"',
    )
    const settingsPanelIndex = html.indexOf(
      '<aside class="control-panel control-panel--settings"',
    )
    const settingsDetailsIndex = html.indexOf(
      '<details id="traffic-controls-settings"',
    )
    const navigationPrimary = html.slice(0, mapDetailsIndex)
    const navigationMore = html.slice(mapDetailsIndex, settingsPanelIndex)
    const settingsPrimary = html.slice(
      settingsPanelIndex,
      settingsDetailsIndex,
    )
    const settingsMore = html.slice(settingsDetailsIndex)

    expect(html).toContain('aria-label="Operations"')
    expect(html).toContain('aria-label="Location and settings"')
    expect(navigationPrimary).not.toContain('id="location-search-input"')
    expect(navigationPrimary).toContain('>CENTER<')
    expect(navigationPrimary).toContain('>AIRCRAFT<')
    expect(navigationPrimary).toContain('>SHIPS<')
    expect(navigationPrimary).not.toContain('>AUTO<')
    expect(navigationPrimary).not.toContain('href=')
    expect(navigationMore).toContain(
      '<summary id="traffic-controls-map-tools-summary">MORE</summary>',
    )
    expect(navigationMore).toContain('<legend>Layers</legend>')
    expect(navigationMore).toContain('Traffic legend')
    expect(navigationMore).toContain('Band 1 · below 1,000 m')
    expect(navigationMore).toContain(
      'Moving · reported speed at least 1 kn',
    )
    expect(navigationMore).toContain('Aircraft discovery')
    expect(navigationMore).toContain('Vessel discovery')
    expect(navigationMore).not.toContain(
      'aria-label="Location search details"',
    )
    expect(navigationMore).not.toContain('USE LOCATION')
    expect(navigationMore).not.toContain('<legend>History</legend>')
    expect(settingsPrimary).toContain('id="location-search-input"')
    expect(settingsPrimary).toContain('>AUTO<')
    expect(settingsPrimary).toContain('>LIGHT<')
    expect(settingsPrimary).toContain('>DARK<')
    expect(settingsPrimary).toContain('>TRAILS<')
    expect(settingsMore).toContain(
      '<summary id="traffic-controls-settings-summary">MORE</summary>',
    )
    expect(settingsMore).toContain('aria-label="Location search details"')
    expect(settingsMore).toContain('USE LOCATION')
    expect(settingsMore).toContain('<legend>History</legend>')
    expect(settingsMore).toContain('<legend>Preferences</legend>')
    expect(settingsMore).not.toContain('<legend>Layers</legend>')
    expect(html.match(/name="traffic-control-panels"/g)).toHaveLength(2)
    expect(html.match(/id="location-search-input"/g)).toHaveLength(1)
    expect(html.match(/>AIRCRAFT</g)).toHaveLength(1)
    expect(html.match(/>SHIPS</g)).toHaveLength(1)
    expect(html.match(/>TRAILS</g)).toHaveLength(1)
  })

  it('renders Auto, Light, and Dark as explicit theme preferences', () => {
    const html = renderControls({ themePreference: 'auto' })
    expect(html).toContain('>AUTO<')
    expect(html).toContain('>LIGHT<')
    expect(html).toContain('>DARK<')
    expect(html).toContain('aria-pressed="true">AUTO')
  })

  it('exposes remembered units, explicit sharing, reset, and copy fallback', () => {
    const html = renderControls({
      units: 'aviation-nautical',
      preferenceStatus: 'The share link could not be copied.',
      manualShareUrl: 'https://example.test/#v=1',
    })
    expect(html).toContain('AVIATION / NAUTICAL')
    expect(html).toContain('aria-pressed="true">AVIATION / NAUTICAL')
    expect(html).toContain('SHARE VIEW')
    expect(html).toContain('RESET PREFERENCES')
    expect(html).toContain('role="status"')
    expect(html).toContain('https://example.test/#v=1')
  })

  it('uses the shared traffic vocabulary and exact thresholds in the legend', () => {
    const html = renderControls({
      units: 'aviation-nautical',
      marineStaleAfterMs: 120_000,
    })

    expect(html).toContain('Band 1 · below 3,281 ft')
    expect(html).toContain('Band 4 · 32,808 ft or higher')
    expect(html).toContain(
      'Climbing · reported rate is at least 200 ft/min upward',
    )
    expect(html).toContain(
      'Small reported vertical rate · less than 200 ft/min either way',
    )
    expect(html).toContain(
      'Slow or stopped · reported speed below 1 kn',
    )
    expect(html).toContain('eligible from 8 m at 1 kn or faster')
    expect(html).toContain('no more than 120 seconds old')
    expect(html).toContain('AIR and SEA count circles')
  })

  it('exposes a non-blocking waiting application update', () => {
    const html = renderControls({
      appShellStatus: 'An application update is ready.',
      appUpdateAvailable: true,
    })
    expect(html).toContain('REFRESH APP')
    expect(html).toContain('An application update is ready.')
    expect(html).toContain('role="status"')
    expect(html.match(/REFRESH APP/g)).toHaveLength(1)
    expect(
      html.match(/An application update is ready\./g),
    ).toHaveLength(1)
  })

  it('promotes operational recovery without duplicating shared airport retry', () => {
    const html = renderControls({
      airportsVisible: true,
      airportsError: 'Airport data timed out',
      weatherVisible: true,
      weatherError: 'Airport station context unavailable',
      weatherRetryUsesAirports: true,
    })

    expect(html.match(/RETRY AIRPORTS/g)).toHaveLength(1)
    expect(html).not.toContain('RETRY METAR')
    expect(html).toContain('METAR unavailable')
    expect(html).toContain('Airport station context unavailable')
    expect(html).not.toContain('Airport data timed out')
  })

  it('promotes independent operations and settings recovery in their panels', () => {
    const html = renderControls({
      historyStatus: {
        phase: 'error',
        recordCount: 0,
        logicalBytes: 0,
        message: 'History database unavailable',
      },
      weatherVisible: true,
      weatherError: 'Weather request timed out',
    })

    expect(html.match(/RETRY HISTORY/g)).toHaveLength(1)
    expect(html.match(/RETRY METAR/g)).toHaveLength(1)
  })

  it('keeps clustering as a provider-neutral optional layer preference', () => {
    const html = renderControls({ clusteringEnabled: true })
    expect(html).toContain('aria-pressed="true">CLUSTERS')
  })

  it('keeps selected-object trail visibility and duration explicit', () => {
    const html = renderControls({
      trailPreferences: { visible: false, durationMinutes: 30 },
    })

    expect(html).toContain('<legend>Trail</legend>')
    expect(html).toContain('aria-pressed="false">TRAILS')
    expect(html).not.toContain('>SHOW<')
    expect(html).not.toContain('>HIDE<')
    expect(html).toContain('<option value="30" selected="">30 MIN</option>')
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

  it('keeps METAR loading, failure, pacing, and provenance local', () => {
    const loading = renderControls({
      weatherVisible: true,
      weatherLoading: true,
    })
    expect(loading).toContain('METAR...')
    expect(loading).toContain('aria-busy="true"')

    const waiting = renderControls({
      weatherVisible: true,
      weatherWaiting: true,
      weatherStatusMessage: 'The next request is available at 12:01 UTC.',
    })
    expect(waiting).toContain('The next request is available')

    const failed = renderControls({
      weatherVisible: true,
      weatherError: 'Weather request timed out',
    })
    expect(failed).toContain('METAR unavailable')
    expect(failed).toContain('RETRY METAR')
    expect(failed).toContain('NOAA/NWS Aviation Weather Center')
    expect(failed).toContain('not an official forecast')
    expect(failed).toContain('airport board')
    expect(failed).toContain('visible qualifying ICAO station IDs')

    const disabled = renderControls({
      weatherVisible: false,
      weatherLoading: true,
      weatherError: 'Weather request timed out',
    })
    expect(disabled).toContain('>METAR<')
    expect(disabled).not.toContain('METAR...')
    expect(disabled).not.toContain('METAR unavailable')
  })
})
