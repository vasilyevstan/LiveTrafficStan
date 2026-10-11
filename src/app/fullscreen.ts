export interface FullscreenTarget {
  readonly isConnected: boolean
  requestFullscreen?(): Promise<void>
}

interface FullscreenDocument {
  readonly fullscreenEnabled?: boolean
  readonly fullscreenElement: FullscreenTarget | null
  exitFullscreen?(): Promise<void>
  addEventListener(
    type: 'fullscreenchange' | 'fullscreenerror',
    listener: (event: Event) => void,
  ): void
  removeEventListener(
    type: 'fullscreenchange' | 'fullscreenerror',
    listener: (event: Event) => void,
  ): void
}

export interface FullscreenState {
  available: boolean
  active: boolean
  pending: 'enter' | 'exit' | null
  message?: string
}

export const INITIAL_FULLSCREEN_STATE: FullscreenState = {
  available: false,
  active: false,
  pending: null,
}

export const FULLSCREEN_UNAVAILABLE_MESSAGE =
  'Native fullscreen is unavailable here.'

const failureMessage = (action: 'enter' | 'exit') =>
  action === 'enter'
    ? 'Fullscreen was declined. Try again.'
    : 'Could not exit. Use the browser exit control.'

export const workspaceOwnsFullscreen = (element: Element) => {
  const workspace = element.closest('.app-shell')
  return workspace !== null &&
    element.ownerDocument.fullscreenElement === workspace
}

export const createFullscreenSession = (
  target: FullscreenTarget,
  document: FullscreenDocument,
  onState: (state: FullscreenState) => void,
) => {
  let disposed = false
  let revision = 0
  let pending: { revision: number; action: 'enter' | 'exit' } | null = null
  let message: string | undefined
  let lastState: FullscreenState | undefined
  const ownsFullscreen = () => document.fullscreenElement === target
  const available = () =>
    target.isConnected &&
    document.fullscreenEnabled === true &&
    typeof target.requestFullscreen === 'function' &&
    typeof document.exitFullscreen === 'function'

  const publish = () => {
    if (disposed) return
    const state: FullscreenState = {
      available: available(),
      active: ownsFullscreen(),
      pending: pending?.action ?? null,
      message,
    }
    if (
      lastState?.available === state.available &&
      lastState.active === state.active &&
      lastState.pending === state.pending &&
      lastState.message === state.message
    ) return
    lastState = state
    onState(state)
  }

  const onChange = () => {
    if (lastState?.active !== ownsFullscreen()) message = undefined
    publish()
  }
  const onError = (event: Event) => {
    if (
      !pending ||
      (!Object.is(event.target, target) && !Object.is(event.target, document))
    ) return
    // Error events have no attempt identity; the matching promise owns feedback.
    publish()
  }
  const run = (action: 'enter' | 'exit', operation: () => Promise<void>) => {
    const attempt = ++revision
    pending = { revision: attempt, action }
    message = undefined
    publish()
    const finish = (failed = false) => {
      if (disposed || pending?.revision !== attempt) return
      if (failed && ownsFullscreen() === (action === 'exit')) {
        message = failureMessage(action)
      }
      pending = null
      publish()
    }
    try {
      void operation().then(() => finish(), () => finish(true))
    } catch {
      finish(true)
    }
  }

  document.addEventListener('fullscreenchange', onChange)
  document.addEventListener('fullscreenerror', onError)
  publish()

  return {
    enter() {
      if (disposed || pending || ownsFullscreen()) return
      const request = target.requestFullscreen
      if (!available() || !request) {
        message = FULLSCREEN_UNAVAILABLE_MESSAGE
        publish()
        return
      }
      if (document.fullscreenElement !== null) {
        message = 'Exit the other fullscreen view first.'
        publish()
        return
      }
      run('enter', () => request.call(target))
    },
    exit() {
      if (disposed || pending || !ownsFullscreen()) return
      const exit = document.exitFullscreen
      if (!exit) {
        message = failureMessage('exit')
        publish()
        return
      }
      run('exit', () => exit.call(document))
    },
    dispose() {
      disposed = true
      pending = null
      revision += 1
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('fullscreenerror', onError)
    },
  }
}
