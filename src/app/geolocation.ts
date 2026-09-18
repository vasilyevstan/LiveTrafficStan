import type { AppCenter } from '../config/appConfig'
import { centerFromCoordinates } from '../domain/center'

export type BrowserLocationPermission =
  | PermissionState
  | 'unsupported'
  | 'unavailable'
  | 'insecure'

export type BrowserLocationFailure =
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'insecure'

export interface BrowserLocationSettings {
  coordinatePrecision: number
  timeoutMs: number
  maximumAgeMs: number
}

interface BrowserPermissionStatus {
  state: PermissionState
  addEventListener?(
    type: 'change',
    listener: () => void,
  ): void
  removeEventListener?(
    type: 'change',
    listener: () => void,
  ): void
}

interface BrowserPermissions {
  query(descriptor: PermissionDescriptor): Promise<BrowserPermissionStatus>
}

interface BrowserGeolocation {
  getCurrentPosition(
    success: (position: GeolocationPosition) => void,
    error?: (error: GeolocationPositionError) => void,
    options?: PositionOptions,
  ): void
}

export interface BrowserLocationEnvironment {
  secure: boolean
  geolocation?: BrowserGeolocation
  permissions?: BrowserPermissions
}

export class BrowserLocationError extends Error {
  readonly reason: BrowserLocationFailure

  constructor(reason: BrowserLocationFailure) {
    super(reason)
    this.name = 'BrowserLocationError'
    this.reason = reason
  }
}

export const getBrowserLocationEnvironment =
  (): BrowserLocationEnvironment => ({
    secure: window.isSecureContext,
    geolocation: navigator.geolocation,
    permissions: navigator.permissions,
  })

export const readBrowserLocationPermission = async (
  environment: BrowserLocationEnvironment,
): Promise<BrowserLocationPermission> => {
  if (!environment.secure) return 'insecure'
  if (!environment.geolocation) return 'unavailable'
  if (!environment.permissions) return 'unsupported'

  try {
    const status = await environment.permissions.query({
      name: 'geolocation',
    })
    return status.state
  } catch {
    return 'unsupported'
  }
}

export const subscribeBrowserLocationPermission = async (
  environment: BrowserLocationEnvironment,
  listener: (permission: PermissionState) => void,
) => {
  if (
    !environment.secure ||
    !environment.geolocation ||
    !environment.permissions
  ) {
    return () => undefined
  }

  try {
    const status = await environment.permissions.query({
      name: 'geolocation',
    })
    if (!status.addEventListener || !status.removeEventListener) {
      return () => undefined
    }

    const handleChange = () => listener(status.state)
    status.addEventListener('change', handleChange)
    return () => status.removeEventListener?.('change', handleChange)
  } catch {
    return () => undefined
  }
}

const failureFromPositionError = (
  error: GeolocationPositionError,
): BrowserLocationFailure => {
  if (error.code === 1) return 'denied'
  if (error.code === 3) return 'timeout'
  return 'unavailable'
}

export const requestBrowserLocation = (
  environment: BrowserLocationEnvironment,
  settings: BrowserLocationSettings,
): Promise<AppCenter> => {
  if (!environment.secure) {
    return Promise.reject(new BrowserLocationError('insecure'))
  }
  if (!environment.geolocation) {
    return Promise.reject(new BrowserLocationError('unavailable'))
  }

  return new Promise((resolve, reject) => {
    environment.geolocation!.getCurrentPosition(
      (position) => {
        resolve(
          centerFromCoordinates(
            {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            settings.coordinatePrecision,
            'Near you',
          ),
        )
      },
      (error) => {
        reject(new BrowserLocationError(failureFromPositionError(error)))
      },
      {
        enableHighAccuracy: false,
        timeout: settings.timeoutMs,
        maximumAge: settings.maximumAgeMs,
      },
    )
  })
}

export const browserLocationFailureMessage = (
  reason: BrowserLocationFailure,
) => {
  switch (reason) {
    case 'denied':
      return 'Location permission is blocked; keeping the current home area.'
    case 'timeout':
      return 'Location lookup timed out; keeping the current home area.'
    case 'insecure':
      return 'Location needs HTTPS or localhost; using the configured home area.'
    case 'unavailable':
      return 'Browser location is unavailable; keeping the current home area.'
  }
}
