import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WeatherObservationDetails } from './WeatherObservationDetails'

describe('WeatherObservationDetails', () => {
  it('keeps observation time, retrieval time, provenance, and limitations explicit', () => {
    const html = renderToStaticMarkup(
      <WeatherObservationDetails
        observation={{
          id: 'weather:EETN',
          stationId: 'EETN',
          siteName: 'Tallinn Airport',
          longitude: 24.801,
          latitude: 59.413,
          observedAt: 100_000,
          reportType: 'METAR',
          flightCategory: 'VFR',
          temperatureCelsius: 14,
          dewpointCelsius: 12,
          windDirection: 'VRB',
          windSpeedKph: 20.372,
          visibility: {
            kilometers: 9.656064,
            relation: 'at-least',
            sourceToken: '6+',
          },
          altimeterHpa: 1005,
          rawObservation: 'METAR EETN fixture',
          freshness: 'current',
        }}
        source={{
          name: 'NOAA/NWS Aviation Weather Center',
          apiUrl: 'https://aviationweather.gov/api/data/metar',
          documentationUrl: 'https://aviationweather.gov/data/api/',
          termsUrl: 'https://www.weather.gov/disclaimer',
          licenseName: 'U.S. public domain unless marked otherwise',
        }}
        retrievedAt={110_000}
        now={120_000}
        units="aviation-nautical"
        onClose={() => undefined}
      />,
    )

    expect(html).toContain('Selected METAR observation')
    expect(html).toContain('Observed')
    expect(html).toContain('Retrieved')
    expect(html).toContain('METAR EETN fixture')
    expect(html).toContain('NOAA/NWS Aviation Weather Center')
    expect(html).toContain('11 kn')
    expect(html).toContain('6+ statute mi')
    expect(html).toContain('Do not infer a forecast')
  })

  it('formats normalized weather values in metric units', () => {
    const html = renderToStaticMarkup(
      <WeatherObservationDetails
        observation={{
          id: 'weather:EETN',
          stationId: 'EETN',
          siteName: 'Tallinn Airport',
          longitude: 24.801,
          latitude: 59.413,
          observedAt: 100_000,
          reportType: 'METAR',
          flightCategory: 'VFR',
          windSpeedKph: 20.372,
          visibility: {
            kilometers: 9.656064,
            relation: 'at-least',
            sourceToken: '6+',
          },
          rawObservation: 'METAR EETN fixture',
          freshness: 'current',
        }}
        source={{
          name: 'NOAA/NWS Aviation Weather Center',
          apiUrl: 'https://aviationweather.gov/api/data/metar',
          documentationUrl: 'https://aviationweather.gov/data/api/',
          termsUrl: 'https://www.weather.gov/disclaimer',
          licenseName: 'U.S. public domain unless marked otherwise',
        }}
        retrievedAt={110_000}
        now={120_000}
        units="metric"
        onClose={() => undefined}
      />,
    )

    expect(html).toContain('20 km/h')
    expect(html).toContain('at least 9.7 km')
  })
})
