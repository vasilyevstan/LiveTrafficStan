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
  capturePauseRevision?: number,
  capturedPositionId?: string,
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
  const capturePauseRef = useRef({ revision: capturePauseRevision, positionId: capturedPositionId })

  useEffect(() => {
    capturePauseRef.current = { revision: capturePauseRevision, positionId: capturedPositionId }
  }, [capturePauseRevision, capturedPositionId])

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
    const capture = capturePauseRef.current
    const owner = parseOrbitalFeatureId(capture.positionId)?.owner
    controller.setCapturePause(capture.revision, owner === 'curated' ? capture.positionId : undefined)
    starlinkController.setCapturePause(capture.revision, owner === 'starlink' ? capture.positionId : undefined)
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
    const owner = parseOrbitalFeatureId(capturedPositionId)?.owner
    for (const [controller, channelEnabled, channel] of [
      [controllerRef.current, enabled, 'curated'],
      [starlinkControllerRef.current, starlinkEnabled, 'starlink'],
    ] as const) {
      // Enter capture before other inputs; release only after other pauses apply.
      if (capturePauseRevision !== undefined) controller?.setCapturePause(
        capturePauseRevision, owner === channel ? capturedPositionId : undefined,
      )
      controller?.setEnabled(channelEnabled)
      controller?.setHistoryActive(historyActive)
      controller?.setOnline(online)
      if (capturePauseRevision === undefined) controller?.setCapturePause(undefined)
    }
  }, [capturePauseRevision, capturedPositionId, enabled, starlinkEnabled, historyActive, online])

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
  const acceptedPositionForCapture = useCallback((id: string) => {
    const selected = parseOrbitalFeatureId(id)
    return (selected?.owner === 'starlink' ? starlinkControllerRef : controllerRef)
      .current?.acceptedPositionForCapture(id)
  }, [])
  const retryStarlink = useCallback(
    () => starlinkControllerRef.current?.retry(),
    [],
  )

  return { state, retry, starlinkState, retryStarlink, acceptedPositionForCapture }
}
