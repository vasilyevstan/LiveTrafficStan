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
          windSpeedKnots: 11,
          visibility: '6+',
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
        onClose={() => undefined}
      />,
    )

    expect(html).toContain('Selected METAR observation')
    expect(html).toContain('Observed')
    expect(html).toContain('Retrieved')
    expect(html).toContain('METAR EETN fixture')
    expect(html).toContain('NOAA/NWS Aviation Weather Center')
    expect(html).toContain('Do not infer a forecast')
  })
})
