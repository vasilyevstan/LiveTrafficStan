import { useEffect, useState } from 'react'
import type { AppCenter, AppConfig } from '../config/appConfig'
import type { Aircraft, TrafficProviderResult } from '../domain/traffic'
import { AdsbLolAircraftProvider } from '../providers/aircraft/adsbLolProvider'
import { errorMessage } from '../providers/errors'

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
) => {
  const [result, setResult] =
    useState<TrafficProviderResult<Aircraft>>(initialResult)

  useEffect(() => {
    const provider = new AdsbLolAircraftProvider(config.endpointBaseUrl)
    let disposed = false
    let inFlight = false
    let timeout: number | undefined
    let controller: AbortController | undefined
    let lastLoggedError: string | undefined

    const clearTimer = () => {
      if (timeout !== undefined) {
        window.clearTimeout(timeout)
        timeout = undefined
      }
    }

    const schedule = () => {
      clearTimer()
      if (!disposed && !document.hidden) {
        timeout = window.setTimeout(run, config.refreshIntervalMs)
      }
    }

    const run = async () => {
      if (disposed || document.hidden || inFlight) return

      inFlight = true
      controller = new AbortController()
      setResult((current) => ({
        ...current,
        status: {
          ...current.status,
          phase: current.status.lastSuccessAt ? current.status.phase : 'loading',
          paused: false,
        },
      }))

      try {
        const entities = await provider.fetchSnapshot(
          { center, radiusKm },
          controller.signal,
        )
        if (disposed) return

        const now = Date.now()
        const lastDataAt = entities.reduce(
          (latest, entity) => Math.max(latest, entity.position.observedAt),
          0,
        )
        lastLoggedError = undefined
        setResult({
          entities,
          status: {
            phase: 'live',
            paused: false,
            lastSuccessAt: now,
            lastDataAt: lastDataAt || now,
          },
        })
      } catch (error) {
        if (disposed || controller.signal.aborted) return

        const message = errorMessage(error)
        if (message !== lastLoggedError) {
          console.warn(`Aircraft provider error: ${message}`)
          lastLoggedError = message
        }
        setResult((current) => ({
          ...current,
          status: {
            ...current.status,
            phase: 'error',
            paused: false,
            error: message,
          },
        }))
      } finally {
        inFlight = false
        controller = undefined
        schedule()
      }
    }

    const handleVisibilityChange = () => {
      clearTimer()
      if (document.hidden) {
        controller?.abort()
        setResult((current) => ({
          ...current,
          status: {
            ...current.status,
            paused: true,
          },
        }))
      } else {
        setResult((current) => ({
          ...current,
          status: {
            ...current.status,
            paused: false,
          },
        }))
        void run()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    if (document.hidden) {
      setResult((current) => ({
        ...current,
        status: { ...current.status, paused: true },
      }))
    } else {
      void run()
    }

    return () => {
      disposed = true
      clearTimer()
      controller?.abort()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [center, radiusKm, config])

  return result
}
