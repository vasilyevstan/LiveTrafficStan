import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  flightRouteIdentity,
  flightRouteIdentityKey,
  type FlightRouteIdentity,
  type FlightRouteViewState,
} from '../domain/flightRoute'
import type { Aircraft } from '../domain/traffic'
import type { FlightRouteProvider } from '../providers/flightRoute/aviationstackFlightRouteProvider'
import { FlightRouteController } from './FlightRouteController'

export const useFlightRoute = (
  aircraft:
    | Pick<Aircraft, 'hex' | 'callsign' | 'registration'>
    | undefined,
  provider: FlightRouteProvider,
) => {
  const [state, setState] = useState<FlightRouteViewState>({
    phase: 'idle',
  })
  const controller = useMemo(
    () => new FlightRouteController(provider),
    [provider],
  )
  const aircraftHex = aircraft?.hex
  const aircraftCallsign = aircraft?.callsign
  const aircraftRegistration = aircraft?.registration
  const identity = useMemo<FlightRouteIdentity | undefined>(
    () =>
      aircraftHex
        ? flightRouteIdentity({
            hex: aircraftHex,
            callsign: aircraftCallsign,
            registration: aircraftRegistration,
          })
        : undefined,
    [aircraftCallsign, aircraftHex, aircraftRegistration],
  )

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState)
    return () => {
      unsubscribe()
      controller.dispose()
    }
  }, [controller])

  useEffect(() => {
    controller.select(identity)
  }, [controller, identity])

  const request = useCallback(() => {
    if (identity) controller.request(identity)
  }, [controller, identity])

  if (aircraft && !identity) {
    return {
      state: {
        phase: 'unavailable',
        reason: 'invalid-identity',
      } as const,
      request,
    }
  }
  if (!identity) {
    return {
      state: { phase: 'idle' } as const,
      request,
    }
  }

  const identityKey = flightRouteIdentityKey(identity)
  if (
    state.phase === 'idle' &&
    state.identityKey !== identityKey
  ) {
    return {
      state: { phase: 'idle', identityKey } as const,
      request,
    }
  }
  if (
    state.phase !== 'idle' &&
    state.identityKey !== identityKey
  ) {
    return {
      state: { phase: 'idle', identityKey } as const,
      request,
    }
  }

  return { state, request }
}
