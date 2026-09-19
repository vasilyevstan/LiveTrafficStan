import type { MarineProviderCapabilities } from '../types'

export const DIGITRAFFIC_PROVIDER_NAME = 'Fintraffic Digitraffic'

export const DIGITRAFFIC_MARINE_CAPABILITIES = {
  id: 'digitraffic',
  name: DIGITRAFFIC_PROVIDER_NAME,
  browserAccess: 'direct-keyless',
  restGeography: 'radius',
  streamGeography: 'all-published-vessels',
  metadata: true,
  license: {
    name: 'CC BY 4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Source: Fintraffic / digitraffic.fi, license CC 4.0 BY',
    modificationNotice: 'Filtered and normalized by LiveTrafficStan',
  },
  coverage: {
    kind: 'regional',
    label: 'Digitraffic regional source; exact coverage unknown',
    exactBoundaryKnown: false,
    exclusions: ['Class A AIS only', 'Fishing vessels are filtered upstream'],
    evidenceUrl: 'https://www.digitraffic.fi/en/marine-traffic/ais/',
    reviewedOn: '2026-09-19',
  },
} as const satisfies MarineProviderCapabilities
