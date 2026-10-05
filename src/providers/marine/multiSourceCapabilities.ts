import type { MarineProviderCapabilities } from '../types'

export const MULTI_SOURCE_MARINE_CAPABILITIES = {
  id: 'multi-source-marine',
  name: 'Digitraffic, AISStream and Open Waters AIS',
  browserAccess: 'mixed',
  restGeography: 'mixed',
  streamGeography: 'mixed',
  metadata: true,
  discoveryNote:
    'Global AIS reception is best effort. Type and dimensions can arrive after positions; missing values are not inferred.',
  license: {
    name: 'Per-source terms',
    url: 'https://github.com/vasilyevstan/LiveTrafficStan/blob/main/docs/data-sources-and-licensing.md',
    attribution:
      'Fintraffic / digitraffic.fi; AISStream; Open Waters AIS and the original sources credited with each vessel',
    modificationNotice:
      'Filtered, normalized and deduplicated by MMSI; matching metadata may be combined with source attribution',
  },
  coverage: {
    kind: 'global-best-effort',
    label: 'Global AIS receiver networks plus Digitraffic regional coverage; reception is not guaranteed',
    exactBoundaryKnown: false,
    exclusions: [
      'Only received positions are shown',
      'Vessels without AIS or receiver coverage are unavailable',
      'Missing yacht type or dimensions cannot be inferred',
    ],
    evidenceUrl: 'https://openwaters.io/ais/',
    reviewedOn: '2026-10-04',
  },
} as const satisfies MarineProviderCapabilities

export const MARINE_SUPPLEMENT_ATTRIBUTIONS = [
  'Marine <a href="https://aisstream.io/" target="_blank" rel="noreferrer">AISStream</a> · <a href="https://openwaters.io/ais/" target="_blank" rel="noreferrer">Open Waters AIS</a> · <a href="https://www.aishub.net/" target="_blank" rel="noreferrer">AISHub</a>',
  'Contains data under the <a href="https://data.norge.no/nlod/en/2.0" target="_blank" rel="noreferrer">Norwegian licence for Open Government data (NLOD)</a> distributed by the Norwegian Coastal Administration. Data delivered by BarentsWatch.',
  'Open Waters volunteer receptions: <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer">CC0</a>; volunteer aggregate: <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL</a>. <a href="https://openwaters.io/ais/#license" target="_blank" rel="noreferrer">Per-source terms</a>.',
] as const
