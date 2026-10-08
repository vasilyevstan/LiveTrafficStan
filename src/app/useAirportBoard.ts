import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AirportBoardState } from '../domain/airportBoard'
import type { AirportBoardProvider } from '../providers/airportBoards/airportBoardProvider'
import { AirportBoardController } from './AirportBoardController'

export const useAirportBoard = (
  airportIcao: string | undefined,
  provider: AirportBoardProvider,
  now: number,
  online: boolean,
  historical: boolean,
) => {
  const controller = useMemo(() => new AirportBoardController(provider), [provider])
  const [state, setState] = useState<AirportBoardState>({ phase: 'idle' })
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState)
    return () => { unsubscribe(); controller.dispose() }
  }, [controller])

  useEffect(() => {
    const update = () => {
      const active = !document.hidden
      setVisible(active)
      controller.select(airportIcao, active && online && navigator.onLine && !historical)
    }
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [controller, airportIcao, online, historical])

  useEffect(() => { controller.expire() }, [controller, now])

  const request = useCallback(() => {
    controller.select(airportIcao, !document.hidden && online && navigator.onLine && !historical)
    void controller.request()
  }, [controller, airportIcao, online, historical])

  return {
    state: state.airportIcao === airportIcao ? state : { phase: 'idle', airportIcao } as const,
    visible,
    retryAt: provider.retryAt,
    request,
  }
}
