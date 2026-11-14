import type { TrainSource, TrainSourceId } from '../../domain/trains'

/**
 * Coverage rectangles only gate whether a source is polled for the current
 * view; they are not a claim of complete network coverage.
 */
export const TRAIN_SOURCES: Readonly<Record<TrainSourceId, TrainSource>> = {
  fintraffic: {
    id: 'fintraffic',
    name: 'Fintraffic / Digitraffic',
    coverage: 'Finland',
    // Hanko to Kokkola, then Oulu, Tornio, and Kolari; excludes Tallinn and Sweden's coast.
    areas: [
      { west: 21, south: 59.7, east: 31.7, north: 64.3 },
      { west: 23.5, south: 64.3, east: 30.7, north: 67.6 },
    ],
    websiteUrl: 'https://www.digitraffic.fi/en/railway-traffic/',
    licenseName: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Source: Fintraffic / digitraffic.fi, license CC 4.0 BY',
  },
  entur: {
    id: 'entur',
    name: 'Entur',
    coverage: 'Norway, participating operators',
    // Southern network to Trondheim, the Nordland line to Bodø, and the Ofoten line.
    areas: [
      { west: 4.5, south: 57.9, east: 12.4, north: 64 },
      { west: 10.5, south: 63.8, east: 16, north: 67.6 },
      { west: 16.5, south: 68.2, east: 18.3, north: 68.6 },
    ],
    websiteUrl: 'https://developer.entur.org/pages-real-time-vehicle/',
    licenseName: 'NLOD 2.0',
    licenseUrl: 'https://data.norge.no/nlod/en/2.0',
    attribution: 'Contains data from Entur, made available under NLOD 2.0',
  },
  mbta: {
    id: 'mbta',
    name: 'MBTA',
    coverage: 'Greater Boston commuter rail',
    areas: [{ west: -72, south: 41.4, east: -70.4, north: 43 }],
    websiteUrl: 'https://www.mbta.com/developers/v3-api',
    licenseName: 'MassDOT Developers License Agreement',
    licenseUrl: 'https://github.com/mbta/gtfs-documentation/blob/master/developers-license-agreement.pdf',
    attribution: 'Data provided by MassDOT/MBTA; not endorsed by MassDOT or MBTA',
  },
  lirr: {
    id: 'lirr',
    name: 'MTA Long Island Rail Road',
    coverage: 'Long Island Rail Road',
    areas: [{ west: -74.1, south: 40.5, east: -71.8, north: 41.2 }],
    websiteUrl: 'https://api.mta.info/#/lirrFeeds',
    licenseName: 'MTA data feed terms',
    licenseUrl: 'https://www.mta.info/developers/terms-and-conditions',
    attribution: 'Data from the MTA, redistributed by LiveTrafficStan; not endorsed by the MTA. Reports may lag and may be incomplete.',
  },
}
