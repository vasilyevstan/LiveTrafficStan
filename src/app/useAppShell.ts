import { useCallback, useEffect, useRef, useState } from 'react'

export type AppShellPhase =
  | 'disabled'
  | 'registering'
  | 'ready'
  | 'update-available'
  | 'activating'
  | 'unsupported'
  | 'retiring'
  | 'error'

export interface AppShellState {
  phase: AppShellPhase
  message?: string
}

const normalBuild = import.meta.env.PROD && import.meta.env.MODE !== 'pwa-retire'
const retirementBuild = import.meta.env.PROD && import.meta.env.MODE === 'pwa-retire'

export const isFailedInitialInstall = (
  workerState: ServiceWorkerState,
  hasActiveWorker: boolean,
  hasController: boolean,
) =>
  workerState === 'redundant' &&
  !hasActiveWorker &&
  !hasController

const initialState = (): AppShellState =>
  normalBuild
    ? {
        phase: 'registering',
        message: 'Preparing the offline application shell.',
      }
    : retirementBuild
      ? {
          phase: 'retiring',
          message: 'Retiring the offline application shell.',
        }
      : { phase: 'disabled' }

export const useAppShell = () => {
  const [state, setState] = useState<AppShellState>(initialState)
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(
    undefined,
  )

  useEffect(() => {
    if (!normalBuild && !retirementBuild) return
    if (
      !window.isSecureContext ||
      !('serviceWorker' in navigator)
    ) {
      setState({
        phase: 'unsupported',
        message:
          'Offline application-shell support is unavailable in this browser.',
      })
      return
    }

    let disposed = false
    let reloadStarted = false
    let reloadTimer: number | undefined
    let retirementNavigation = false
    const cleanups: (() => void)[] = []
    const serviceWorker = navigator.serviceWorker
    const hadController = serviceWorker.controller !== null

    const setCurrentState = (nextState: AppShellState) => {
      if (!disposed) setState(nextState)
    }

    const handleWorkerMessage = (event: MessageEvent<unknown>) => {
      if (
        typeof event.data !== 'object' ||
        event.data === null ||
        !('type' in event.data) ||
        event.data.type !== 'APP_SHELL_RETIRED'
      ) {
        return
      }
      retirementNavigation = true
      if (reloadTimer !== undefined) {
        window.clearTimeout(reloadTimer)
        reloadTimer = undefined
      }
    }
    serviceWorker.addEventListener('message', handleWorkerMessage)
    cleanups.push(() =>
      serviceWorker.removeEventListener('message', handleWorkerMessage),
    )

    if (retirementBuild) {
      void serviceWorker
        .getRegistration('/')
        .then((registration) => registration?.update())
        .catch((error: unknown) => {
          setCurrentState({
            phase: 'error',
            message:
              error instanceof Error
                ? `Application-shell retirement failed: ${error.message}`
                : 'Application-shell retirement failed.',
          })
        })
      return () => {
        disposed = true
        for (const cleanup of cleanups) cleanup()
      }
    }

    const handleControllerChange = () => {
      if (!hadController || reloadStarted) return
      reloadStarted = true
      reloadTimer = window.setTimeout(() => {
        if (!retirementNavigation) window.location.reload()
      }, 250)
    }
    serviceWorker.addEventListener(
      'controllerchange',
      handleControllerChange,
    )
    cleanups.push(() =>
      serviceWorker.removeEventListener(
        'controllerchange',
        handleControllerChange,
      ),
    )

    const observeInstallingWorker = (
      registration: ServiceWorkerRegistration,
      worker: ServiceWorker,
    ) => {
      const handleStateChange = () => {
        if (
          isFailedInitialInstall(
            worker.state,
            registration.active !== null,
            serviceWorker.controller !== null,
          )
        ) {
          setCurrentState({
            phase: 'error',
            message:
              'Offline application shell unavailable: installation failed.',
          })
          return
        }
        if (
          worker.state === 'installed' &&
          serviceWorker.controller &&
          registration.waiting
        ) {
          setCurrentState({
            phase: 'update-available',
            message: 'An application update is ready.',
          })
        }
      }
      worker.addEventListener('statechange', handleStateChange)
      cleanups.push(() =>
        worker.removeEventListener('statechange', handleStateChange),
      )
      handleStateChange()
    }

    void serviceWorker
      .register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
      .then(async (registration) => {
        if (disposed) return
        registrationRef.current = registration

        const handleUpdateFound = () => {
          if (registration.installing) {
            observeInstallingWorker(
              registration,
              registration.installing,
            )
          }
        }
        registration.addEventListener('updatefound', handleUpdateFound)
        cleanups.push(() =>
          registration.removeEventListener(
            'updatefound',
            handleUpdateFound,
          ),
        )
        if (registration.installing) {
          observeInstallingWorker(registration, registration.installing)
        }

        if (registration.waiting && serviceWorker.controller) {
          setCurrentState({
            phase: 'update-available',
            message: 'An application update is ready.',
          })
        } else {
          await serviceWorker.ready
          setCurrentState({
            phase: 'ready',
            message:
              'Offline application shell ready. Live traffic and basemap tiles are not cached.',
          })
        }

        try {
          await registration.update()
        } catch {
          // The installed shell remains usable when an update check is offline.
        }
      })
      .catch((error: unknown) => {
        setCurrentState({
          phase: 'error',
          message:
            error instanceof Error
              ? `Offline application shell unavailable: ${error.message}`
              : 'Offline application shell unavailable.',
        })
      })

    return () => {
      disposed = true
      if (reloadTimer !== undefined) window.clearTimeout(reloadTimer)
      registrationRef.current = undefined
      for (const cleanup of cleanups) cleanup()
    }
  }, [])

  const activateUpdate = useCallback(() => {
    const waiting = registrationRef.current?.waiting
    if (!waiting) {
      setState({
        phase: 'error',
        message: 'The waiting application update is no longer available.',
      })
      return
    }
    setState({
      phase: 'activating',
      message: 'Applying the application update.',
    })
    waiting.postMessage({ type: 'ACTIVATE_UPDATE' })
  }, [])

  return {
    ...state,
    updateAvailable: state.phase === 'update-available',
    activateUpdate,
  }
}
