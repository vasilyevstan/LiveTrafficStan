import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppCenter, AppConfig } from '../config/appConfig'
import {
  BrowserLocationError,
  browserLocationFailureMessage,
  getBrowserLocationEnvironment,
  readBrowserLocationPermission,
  requestBrowserLocation,
  subscribeBrowserLocationPermission,
} from './geolocation'

export type SessionLocationPhase =
  | 'checking'
  | 'fallback'
  | 'locating'
  | 'located'
  | 'error'

interface SessionLocationState {
  homeCenter: AppCenter
  initialReady: boolean
  phase: SessionLocationPhase
  canRequest: boolean
  message?: string
  revision: number
}

const initialState = (fallback: AppCenter): SessionLocationState => ({
  homeCenter: fallback,
  initialReady: false,
  phase: 'checking',
  canRequest: false,
  revision: 0,
})

const locationSettings = (
  config: AppConfig['navigation'],
) => ({
  coordinatePrecision: config.coordinatePrecision,
  timeoutMs: config.geolocationTimeoutMs,
  maximumAgeMs: config.geolocationMaximumAgeMs,
})

export const useSessionLocation = (
  fallback: AppCenter,
  config: AppConfig['navigation'],
) => {
  const [state, setState] = useState(() => initialState(fallback))
  const requestRevisionRef = useRef(0)
  const locationAttemptRef = useRef(false)
  const phaseRef = useRef(state.phase)
  const mountedRef = useRef(false)

  useEffect(() => {
    phaseRef.current = state.phase
  }, [state.phase])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestRevisionRef.current += 1
      locationAttemptRef.current = false
    }
  }, [])

  useEffect(() => {
    let disposed = false
    const requestRevision = ++requestRevisionRef.current
    const environment = getBrowserLocationEnvironment()
    const canRequest = environment.secure && Boolean(environment.geolocation)

    const finishFallback = (message: string, error = false) => {
      if (disposed || requestRevision !== requestRevisionRef.current) return
      setState((current) => ({
        ...current,
        homeCenter: fallback,
        initialReady: true,
        phase: error ? 'error' : 'fallback',
        canRequest,
        message,
        revision: current.revision + 1,
      }))
    }

    const resolveInitialLocation = async () => {
      const permission = await readBrowserLocationPermission(environment)
      if (disposed || requestRevision !== requestRevisionRef.current) return

      if (permission === 'insecure') {
        finishFallback(browserLocationFailureMessage('insecure'), true)
        return
      }
      if (permission === 'unavailable') {
        finishFallback(browserLocationFailureMessage('unavailable'), true)
        return
      }
      if (permission === 'denied') {
        finishFallback(browserLocationFailureMessage('denied'), true)
        return
      }
      if (permission !== 'granted') {
        finishFallback(
          'Choose Use location after granting access. Location is rounded and not saved.',
        )
        return
      }

      setState((current) => ({
        ...current,
        phase: 'locating',
        canRequest,
        message: 'Finding your starting area...',
      }))

      try {
        const homeCenter = await requestBrowserLocation(
          environment,
          locationSettings(config),
        )
        if (disposed || requestRevision !== requestRevisionRef.current) return
        setState((current) => ({
          homeCenter,
          initialReady: true,
          phase: 'located',
          canRequest,
          message: 'Using a rounded location near you.',
          revision: current.revision + 1,
        }))
      } catch (error) {
        const reason =
          error instanceof BrowserLocationError
            ? error.reason
            : 'unavailable'
        finishFallback(browserLocationFailureMessage(reason), true)
      }
    }

    void resolveInitialLocation()
    return () => {
      disposed = true
    }
  }, [config, fallback])

  const requestLocation = useCallback(() => {
    if (locationAttemptRef.current) return

    const environment = getBrowserLocationEnvironment()
    const canRequest = environment.secure && Boolean(environment.geolocation)
    const requestRevision = ++requestRevisionRef.current

    if (!canRequest) {
      const reason = environment.secure ? 'unavailable' : 'insecure'
      setState((current) => ({
        ...current,
        phase: 'error',
        canRequest: false,
        message: browserLocationFailureMessage(reason),
      }))
      return
    }

    locationAttemptRef.current = true
    setState((current) => ({
      ...current,
      phase: 'locating',
      canRequest: true,
      message: 'Finding your location...',
    }))

    void requestBrowserLocation(environment, locationSettings(config))
      .then((homeCenter) => {
        if (
          !mountedRef.current ||
          requestRevision !== requestRevisionRef.current
        ) {
          return
        }
        setState((current) => ({
          homeCenter,
          initialReady: true,
          phase: 'located',
          canRequest: true,
          message: 'Home area updated to a rounded location near you.',
          revision: current.revision + 1,
        }))
      })
      .catch((error: unknown) => {
        if (
          !mountedRef.current ||
          requestRevision !== requestRevisionRef.current
        ) {
          return
        }
        const reason =
          error instanceof BrowserLocationError
            ? error.reason
            : 'unavailable'
        setState((current) => ({
          ...current,
          phase: 'error',
          canRequest: true,
          message: browserLocationFailureMessage(reason),
        }))
      })
      .finally(() => {
        if (requestRevision === requestRevisionRef.current) {
          locationAttemptRef.current = false
        }
      })
  }, [config])

  useEffect(() => {
    let disposed = false
    let unsubscribe: () => void = () => undefined
    const environment = getBrowserLocationEnvironment()

    void subscribeBrowserLocationPermission(
      environment,
      (permission) => {
        if (disposed) return
        if (permission === 'granted' && phaseRef.current !== 'located') {
          requestLocation()
          return
        }
        if (permission === 'denied') {
          setState((current) => ({
            ...current,
            phase: 'error',
            canRequest:
              environment.secure && Boolean(environment.geolocation),
            message: browserLocationFailureMessage('denied'),
          }))
        }
      },
    ).then((cleanup) => {
      if (disposed) {
        cleanup()
      } else {
        unsubscribe = cleanup
      }
    })

    return () => {
      disposed = true
      unsubscribe()
    }
  }, [requestLocation])

  return {
    ...state,
    locating: state.phase === 'locating',
    requestLocation,
  }
}
