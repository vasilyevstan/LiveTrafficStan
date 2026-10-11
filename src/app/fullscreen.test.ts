import { describe, expect, it, vi } from 'vitest'
import {
  createFullscreenSession,
  FULLSCREEN_UNAVAILABLE_MESSAGE,
  type FullscreenState,
  type FullscreenTarget,
} from './fullscreen'

class FakeDocument extends EventTarget {
  fullscreenEnabled = true
  fullscreenElement: FullscreenTarget | null = null
  exitFullscreen = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
}

const fixture = () => {
  const target = {
    isConnected: true,
    requestFullscreen: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }
  const document = new FakeDocument()
  const states: FullscreenState[] = []
  const session = createFullscreenSession(target, document, state => states.push(state))
  const change = (element: FullscreenTarget | null) => {
    document.fullscreenElement = element
    document.dispatchEvent(new Event('fullscreenchange'))
  }
  return { target, document, session, states, change, state: () => states.at(-1)! }
}

const deferred = () => {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe('native workspace fullscreen', () => {
  it('calls the native request synchronously and does not infer active from resolution', async () => {
    const { target, session, state, change } = fixture()
    session.enter()
    expect(target.requestFullscreen).toHaveBeenCalledOnce()
    expect(state()).toMatchObject({ active: false, pending: 'enter' })
    await Promise.resolve()
    expect(state()).toMatchObject({ active: false, pending: null })
    change(target)
    expect(state().active).toBe(true)
  })

  it('keeps one native operation in flight even when change precedes resolution', async () => {
    const { target, document, session, state, change } = fixture()
    const request = deferred()
    target.requestFullscreen.mockReturnValue(request.promise)
    session.enter()
    change(target)
    session.enter()
    session.exit()
    expect(target.requestFullscreen).toHaveBeenCalledOnce()
    expect(document.exitFullscreen).not.toHaveBeenCalled()
    expect(state()).toMatchObject({ active: true, pending: 'enter' })
    request.resolve()
    await Promise.resolve()
    session.exit()
    expect(document.exitFullscreen).toHaveBeenCalledOnce()
  })

  it('preserves the native method receivers', async () => {
    const { target, document, session, change } = fixture()
    session.enter()
    expect(target.requestFullscreen.mock.contexts[0]).toBe(target)
    await Promise.resolve()
    change(target)
    session.exit()
    expect(document.exitFullscreen.mock.contexts[0]).toBe(document)
  })

  it.each(['disabled', 'detached', 'missing-request', 'missing-exit'] as const)(
    'reports native unavailability without simulation: %s',
    kind => {
      const document = new FakeDocument()
      const request = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const target: FullscreenTarget = {
        isConnected: kind !== 'detached',
        ...(kind === 'missing-request' ? {} : { requestFullscreen: request }),
      }
      if (kind === 'disabled') document.fullscreenEnabled = false
      const port = kind === 'missing-exit'
        ? {
            get fullscreenEnabled() { return document.fullscreenEnabled },
            get fullscreenElement() { return document.fullscreenElement },
            addEventListener: document.addEventListener.bind(document),
            removeEventListener: document.removeEventListener.bind(document),
          }
        : document
      const states: FullscreenState[] = []
      const session = createFullscreenSession(target, port, state => states.push(state))
      session.enter()
      expect(request).not.toHaveBeenCalled()
      expect(states.at(-1)).toMatchObject({
        available: false, active: false, pending: null,
        message: FULLSCREEN_UNAVAILABLE_MESSAGE,
      })
    },
  )

  it('does not enter over or exit a foreign fullscreen owner', () => {
    const { document, target, session, state, change } = fixture()
    change({ isConnected: true })
    session.enter()
    session.exit()
    expect(target.requestFullscreen).not.toHaveBeenCalled()
    expect(document.exitFullscreen).not.toHaveBeenCalled()
    expect(state().message).toBe('Exit the other fullscreen view first.')
  })

  it('reports a boolean unavailable state when the browser has no capability flag', () => {
    const { target, document } = fixture()
    const states: FullscreenState[] = []
    const session = createFullscreenSession(target, {
      fullscreenElement: null,
      exitFullscreen: document.exitFullscreen,
      addEventListener: document.addEventListener.bind(document),
      removeEventListener: document.removeEventListener.bind(document),
    }, state => states.push(state))
    session.enter()
    expect(states.at(-1)?.available).toBe(false)
    expect(target.requestFullscreen).not.toHaveBeenCalled()
    session.dispose()
  })

  it.each(['throw', 'reject'] as const)('surfaces a native entry %s and allows an explicit retry', async kind => {
    const { target, session, state } = fixture()
    target.requestFullscreen.mockImplementationOnce(() => {
      if (kind === 'throw') throw new Error('Native failure')
      return Promise.reject(new Error('Native failure'))
    })
    session.enter()
    await Promise.resolve()
    expect(state()).toMatchObject({
      active: false, pending: null, message: 'Fullscreen was declined. Try again.',
    })
    session.enter()
    expect(target.requestFullscreen).toHaveBeenCalledTimes(2)
    expect(state().message).toBeUndefined()
  })

  it('deduplicates error-event and rejection feedback without releasing a pending operation early', async () => {
    const { target, document, session, states, state } = fixture()
    const request = deferred()
    target.requestFullscreen.mockReturnValue(request.promise)
    session.enter()
    document.dispatchEvent(new Event('fullscreenerror'))
    const notifications = states.length
    document.dispatchEvent(new Event('fullscreenerror'))
    expect(states).toHaveLength(notifications)
    expect(state().pending).toBe('enter')
    request.reject(new Error('Native rejection'))
    await Promise.resolve()
    expect(state()).toMatchObject({ pending: null, active: false })
    expect(state().message).toBe('Fullscreen was declined. Try again.')
  })

  it('does not attribute a late unstructured error event to a newer attempt', async () => {
    const { target, document, session, state } = fixture()
    target.requestFullscreen.mockRejectedValueOnce(new Error('First rejection'))
    session.enter()
    await Promise.resolve()
    const retry = deferred()
    target.requestFullscreen.mockReturnValue(retry.promise)
    session.enter()
    document.dispatchEvent(new Event('fullscreenerror'))
    expect(state()).toMatchObject({ pending: 'enter', message: undefined })
    retry.resolve()
    await Promise.resolve()
    expect(state().message).toBeUndefined()
  })

  it('leaves failed exit active, accepts retry and observes browser exit without reentry', async () => {
    const { target, document, session, state, change } = fixture()
    change(target)
    document.exitFullscreen.mockRejectedValueOnce(new Error('Native exit failure'))
    session.exit()
    await Promise.resolve()
    expect(state()).toMatchObject({
      active: true, pending: null,
      message: 'Could not exit. Use the browser exit control.',
    })
    session.exit()
    await Promise.resolve()
    change(null)
    expect(state()).toMatchObject({ active: false, pending: null })
    expect(state().message).toBeUndefined()
    expect(target.requestFullscreen).not.toHaveBeenCalled()
  })

  it('does not replace a completed browser exit with a late exit rejection', async () => {
    const { target, document, session, state, change } = fixture()
    const exit = deferred()
    document.exitFullscreen.mockReturnValue(exit.promise)
    change(target)
    session.exit()
    change(null)
    exit.reject(new Error('The browser has already exited'))
    await Promise.resolve()
    expect(state()).toMatchObject({ active: false, pending: null, message: undefined })
  })

  it('fences an old lifetime after remounting the same workspace', async () => {
    const { target, document, session, change } = fixture()
    const oldRequest = deferred()
    target.requestFullscreen.mockReturnValueOnce(oldRequest.promise)
    session.enter()
    session.dispose()
    const currentStates: FullscreenState[] = []
    const current = createFullscreenSession(target, document, state => currentStates.push(state))
    const request = deferred()
    target.requestFullscreen.mockReturnValueOnce(request.promise)
    current.enter()
    oldRequest.reject(new Error('Old request'))
    document.dispatchEvent(new Event('fullscreenerror'))
    await Promise.resolve()
    expect(currentStates.at(-1)).toMatchObject({ pending: 'enter', message: undefined })
    change(target)
    request.resolve()
    await Promise.resolve()
    expect(currentStates.at(-1)).toMatchObject({ active: true, pending: null, message: undefined })
    current.dispose()
  })

  it('ignores an obsolete lifetime and does not exit another owner on disposal', async () => {
    const { target, document, session, states, change } = fixture()
    const request = deferred()
    target.requestFullscreen.mockReturnValue(request.promise)
    session.enter()
    session.dispose()
    const notifications = states.length
    change({ isConnected: true })
    request.reject(new Error('Late rejection'))
    await Promise.resolve()
    document.dispatchEvent(new Event('fullscreenerror'))
    expect(states).toHaveLength(notifications)
    expect(document.exitFullscreen).not.toHaveBeenCalled()
    const nextStates: FullscreenState[] = []
    const next = createFullscreenSession(target, document, state => nextStates.push(state))
    change(target)
    expect(nextStates.at(-1)?.active).toBe(true)
    expect(states).toHaveLength(notifications)
    next.dispose()
  })
})
