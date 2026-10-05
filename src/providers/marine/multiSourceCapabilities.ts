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
