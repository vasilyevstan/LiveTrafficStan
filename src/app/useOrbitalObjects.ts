import { useCallback, useEffect, useRef, useState } from 'react'
import { APP_CONFIG, type AppConfig } from '../config/appConfig'
import {
  EMPTY_ORBITAL_PREDICTION,
  parseOrbitalFeatureId,
  type OrbitalControllerState,
} from '../domain/orbital'
import {
  DEFAULT_ORBITAL_DISCOVERY_FILTERS,
  type OrbitalDiscoveryFilters,
} from '../domain/orbitalDiscovery'
import type { OrbitalViewport } from '../domain/orbitalViewport'
import { OrbitalCatalogProvider } from '../providers/orbital/orbitalCatalogProvider'
import { StarlinkCatalogProvider } from '../providers/orbital/starlinkCatalogProvider'
import { OrbitalWorkerHub } from '../workers/orbitalWorkerHub'
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

export interface StarlinkOrbitalHookOptions {
  enabled: boolean
  config?: AppConfig['starlink']
}

export const useOrbitalObjects = (
  enabled: boolean,
  historyActive: boolean,
  online: boolean,
  viewport: OrbitalViewport | undefined,
  selectedId: string | null,
  filters: OrbitalDiscoveryFilters,
  config: AppConfig['orbital'],
  starlinkOptions?: StarlinkOrbitalHookOptions,
) => {
  const [state, setState] = useState<OrbitalControllerState>(initialState)
  const [starlinkState, setStarlinkState] =
    useState<OrbitalControllerState>(initialState)
  const controllerRef = useRef<OrbitalController | undefined>(undefined)
  const starlinkControllerRef =
    useRef<OrbitalController | undefined>(undefined)
  const starlinkConfig =
    starlinkOptions?.config ?? APP_CONFIG.starlink
  const starlinkEnabled = starlinkOptions?.enabled ?? false

  useEffect(() => {
    const workerHub = new OrbitalWorkerHub()
    const controller = new OrbitalController({
      provider: new OrbitalCatalogProvider(config),
      workerFactory: () => workerHub.createChannel('curated'),
      config,
      onState: setState,
    })
    const starlinkController = new OrbitalController({
      provider: new StarlinkCatalogProvider(starlinkConfig),
      workerFactory: () => workerHub.createChannel('starlink'),
      config: starlinkConfig,
      onState: setStarlinkState,
    })
    controllerRef.current = controller
    starlinkControllerRef.current = starlinkController
    controller.start()
    starlinkController.start()
    starlinkController.setFilters(DEFAULT_ORBITAL_DISCOVERY_FILTERS)

    const handleVisibilityChange = () => {
      const visible = !document.hidden
      controller.setPageVisible(visible)
      starlinkController.setPageVisible(visible)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    handleVisibilityChange()

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      controller.stop()
      starlinkController.stop()
      workerHub.dispose()
      controllerRef.current = undefined
      starlinkControllerRef.current = undefined
    }
  }, [config, starlinkConfig])

  useEffect(() => {
    controllerRef.current?.setEnabled(enabled)
  }, [enabled])

  useEffect(() => {
    starlinkControllerRef.current?.setEnabled(starlinkEnabled)
  }, [starlinkEnabled])

  useEffect(() => {
    controllerRef.current?.setHistoryActive(historyActive)
    starlinkControllerRef.current?.setHistoryActive(historyActive)
  }, [historyActive])

  useEffect(() => {
    controllerRef.current?.setOnline(online)
    starlinkControllerRef.current?.setOnline(online)
  }, [online])

  useEffect(() => {
    const committedViewport = viewport ?? WAITING_FOR_VIEWPORT
    controllerRef.current?.setViewport(committedViewport)
    starlinkControllerRef.current?.setViewport(committedViewport)
  }, [viewport])

  useEffect(() => {
    const selected = parseOrbitalFeatureId(selectedId)
    controllerRef.current?.setSelectedId(
      selected?.owner === 'curated' ? selected.id : null,
    )
    starlinkControllerRef.current?.setSelectedId(
      selected?.owner === 'starlink' ? selected.id : null,
    )
  }, [selectedId])

  useEffect(() => {
    controllerRef.current?.setFilters(filters)
  }, [filters])

  const retry = useCallback(() => controllerRef.current?.retry(), [])
  const retryStarlink = useCallback(
    () => starlinkControllerRef.current?.retry(),
    [],
  )

  return { state, retry, starlinkState, retryStarlink }
}
