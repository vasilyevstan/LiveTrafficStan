import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_CONFIG } from '../config/appConfig'
import type { TrafficEntity } from '../domain/traffic'
import {
  HistoryRepositoryError,
  IndexedDbHistoryRepository,
} from '../history/indexedDbHistory'
import { useTrafficHistory } from './useTrafficHistory'

const hooks = vi.hoisted(() => {
  const slots: unknown[] = []
  let cursor = 0
  let effects: (() => void)[] = []
  let dirty = false
  const cleanups = new Map<number, () => void>()
  const same = (left: readonly unknown[], right: readonly unknown[]) =>
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  const memo = <T>(factory: () => T, dependencies: readonly unknown[]): T => {
    const index = cursor++
    const previous = slots[index] as { value: T; dependencies: readonly unknown[] } | undefined
    if (!previous || !same(previous.dependencies, dependencies)) {
      slots[index] = { value: factory(), dependencies }
    }
    return (slots[index] as { value: T }).value
  }
  const state = <T>(initial: T | (() => T)) => {
    const cell = memo(() => ({
      value: typeof initial === 'function' ? (initial as () => T)() : initial,
    }), [])
    return [cell.value, (next: T | ((current: T) => T)) => {
      const value = typeof next === 'function' ? (next as (current: T) => T)(cell.value) : next
      if (!Object.is(value, cell.value)) {
        cell.value = value
        dirty = true
      }
    }] as const
  }
  return {
    begin: () => { cursor = 0; dirty = false },
    finish: () => {
      const pending = effects
      effects = []
      for (const effect of pending) effect()
      return dirty
    },
    reset: () => {
      for (const cleanup of cleanups.values()) cleanup()
      cleanups.clear()
      slots.length = 0
      effects = []
      cursor = 0
    },
    react: {
      useMemo: memo,
      useState: state,
      useRef: <T>(value: T) => memo(() => ({ current: value }), []),
      useCallback: <T>(callback: T, dependencies: readonly unknown[]) => memo(() => callback, dependencies),
      useReducer: <S, A>(reducer: (state: S, action: A) => S, initial: S) => {
        const [current, setState] = state(initial)
        return [current, (action: A) => setState(value => reducer(value, action))] as const
      },
      useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => {
        const index = cursor++
        const previous = slots[index] as readonly unknown[] | undefined
        if (previous && same(previous, dependencies)) return
        slots[index] = dependencies
        effects.push(() => {
          cleanups.get(index)?.()
          cleanups.delete(index)
          const cleanup = effect()
          if (cleanup) cleanups.set(index, cleanup)
        })
      },
    },
  }
})

vi.mock('react', () => hooks.react)

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(complete => { resolve = complete })
  return { promise, resolve }
}

describe('history lifecycle write admission', () => {
  let entities: readonly TrafficEntity[]
  let history: ReturnType<typeof useTrafficHistory>
  let reader: IndexedDbHistoryRepository
  const HistoryProbe = () => useTrafficHistory(entities, 0, APP_CONFIG.history)
  const render = () => {
    do {
      hooks.begin()
      history = HistoryProbe()
    } while (hooks.finish())
    return history
  }
  const settle = async (phase: string) => {
    await vi.waitFor(() => {
      render()
      expect(history.status.phase).toBe(phase)
    })
  }
  const observe = () => {
    const now = Date.now() + 1
    entities = [{
      id: 'aircraft:a00001',
      kind: 'aircraft',
      provider: 'ADSB.lol',
      hex: 'a00001',
      position: { observedAt: now, latitude: 59, longitude: 24 },
      receivedAt: now,
      markerIcon: 'aircraft',
      markerScale: 1,
    }]
    render()
  }

  beforeEach(async () => {
    entities = []
    const values = new Map<string, string>()
    vi.stubGlobal('indexedDB', new IDBFactory())
    vi.stubGlobal('BroadcastChannel', undefined)
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value) },
        removeItem: (key: string) => { values.delete(key) },
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setInterval: vi.fn(() => 1),
      clearInterval: vi.fn(),
    })
    vi.stubGlobal('document', {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    reader = new IndexedDbHistoryRepository()
    render()
    await settle('disabled')
  })

  afterEach(() => {
    hooks.reset()
    reader.close()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('records after sequential consent and retention changes', async () => {
    await history.setPersistenceEnabled(true)
    await history.setRetentionHours(6)
    observe()
    await vi.waitFor(async () => {
      render()
      expect((await reader.readAll()).records).toHaveLength(1)
    })
  })

  it.each(['enable', 'clear'] as const)(
    'keeps recording after retention supersedes the %s status update',
    async operation => {
      if (operation === 'clear') await history.setPersistenceEnabled(true)
      const entered = deferred()
      const release = deferred()
      const method = operation === 'clear' ? 'clear' : 'setRecordingEnabled'
      const original = IndexedDbHistoryRepository.prototype[method]
      vi.spyOn(IndexedDbHistoryRepository.prototype, method).mockImplementation(
        async function (this: IndexedDbHistoryRepository, enabled?: boolean) {
          entered.resolve()
          await release.promise
          return operation === 'clear'
            ? (original as IndexedDbHistoryRepository['clear']).call(this)
            : (original as IndexedDbHistoryRepository['setRecordingEnabled']).call(this, enabled ?? false)
        },
      )
      const pending = operation === 'clear'
        ? history.clearHistory()
        : history.setPersistenceEnabled(true)
      await entered.promise
      const retention = history.setRetentionHours(6)
      release.resolve()
      await Promise.all([pending, retention])
      await settle('ready')
      observe()
      expect(history.settings).toMatchObject({ enabled: true, retentionHours: 6 })
      expect(history.sessionSnapshot.records).toHaveLength(1)
      await vi.waitFor(async () => {
        render()
        expect((await reader.readAll()).records).toHaveLength(1)
      })
    },
  )

  it('does not let retention conceal a failed clear or resume its writes', async () => {
    await history.setPersistenceEnabled(true)
    const entered = deferred()
    const release = deferred()
    vi.spyOn(IndexedDbHistoryRepository.prototype, 'clear').mockImplementation(async () => {
      entered.resolve()
      await release.promise
      throw new HistoryRepositoryError('transaction-failed', 'Clear failed')
    })
    const clearing = history.clearHistory()
    await entered.promise
    const retention = history.setRetentionHours(6)
    release.resolve()
    await Promise.all([clearing, retention])
    render()
    expect(history.status.phase).not.toBe('ready')
    expect(history.status.message).toBe('Clear failed')
    observe()
    expect((await reader.readAll()).records).toHaveLength(0)
  })

  it('keeps quota suspension through a retention change', async () => {
    await history.setPersistenceEnabled(true)
    vi.spyOn(IndexedDbHistoryRepository.prototype, 'writeBatch').mockRejectedValue(
      new HistoryRepositoryError('quota-exceeded', 'Quota full'),
    )
    observe()
    await settle('quota-exceeded')
    await history.setRetentionHours(6)
    render()
    expect(history.status.phase).toBe('quota-exceeded')
    expect((await reader.readAll()).records).toHaveLength(0)
  })

  it('lets a newer disable fence both enable and retention completion', async () => {
    const entered = deferred()
    const release = deferred()
    const original = IndexedDbHistoryRepository.prototype.setRecordingEnabled
    vi.spyOn(IndexedDbHistoryRepository.prototype, 'setRecordingEnabled').mockImplementation(
      async function (this: IndexedDbHistoryRepository, enabled) {
        if (enabled) {
          entered.resolve()
          await release.promise
        }
        return original.call(this, enabled)
      },
    )
    const enabling = history.setPersistenceEnabled(true)
    await entered.promise
    const retention = history.setRetentionHours(6)
    const disabling = history.setPersistenceEnabled(false)
    release.resolve()
    await Promise.all([enabling, retention, disabling])
    await settle('disabled')
    observe()
    expect(history.settings.enabled).toBe(false)
    expect((await reader.readAll()).metadata.recordingEnabled).toBe(false)
    expect((await reader.readAll()).records).toHaveLength(0)
  })

  it('resumes a quota-suspended writer after clear overlaps retention', async () => {
    await history.setPersistenceEnabled(true)
    vi.spyOn(IndexedDbHistoryRepository.prototype, 'writeBatch').mockRejectedValueOnce(
      new HistoryRepositoryError('quota-exceeded', 'Quota full'),
    )
    observe()
    await settle('quota-exceeded')
    const entered = deferred()
    const release = deferred()
    const original = IndexedDbHistoryRepository.prototype.clear
    vi.spyOn(IndexedDbHistoryRepository.prototype, 'clear').mockImplementation(
      async function (this: IndexedDbHistoryRepository) {
        entered.resolve()
        await release.promise
        return original.call(this)
      },
    )
    const clearing = history.clearHistory()
    await entered.promise
    const retention = history.setRetentionHours(6)
    release.resolve()
    await Promise.all([clearing, retention])
    await settle('ready')
    observe()
    expect(history.sessionSnapshot.records).toHaveLength(1)
    await vi.waitFor(async () => {
      render()
      expect((await reader.readAll()).records).toHaveLength(1)
    })
  })
})
