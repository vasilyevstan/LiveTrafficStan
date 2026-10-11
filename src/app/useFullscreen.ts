import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  createFullscreenSession,
  INITIAL_FULLSCREEN_STATE,
} from './fullscreen'

export const useFullscreen = (
  targetRef: RefObject<HTMLElement | null>,
  onTransition: (active: boolean) => void,
) => {
  const [state, setState] = useState(INITIAL_FULLSCREEN_STATE)
  const sessionRef = useRef<ReturnType<typeof createFullscreenSession> | null>(null)

  useEffect(() => {
    const target = targetRef.current
    if (!target) return
    let active = false
    const session = createFullscreenSession(target, target.ownerDocument, next => {
      if (active !== next.active) onTransition(next.active)
      active = next.active
      setState(next)
    })
    sessionRef.current = session
    return () => {
      session.dispose()
      if (sessionRef.current === session) sessionRef.current = null
    }
  }, [targetRef, onTransition])

  const enter = useCallback(() => sessionRef.current?.enter(), [])
  const exit = useCallback(() => sessionRef.current?.exit(), [])
  return { state, enter, exit }
}
