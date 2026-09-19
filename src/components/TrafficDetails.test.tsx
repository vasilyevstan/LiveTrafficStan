import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AircraftMetadataViewState } from '../domain/aircraftMetadata'
import type {
  DisplayAircraft,
  DisplayVessel,
} from '../domain/traffic'
import { TrafficDetails } from './TrafficDetails'

const aircraft: DisplayAircraft = {
  id: 'aircraft:abc123',
  kind: 'aircraft',
  provider: 'ADSB.lol',
  hex: 'ABC123',
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
  identityKey: 'ABC123|ES-ABC|A320',
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
          identityKey: 'ABC123|ES-ABC|A320',
          reason: 'registration-conflict',
        }}
        now={1_800_000_001_000}
        onClose={() => undefined}
      />,
    )
    const errorHtml = renderToStaticMarkup(
      <TrafficDetails
        entity={aircraft}
        aircraftMetadata={{
          phase: 'error',
          identityKey: 'ABC123|ES-ABC|A320',
          message: 'Aircraft metadata returned HTTP 503',
        }}
        now={1_800_000_001_000}
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
        now={1_800_000_001_000}
        onClose={() => undefined}
      />,
    )

    expect(html).not.toContain('Aircraft metadata')
    expect(html).not.toContain('AIRBUS A-320')
    expect(html).toContain('Position report')
    expect(html).toContain('Metadata report')
    expect(html).toContain('Unavailable')
    expect(html).toContain('no ETA year or port relationship is inferred')
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
})
