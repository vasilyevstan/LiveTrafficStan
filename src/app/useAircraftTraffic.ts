import { useEffect, useRef, useState } from 'react'
import type { AppConfig } from '../config/appConfig'
import type { Aircraft, TrafficProviderResult } from '../domain/traffic'
import { AdsbLolAircraftProvider } from '../providers/aircraft/adsbLolProvider'
import type { TrafficQuery } from '../providers/types'
import { AircraftTrafficController } from './AircraftTrafficController'
import { shouldPauseTraffic } from './trafficPause'

const initialResult = (): TrafficProviderResult<Aircraft> => ({
  entities: [],
  status: {
    phase: 'idle',
    paused: true,
  },
})

export const useAircraftTraffic = (
  query: TrafficQuery | null,
  config: AppConfig['aircraft'],
) => {
  const [result, setResult] =
    useState<TrafficProviderResult<Aircraft>>(initialResult)
  const controllerRef = useRef<AircraftTrafficController | undefined>(undefined)
  const queryRef = useRef<TrafficQuery | null>(query)
  const startControllerRef = useRef<
    ((initialQuery: TrafficQuery) => void) | undefined
  >(undefined)

  useEffect(() => {
    queryRef.current = query
    const controller = controllerRef.current

    if (controller) {
      if (query) controller.updateQuery(query)
      controller.setPaused(
        shouldPauseTraffic(query, document.hidden, navigator.onLine),
      )
      return
    }

    if (query) {
      startControllerRef.current?.(query)
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

    const startController = (initialQuery: TrafficQuery) => {
      if (disposed || controllerRef.current) return

      const controller = new AircraftTrafficController({
        provider: new AdsbLolAircraftProvider(config.endpointBaseUrl),
        initialQuery,
        refreshIntervalMs: config.refreshIntervalMs,
        rateLimitBackoffMaxMs: config.rateLimitBackoffMaxMs,
        onResult: (nextResult) => {
          if (!disposed) setResult(nextResult)
        },
      })
      controllerRef.current = controller
      controller.start(
        shouldPauseTraffic(
          queryRef.current,
          document.hidden,
          navigator.onLine,
        ),
      )
    }

    startControllerRef.current = startController
    if (queryRef.current) startController(queryRef.current)

    const handleVisibilityChange = () => {
      controllerRef.current?.setPaused(
        shouldPauseTraffic(
          queryRef.current,
          document.hidden,
          navigator.onLine,
        ),
      )
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleVisibilityChange)
    window.addEventListener('offline', handleVisibilityChange)

    return () => {
      disposed = true
      startControllerRef.current = undefined
      controllerRef.current?.stop()
      controllerRef.current = undefined
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleVisibilityChange)
      window.removeEventListener('offline', handleVisibilityChange)
    }
  }, [config])

  return result
}
