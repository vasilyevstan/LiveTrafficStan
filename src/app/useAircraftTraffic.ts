import { useEffect, useRef, useState } from 'react'
import type { AppCenter, AppConfig } from '../config/appConfig'
import type { Aircraft, TrafficProviderResult } from '../domain/traffic'
import { AdsbLolAircraftProvider } from '../providers/aircraft/adsbLolProvider'
import type { TrafficQuery } from '../providers/types'
import { AircraftTrafficController } from './AircraftTrafficController'

const initialResult: TrafficProviderResult<Aircraft> = {
  entities: [],
  status: {
    phase: 'idle',
    paused: false,
  },
}

export const useAircraftTraffic = (
  center: AppCenter,
  radiusKm: number,
  config: AppConfig['aircraft'],
  enabled = true,
) => {
  const [result, setResult] =
    useState<TrafficProviderResult<Aircraft>>(initialResult)
  const controllerRef = useRef<AircraftTrafficController | undefined>(undefined)
  const queryRef = useRef<TrafficQuery>({ center, radiusKm })

  useEffect(() => {
    const query = { center, radiusKm }
    queryRef.current = query
    controllerRef.current?.updateQuery(query)
  }, [center, radiusKm])

  useEffect(() => {
    if (!enabled) {
      controllerRef.current?.stop()
      controllerRef.current = undefined
      setResult(initialResult)
      return
    }

    const controller = new AircraftTrafficController({
      provider: new AdsbLolAircraftProvider(config.endpointBaseUrl),
      initialQuery: queryRef.current,
      refreshIntervalMs: config.refreshIntervalMs,
      rateLimitBackoffMaxMs: config.rateLimitBackoffMaxMs,
      onResult: setResult,
    })
    controllerRef.current = controller

    const handleVisibilityChange = () => {
      controller.setPaused(document.hidden)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    controller.start(document.hidden)

    return () => {
      controller.stop()
      if (controllerRef.current === controller) {
        controllerRef.current = undefined
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [config, enabled])

  return result
}
