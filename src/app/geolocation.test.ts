import { describe, expect, it, vi } from 'vitest'
import {
  BrowserLocationError,
  browserLocationFailureMessage,
  readBrowserLocationPermission,
  requestBrowserLocation,
  subscribeBrowserLocationPermission,
  type BrowserLocationEnvironment,
} from './geolocation'

const settings = {
  coordinatePrecision: 3,
  timeoutMs: 8_000,
  maximumAgeMs: 300_000,
}

describe('browser geolocation', () => {
  it('checks permission without causing a location prompt', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'granted' })
    const getCurrentPosition = vi.fn()
    const environment: BrowserLocationEnvironment = {
      secure: true,
      permissions: { query },
      geolocation: { getCurrentPosition },
    }

    await expect(readBrowserLocationPermission(environment)).resolves.toBe(
      'granted',
    )
    expect(query).toHaveBeenCalledWith({ name: 'geolocation' })
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('falls back to explicit action when permission lookup is unsupported', async () => {
    const environment: BrowserLocationEnvironment = {
      secure: true,
      permissions: {
        query: vi.fn().mockRejectedValue(new Error('unsupported')),
      },
      geolocation: { getCurrentPosition: vi.fn() },
    }

    await expect(readBrowserLocationPermission(environment)).resolves.toBe(
      'unsupported',
    )
  })

  it('observes a permission change without starting continuous location tracking', async () => {
    let changeListener: (() => void) | undefined
    const status = {
      state: 'prompt' as PermissionState,
      addEventListener: vi.fn(
        (_type: 'change', listener: () => void) => {
          changeListener = listener
        },
      ),
      removeEventListener: vi.fn(),
    }
    const listener = vi.fn()
    const environment: BrowserLocationEnvironment = {
      secure: true,
      permissions: {
        query: vi.fn().mockResolvedValue(status),
      },
      geolocation: { getCurrentPosition: vi.fn() },
    }

    const unsubscribe = await subscribeBrowserLocationPermission(
      environment,
      listener,
    )
    status.state = 'granted'
    changeListener?.()

    expect(listener).toHaveBeenCalledWith('granted')
    unsubscribe()
    expect(status.removeEventListener).toHaveBeenCalledWith(
      'change',
      changeListener,
    )
  })

  it('rounds a one-shot location and uses privacy-conscious options', async () => {
    const getCurrentPosition = vi.fn((success) => {
      success({
        coords: {
          latitude: 59.43749,
          longitude: 24.7536,
        },
      })
    })
    const environment: BrowserLocationEnvironment = {
      secure: true,
      geolocation: { getCurrentPosition },
    }

    await expect(requestBrowserLocation(environment, settings)).resolves.toEqual(
      {
        latitude: 59.437,
        longitude: 24.754,
        label: 'Near you',
      },
    )
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      {
        enableHighAccuracy: false,
        timeout: 8_000,
        maximumAge: 300_000,
      },
    )
  })

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ] as const)(
    'keeps geolocation error code %s explicit',
    async (code, reason) => {
      const environment: BrowserLocationEnvironment = {
        secure: true,
        geolocation: {
          getCurrentPosition: (_success, error) => {
            error?.({ code } as GeolocationPositionError)
          },
        },
      }

      await expect(
        requestBrowserLocation(environment, settings),
      ).rejects.toEqual(
        new BrowserLocationError(reason),
      )
      expect(browserLocationFailureMessage(reason)).toBeTruthy()
    },
  )

  it('does not offer an insecure-context location request', async () => {
    const environment: BrowserLocationEnvironment = {
      secure: false,
      geolocation: { getCurrentPosition: vi.fn() },
    }

    await expect(readBrowserLocationPermission(environment)).resolves.toBe(
      'insecure',
    )
    await expect(requestBrowserLocation(environment, settings)).rejects.toEqual(
      new BrowserLocationError('insecure'),
    )
  })
})
