import { describe, expect, it } from 'vitest'
import { defaultAppPreferences } from './preferences'
import {
  createShareUrl,
  MAXIMUM_SHARE_FRAGMENT_LENGTH,
  parseShareFragment,
  serializeShareFragment,
} from './shareState'

const camera = {
  latitude: 59.43749,
  longitude: 24.75351,
  zoom: 8.246,
  bearing: -12.34,
  pitch: 44.96,
}

describe('shared application state', () => {
  it('round trips a canonical full camera and preference state', () => {
    const preferences = {
      ...defaultAppPreferences(),
      theme: 'dark' as const,
      units: 'aviation-nautical' as const,
      layers: {
        ...defaultAppPreferences().layers,
        portsVisible: true,
      },
      vesselFilters: {
        ...defaultAppPreferences().vesselFilters,
        category: 'cargo' as const,
      },
      trail: {
        visible: false,
        durationMinutes: 60 as const,
      },
    }
    const fragment = serializeShareFragment(camera, preferences, 3)
    expect(fragment.length).toBeLessThan(MAXIMUM_SHARE_FRAGMENT_LENGTH)
    expect(fragment).not.toContain('starlink=')
    expect(parseShareFragment(fragment)).toEqual({
      camera: {
        latitude: 59.437,
        longitude: 24.754,
        zoom: 8.25,
        bearing: -12.3,
        pitch: 45,
      },
      preferences: {
        theme: 'dark',
        projection: 'auto',
        units: 'aviation-nautical',
        layers: {
          aircraftVisible: true,
          vesselsVisible: true,
          portsVisible: true,
          airportsVisible: false,
          clusteringEnabled: false,
          weatherVisible: false,
          orbitalObjectsVisible: false,
        },
        vesselFilters: {
          category: 'cargo',
          navigation: 'all',
          reportedSpeed: 'all',
          minimumLengthMeters: 50,
          maximumLengthMeters: null,
          includeUnknownLength: false,
        },
        trail: {
          visible: false,
          durationMinutes: 60,
        },
      },
    })
  })

  it('supports partial known preferences while keeping camera atomic', () => {
    expect(
      parseShareFragment(
        '#v=1&theme=auto&ports=1&orbits=1&starlink=1',
      ),
    ).toEqual({
      preferences: {
        theme: 'auto',
        layers: {
          portsVisible: true,
          orbitalObjectsVisible: true,
        },
      },
    })
    expect(parseShareFragment('#v=1&lat=59&lon=24')).toBeNull()
  })

  it.each(['0', '1'])('ignores valid legacy starlink=%s without losing camera or other overrides', (value) => {
    const fragment =
      '#v=1&lat=59&lon=24&zoom=8&bearing=0&pitch=0&theme=dark&orbits=1&aircraft=0'
    expect(parseShareFragment(`${fragment}&starlink=${value}`)).toEqual(
      parseShareFragment(fragment),
    )
    expect(parseShareFragment(`${fragment}&starlink=${value}`)).toMatchObject({
      camera: { latitude: 59, longitude: 24, zoom: 8, bearing: 0, pitch: 0 },
      preferences: {
        theme: 'dark',
        layers: { orbitalObjectsVisible: true, aircraftVisible: false },
      },
    })
    expect(parseShareFragment(`#v=1&orbits=0&starlink=${value}`)).toEqual({
      preferences: { layers: { orbitalObjectsVisible: false } },
    })
  })

  it.each([
    'starlink=false',
    'starlink=yes',
    'starlink=',
    'starlink=0&starlink=1',
  ])('still rejects invalid legacy input %s', (value) => {
    expect(parseShareFragment(`#v=1&theme=dark&${value}`)).toBeNull()
  })

  it('round trips the globe preference and native negative polar zoom without location storage', () => {
    for (const projection of ['auto', 'flat'] as const) {
      const preferences = { ...defaultAppPreferences(), projection }
      const fragment = serializeShareFragment(
        { ...camera, latitude: 85, zoom: -5.5 },
        preferences,
        3,
      )
      expect(parseShareFragment(fragment)).toMatchObject({
        camera: { latitude: 85, zoom: -5.5 },
        preferences: { projection },
      })
      expect(preferences).not.toHaveProperty('camera')
      expect(preferences).not.toHaveProperty('latitude')
    }
    expect(parseShareFragment('#v=1&projection=flat')).toEqual({
      preferences: { projection: 'flat' },
    })
    expect(parseShareFragment('#v=1&projection=globe')).toBeNull()
    expect(
      parseShareFragment('#v=1&projection=auto&projection=flat'),
    ).toBeNull()
    expect(
      parseShareFragment(
        '#v=1&lat=85&lon=0&zoom=-6.01&bearing=0&pitch=0&projection=auto',
      ),
    ).toBeNull()
  })

  it('canonicalizes precise incoming and world-wrapped outgoing cameras', () => {
    expect(
      parseShareFragment(
        '#v=1&lat=59.437123&lon=24.754987&zoom=8.246&bearing=12.34&pitch=4.56',
      ),
    ).toEqual({
      camera: {
        latitude: 59.437,
        longitude: 24.755,
        zoom: 8.25,
        bearing: 12.3,
        pitch: 4.6,
      },
    })

    const fragment = serializeShareFragment(
      { ...camera, longitude: 384.75351 },
      defaultAppPreferences(),
      3,
    )
    expect(fragment).toContain('lon=24.754')
    expect(parseShareFragment(fragment)?.camera?.longitude).toBe(24.754)
  })

  it('rejects duplicates, unknowns, malformed values, and old versions', () => {
    expect(parseShareFragment('#v=1&theme=dark&theme=light')).toBeNull()
    expect(parseShareFragment('#v=1&radius=50')).toBeNull()
    expect(parseShareFragment('#v=1&aircraft=yes')).toBeNull()
    expect(parseShareFragment('#v=2&theme=dark')).toBeNull()
    expect(
      parseShareFragment('#v=1&theme=dark&vesselMinLength=25.0'),
    ).toBeNull()
    expect(
      parseShareFragment('#v=1&theme=dark&vesselMaxLength=24.0'),
    ).toBeNull()
    expect(
      parseShareFragment('#v=1&theme=dark&trailMinutes=15.0'),
    ).toBeNull()
    expect(
      parseShareFragment(
        `#v=1&theme=${'x'.repeat(MAXIMUM_SHARE_FRAGMENT_LENGTH)}`,
      ),
    ).toBeNull()
  })

  it('rejects non-finite and out-of-range camera values', () => {
    expect(
      parseShareFragment(
        '#v=1&lat=91&lon=24&zoom=8&bearing=0&pitch=0',
      ),
    ).toBeNull()
    expect(
      parseShareFragment(
        '#v=1&lat=59&lon=24&zoom=NaN&bearing=0&pitch=0',
      ),
    ).toBeNull()
  })

  it('creates a fragment-only URL without existing query state', () => {
    const url = createShareUrl(
      {
        origin: 'https://example.test',
        pathname: '/app',
      } as Location,
      camera,
      defaultAppPreferences(),
      3,
    )
    expect(url).toMatch(/^https:\/\/example\.test\/app#v=1&/)
    expect(url).not.toContain('?')
  })

  it('rejects invalid serializer camera input', () => {
    expect(() =>
      serializeShareFragment(
        { ...camera, latitude: 91 },
        defaultAppPreferences(),
        3,
      ),
    ).toThrow('Cannot share an invalid map camera')
  })
})
