import { useCallback, useEffect, useMemo, useState } from 'react'
import { VESSEL_PHOTO_CONFIG } from '../config/appConfig'
import {
  vesselPhotoIdentity,
  vesselPhotoIdentityKey,
  vesselReferencePhotoForSelection,
  type DynamicVesselPhoto,
  type VesselPhotoIdentity,
  type VesselPhotoViewState,
} from '../domain/vesselPhoto'
import type { Vessel } from '../domain/traffic'
import type { PhotoProvider } from '../providers/photo'
import { VesselPhotoController } from './VesselPhotoController'

export const useVesselPhoto = (
  vessel: Pick<Vessel, 'id' | 'mmsi' | 'imo'> | undefined,
  provider: PhotoProvider<VesselPhotoIdentity, DynamicVesselPhoto>,
) => {
  const [state, setState] = useState<VesselPhotoViewState>({ phase: 'idle' })
  const controller = useMemo(() => new VesselPhotoController(provider, VESSEL_PHOTO_CONFIG), [provider])
  const id = vessel?.id
  const mmsi = vessel?.mmsi
  const imo = vessel?.imo
  const identity = useMemo(() => {
    if (id === undefined || mmsi === undefined ||
      vesselReferencePhotoForSelection({ id, imo })) return undefined
    return vesselPhotoIdentity({ id, mmsi, imo })
  }, [id, mmsi, imo])

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState)
    return () => {
      unsubscribe()
      controller.dispose()
    }
  }, [controller])
  useEffect(() => {
    const update = () => {
      const activeIdentity = !document.hidden && navigator.onLine ? identity : undefined
      controller.select(activeIdentity)
      if (activeIdentity) controller.requestIfMissing(activeIdentity)
      if (identity && !navigator.onLine) {
        setState({ phase: 'error', identityKey: vesselPhotoIdentityKey(identity), reason: 'network' })
      }
    }
    update()
    document.addEventListener('visibilitychange', update)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [controller, identity])
  const request = useCallback(() => {
    if (identity && !document.hidden && navigator.onLine) controller.request(identity)
  }, [controller, identity])
  return {
    state: identity && state.identityKey === vesselPhotoIdentityKey(identity)
      ? state : { phase: 'idle' } as const,
    request,
  }
}
