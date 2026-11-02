import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppConfig } from '../config/appConfig'
import type { TrafficProviderResult, Vessel } from '../domain/traffic'
import type { CachedMarineDiscovery } from '../domain/objectDiscovery'
import { DigitrafficMarineProvider } from '../providers/marine/DigitrafficMarineProvider'
import { MultiSourceMarineProvider } from '../providers/marine/MultiSourceMarineProvider'
import { MULTI_SOURCE_MARINE_CAPABILITIES } from '../providers/marine/multiSourceCapabilities'
import { DIGITRAFFIC_MARINE_CAPABILITIES } from '../providers/marine/digitrafficCapabilities'
import type { MarineDiagnosticsOptions } from '../providers/marine/marineDiagnostics'
import type {
  MarineProviderCapabilities,
  TrafficQuery,
} from '../providers/types'
import { marineTrafficPause } from './marineTrafficPause'

interface MarineTrafficResult extends TrafficProviderResult<Vessel> {
  capabilities: MarineProviderCapabilities
}

const initialResult = (): MarineTrafficResult => ({
  entities: [],
  status: {
    phase: 'idle',
    paused: true,
  },
  capabilities: DIGITRAFFIC_MARINE_CAPABILITIES,
})

const developmentDiagnostics = (): MarineDiagnosticsOptions | undefined => {
  if (
    !import.meta.env.DEV ||
    new URLSearchParams(window.location.search).get('marineDiagnostics') !== '1'
  ) {
    return undefined
  }

  return {
    sampleIntervalMs: 60_000,
    onSnapshot: (snapshot) => {
      const serialized = JSON.stringify(snapshot)
      console.info(
        'TrackStan marine diagnostics',
        serialized,
      )
      document.title = `TrackStan diagnostics ${serialized}`
    },
  }
}

export const useMarineTraffic = (
  query: TrafficQuery | null,
  config: AppConfig['marine'],
  intentionallyPaused = false,
) => {
  const [result, setResult] = useState<MarineTrafficResult>(initialResult)
  const providerRef = useRef<
    DigitrafficMarineProvider | MultiSourceMarineProvider | undefined
  >(undefined)
  const queryRef = useRef<TrafficQuery | null>(query)
  const intentionalPauseRef = useRef(intentionallyPaused)
  const startProviderRef = useRef<
    ((initialQuery: TrafficQuery) => void) | undefined
  >(undefined)

  useEffect(() => {
    const previousQuery = queryRef.current
    queryRef.current = query
    intentionalPauseRef.current = intentionallyPaused
    const provider = providerRef.current

    if (provider) {
      const { networkPaused, viewportPaused } = marineTrafficPause(
        query,
        document.hidden,
        navigator.onLine,
        intentionallyPaused,
      )
      if (networkPaused) provider.setPaused(true)
      if (query && query !== previousQuery) provider.updateQuery(query)
      if (!networkPaused) provider.setPaused(false)
      setResult((current) => ({
        ...current,
        status: {
          ...current.status,
          paused: networkPaused || viewportPaused,
          ...(viewportPaused ? { updating: false } : {}),
        },
      }))
      return
    }

    if (query) {
      startProviderRef.current?.(query)
    } else {
      setResult((current) => ({
        ...current,
        status: {
          ...current.status,
          paused: true,
          updating: false,
        },
      }))
    }
  }, [query, intentionallyPaused])

  useEffect(() => {
    let disposed = false

    const startProvider = (initialQuery: TrafficQuery) => {
      if (disposed || providerRef.current) return

      const Provider = config.supplementEnabled
        ? MultiSourceMarineProvider : DigitrafficMarineProvider
      const provider = new Provider({
        config,
        query: initialQuery,
        diagnostics: developmentDiagnostics(),
        callbacks: {
          onSnapshot: (entities) => {
            if (!disposed) {
              setResult((current) => ({ ...current, entities }))
            }
          },
          onStatus: (status) => {
            if (!disposed) {
              setResult((current) => ({
                ...current,
                status: {
                  ...status,
                  paused: status.paused || queryRef.current === null,
                  ...(queryRef.current === null ? { updating: false } : {}),
                },
              }))
            }
          },
        },
      })
      providerRef.current = provider
      provider.start(marineTrafficPause(
        queryRef.current,
        document.hidden,
        navigator.onLine,
        intentionalPauseRef.current,
      ).networkPaused)
    }

    startProviderRef.current = startProvider
    if (queryRef.current) startProvider(queryRef.current)

    const handleVisibilityChange = () => {
      providerRef.current?.setPaused(
        marineTrafficPause(
          queryRef.current,
          document.hidden,
          navigator.onLine,
          intentionalPauseRef.current,
        ).networkPaused,
      )
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleVisibilityChange)
    window.addEventListener('offline', handleVisibilityChange)

    return () => {
      disposed = true
      startProviderRef.current = undefined
      providerRef.current?.stop()
      providerRef.current = undefined
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleVisibilityChange)
      window.removeEventListener('offline', handleVisibilityChange)
    }
  }, [config])

  const discoverMetadata = useCallback((query: string, now = Date.now()): CachedMarineDiscovery =>
    providerRef.current?.discoverMetadata(query, now) ?? {
      loaded: false,
      result: { objectClass: 'ships', retrievedAt: now, matches: [], truncated: false, rejectedRecords: 0 },
    }, [])

  return {
    ...result,
    discoverMetadata,
    capabilities: config.supplementEnabled
      ? MULTI_SOURCE_MARINE_CAPABILITIES : DIGITRAFFIC_MARINE_CAPABILITIES,
  }
}
