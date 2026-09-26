import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AircraftMetadataViewState } from '../domain/aircraftMetadata'
import type {
  DisplayAircraft,
  DisplayVessel,
} from '../domain/traffic'
import { TrafficDetails } from './TrafficDetails'

const aircraft: DisplayAircraft = {
  id: 'aircraft:511123',
  kind: 'aircraft',
  provider: 'ADSB.lol',
  hex: '511123',
  registration: 'ES-ABC',
  aircraftType: 'A320',
  callsign: 'TST123',
  position: {
    latitude: 59.4,
    longitude: 24.7,
    observedAt: 1_800_000_000_000,
  },
  receivedAt: 1_800_000_000_000,
  markerIcon: 'aircraft',
  markerScale: 1,
  freshness: 'live',
}

const availableMetadata: AircraftMetadataViewState = {
  phase: 'available',
  identityKey: '511123|ES-ABC|A320',
  metadata: {
    databaseRegistration: 'ES-ABC',
    typeCode: 'A320',
    modelDescription: 'AIRBUS A-320',
    configuration: 'L2J',
    wakeCategory: 'M',
    confidence: 'registration-verified',
    source: {
      name: 'Mictronics aircraft-database',
      repositoryUrl:
        'https://github.com/Mictronics/aircraft-database',
      publishedAt: '2026-09-13T07:35:29Z',
      outputVersion: '2026-09-13-v1',
      licenseName: 'ODC Attribution License 1.0',
      licenseUrl: 'https://opendatacommons.org/licenses/by/1-0/',
    },
    staleAfterDays: 45,
    futureToleranceHours: 24,
  },
}

describe('TrafficDetails aircraft metadata', () => {
  it('shows factual model context, confidence, publication age, and attribution separately from live data', () => {
    const html = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={availableMetadata}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )

    expect(html).toContain('AIRBUS A-320')
    expect(html).toContain('L2J')
    expect(html).toContain('M · medium')
    expect(html).toContain('ICAO24 and live registration verified')
    expect(html).toContain('Snapshot 2026-09-13')
    expect(html).toContain('Mictronics aircraft-database')
    expect(html).toContain('ODC-By 1.0')
    expect(html).toContain('Publication age is not per-aircraft')
    expect(html).toContain('ADSB.lol')
    expect(html).toContain('Registration allocation')
    expect(html).toContain('Estonia (EE)')
    expect(html).not.toContain('Operating airline')
  })

  it('labels ICAO24-only confidence without replacing live registration', () => {
    const state: AircraftMetadataViewState = {
      ...availableMetadata,
      metadata: {
        ...availableMetadata.metadata,
        confidence: 'icao24-only',
        databaseRegistration: 'N123DB',
      },
    }
    const html = renderToStaticMarkup(
      <TrafficDetails
        entity={{ ...aircraft, registration: undefined }}
        aircraftMetadata={state}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )

    expect(html).toContain('N123DB')
    expect(html).toContain(
      'ICAO24 only · live registration unavailable',
    )
  })

  it('keeps conflicts and metadata failures local to the metadata section', () => {
    const conflictHtml = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={{
          phase: 'unavailable',
          identityKey: '511123|ES-ABC|A320',
          reason: 'registration-conflict',
        }}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )
    const errorHtml = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={{
          phase: 'error',
          identityKey: '511123|ES-ABC|A320',
          message: 'Aircraft metadata returned HTTP 503',
        }}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )

    expect(conflictHtml).toContain(
      'does not match the live registration',
    )
    expect(conflictHtml).not.toContain('AIRBUS A-320')
    expect(errorHtml).toContain('Live ADS-B remains active')
    expect(errorHtml).toContain('TST123')
  })

  it('loads no aircraft photo until the explicit enabled-build action', () => {
    const disabledHtml = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={availableMetadata}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )
    const enabledHtml = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={availableMetadata}
        aircraftPhotoEnabled
        aircraftPhoto={{ phase: 'idle', identityKey: '511123' }}
        aircraftPhotoTermsUrl="https://www.planespotters.net/photo/api"
        now={1_800_000_001_000}
        units="metric"
        onRequestAircraftPhoto={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(disabledHtml).not.toContain('Aircraft photo')
    expect(disabledHtml).not.toContain('api.planespotters.net')
    expect(enabledHtml).toContain('Aircraft photo')
    expect(enabledHtml).toContain('Load aircraft photo')
    expect(enabledHtml).toContain(
      'Loading sends ICAO24 511123 and normal browser network metadata directly to Planespotters',
    )
    expect(enabledHtml).toContain('Photo API terms')
    expect(enabledHtml).not.toContain('<img')
  })

  it('renders the unchanged Planespotters thumbnail as a credited source-page link', () => {
    const html = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={availableMetadata}
        aircraftPhotoEnabled
        aircraftPhoto={{
          phase: 'available',
          identityKey: '511123',
          photo: {
            icao24: '511123',
            thumbnailUrl:
              'https://cdn.planespotters.net/example/photo_t.jpg',
            thumbnailWidth: 200,
            thumbnailHeight: 133,
            photoPageUrl:
              'https://www.planespotters.net/photo/000001/example',
            photographer: 'Test Photographer',
            source: {
              name: 'Planespotters.net',
              websiteUrl: 'https://www.planespotters.net/',
              termsUrl: 'https://www.planespotters.net/photo/api',
            },
          },
        }}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )

    expect(html).toContain(
      'Photo returned by Planespotters for ICAO24 511123',
    )
    expect(html).toContain(
      'src="https://cdn.planespotters.net/example/photo_t.jpg"',
    )
    expect(html).toContain(
      'href="https://www.planespotters.net/photo/000001/example"',
    )
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toContain('nofollow')
    expect(html).toContain('Photo © Test Photographer')
    expect(html).toContain('Open the image for its unchanged original')
    expect(html).not.toContain('Load aircraft photo')
  })

  it('keeps photo failures local and never substitutes another image', () => {
    const notFoundHtml = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={availableMetadata}
        aircraftPhotoEnabled
        aircraftPhoto={{
          phase: 'unavailable',
          identityKey: '511123',
          reason: 'not-found',
        }}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )
    const errorHtml = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={availableMetadata}
        aircraftPhotoEnabled
        aircraftPhoto={{
          phase: 'error',
          identityKey: '511123',
          reason: 'network',
        }}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )

    expect(notFoundHtml).toContain(
      'No generic or model-level substitute is shown',
    )
    expect(notFoundHtml).not.toContain('<img')
    expect(errorHtml).toContain('could not reach Planespotters')
    expect(errorHtml).toContain('Live ADS-B remains active')
    expect(errorHtml).toContain('Try again')
  })

  it('shows route lookup only after explicit enablement and renders a matched route', () => {
    const disabledHtml = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={availableMetadata}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )
    const enabledHtml = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={availableMetadata}
        flightRouteEnabled
        flightRoute={{
          phase: 'available',
          identityKey: 'TST123|511123|ES-ABC',
          route: {
            flightIcao: 'TST123',
            confidence: 'plausible',
            departure: {
              name: 'Tallinn Airport',
              code: 'TLL',
            },
            arrival: {
              name: 'Helsinki Airport',
              code: 'HEL',
            },
            providerUpdatedAt: 1_800_000_000_000,
            source: {
              name: 'ADSB.lol',
              websiteUrl: 'https://www.adsb.lol/',
            },
          },
        }}
        now={1_800_000_001_000}
        units="metric"
        onRequestFlightRoute={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(disabledHtml).not.toContain('Plausible route')
    expect(enabledHtml).toContain('Plausible route')
    expect(enabledHtml).toContain('Tallinn Airport (TLL)')
    expect(enabledHtml).toContain('Helsinki Airport (HEL)')
    expect(enabledHtml).toContain('TST123')
    expect(enabledHtml).toContain('Route status')
    expect(enabledHtml).toContain('Plausible')
    expect(enabledHtml).toContain('Plausible origin')
    expect(enabledHtml).toContain('Plausible destination')
    expect(enabledHtml).toContain(
      'Standing-data file last modified',
    )
    expect(enabledHtml).toContain(
      'not a filed flight plan',
    )
    expect(enabledHtml).toContain('may be stale or wrong')
    expect(enabledHtml).toContain('Refresh plausible route')
    expect(enabledHtml.indexOf('Refresh plausible route')).toBeLessThan(
      enabledHtml.indexOf('Callsign'),
    )
    expect(enabledHtml).toContain('ADSB.lol')
    expect(enabledHtml).toContain('VRS Standing Data')
  })

  it('keeps invalid identity and provider failures local to route lookup', () => {
    const invalidHtml = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={availableMetadata}
        flightRouteEnabled
        flightRoute={{
          phase: 'unavailable',
          reason: 'invalid-identity',
        }}
        now={1_800_000_001_000}
        units="metric"
        onRequestFlightRoute={() => undefined}
        onClose={() => undefined}
      />,
    )
    const errorHtml = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={availableMetadata}
        flightRouteEnabled
        flightRoute={{
          phase: 'error',
          identityKey: 'TST123|511123|ES-ABC',
          reason: 'provider-error',
        }}
        now={1_800_000_001_000}
        units="metric"
        onRequestFlightRoute={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(invalidHtml).toContain('valid ICAO flight callsign')
    expect(invalidHtml).toContain('disabled=""')
    expect(errorHtml).toContain('The route provider is unavailable')
    expect(errorHtml).toContain('Live ADS-B remains active')
  })

  it('keeps the route action before aircraft telemetry and disables it during cooldown', () => {
    const html = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={availableMetadata}
        flightRouteEnabled
        flightRoute={{
          phase: 'error',
          identityKey: 'TST123|511123|ES-ABC',
          reason: 'quota-exhausted',
          retryAt: 1_800_000_031_000,
        }}
        now={1_800_000_001_000}
        units="metric"
        onRequestFlightRoute={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(html.indexOf('Find plausible route')).toBe(-1)
    expect(html.indexOf('Try again later')).toBeLessThan(
      html.indexOf('Callsign'),
    )
    expect(html).toContain('disabled=""')
    expect(html).toContain('Try again after')
  })

  it('omits current route lookup from historical aircraft details', () => {
    const html = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={{ phase: 'idle' }}
        flightRouteEnabled
        flightRoute={{ phase: 'idle' }}
        now={1_800_000_001_000}
        units="metric"
        historical
        onRequestFlightRoute={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(html).not.toContain('Plausible route')
    expect(html).not.toContain('Find plausible route')
  })

  it('omits aircraft photos from history playback', () => {
    const html = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={{ phase: 'idle' }}
        aircraftPhotoEnabled
        aircraftPhoto={{ phase: 'idle', identityKey: '511123' }}
        now={1_800_000_001_000}
        units="metric"
        historical
        onClose={() => undefined}
      />,
    )

    expect(html).not.toContain('Aircraft photo')
    expect(html).not.toContain('Load aircraft photo')
  })

  it('describes aircraft altitude and vertical trend without inferring ground', () => {
    const html = renderToStaticMarkup(
      <TrafficDetails
        entity={{
          ...aircraft,
          altitudeMeters: 0,
          verticalSpeedMps: 1.016,
        }}
        aircraftMetadata={{ phase: 'idle' }}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )

    expect(html).toContain('Reported altitude band')
    expect(html).toContain('Band 1 · below 1,000 m')
    expect(html).not.toContain('On ground')
    expect(html).toContain(
      'Climbing · reported rate is at least 200 ft/min upward',
    )
  })

  it('does not render aircraft metadata for a vessel selection', () => {
    const vessel: DisplayVessel = {
      id: 'vessel:123456789',
      kind: 'vessel',
      provider: 'Digitraffic',
      mmsi: 123456789,
      vesselCategory: 'unknown',
      navigationCategory: 'unknown',
      name: 'TEST SHIP',
      position: {
        latitude: 59.4,
        longitude: 24.7,
        observedAt: 1_800_000_000_000,
      },
      receivedAt: 1_800_000_000_000,
      markerIcon: 'vessel',
      markerScale: 1,
      freshness: 'live',
    }
    const html = renderToStaticMarkup(
      <TrafficDetails
        entity={vessel}
        aircraftMetadata={availableMetadata}
        aircraftPhotoEnabled
        aircraftPhoto={{
          phase: 'available',
          identityKey: '511123',
          photo: {
            icao24: '511123',
            thumbnailUrl:
              'https://cdn.planespotters.net/example/photo_t.jpg',
            thumbnailWidth: 200,
            thumbnailHeight: 133,
            photoPageUrl:
              'https://www.planespotters.net/photo/000001/example',
            photographer: 'Test Photographer',
            source: {
              name: 'Planespotters.net',
              websiteUrl: 'https://www.planespotters.net/',
              termsUrl: 'https://www.planespotters.net/photo/api',
            },
          },
        }}
        flightRouteEnabled
        flightRoute={{ phase: 'idle' }}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )

    expect(html).not.toContain('Aircraft metadata')
    expect(html).not.toContain('AIRBUS A-320')
    expect(html).not.toContain('Flight route')
    expect(html).not.toContain('Aircraft photo')
    expect(html).toContain('Position report')
    expect(html).toContain('Metadata report')
    expect(html).toContain('Unavailable')
    expect(html).toContain('no ETA year or port relationship is inferred')
    expect(html).not.toContain('Flag state')
  })

  it('keeps vessel metadata age separate from position age', () => {
    const vessel: DisplayVessel = {
      id: 'vessel:123456789',
      kind: 'vessel',
      provider: 'Digitraffic',
      mmsi: 123456789,
      vesselCategory: 'cargo',
      navigationCategory: 'underway',
      name: 'TEST SHIP',
      destination: 'TALLINN',
      eta: '09-18 14:30 UTC',
      metadataObservedAt: 1_799_999_400_000,
      position: {
        latitude: 59.4,
        longitude: 24.7,
        observedAt: 1_800_000_000_000,
      },
      receivedAt: 1_800_000_000_000,
      markerIcon: 'vessel-cargo',
      markerScale: 1,
      freshness: 'live',
    }
    const html = renderToStaticMarkup(
      <TrafficDetails
        entity={vessel}
        aircraftMetadata={{ phase: 'idle' }}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )

    expect(html).toContain('AIS-reported destination')
    expect(html).toContain('AIS ETA (year not supplied)')
    expect(html).toContain('Metadata report')
    expect(html).toContain('10 min ago')
    expect(html).toContain('Position report')
    expect(html).toContain('just now')
  })

  it('keeps speed-derived movement separate from conflicting navigation status', () => {
    const vessel: DisplayVessel = {
      id: 'vessel:123456789',
      kind: 'vessel',
      provider: 'Digitraffic',
      mmsi: 123456789,
      vesselCategory: 'other',
      navigationCategory: 'moored',
      vesselType: 'Sailing vessel',
      navigationStatus: 'Moored',
      speedKph: 1.852,
      lengthMeters: 20,
      position: {
        latitude: 59.4,
        longitude: 24.7,
        observedAt: 1_800_000_000_000,
      },
      receivedAt: 1_800_000_000_000,
      markerIcon: 'vessel',
      markerScale: 1,
      freshness: 'live',
    }
    const html = renderToStaticMarkup(
      <TrafficDetails
        entity={vessel}
        aircraftMetadata={{ phase: 'idle' }}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )

    expect(html).toContain('Moving · reported speed at least 1 kn')
    expect(html).toContain(
      'Reported speed and navigation status disagree',
    )
    expect(html).toContain('Moored')
  })

  it('shows flag state only for an ordinary assigned ship-station MMSI', () => {
    const vessel: DisplayVessel = {
      id: 'vessel:276123456',
      kind: 'vessel',
      provider: 'Digitraffic',
      mmsi: 276_123_456,
      vesselCategory: 'cargo',
      navigationCategory: 'underway',
      name: 'TEST SHIP',
      position: {
        latitude: 59.4,
        longitude: 24.7,
        observedAt: 1_800_000_000_000,
      },
      receivedAt: 1_800_000_000_000,
      markerIcon: 'vessel-cargo',
      markerScale: 1,
      freshness: 'live',
    }
    const html = renderToStaticMarkup(
      <TrafficDetails
        entity={vessel}
        aircraftMetadata={{ phase: 'idle' }}
        now={1_800_000_001_000}
        units="metric"
        historical
        onClose={() => undefined}
      />,
    )

    expect(html).toContain('Flag state')
    expect(html).toContain('Estonia (EE)')
    expect(html).not.toContain('Registration allocation')
  })

  it.each(['metric', 'aviation-nautical'] as const)(
    'shows vessel speed in km/h and knots with %s preferences',
    (units) => {
      const vessel: DisplayVessel = {
        id: 'vessel:276123456',
        kind: 'vessel',
        provider: 'Digitraffic',
        mmsi: 276_123_456,
        vesselCategory: 'cargo',
        navigationCategory: 'underway',
        speedKph: 18.52,
        position: {
          latitude: 59.4,
          longitude: 24.7,
          observedAt: 1_800_000_000_000,
        },
        receivedAt: 1_800_000_000_000,
        markerIcon: 'vessel-cargo',
        markerScale: 1,
        freshness: 'live',
      }
      const html = renderToStaticMarkup(
        <TrafficDetails
          entity={vessel}
          aircraftMetadata={{ phase: 'idle' }}
          now={1_800_000_001_000}
          units={units}
          onClose={() => undefined}
        />,
      )

      expect(html).toContain('Speed over ground')
      expect(html).toContain('19 km/h · 10 kn')
    },
  )
})
