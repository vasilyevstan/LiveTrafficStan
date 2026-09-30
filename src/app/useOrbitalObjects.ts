import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppConfig } from '../config/appConfig'
import {
  EMPTY_ORBITAL_PREDICTION,
  type OrbitalControllerState,
} from '../domain/orbital'
import type { OrbitalDiscoveryFilters } from '../domain/orbitalDiscovery'
import type { OrbitalViewport } from '../domain/orbitalViewport'
import { OrbitalCatalogProvider } from '../providers/orbital/orbitalCatalogProvider'
import type { OrbitalWorkerLike } from '../workers/orbitalProtocol'
import { OrbitalController } from './OrbitalController'

const initialState = (): OrbitalControllerState => ({
  phase: 'disabled',
  acceptedCount: 0,
  positions: [],
  prediction: EMPTY_ORBITAL_PREDICTION,
})

const WAITING_FOR_VIEWPORT: OrbitalViewport = {
  kind: 'invalid',
  reason: 'invalid-geometry',
  message: 'Waiting for the committed map view to settle.',
}

const createOrbitalWorker = (): OrbitalWorkerLike =>
  new Worker(new URL('../workers/orbital.worker.ts', import.meta.url), {
    type: 'module',
    name: 'livetrafficstan-orbital-propagation',
  })

export const useOrbitalObjects = (
  enabled: boolean,
  historyActive: boolean,
  online: boolean,
  viewport: OrbitalViewport | undefined,
  selectedId: string | null,
  filters: OrbitalDiscoveryFilters,
  config: AppConfig['orbital'],
) => {
  const [state, setState] = useState<OrbitalControllerState>(initialState)
  const controllerRef = useRef<OrbitalController | undefined>(undefined)

  useEffect(() => {
    const controller = new OrbitalController({
      provider: new OrbitalCatalogProvider(config),
      workerFactory: createOrbitalWorker,
      config,
      onState: setState,
    })
    controllerRef.current = controller
    controller.start()

    const handleVisibilityChange = () => {
      controller.setPageVisible(!document.hidden)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    handleVisibilityChange()

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      controller.stop()
      controllerRef.current = undefined
    }
  }, [config])

  useEffect(() => {
    controllerRef.current?.setEnabled(enabled)
  }, [enabled])

  useEffect(() => {
    controllerRef.current?.setHistoryActive(historyActive)
  }, [historyActive])

  useEffect(() => {
    controllerRef.current?.setOnline(online)
  }, [online])

  useEffect(() => {
    controllerRef.current?.setViewport(viewport ?? WAITING_FOR_VIEWPORT)
  }, [viewport])

  useEffect(() => {
    controllerRef.current?.setSelectedId(selectedId)
  }, [selectedId])

  useEffect(() => {
    controllerRef.current?.setFilters(filters)
  }, [filters])

  const retry = useCallback(() => controllerRef.current?.retry(), [])

  return { state, retry }
}
