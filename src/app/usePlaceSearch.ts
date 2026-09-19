import { useCallback, useEffect, useState } from 'react'
import type { AppConfig } from '../config/appConfig'
import { PhotonPlaceSearchProvider } from '../providers/geocoding/photonProvider'
import {
  PlaceSearchController,
  type PlaceSearchState,
} from './PlaceSearchController'

export const usePlaceSearch = (
  config: AppConfig['geocoder'],
  coordinatePrecision: number,
) => {
  const [state, setState] = useState<PlaceSearchState>({ phase: 'idle' })
  const [controller] = useState(
    () =>
      new PlaceSearchController({
        provider: new PhotonPlaceSearchProvider({
          endpointBaseUrl: config.endpointBaseUrl,
          resultLimit: config.resultLimit,
          coordinatePrecision,
        }),
        config,
        onState: setState,
      }),
  )

  useEffect(
    () => () => {
      controller.stop()
    },
    [controller],
  )

  const search = useCallback(
    (query: string) => {
      void controller.search(query)
    },
    [controller],
  )

  const cancel = useCallback(
    () => {
      controller.cancel()
    },
    [controller],
  )

  return { state, search, cancel }
}
