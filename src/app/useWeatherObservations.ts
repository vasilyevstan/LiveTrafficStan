import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WeatherObservationsViewState } from '../domain/weatherObservations'
import { ProviderError, errorMessage } from '../providers/errors'
import { AwcMetarProvider } from '../providers/weather/awcMetarProvider'

export const nextWeatherRequestAt = (
  lastStartedAt: number | undefined,
  blockedUntil: number,
  requestCooldownMs: number,
) =>
  Math.max(
    blockedUntil,
    lastStartedAt === undefined
      ? 0
      : lastStartedAt + requestCooldownMs,
  )

export const weatherRetryAt = (
  error: unknown,
  now: number,
  fallbackAt: number,
) =>
  error instanceof ProviderError && error.retryAfterMs !== undefined
    ? Math.max(fallbackAt, now + error.retryAfterMs)
    : fallbackAt

const pageInitiallyVisible = () =>
  typeof document === 'undefined' || !document.hidden

export const useWeatherObservations = (
  enabled: boolean,
  stationIds: readonly string[],
  provider: AwcMetarProvider,
  now: number,
  requestCooldownMs: number,
) => {
  const stationKey = useMemo(() => stationIds.join(','), [stationIds])
  const stationIdsRef = useRef(stationIds)
  const controllerRef = useRef<AbortController | null>(null)
  const generationRef = useRef(0)
  const attemptedKeyRef = useRef<string | undefined>(undefined)
  const lastStartedAtRef = useRef<number | undefined>(undefined)
  const blockedUntilRef = useRef(0)
  const [pageVisible, setPageVisible] = useState(pageInitiallyVisible)
  const [state, setState] = useState<WeatherObservationsViewState>({
    phase: 'idle',
  })
  const [retryRevision, setRetryRevision] = useState(0)
  const [gateRevision, setGateRevision] = useState(0)

  useEffect(() => {
    stationIdsRef.current = stationIds
  }, [stationIds])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const handleVisibilityChange = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (state.phase === 'waiting' && now >= state.nextRequestAt) {
      setGateRevision((current) => current + 1)
    }
  }, [now, state])

  useEffect(() => {
    const generation = ++generationRef.current
    controllerRef.current?.abort()
    controllerRef.current = null

    if (!enabled || !pageVisible) {
      setState((current) =>
        current.phase === 'ready' || current.phase === 'error'
          ? current
          : { phase: 'idle' },
      )
      return
    }

    const attemptKey = `${stationKey}:${retryRevision}`
    if (attemptedKeyRef.current === attemptKey) return

    const requestedIds = [...stationIdsRef.current]
    if (requestedIds.length > 0) {
      const gateNow = Date.now()
      const nextRequestAt = nextWeatherRequestAt(
        lastStartedAtRef.current,
        blockedUntilRef.current,
        requestCooldownMs,
      )
      if (gateNow < nextRequestAt) {
        attemptedKeyRef.current = undefined
        setState({ phase: 'waiting', stationKey, nextRequestAt })
        return
      }
      lastStartedAtRef.current = gateNow
    }

    attemptedKeyRef.current = attemptKey
    const controller = new AbortController()
    let settled = false
    controllerRef.current = controller
    setState({ phase: 'loading', stationKey })
    void provider.load(requestedIds, controller.signal).then(
      (dataset) => {
        settled = true
        if (
          generation !== generationRef.current ||
          controller.signal.aborted
        ) {
          return
        }
        controllerRef.current = null
        blockedUntilRef.current = 0
        setState({ phase: 'ready', stationKey, dataset })
      },
      (error: unknown) => {
        settled = true
        if (
          generation !== generationRef.current ||
          controller.signal.aborted
        ) {
          return
        }
        controllerRef.current = null
        const failedAt = Date.now()
        const cooldownAt = nextWeatherRequestAt(
          lastStartedAtRef.current,
          blockedUntilRef.current,
          requestCooldownMs,
        )
        blockedUntilRef.current = weatherRetryAt(
          error,
          failedAt,
          cooldownAt,
        )
        setState({
          phase: 'error',
          stationKey,
          message: errorMessage(error),
          nextRetryAt:
            blockedUntilRef.current > failedAt
              ? blockedUntilRef.current
              : undefined,
        })
      },
    )

    return () => {
      controller.abort()
      if (!settled && attemptedKeyRef.current === attemptKey) {
        attemptedKeyRef.current = undefined
      }
      if (controllerRef.current === controller) {
        controllerRef.current = null
      }
    }
  }, [
    enabled,
    gateRevision,
    pageVisible,
    provider,
    requestCooldownMs,
    retryRevision,
    stationKey,
  ])

  const refresh = useCallback(() => {
    attemptedKeyRef.current = undefined
    setRetryRevision((current) => current + 1)
  }, [])

  return {
    state,
    refresh,
    retry: refresh,
    canRefresh:
      state.phase !== 'loading' &&
      (state.phase !== 'waiting' || now >= state.nextRequestAt) &&
      (state.phase !== 'error' ||
        state.nextRetryAt === undefined ||
        now >= state.nextRetryAt),
  }
}
