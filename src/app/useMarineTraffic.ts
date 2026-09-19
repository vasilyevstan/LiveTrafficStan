import { useEffect, useRef, useState } from 'react'
import type { AppConfig } from '../config/appConfig'
import type { TrafficProviderResult, Vessel } from '../domain/traffic'
import { DigitrafficMarineProvider } from '../providers/marine/DigitrafficMarineProvider'
import type { TrafficQuery } from '../providers/types'

const initialResult = (): TrafficProviderResult<Vessel> => ({
  entities: [],
  status: {
    phase: 'idle',
    paused: true,
  },
})

export const useMarineTraffic = (
  query: TrafficQuery | null,
  config: AppConfig['marine'],
) => {
  const [result, setResult] =
    useState<TrafficProviderResult<Vessel>>(initialResult)
  const providerRef = useRef<DigitrafficMarineProvider | undefined>(undefined)
  const queryRef = useRef<TrafficQuery | null>(query)
  const startProviderRef = useRef<
    ((initialQuery: TrafficQuery) => void) | undefined
  >(undefined)

  useEffect(() => {
    queryRef.current = query
    const provider = providerRef.current

    if (provider) {
      if (query) provider.updateQuery(query)
      provider.setPaused(document.hidden || query === null)
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
  }, [query])

  useEffect(() => {
    let disposed = false

    const startProvider = (initialQuery: TrafficQuery) => {
      if (disposed || providerRef.current) return

      const provider = new DigitrafficMarineProvider({
        config,
        query: initialQuery,
        callbacks: {
          onSnapshot: (entities) => {
            if (!disposed) {
              setResult((current) => ({ ...current, entities }))
            }
          },
          onStatus: (status) => {
            if (!disposed) {
              setResult((current) => ({ ...current, status }))
            }
          },
        },
      })
      providerRef.current = provider
      provider.start(document.hidden || queryRef.current === null)
    }

    startProviderRef.current = startProvider
    if (queryRef.current) startProvider(queryRef.current)

    const handleVisibilityChange = () => {
      providerRef.current?.setPaused(
        document.hidden || queryRef.current === null,
      )
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      disposed = true
      startProviderRef.current = undefined
      providerRef.current?.stop()
      providerRef.current = undefined
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [config])

  return result
}
