import { describe, expect, it } from 'vitest'
import type { AircraftPhotoViewState } from '../domain/aircraftPhoto'
import type { Aircraft, Vessel } from '../domain/traffic'
import {
  createTrafficTooltipElement,
  trafficTooltipSummary,
} from './trafficTooltip'

class FakeElement {
  readonly children: FakeElement[] = []
  readonly dataset: Record<string, string> = {}
  className = ''
  textContent = ''
  href = ''
  target = ''
  rel = ''
  title = ''
  src = ''
  width = 0
  height = 0
  alt = ''
  loading = ''
  referrerPolicy = ''

  append(...children: FakeElement[]) {
    this.children.push(...children)
  }
}

const fakeDocument = {
  createElement: () => new FakeElement(),
} as unknown as Document

const aircraft = (
  overrides: Partial<Aircraft> = {},
): Aircraft => ({
  id: 'aircraft:abc123',
  kind: 'aircraft',
  provider: 'test',
  hex: 'abc123',
  position: {
    latitude: 59,
    longitude: 24,
    observedAt: 1,
  },
  receivedAt: 1,
  markerIcon: 'aircraft',
  markerScale: 1,
  ...overrides,
})

const vessel = (
  overrides: Partial<Vessel> = {},
): Vessel => ({
  id: 'vessel:230123456',
  kind: 'vessel',
  provider: 'test',
  mmsi: 230123456,
  vesselCategory: 'other',
  navigationCategory: 'unknown',
  position: {
    latitude: 59,
    longitude: 24,
    observedAt: 1,
  },
  receivedAt: 1,
  markerIcon: 'vessel',
  markerScale: 1,
  ...overrides,
})

describe('trafficTooltipSummary', () => {
  it('uses already-loaded aircraft callsign and reported type truthfully', () => {
    expect(
      trafficTooltipSummary(
        aircraft({
          callsign: '  TST123  ',
          aircraftType: 'A320',
          registration: 'N123TS',
          altitudeMeters: 3_048,
        }),
      ),
    ).toEqual({
      title: 'Flight / callsign: TST123',
      details: [
        'Reported aircraft type: A320',
        'Reported altitude: 3,048 m',
        'Registration: N123TS',
      ],
    })
  })

  it('uses the selected unit system for reported aircraft altitude', () => {
    expect(
      trafficTooltipSummary(
        aircraft({ altitudeMeters: 3_048 }),
        'aviation-nautical',
      ),
    ).toEqual({
      title: 'Aircraft: ABC123',
      details: [
        'Reported aircraft type: unreported',
        'Reported altitude: 10,000 ft',
        'ICAO24: ABC123',
      ],
    })
  })

  describe('createTrafficTooltipElement', () => {
    const photoState: AircraftPhotoViewState = {
      phase: 'available',
      identityKey: 'ABC123',
      photo: {
        icao24: 'ABC123',
        thumbnailUrl:
          'https://cdn.planespotters.net/example.jpg',
        thumbnailWidth: 200,
        thumbnailHeight: 133,
        photoPageUrl:
          'https://www.planespotters.net/photo/123/example',
        photographer: 'Test Photographer',
        source: {
          name: 'Planespotters.net',
          websiteUrl: 'https://www.planespotters.net/',
          termsUrl: 'https://www.planespotters.net/photo/api',
        },
      },
    }

    it('keeps the validated thumbnail and exact source page linked with credit', () => {
      const root = createTrafficTooltipElement(
        aircraft(),
        fakeDocument,
        {
          aircraftPhotoEnabled: true,
          aircraftPhoto: photoState,
        },
      ) as unknown as FakeElement
      const link = root.children.find(
        (child) => child.className === 'traffic-tooltip__photo-link',
      )

      expect(link).toMatchObject({
        href: 'https://www.planespotters.net/photo/123/example',
        target: '_blank',
        rel: 'noreferrer noopener',
      })
      expect(link?.children[0]).toMatchObject({
        className: 'traffic-tooltip__photo',
        src: 'https://cdn.planespotters.net/example.jpg',
        width: 200,
        height: 133,
        alt: 'Aircraft ABC123',
      })
      expect(link?.children[1]).toMatchObject({
        className: 'traffic-tooltip__photo-credit',
        textContent:
          'Photo © Test Photographer via Planespotters.net',
      })
    })

    it('does not show a photo from a different aircraft identity', () => {
      const root = createTrafficTooltipElement(
        aircraft({ hex: 'def456' }),
        fakeDocument,
        {
          aircraftPhotoEnabled: true,
          aircraftPhoto: photoState,
        },
      ) as unknown as FakeElement

      expect(
        root.children.some(
          (child) =>
            child.className === 'traffic-tooltip__photo-link',
        ),
      ).toBe(false)
    })
  })

  it('falls back to ICAO24 without claiming missing aircraft metadata', () => {
    expect(trafficTooltipSummary(aircraft())).toEqual({
      title: 'Aircraft: ABC123',
      details: [
        'Reported aircraft type: unreported',
        'Reported altitude: unreported',
        'ICAO24: ABC123',
      ],
    })
  })

  it('labels vessel destination as AIS data rather than a complete route', () => {
    expect(
      trafficTooltipSummary(
        vessel({
          name: 'Test Vessel',
          destination: 'Helsinki',
          speedKph: 18.52,
        }),
      ),
    ).toEqual({
      title: 'Test Vessel',
      details: [
        'Flag: Finland (FI)',
        'Speed over ground: 19 km/h · 10 kn',
        'AIS destination: Helsinki',
      ],
    })
  })

  it('keeps provider markup-like text as plain summary data', () => {
    expect(
      trafficTooltipSummary(
        vessel({
          name: '<img src=x onerror=alert(1)>',
          destination: '<script>alert(1)</script>',
        }),
      ),
    ).toMatchObject({
      title: '<img src=x onerror=alert(1)>',
      details: [
        'Flag: Finland (FI)',
        'Speed over ground: unreported',
        'AIS destination: <script>alert(1)</script>',
      ],
    })
  })
})
