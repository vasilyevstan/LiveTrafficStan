import { describe, expect, it, vi } from 'vitest'
import type {
  AircraftMetadataIdentity,
  AircraftMetadataLookupResult,
} from '../domain/aircraftMetadata'
import type { AircraftMetadataProvider } from '../providers/aircraftMetadata/staticAircraftMetadataProvider'
import { AircraftMetadataController } from './AircraftMetadataController'

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

const identities: Record<string, AircraftMetadataIdentity> = {
  first: {
    hex: 'ABC123',
    registration: 'ES-ABC',
    aircraftType: 'A320',
  },
  second: {
    hex: 'DEF456',
    registration: 'ES-DEF',
    aircraftType: 'H125',
  },
}

const available = (
  modelDescription: string,
): AircraftMetadataLookupResult => ({
  kind: 'available',
  metadata: {
    databaseRegistration: 'ES-ABC',
    typeCode: 'A320',
    modelDescription,
    confidence: 'registration-verified',
    source: {
      name: 'Fixture',
      repositoryUrl: 'https://example.test/source',
      publishedAt: '2026-09-13T07:35:29Z',
      outputVersion: 'test-v1',
      licenseName: 'ODC-By 1.0',
      licenseUrl: 'https://example.test/license',
    },
    staleAfterDays: 45,
    futureToleranceHours: 24,
  },
})

describe('AircraftMetadataController', () => {
  it('does not request metadata until an aircraft identity is selected', () => {
    const provider: AircraftMetadataProvider = {
      lookup: vi.fn(),
    }
    const controller = new AircraftMetadataController(provider)

    controller.subscribe(() => undefined)
    controller.select(undefined)

    expect(provider.lookup).not.toHaveBeenCalled()
  })

  it('prevents late A results from publishing after A to B to A', async () => {
    const requests = [
      deferred<AircraftMetadataLookupResult>(),
      deferred<AircraftMetadataLookupResult>(),
      deferred<AircraftMetadataLookupResult>(),
    ]
    const signals: AbortSignal[] = []
    const provider: AircraftMetadataProvider = {
      lookup: vi.fn((_identity, signal) => {
        signals.push(signal)
        const request = requests[signals.length - 1]
        if (!request) throw new Error('Unexpected request')
        return request.promise
      }),
    }
    const controller = new AircraftMetadataController(provider)
    const states: string[] = []
    controller.subscribe((state) => {
      states.push(
        state.phase === 'ready'
          ? `${state.phase}:${state.metadata.modelDescription}`
          : state.phase,
      )
    })

    controller.select(identities.first)
    controller.select(identities.second)
    controller.select(identities.first)
    expect(signals.map(({ aborted }) => aborted)).toEqual([
      true,
      true,
      false,
    ])

    requests[0].resolve(available('OBSOLETE A'))
    requests[1].resolve(available('OBSOLETE B'))
    await Promise.resolve()
    expect(states).not.toContain('ready:OBSOLETE A')
    expect(states).not.toContain('ready:OBSOLETE B')

    requests[2].resolve(available('CURRENT A'))
    await Promise.resolve()
    expect(states.at(-1)).toBe('ready:CURRENT A')
  })

  it('aborts and clears work for a vessel or no selection', () => {
    const request = deferred<AircraftMetadataLookupResult>()
    let signal: AbortSignal | undefined
    const provider: AircraftMetadataProvider = {
      lookup: vi.fn((_identity, requestSignal) => {
        signal = requestSignal
        return request.promise
      }),
    }
    const controller = new AircraftMetadataController(provider)
    const states: string[] = []
    controller.subscribe((state) => states.push(state.phase))

    controller.select(identities.first)
    controller.select(undefined)

    expect(signal?.aborted).toBe(true)
    expect(states.at(-1)).toBe('idle')
  })

  it('does not restart an unchanged identity and isolates old errors', async () => {
    const first = deferred<AircraftMetadataLookupResult>()
    const second = deferred<AircraftMetadataLookupResult>()
    const provider: AircraftMetadataProvider = {
      lookup: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    }
    const controller = new AircraftMetadataController(provider)
    const states: string[] = []
    controller.subscribe((state) => states.push(state.phase))

    controller.select(identities.first)
    controller.select({ ...identities.first })
    expect(provider.lookup).toHaveBeenCalledTimes(1)

    controller.select(identities.second)
    first.reject(new Error('Old failure'))
    await Promise.resolve()
    expect(states.at(-1)).toBe('loading')

    second.reject(new Error('Current failure'))
    await Promise.resolve()
    expect(states.at(-1)).toBe('error')
  })
})
