import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AircraftMetadataViewState } from '../domain/aircraftMetadata'
import type { VesselPhotoViewState } from '../domain/vesselPhoto'
import type {
  DisplayAircraft,
  DisplayVessel,
} from '../domain/traffic'
import { MobileInspectorContext } from './mobileWorkspace'
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

const vessel: DisplayVessel = {
  id: 'vessel:230123456', kind: 'vessel', provider: 'Open Waters',
  mmsi: 230123456, imo: 8919805, vesselCategory: 'passenger',
  navigationCategory: 'underway', name: 'TEST VESSEL',
  position: { latitude: 59.4, longitude: 24.7, observedAt: 1_800_000_000_000 },
  receivedAt: 1_800_000_000_000, markerIcon: 'vessel-passenger',
  markerScale: 1, freshness: 'live',
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

describe('TrafficDetails reported squawk', () => {
  it.each(['0000', '0042', '7000', '7500', '7600', '7700'])(
    'displays normalized code %s without interpreting it',
    (squawk) => {
      const html = renderToStaticMarkup(
        <TrafficDetails
          entity={{ ...aircraft, squawk }}
          aircraftMetadata={{ phase: 'idle' }}
          now={1_800_000_001_000}
          units="metric"
          onClose={() => undefined}
        />,
      )
      expect(html).toContain(`<dt>Squawk</dt><dd>${squawk}</dd>`)
    },
  )

  it('omits the row when normalized squawk is unavailable', () => {
    const html = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={{ phase: 'idle' }}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )
    expect(html).not.toContain('<dt>Squawk</dt>')
  })
})

describe('TrafficDetails reported directions', () => {
  const render = (entity: DisplayAircraft | DisplayVessel, historical = false) =>
    renderToStaticMarkup(
      <TrafficDetails
        entity={entity}
        aircraftMetadata={{ phase: 'idle' }}
        now={1_800_000_001_000}
        units="metric"
        historical={historical}
        onClose={() => undefined}
      />,
    )

  describe.each([false, true])('vessel historical=%s', (historical) => {
    it.each([
      ['different values', 45, 80],
      ['equal values', 45, 45],
      ['heading only', 45, undefined],
      ['course only', undefined, 80],
      ['neither value', undefined, undefined],
      ['both zero', 0, 0],
      ['zero heading', 0, 80],
      ['zero course', 45, 0],
    ] as const)(
      'keeps independent reported fields for %s',
      (_name, headingDegrees, courseDegrees) => {
        const html = render(
          { ...vessel, headingDegrees, courseDegrees },
          historical,
        )

        if (headingDegrees === undefined) {
          expect(html).not.toContain('<dt>Heading (bow)</dt>')
        } else {
          expect(html).toContain(
            `<dt>Heading (bow)</dt><dd>${headingDegrees} deg</dd>`,
          )
        }
        if (courseDegrees === undefined) {
          expect(html).not.toContain('<dt>Course over ground</dt>')
        } else {
          expect(html).toContain(
            `<dt>Course over ground</dt><dd>${courseDegrees} deg</dd>`,
          )
        }
        expect(html).not.toContain('<dt>Course / heading</dt>')
        expect(html).not.toContain('<dt>Direction</dt>')
      },
    )
  })

  it('keeps reported directions when the vessel is stopped', () => {
    const html = render({
      ...vessel,
      speedKph: 0,
      headingDegrees: 45,
      courseDegrees: 80,
    })
    expect(html).toContain('<dt>Heading (bow)</dt><dd>45 deg</dd>')
    expect(html).toContain('<dt>Course over ground</dt><dd>80 deg</dd>')
  })

  it.each([
    ['course first', 45, 80, 80],
    ['heading fallback', 45, undefined, 45],
    ['neither value', undefined, undefined, undefined],
    ['zero course', 45, 0, 0],
    ['zero heading fallback', 0, undefined, 0],
  ] as const)(
    'preserves aircraft Direction for %s',
    (_name, headingDegrees, courseDegrees, direction) => {
      const html = render({ ...aircraft, headingDegrees, courseDegrees })
      if (direction === undefined) {
        expect(html).not.toContain('<dt>Direction</dt>')
      } else {
        expect(html).toContain(`<dt>Direction</dt><dd>${direction} deg</dd>`)
      }
      expect(html).not.toContain('<dt>Heading (bow)</dt>')
      expect(html).not.toContain('<dt>Course over ground</dt>')
    },
  )
})

describe('TrafficDetails dynamic vessel photos', () => {
  const state: Extract<VesselPhotoViewState, { phase: 'available' }> = {
    phase: 'available', identityKey: 'vessel:230123456|IMO|8919805',
    photo: {
      lookupKind: 'IMO', lookupNumber: '8919805',
      thumbnailUrl: 'https://thumb.wikimedia.org/wikipedia/commons/a/ab/Test.jpg',
      pageUrl: 'https://commons.wikimedia.org/wiki/File:Test.jpg',
      width: 960, height: 643, artist: 'Test photographer',
      license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
  }
  const render = (photo: VesselPhotoViewState, entity = vessel, historical = false) =>
    renderToStaticMarkup(<TrafficDetails
      entity={entity} aircraftMetadata={{ phase: 'idle' }} vesselPhotoEnabled
      vesselPhoto={photo} now={1_800_000_001_000} units="metric" historical={historical}
      onClose={() => undefined}
    />)

  it('shows attributed lookup imagery above facts with match context only in its title', () => {
    const html = render(state)
    expect(html).toContain(
      'title="Open Waters photo for reported IMO 8919805; not live confirmation"',
    )
    expect(html).toContain(`src="${state.photo.thumbnailUrl}"`)
    expect(html).toContain('crossorigin="anonymous"')
    expect(html).toContain('referrerPolicy="no-referrer"')
    expect(html).toContain('Test photographer')
    expect(html).toContain('Wikimedia Commons via Open Waters')
    expect(html).toContain('https://creativecommons.org/licenses/by/4.0/')
    expect(html).not.toContain('Exact AIS-reported IMO')
    expect(html).not.toContain('Vessel photo')
    expect(html).not.toContain('metadata-status')
    expect(html.indexOf('traffic-photo__image')).toBeLessThan(html.indexOf('<dt>MMSI'))
  })

  it('guards the complete selected identity, prefers bundled imagery and excludes history', () => {
    expect(render(state, { ...vessel, imo: 8917601 })).not.toContain(state.photo.thumbnailUrl)
    expect(render(state, { ...vessel, id: 'vessel:230123457' })).not.toContain(state.photo.thumbnailUrl)
    const bundled = render(state, { ...vessel, imo: 9214379 })
    expect(bundled).toContain('/vessel-photos/2026-10-02-v1/imo-9214379.jpg')
    expect(bundled).not.toContain(state.photo.thumbnailUrl)
    expect(render(state, vessel, true)).not.toContain('traffic-photo')
    expect(render(state, vessel, true)).not.toContain(state.photo.thumbnailUrl)
  })

  it('keeps the reassignable MMSI caveat in the photo title', () => {
    const html = render({
      ...state, identityKey: 'vessel:230123456|MMSI|230123456',
      photo: { ...state.photo, lookupKind: 'MMSI', lookupNumber: '230123456' },
    }, { ...vessel, imo: undefined })
    expect(html).toContain(
      'title="Open Waters photo for reported MMSI 230123456; MMSIs can be reassigned; not live confirmation"',
    )
    expect(html).not.toContain('metadata-status')
  })

  it('renders no photo UI for idle, loading, empty, offline or failed lookups', () => {
    const identityKey = state.identityKey
    const states: VesselPhotoViewState[] = [
      { phase: 'idle' },
      { phase: 'loading', identityKey },
      { phase: 'unavailable', identityKey, reason: 'not-found' },
      { phase: 'error', identityKey, reason: 'network' },
      { phase: 'error', identityKey, reason: 'provider-error', retryAt: 1_800_000_101_000 },
    ]
    for (const photo of states) {
      const html = render(photo)
      expect(html).not.toContain('traffic-photo')
      expect(html).not.toContain('Vessel photo')
      expect(html).not.toContain('Open Waters returned')
      expect(html).not.toContain('Try photo lookup')
      expect(html).not.toContain('<button type="button" class="aircraft-photo__action"')
      expect(html).not.toContain('metadata-status')
    }
  })
})

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
    expect(html).toContain('aria-label="Close aircraft details"')
    expect(html).not.toContain('>Close</button>')
    expect(html).toContain('L2J')
    expect(html).toContain('M · medium')
    expect(html).toContain('ICAO24 and live registration verified')
    expect(html).toContain('Snapshot 2026-09-13')
    expect(html).toContain('Mictronics aircraft-database')
    expect(html).toContain('ODC-By 1.0')
    expect(html).toContain('database age is not aircraft verification')
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

  it('renders no metadata section or absence text unless metadata is available', () => {
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

    const loadingHtml = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={{ phase: 'loading', identityKey: '511123|ES-ABC|A320' }}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )
    for (const html of [conflictHtml, errorHtml, loadingHtml]) {
      expect(html).not.toContain('aircraft-metadata')
      expect(html).not.toContain('Metadata unavailable')
      expect(html).not.toContain('mismatch')
      expect(html).not.toContain('Loading metadata')
      expect(html).not.toContain('Mictronics')
      expect(html).not.toContain('AIRBUS A-320')
      expect(html).toContain('TST123')
    }
  })

  it('renders no aircraft photo UI until an exact photo is available', () => {
    const states = [
      { phase: 'idle', identityKey: '511123' } as const,
      { phase: 'loading', identityKey: '511123' } as const,
      {
        phase: 'unavailable',
        identityKey: '511123',
        reason: 'not-found',
      } as const,
      {
        phase: 'error',
        identityKey: '511123',
        reason: 'network',
      } as const,
    ]

    states.forEach((aircraftPhoto) => {
      const html = renderToStaticMarkup(
        <TrafficDetails
          entity={aircraft}
          aircraftMetadata={availableMetadata}
          aircraftPhotoEnabled
          aircraftPhoto={aircraftPhoto}
          now={1_800_000_001_000}
          units="metric"
          onClose={() => undefined}
        />,
      )

      expect(html).not.toContain('aircraft-photo')
      expect(html).not.toContain('Load photo')
      expect(html).not.toContain('Planespotters')
      expect(html).not.toContain('<img')
    })
  })

  it('renders an available photo above facts with only its source credit', () => {
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
      'src="https://cdn.planespotters.net/example/photo_t.jpg"',
    )
    expect(html).toContain(
      'href="https://www.planespotters.net/photo/000001/example"',
    )
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toContain('nofollow')
    expect(html).toContain('© Test Photographer')
    expect(html).toContain('Planespotters.net')
    expect(html).not.toContain('Planespotters match')
    expect(html).not.toContain('Open image for original')
    expect(html).not.toContain('Load photo')
    expect(html.indexOf('traffic-photo__image')).toBeLessThan(
      html.indexOf('Callsign'),
    )
  })

  it('orders an available aircraft photo before its route and facts', () => {
    const airports = [
      { name: 'Tallinn Airport', code: 'TLL', icao: 'EETN', latitude: 59.4133, longitude: 24.8328 },
      { name: 'Helsinki Airport', code: 'HEL', icao: 'EFHK', latitude: 60.3172, longitude: 24.9633 },
    ]
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
            thumbnailUrl: 'https://cdn.planespotters.net/example/photo_t.jpg',
            thumbnailWidth: 200,
            thumbnailHeight: 133,
            photoPageUrl: 'https://www.planespotters.net/photo/000001/example',
            photographer: 'Test Photographer',
            source: {
              name: 'Planespotters.net',
              websiteUrl: 'https://www.planespotters.net/',
              termsUrl: 'https://www.planespotters.net/photo/api',
            },
          },
        }}
        flightRouteEnabled
        flightRoute={{
          phase: 'available',
          identityKey: 'TST123|511123|ES-ABC',
          route: {
            flightIcao: 'TST123',
            confidence: 'plausible',
            departure: airports[0]!,
            arrival: airports[1]!,
            airports,
            providerUpdatedAt: 1_800_000_000_000,
            source: { name: 'ADSB.lol', websiteUrl: 'https://www.adsb.lol/' },
          },
        }}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )
    const photo = html.indexOf('traffic-photo__image')
    const route = html.indexOf('aria-label="Plausible route"')
    expect(photo).toBeGreaterThan(-1)
    expect(photo).toBeLessThan(route)
    expect(route).toBeLessThan(html.indexOf('Callsign'))
  })

  it('shows only an available route above aircraft facts', () => {
    const airports = [
      { name: 'Tallinn Airport', code: 'TLL', icao: 'EETN', latitude: 59.4133, longitude: 24.8328 },
      { name: 'Helsinki Airport', code: 'HEL', icao: 'EFHK', latitude: 60.3172, longitude: 24.9633 },
    ]
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
        flightRouteEnabled
        flightRoute={{
          phase: 'available',
          identityKey: 'TST123|511123|ES-ABC',
          route: {
            flightIcao: 'TST123',
            confidence: 'plausible',
            departure: airports[0]!,
            arrival: airports[1]!,
            airports,
            providerUpdatedAt: 1_800_000_000_000,
            source: {
              name: 'ADSB.lol',
              websiteUrl: 'https://www.adsb.lol/',
            },
          },
        }}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )

    expect(disabledHtml).not.toContain('Plausible route')
    expect(enabledHtml).toContain('Plausible route')
    expect(enabledHtml).toContain('Tallinn Airport (TLL)')
    expect(enabledHtml).toContain('Helsinki Airport (HEL)')
    expect(enabledHtml).toContain('Departure')
    expect(enabledHtml).toContain('Destination')
    expect(enabledHtml).not.toContain('Standing data age')
    expect(enabledHtml).not.toContain('not a filed plan')
    expect(enabledHtml).not.toContain('Refresh')
    const routeStart = enabledHtml.indexOf('<section class="traffic-route"')
    const routeEnd = enabledHtml.indexOf('</section>', routeStart)
    const routeHtml = enabledHtml.slice(routeStart, routeEnd)
    expect(routeHtml).not.toContain('ADSB.lol')
    expect(routeHtml).not.toContain('VRS Standing Data')
    expect(enabledHtml.indexOf('Plausible route')).toBeLessThan(
      enabledHtml.indexOf('Callsign'),
    )
  })

  it('renders no route UI for idle, loading, unavailable, or error states', () => {
    const states = [
      { phase: 'idle' } as const,
      {
        phase: 'loading',
        identityKey: 'TST123|511123|ES-ABC',
      } as const,
      {
        phase: 'unavailable',
        identityKey: 'TST123|511123|ES-ABC',
        reason: 'not-found',
      } as const,
      {
        phase: 'error',
        identityKey: 'TST123|511123|ES-ABC',
        reason: 'provider-error',
      } as const,
    ]

    states.forEach((flightRoute) => {
      const html = renderToStaticMarkup(
        <TrafficDetails
          entity={aircraft}
          aircraftMetadata={availableMetadata}
          flightRouteEnabled
          flightRoute={flightRoute}
          now={1_800_000_001_000}
          units="metric"
          onClose={() => undefined}
        />,
      )

      expect(html).not.toContain('flight-route')
      expect(html).not.toContain('Plausible route')
      expect(html).not.toContain('Checking route')
      expect(html).not.toContain('Retry')
    })
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
    expect(html).not.toContain('Load photo')
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
    expect(html).not.toContain('no ETA year or port link inferred')
    expect(html).not.toContain('Reported destination')
    expect(html).not.toContain('Flag state')
  })

  it('shows a bundled reference photo only for an exact live IMO match', () => {
    const vessel: DisplayVessel = {
      id: 'vessel:230628000',
      kind: 'vessel',
      provider: 'Digitraffic',
      mmsi: 230628000,
      vesselCategory: 'passenger',
      navigationCategory: 'underway',
      name: 'FINLANDIA',
      imo: 9214379,
      position: {
        latitude: 59.6,
        longitude: 24.7,
        observedAt: 1_800_000_000_000,
      },
      receivedAt: 1_800_000_000_000,
      markerIcon: 'vessel-passenger',
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

    expect(html.indexOf('traffic-photo__image')).toBeLessThan(
      html.indexOf('<dt>MMSI'),
    )
    expect(html).toContain(
      'title="Exact AIS-reported IMO 9214379 reference photo; not live confirmation"',
    )
    expect(html).not.toContain('Vessel photo')
    expect(html).not.toContain('metadata-status')
    expect(html).toContain(
      'src="/vessel-photos/2026-10-02-v1/imo-9214379.jpg"',
    )
    expect(html).toContain('width="640"')
    expect(html).toContain('height="472"')
    expect(html).toContain('Pjotr Mahhonin')
    expect(html).toContain('Wikimedia Commons')
    expect(html).toContain('CC BY-SA 3.0')
    expect(html).toContain('oldid=1253024543')
    expect(html).toContain('not live confirmation')
    expect(html).toContain('not cropped or retouched')
  })

  it('renders no photo UI for invalid or unmatched IMO coverage', () => {
    const vessel: DisplayVessel = {
      id: 'vessel:230361000',
      kind: 'vessel',
      provider: 'Digitraffic',
      mmsi: 230361000,
      vesselCategory: 'passenger',
      navigationCategory: 'underway',
      name: 'GABRIELLA',
      imo: 8917601,
      position: {
        latitude: 60.1,
        longitude: 24.9,
        observedAt: 1_800_000_000_000,
      },
      receivedAt: 1_800_000_000_000,
      markerIcon: 'vessel-passenger',
      markerScale: 1,
      freshness: 'live',
    }
    const unmatchedHtml = renderToStaticMarkup(
      <TrafficDetails
        entity={vessel}
        aircraftMetadata={{ phase: 'idle' }}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )
    const invalidHtml = renderToStaticMarkup(
      <TrafficDetails
        entity={{ ...vessel, imo: 8917602 }}
        aircraftMetadata={{ phase: 'idle' }}
        now={1_800_000_001_000}
        units="metric"
        onClose={() => undefined}
      />,
    )

    for (const html of [unmatchedHtml, invalidHtml]) {
      expect(html).not.toContain('traffic-photo')
      expect(html).not.toContain('Vessel photo')
      expect(html).not.toContain('no substitute')
      expect(html).not.toContain('/vessel-photos/')
    }
  })

  it('omits vessel photos from history playback', () => {
    const vessel: DisplayVessel = {
      id: 'vessel:276829000',
      kind: 'vessel',
      provider: 'Digitraffic',
      mmsi: 276829000,
      vesselCategory: 'passenger',
      navigationCategory: 'underway',
      name: 'MEGASTAR',
      imo: 9773064,
      position: {
        latitude: 59.5,
        longitude: 24.7,
        observedAt: 1_800_000_000_000,
      },
      receivedAt: 1_800_000_000_000,
      markerIcon: 'vessel-passenger',
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

    expect(html).not.toContain('traffic-photo')
    expect(html).not.toContain('/vessel-photos/')
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

    const route = html.indexOf('<section class="traffic-route" aria-label="Reported destination"')
    expect(route).toBeGreaterThan(-1)
    expect(html).toContain('<dt>Destination</dt><dd>TALLINN</dd>')
    expect(html).toContain('<dt>ETA</dt><dd>09-18 14:30 UTC</dd>')
    expect(route).toBeLessThan(html.indexOf('<dt>Vessel name'))
    expect(html).not.toContain('AIS-reported destination')
    expect(html).not.toContain('may lag position')
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
      'Speed and navigation status conflict',
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

describe('TrafficDetails aircraft View from here', () => {
  const render = (entity: DisplayAircraft | DisplayVessel, unavailable?: string, historical = false) =>
    renderToStaticMarkup(
      <TrafficDetails
        entity={entity}
        aircraftMetadata={{ phase: 'idle' }}
        now={1_800_000_001_000}
        units="metric"
        historical={historical}
        onViewFromHere={() => undefined}
        viewFromHereUnavailable={unavailable}
        onClose={() => undefined}
      />,
    )

  it('offers the entry for a live aircraft', () => {
    const html = render(aircraft)
    expect(html).toContain('data-aircraft-view-entry="aircraft:511123"')
    expect(html).toContain('aria-label="View from here"')
    expect(html).toContain('title="View from here"')
    expect(html).toMatch(/aria-label="View from here"[^>]*>[\s\S]*traffic-action-icon/)
    expect(html).not.toContain('>View from here</button>')
    expect(html).not.toMatch(/data-aircraft-view-entry[^>]*disabled/)
  })

  it('disables the entry with its reason only in the icon title', () => {
    const html = render(aircraft, 'View from here needs a reported altitude.')
    expect(html).toMatch(/data-aircraft-view-entry[^>]*disabled/)
    expect(html).toMatch(
      /aria-label="View from here" title="View from here needs a reported altitude\."/,
    )
    expect(html).not.toContain('aria-describedby')
    expect(html).not.toContain('>View from here needs a reported altitude.<')
  })

  it('omits the entry for history and vessels', () => {
    expect(render(aircraft, undefined, true)).not.toContain('View from here')
    expect(render(vessel)).not.toContain('View from here')
  })
})

describe('TrafficDetails action placement', () => {
  const shareObject = <>
    <button type="button" className="details-panel__save" aria-label="Save TEST123">Save</button>
    <button type="button" className="details-panel__share" aria-label="Share object">Share</button>
  </>
  const renderActions = (
    entity: DisplayAircraft | DisplayVessel,
    options: { historical?: boolean, compact?: boolean, forceCompact?: boolean } = {},
  ) => renderToStaticMarkup(
    <MobileInspectorContext.Provider value={options.compact === undefined ? undefined : {
      mobile: !options.forceCompact,
      compact: options.compact,
      forceCompact: options.forceCompact,
      identity: entity.id,
      returnToTask: false,
      onExpand: () => undefined,
      onCollapse: () => undefined,
    }}>
      <TrafficDetails
        entity={entity}
        aircraftMetadata={{ phase: 'idle' }}
        now={1_800_000_001_000}
        units="metric"
        historical={options.historical}
        onShowJourney={() => undefined}
        onViewFromHere={() => undefined}
        shareObject={shareObject}
        onClose={() => undefined}
      />
    </MobileInspectorContext.Provider>,
  )

  it('keeps identity separate and orders every normal desktop action in one row', () => {
    const html = renderActions(aircraft)
    const row = html.slice(
      html.indexOf('details-panel__action-row'),
      html.indexOf('details-panel__body'),
    )
    expect(html).toContain('class="details-panel details-panel--action details-panel--action-row details-panel--traffic-actions"')
    expect(html.indexOf('selected-traffic-title')).toBeLessThan(html.indexOf('details-panel__action-row'))
    for (const label of ['Show path', 'View from here', 'Save TEST123', 'Share object', 'Close aircraft details']) {
      expect(row).toContain(label)
    }
    expect(html.match(/traffic-details__path-action/g)).toHaveLength(1)
    expect(html.match(/data-aircraft-view-entry/g)).toHaveLength(1)
    expect(row.indexOf('Show path')).toBeLessThan(row.indexOf('View from here'))
    expect(row.indexOf('View from here')).toBeLessThan(row.indexOf('Save TEST123'))
    expect(row.indexOf('Save TEST123')).toBeLessThan(row.indexOf('Share object'))
    expect(row.indexOf('Share object')).toBeLessThan(row.indexOf('Close aircraft details'))
  })

  it('keeps vessel actions scoped without exposing the aircraft view action', () => {
    const html = renderActions(vessel)
    expect(html).toContain('Show path')
    expect(html).toContain('Save TEST123')
    expect(html).toContain('Share object')
    expect(html).toContain('Close ship details')
    expect(html).not.toContain('View from here')
  })

  it('keeps history on the generic panel without current actions', () => {
    const html = renderActions(aircraft, { historical: true })
    expect(html).toContain('details-panel--historical')
    expect(html).not.toContain('details-panel--action-row')
    expect(html).not.toContain('Show path')
    expect(html).not.toContain('View from here')
    expect(html).not.toContain('Save TEST123')
    expect(html).not.toContain('Share object')
  })

  it('keeps mobile primary actions out of the compact header until expansion', () => {
    const html = renderActions(aircraft, { compact: true, forceCompact: false })
    const body = html.slice(html.indexOf('details-panel__body'))
    expect(html).toMatch(/Save TEST123[\s\S]*Share object[\s\S]*>Details<\/button>[\s\S]*Close aircraft details/)
    expect(body).toContain('hidden=""')
    expect(body).toContain('inert=""')
    expect(html).not.toContain('traffic-details__path-action')
    expect(html).not.toContain('data-aircraft-view-entry')
  })

  it('keeps forced desktop primary actions mounted and inert until expansion', () => {
    const html = renderActions(aircraft, { compact: true, forceCompact: true })
    const body = html.slice(html.indexOf('details-panel__body'))
    expect(html).toMatch(/Save TEST123[\s\S]*Share object[\s\S]*>Details<\/button>[\s\S]*Close aircraft details/)
    expect(body).toContain('hidden=""')
    expect(body).toContain('inert=""')
    expect(body).toContain('Show path')
    expect(body).toContain('View from here')
    expect(html.match(/traffic-details__path-action/g)).toHaveLength(1)
    expect(html.match(/data-aircraft-view-entry/g)).toHaveLength(1)
  })

  it('preserves loading and failure feedback without duplicating path controls', () => {
    const html = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={{ phase: 'idle' }}
        now={1_800_000_001_000}
        units="metric"
        onShowJourney={() => undefined}
        journeyPreparing
        journeyMessage="The path could not be prepared."
        onClose={() => undefined}
      />,
    )
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-label="Loading path"')
    expect(html).toContain('title="Loading path"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('role="status">The path could not be prepared.')
  })
})
