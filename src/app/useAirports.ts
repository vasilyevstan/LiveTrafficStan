import { useCallback, useEffect, useRef, useState } from 'react'
import type { AirportsViewState } from '../domain/airports'
import { StaticAirportsProvider } from '../providers/airports/staticAirportsProvider'

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export const useAirports = (
  enabled: boolean,
  provider: StaticAirportsProvider,
) => {
  const [state, setState] = useState<AirportsViewState>({ phase: 'idle' })
  const controllerRef = useRef<AbortController | null>(null)
  const fulfilledRef = useRef(false)
  const mountedRef = useRef(true)
  const [retryRevision, setRetryRevision] = useState(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      controllerRef.current?.abort()
      controllerRef.current = null
      if (!fulfilledRef.current) {
        setState((current) =>
          current.phase === 'idle' ? current : { phase: 'idle' },
        )
      }
      return
    }
    if (controllerRef.current || fulfilledRef.current) return

    const controller = new AbortController()
    let active = true
    controllerRef.current = controller
    setState({ phase: 'loading' })
    void provider.load(controller.signal).then(
      (dataset) => {
        if (
          !active ||
          !mountedRef.current ||
          controller.signal.aborted
        ) {
          return
        }
        controllerRef.current = null
        fulfilledRef.current = true
        setState({ phase: 'ready', dataset })
      },
      (error) => {
        if (
          !active ||
          !mountedRef.current ||
          controller.signal.aborted
        ) {
          return
        }
        controllerRef.current = null
        setState({ phase: 'error', message: errorMessage(error) })
      },
    )

    return () => {
      active = false
      controller.abort()
      if (controllerRef.current === controller) {
        controllerRef.current = null
      }
    }
  }, [enabled, provider, retryRevision])

  const retry = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    fulfilledRef.current = false
    setState({ phase: 'idle' })
    setRetryRevision((current) => current + 1)
  }, [])

  return { state, retry }
}
