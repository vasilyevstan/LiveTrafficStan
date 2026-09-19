import type { TrafficViewport } from './viewport'
import { isCoordinateInViewport } from './viewport'

export const AIRPORT_RESULT_LIMIT = 20

export type AirportKind = 'large' | 'medium'

export interface Airport {
  id: string
  name: string
  kind: AirportKind
  ident: string
  icaoCode?: string
  iataCode?: string
  municipality?: string
  isoCountry: string
  longitude: number
  latitude: number
}

export interface AirportSource {
  name: string
  repositoryUrl: string
  commit: string
  publishedAt: string
  termsUrl: string
  documentationUrl: string
  licenseName: string
  outputVersion: string
}

export interface AirportDataset {
  airports: readonly Airport[]
  source: AirportSource
}

export type AirportsViewState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; dataset: AirportDataset }
  | { phase: 'error'; message: string }

export const airportKindLabel = (kind: AirportKind) =>
  kind === 'large' ? 'Large airport' : 'Medium airport'

export const airportsInViewport = (
  airports: readonly Airport[],
  viewport: TrafficViewport,
) =>
  airports
    .filter((airport) =>
      isCoordinateInViewport(
        {
          latitude: airport.latitude,
          longitude: airport.longitude,
        },
        viewport,
      ),
    )
    .sort(
      (first, second) =>
        (first.kind === second.kind
          ? 0
          : first.kind === 'large'
            ? -1
            : 1) ||
        first.name.localeCompare(second.name) ||
        Number(first.id) - Number(second.id),
    )
