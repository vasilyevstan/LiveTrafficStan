import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppConfig } from '../config/appConfig'
import {
  aircraftPhotoIdentity,
  aircraftPhotoIdentityKey,
  type AircraftPhotoIdentity,
  type AircraftPhotoViewState,
} from '../domain/aircraftPhoto'
import type { Aircraft } from '../domain/traffic'
import type { AircraftPhotoProvider } from '../providers/aircraftPhoto/planespottersPhotoProvider'
import { AircraftPhotoController } from './AircraftPhotoController'

export const useAircraftPhoto = (
  aircraft: Pick<Aircraft, 'hex'> | undefined,
  provider: AircraftPhotoProvider,
  config: AppConfig['aircraftPhoto'],
) => {
  const [state, setState] = useState<AircraftPhotoViewState>({
    phase: 'idle',
  })
  const controller = useMemo(
    () =>
      new AircraftPhotoController(provider, {
        cacheMaxEntries: config.cacheMaxEntries,
        cacheTtlMs: config.cacheTtlMs,
        rateLimitFallbackMs: config.rateLimitFallbackMs,
      }),
    [
      config.cacheMaxEntries,
      config.cacheTtlMs,
      config.rateLimitFallbackMs,
      provider,
    ],
  )
  const aircraftHex = aircraft?.hex
  const identity = useMemo<AircraftPhotoIdentity | undefined>(
    () => (aircraftHex ? aircraftPhotoIdentity({ hex: aircraftHex }) : undefined),
    [aircraftHex],
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

  const identityKey = aircraftPhotoIdentityKey(identity)
  if (state.identityKey !== identityKey) {
    return {
      state: { phase: 'idle', identityKey } as const,
      request,
    }
  }
  return { state, request }
}
