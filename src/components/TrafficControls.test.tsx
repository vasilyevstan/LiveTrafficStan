import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_VESSEL_FILTERS } from '../domain/vesselFilters'
import { EMPTY_ORBITAL_PREDICTION } from '../domain/orbital'
import {
  DEFAULT_ORBITAL_DISCOVERY_FILTERS,
  type OrbitalDisplaySelection,
  type OrbitalPopulationCounts,
} from '../domain/orbitalDiscovery'
import { TrafficControls } from './TrafficControls'

const emptyOrbitalDisplay: OrbitalDisplaySelection = {
  available: true,
  tier: 'world',
  limit: 192,
  shownIds: [],
  shownPositions: [],
  matchingShownIds: [],
  matchingShownPositions: [],
  matchingPositions: [],
  zoomHiddenCount: 0,
  selectedException: false,
  selectedFiltered: false,
  selectedZoomHidden: false,
}

const emptyOrbitalCounts: OrbitalPopulationCounts = {
  catalogCount: 0,
  acceptedCount: 0,
  modeledNowCount: 0,
  catalogMatchCount: 0,
  modeledMatchCount: 0,
  inFootprintCount: 0,
  shownInFootprintCount: 0,
  futureCrossingCount: 0,
}

const renderControls = (
  overrides: Partial<Parameters<typeof TrafficControls>[0]> = {},
) =>
  renderToStaticMarkup(
    <TrafficControls
      inView={<p>Current in-view results</p>}
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
      orbitalVisible={false}
      orbitalState={{
        phase: 'disabled',
        acceptedCount: 0,
        positions: [],
        prediction: EMPTY_ORBITAL_PREDICTION,
      }}
      selectedOrbitalId={null}
      orbitalFilters={DEFAULT_ORBITAL_DISCOVERY_FILTERS}
      orbitalDisplay={emptyOrbitalDisplay}
      orbitalCounts={emptyOrbitalCounts}
      orbitalPredictionHorizonMs={90 * 60_000}
      orbitalMaximumQueryLength={64}
      orbitalPageSize={20}
      onOrbitalVisibleChange={() => undefined}
      onOrbitalFiltersChange={() => undefined}
      onOrbitalSelect={() => undefined}
      onRetryOrbital={() => undefined}
      starlinkState={{
        phase: 'disabled',
        acceptedCount: 0,
        positions: [],
        prediction: EMPTY_ORBITAL_PREDICTION,
      }}
      starlinkCounts={emptyOrbitalCounts}
      onRetryStarlink={() => undefined}
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
      projectionPreference="auto"
      onProjectionPreferenceChange={() => undefined}
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
  it('keeps automatic globe and flat choices in Settings with explicit pressed state', () => {
    const automatic = renderControls()
    const projectionGroup = automatic.match(
      /aria-label="Map projection"[^>]*>([\s\S]*?)<\/div>/,
    )?.[1]
    expect(projectionGroup).toMatch(
      /aria-pressed="true"[^>]*>AUTO GLOBE<\/button>/,
    )
    expect(projectionGroup).toMatch(
      /aria-pressed="false"[^>]*>FLAT<\/button>/,
    )
    expect(
      renderControls({ projectionPreference: 'flat' }),
    ).toMatch(/aria-pressed="true"[^>]*>FLAT<\/button>/)
    expect(automatic.indexOf('aria-label="Map projection"')).toBeGreaterThan(
      automatic.indexOf('<details id="traffic-controls-settings"'),
    )
    expect(automatic).toContain('Auto globe changes smoothly with map zoom.')
  })

  it('keeps Center in the primary dock and search in Settings without growing the header', () => {
    const html = renderControls()
    const headerEnd = html.indexOf('</header>')
    const masthead = html.slice(0, headerEnd)
    const mapDetailsIndex = html.indexOf(
      '<details id="traffic-controls-map-tools"',
    )
    const settingsPanelIndex = html.indexOf(
      '<aside class="control-panel control-panel--settings"',
    )
    const settingsDetailsIndex = html.indexOf(
      '<details id="traffic-controls-settings"',
    )
    const navigationPrimary = html.slice(headerEnd, mapDetailsIndex)
    const navigationMore = html.slice(mapDetailsIndex, settingsPanelIndex)
    const settingsPrimary = html.slice(
      settingsPanelIndex,
      settingsDetailsIndex,
    )
    const settingsMore = html.slice(settingsDetailsIndex)

    expect(html).toContain('aria-label="Operations"')
    expect(html).toContain('aria-label="Location and settings"')
    expect(masthead).toContain('class="brand-panel"')
    expect(masthead).not.toContain('aria-label="Map navigation"')
    expect(masthead).not.toContain('id="location-search-input"')
    expect(masthead).not.toContain('>CENTER<')
    expect(masthead).not.toContain('>AIRCRAFT<')
    expect(html).toContain('class="workspace-dock"')
    expect(navigationPrimary).not.toContain('id="location-search-input"')
    expect(navigationPrimary).toContain('id="center-map-button"')
    expect(navigationPrimary).toContain('>CENTER<')
    expect(navigationPrimary).toContain('>AIRCRAFT<')
    expect(navigationPrimary).toContain('>SHIPS<')
    expect(navigationPrimary).toContain('>ORBITS<')
    expect(navigationPrimary).not.toContain('control-options--three')
    expect(navigationPrimary).not.toContain('>AUTO<')
    expect(navigationPrimary).not.toContain('href=')
    expect(navigationMore).toContain('id="traffic-controls-map-tools-summary"')
    expect(navigationMore).toContain('<span>More</span></summary>')
    expect(navigationMore).toContain('class="workspace-panel-title">Explore map')
    expect(navigationMore).toContain('<legend>Layers</legend>')
    expect(navigationMore).toContain('>ORBITS</button>')
    expect(navigationMore).not.toContain('Traffic legend')
    expect(navigationMore).not.toContain('Band 1 · below 1,000 m')
    expect(navigationMore).toContain(
      'role="region" aria-label="Map tools" tabindex="0"',
    )
    expect(navigationMore).toContain('Aircraft discovery')
    expect(navigationMore).toContain('Vessel discovery')
    expect(navigationMore).not.toContain(
      'aria-label="Location search details"',
    )
    expect(navigationMore).not.toContain('USE LOCATION')
    expect(navigationMore).not.toContain('<legend>History</legend>')
    expect(settingsPrimary).not.toContain('id="location-search-input"')
    expect(settingsPrimary).not.toContain('>AUTO<')
    expect(settingsMore).toContain('<legend>Appearance</legend>')
    expect(settingsMore).toContain('>AUTO<')
    expect(settingsMore).toContain('>LIGHT<')
    expect(settingsMore).toContain('>DARK<')
    expect(settingsMore).toContain('>TRAILS<')
    expect(settingsMore).toContain('id="traffic-controls-settings-summary"')
    expect(settingsMore).toContain('<span>Settings</span></summary>')
    expect(settingsMore).toContain('class="workspace-panel-title">View &amp; settings')
    expect(settingsMore).toContain('aria-label="Map navigation"')
    expect(settingsMore).toContain('id="location-search-input"')
    expect(settingsMore).not.toContain('>CENTER<')
    expect(settingsMore).toContain('aria-label="Location search details"')
    expect(settingsMore.indexOf('id="location-search-input"'))
      .toBeLessThan(settingsMore.indexOf('<legend>Appearance</legend>'))
    expect(settingsMore).toContain('USE LOCATION')
    expect(settingsMore).toContain('<legend>History</legend>')
    expect(settingsMore).toContain('<legend>Preferences</legend>')
    expect(settingsMore).toContain(
      'role="region" aria-label="Location and settings" tabindex="0"',
    )
    expect(settingsMore).not.toContain('<legend>Layers</legend>')
    expect(html.match(/name="traffic-control-panels"/g)).toHaveLength(3)
    expect(html.match(/id="location-search-input"/g)).toHaveLength(1)
    expect(html.match(/>CENTER</g)).toHaveLength(1)
    expect(html.match(/>AIRCRAFT</g)).toHaveLength(1)
    expect(html.match(/>SHIPS</g)).toHaveLength(1)
    expect(html.match(/>TRAILS</g)).toHaveLength(1)
    expect(html.match(/>ORBITS</g)).toHaveLength(2)
    expect(html.match(/class="operation-icon"/g)).toHaveLength(9)
    expect(html.match(/aria-label="Theme and trails"/g)).toHaveLength(1)
    expect(html.match(/>LIGHT</g)).toHaveLength(1)
  })

  it('adds a collapsed peer after Settings and a mobile entry to the same In view surface', () => {
    const html = renderControls()
    expect(html.indexOf('id="in-view-summary"')).toBeGreaterThan(
      html.indexOf('id="traffic-controls-settings-summary"'),
    )
    expect(html).toContain(
      'class="control-panel__more control-panel__in-view" name="traffic-control-panels"',
    )
    expect(html).not.toMatch(/<details[^>]*open=/)
    expect(html).toContain('id="in-view-settings-entry"')
    expect(html).toContain('Aircraft, ships &amp; orbits in view')
    expect(html).toContain('aria-label="Aircraft, ships and orbits in view"')
    expect(html.match(/id="traffic-controls-in-view"/g)).toHaveLength(1)
    expect(html).toContain('aria-label="Close In view"')
    expect(html).toContain('Current in-view results')
    expect(html).toContain('class="control-options control-options--one in-view__more"')
    expect(html).toContain('More: orbital discovery &amp; passes')
    expect(html).not.toContain('STARLINK ON')
    expect(html).not.toContain('STARLINK OFF')
  })

  it('keeps the primary Center action outside disclosures and preserves its disabled state', () => {
    const html = renderControls({ centerDisabled: true })
    const button = html.match(/<button id="center-map-button"[\s\S]*?<\/button>/)?.[0]

    expect(button).toContain('disabled=""')
    expect(button).toContain('title="Center on session Home"')
    expect(button).toContain('>CENTER<')
    expect(html.indexOf('id="center-map-button"')).toBeLessThan(
      html.indexOf('<details'),
    )
    expect(html.match(/id="center-map-button"/g)).toHaveLength(1)
  })

  it('composes status into the floating header without duplicating settings state', () => {
    const html = renderControls({
      masthead: <section aria-label="Traffic provider status">PARTIAL</section>,
    })
    const header = html.slice(0, html.indexOf('</header>'))
    expect(header).toContain('aria-label="Traffic provider status">PARTIAL')
    expect(header).not.toContain('role="search"')
    expect(header).not.toContain('id="traffic-controls-settings"')
    expect(html).toContain(
      'id="traffic-controls-settings" name="traffic-control-panels"',
    )
    expect(html.slice(html.indexOf('id="traffic-controls-settings"')))
      .toContain('role="search"')
  })

  it('separates map tools into compact session-only views', () => {
    const html = renderControls()

    expect(html).toContain(
      'role="group" aria-label="Map tools view"',
    )
    for (const task of [
      'layers',
      'find',
      'context',
      'orbits',
      'sources',
    ]) {
      expect(html).toContain(`id="map-tools-task-${task}"`)
      expect(html).toContain(`id="map-tools-panel-${task}"`)
    }
    expect(html).toContain(
      'id="map-tools-task-layers" type="button" class="is-active" aria-pressed="true"',
    )
    expect(html).toContain(
      'id="map-tools-panel-find" class="control-panel__task" aria-labelledby="map-tools-task-find" hidden=""',
    )
    expect(html).toContain('Enable AIRPORTS or METAR in Layers.')
    expect(html).toContain('Natural Earth')
    expect(html).toContain('SGP4 modeled')
  })

  it('names the configured traffic and photo providers in Sources', () => {
    const html = renderControls({
      marineProviderName: 'Digitraffic, AISStream and Open Waters AIS',
    })
    const sources = html.slice(html.indexOf('id="map-tools-panel-sources"'), html.indexOf('id="traffic-controls-settings"'))
    expect(sources).toContain('ADSB.lol')
    expect(sources).toContain('Marine: Digitraffic, AISStream and Open Waters AIS')
    expect(sources).toContain('Planespotters')
    expect(sources).toContain('Wikimedia Commons')
    expect(sources).toContain('Full data credits')
  })

  it('shows modeled orbital status and selection only after explicit enable', () => {
    const html = renderControls({
      orbitalVisible: true,
      orbitalState: {
        phase: 'ready',
        acceptedCount: 1,
        positions: [],
        prediction: {
          mode: 'local',
          totalResults: 1,
          inViewCount: 1,
          futureCrossingCount: 0,
          trackSegments: [],
          results: [
            {
              id: 'orbital:694',
              noradCatalogId: '694',
              name: 'ATLAS CENTAUR 2',
              objectType: 'PAY',
              currentlyInView: true,
              firstCrossingAt: Date.UTC(2026, 2, 12, 12),
            },
          ],
        },
        snapshot: {
          schemaVersion: 2,
          sourceContractVersion: 2,
          catalogId: 'celestrak-curated-v1',
          sources: [],
          retrievedAt: '2026-03-12T12:00:00.000Z',
          publishedAt: '2026-03-12T12:00:00.000Z',
          recordCount: 1,
          records: [],
          sha256: 'a'.repeat(64),
        },
      },
      orbitalDisplay: {
        ...emptyOrbitalDisplay,
        shownIds: ['orbital:694'],
        matchingShownIds: ['orbital:694'],
      },
      orbitalCounts: {
        ...emptyOrbitalCounts,
        catalogCount: 1,
        acceptedCount: 1,
        modeledNowCount: 1,
        catalogMatchCount: 1,
        modeledMatchCount: 1,
        inFootprintCount: 1,
        shownInFootprintCount: 1,
        futureCrossingCount: 0,
      },
      orbitalPrimarySummary:
        'ORBITS · 1 SHOWN · 0 PASSES ≤90M',
    })

    expect(html).toContain(
      'id="orbital-layer-toggle" type="button" class="is-active" aria-pressed="true" aria-busy="false"',
    )
    expect(html).toContain(
      'ORBITS · 1 SHOWN · 0 PASSES ≤90M',
    )
    expect(html).toContain(
      'aria-label="View modeled orbital objects" aria-controls="traffic-controls-map-tools">VIEW',
    )
    expect(html).toContain('Modeled orbital objects')
    expect(html).toContain('ATLAS CENTAUR 2')
    expect(html).toContain('not live or optical visibility')
    expect(html).toContain('CelesTrak')
  })

  it('surfaces a future orbital pass while the detailed controls are closed', () => {
    const html = renderControls({
      orbitalVisible: true,
      orbitalState: {
        phase: 'stale',
        acceptedCount: 1,
        positions: [],
        prediction: {
          mode: 'local',
          totalResults: 1,
          inViewCount: 0,
          futureCrossingCount: 1,
          trackSegments: [],
          results: [
            {
              id: 'orbital:48865',
              noradCatalogId: '48865',
              name: 'COSMOS 2550',
              objectType: 'PAY',
              currentlyInView: false,
              firstCrossingAt: Date.UTC(2026, 2, 12, 12, 30),
            },
          ],
        },
        snapshot: {
          schemaVersion: 2,
          sourceContractVersion: 2,
          catalogId: 'celestrak-curated-v1',
          sources: [],
          retrievedAt: '2026-03-12T12:00:00.000Z',
          publishedAt: '2026-03-12T12:00:00.000Z',
          recordCount: 1,
          records: [],
          sha256: 'a'.repeat(64),
        },
      },
      orbitalCounts: {
        ...emptyOrbitalCounts,
        catalogCount: 1,
        acceptedCount: 1,
        modeledNowCount: 1,
        catalogMatchCount: 1,
        modeledMatchCount: 1,
        inFootprintCount: 0,
        shownInFootprintCount: 0,
        futureCrossingCount: 1,
      },
      orbitalPrimarySummary:
        'ORBITS · 0 SHOWN · 1 PASS ≤90M',
    })
    const mapDetailsIndex = html.indexOf(
      '<details id="traffic-controls-map-tools"',
    )
    const navigationPrimary = html.slice(0, mapDetailsIndex)

    expect(navigationPrimary).toContain(
      'ORBITS · 0 SHOWN · 1 PASS ≤90M',
    )
    expect(navigationPrimary).toContain('>VIEW</button>')
    expect(html).toContain('COSMOS 2550')
  })

  it('explains HISTORY suppression without rendering current orbital context', () => {
    const html = renderControls({
      orbitalVisible: true,
      orbitalState: {
        phase: 'paused-history',
        acceptedCount: 0,
        positions: [],
        prediction: EMPTY_ORBITAL_PREDICTION,
        snapshot: {
          schemaVersion: 2,
          sourceContractVersion: 2,
          catalogId: 'celestrak-curated-v1',
          sources: [],
          retrievedAt: '2026-03-12T12:00:00.000Z',
          publishedAt: '2026-03-12T12:00:00.000Z',
          recordCount: 0,
          records: [],
          sha256: 'a'.repeat(64),
        },
        message:
          'Modeled orbital objects are hidden during historical playback.',
      },
      playback: {
        mode: 'history-paused',
        cursor: 1,
        range: { oldest: 0, newest: 1 },
        speed: 1,
      },
      orbitalPrimarySummary: 'ORBITS · HIDDEN IN HISTORY',
    })

    expect(html).toContain(
      'Modeled orbital objects are hidden during historical playback.',
    )
    expect(html).toContain('ORBITS · HIDDEN IN HISTORY')
    expect(html).not.toContain('class="control-group vessel-discovery orbital-context"')
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

  it('does not duplicate marker meaning in an expanded traffic legend', () => {
    const html = renderControls()

    expect(html).not.toContain('Traffic legend')
    expect(html).not.toContain('Aircraft altitude colors')
    expect(html).not.toContain('Modeled orbital objects</h3>')
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
    expect(failed).toContain('generalized')
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
    expect(failed).toContain('not operational')
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
    expect(failed).toContain('NOAA/NWS AWC')
    expect(failed).toContain('not forecasts or boards')
    expect(failed).toContain('visible ICAO IDs via this app')
    expect(failed).toContain('source/retrieval times')

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
