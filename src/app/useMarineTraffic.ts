import { useEffect, useRef, useState } from 'react'
import type { AppCenter, AppConfig } from '../config/appConfig'
import type { TrafficProviderResult, Vessel } from '../domain/traffic'
import { DigitrafficMarineProvider } from '../providers/marine/DigitrafficMarineProvider'
import type { TrafficQuery } from '../providers/types'

const initialResult: TrafficProviderResult<Vessel> = {
  entities: [],
  status: {
    phase: 'idle',
    paused: false,
  },
}

export const useMarineTraffic = (
  center: AppCenter,
  radiusKm: number,
  config: AppConfig['marine'],
) => {
  const [result, setResult] =
    useState<TrafficProviderResult<Vessel>>(initialResult)
  const providerRef = useRef<DigitrafficMarineProvider | undefined>(undefined)
  const queryRef = useRef<TrafficQuery>({ center, radiusKm })

  useEffect(() => {
    const query = { center, radiusKm }
    queryRef.current = query
    providerRef.current?.updateQuery(query)
  }, [center, radiusKm])

  useEffect(() => {
    let disposed = false
    let provider: DigitrafficMarineProvider | undefined

    const start = () => {
      provider?.stop()
      provider = new DigitrafficMarineProvider({
        config,
        query: queryRef.current,
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
      provider.start()
    }

    const pause = () => {
      provider?.stop()
      provider = undefined
      providerRef.current = undefined
      setResult((current) => ({
        ...current,
        status: {
          ...current.status,
          paused: true,
        },
      }))
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        pause()
      } else {
        start()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    if (document.hidden) {
      pause()
    } else {
      start()
    }

    return () => {
      disposed = true
      provider?.stop()
      if (providerRef.current === provider) {
        providerRef.current = undefined
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [config])

  return result
}
