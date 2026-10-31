import { describe, expect, it, vi } from 'vitest'
import { startDeferredModuleLoad } from './deferredModuleLoader'

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('deferred module loading', () => {
  it('delivers a loaded module once', async () => {
    const ready = vi.fn()
    const failed = vi.fn()

    startDeferredModuleLoad(
      async () => ({ value: 'ready' }),
      ready,
      failed,
    )
    await settle()

    expect(ready).toHaveBeenCalledOnce()
    expect(ready).toHaveBeenCalledWith({ value: 'ready' })
    expect(failed).not.toHaveBeenCalled()
  })

  it('fences stale completion after cancellation', async () => {
    const ready = vi.fn()
    const failed = vi.fn()
    let resolve!: (module: { value: string }) => void
    const load = () => new Promise<{ value: string }>((next) => {
      resolve = next
    })

    const cancel = startDeferredModuleLoad(load, ready, failed)
    cancel()
    resolve({ value: 'stale' })
    await settle()

    expect(ready).not.toHaveBeenCalled()
    expect(failed).not.toHaveBeenCalled()
  })

  it('normalizes failures and permits an explicit later retry', async () => {
    const ready = vi.fn()
    const failed = vi.fn()

    startDeferredModuleLoad(
      async () => Promise.reject('chunk unavailable'),
      ready,
      failed,
    )
    await settle()

    expect(failed).toHaveBeenCalledOnce()
    expect(failed.mock.calls[0]?.[0]).toEqual(
      new Error('chunk unavailable'),
    )

    startDeferredModuleLoad(
      async () => ({ value: 'retried' }),
      ready,
      failed,
    )
    await settle()

    expect(ready).toHaveBeenCalledWith({ value: 'retried' })
  })
})
