import { useEffect, useMemo, useState } from 'react'
import type {
  AircraftMetadataControllerState,
  AircraftMetadataIdentity,
} from '../domain/aircraftMetadata'
import {
  aircraftMetadataIdentity,
  aircraftMetadataIdentityKey,
  evaluateAircraftMetadataState,
} from '../domain/aircraftMetadata'
import type { Aircraft } from '../domain/traffic'
import type { AircraftMetadataProvider } from '../providers/aircraftMetadata/staticAircraftMetadataProvider'
import { AircraftMetadataController } from './AircraftMetadataController'

export const useAircraftMetadata = (
  aircraft: Pick<Aircraft, 'hex' | 'registration' | 'aircraftType'> | undefined,
  provider: AircraftMetadataProvider,
  now: number,
) => {
  const [state, setState] = useState<AircraftMetadataControllerState>({
    phase: 'idle',
  })
  const controller = useMemo(
    () => new AircraftMetadataController(provider),
    [provider],
  )
  const aircraftHex = aircraft?.hex
  const aircraftRegistration = aircraft?.registration
  const aircraftType = aircraft?.aircraftType
  const identity = useMemo<AircraftMetadataIdentity | undefined>(
    () =>
      aircraftHex
        ? aircraftMetadataIdentity({
            hex: aircraftHex,
            registration: aircraftRegistration,
            aircraftType,
          })
        : undefined,
    [aircraftHex, aircraftRegistration, aircraftType],
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

  if (!identity) return { phase: 'idle' } as const
  const identityKey = aircraftMetadataIdentityKey(identity)
  if (
    state.phase === 'idle' ||
    state.identityKey !== identityKey
  ) {
    return { phase: 'loading', identityKey } as const
  }
  return evaluateAircraftMetadataState(state, now)
}
