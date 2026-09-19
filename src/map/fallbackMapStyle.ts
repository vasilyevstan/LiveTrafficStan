import type { StyleSpecification } from 'maplibre-gl'
import type { Theme } from '../app/theme'

export const BASEMAP_FALLBACK_MESSAGE =
  'Basemap tiles are not cached for offline use. Showing a local background for traffic and history.'

export const fallbackMapStyleKey = (theme: Theme) =>
  `livetrafficstan-fallback:${theme}`

export const isFallbackMapStyleKey = (key: string) =>
  key.startsWith('livetrafficstan-fallback:')

export const reconnectedWhileStylePending = (
  online: boolean,
  previouslyOnline: boolean,
  styleLoaded: boolean,
) => online && !previouslyOnline && !styleLoaded

export const shouldRetryAfterFallbackLoad = (
  retryPending: boolean,
  online: boolean,
  fallbackReason: string | undefined,
) => retryPending && online && fallbackReason !== undefined

export const fallbackMapStyle = (
  theme: Theme,
): StyleSpecification => ({
  version: 8,
  name: 'LiveTrafficStan local fallback',
  sources: {},
  layers: [
    {
      id: 'livetrafficstan-fallback-background',
      type: 'background',
      paint: {
        'background-color': theme === 'dark' ? '#071a2b' : '#dce8ec',
      },
    },
  ],
})
