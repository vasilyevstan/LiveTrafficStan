import { useEffect, useState, type ReactNode } from 'react'
import { startDeferredModuleLoad } from './deferredModuleLoader'

type DeferredModuleState<Module> =
  | { phase: 'idle' | 'loading' }
  | { phase: 'ready'; module: Module }
  | { phase: 'error'; error: Error }

interface DeferredModuleProps<Module> {
  active: boolean
  load: () => Promise<Module>
  children: (module: Module) => ReactNode
  pending: ReactNode
  failed: (error: Error, retry: () => void) => ReactNode
}

export function DeferredModule<Module>({
  active,
  load,
  children,
  pending,
  failed,
}: DeferredModuleProps<Module>) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<DeferredModuleState<Module>>({
    phase: 'idle',
  })

  useEffect(() => {
    if (!active) return
    setState({ phase: 'loading' })
    return startDeferredModuleLoad(
      load,
      (module) => {
        setState({ phase: 'ready', module })
      },
      (error) => {
        setState({
          phase: 'error',
          error,
        })
      },
    )
  }, [active, attempt, load])

  if (state.phase === 'ready') return children(state.module)
  if (!active) return null
  if (state.phase === 'error') {
    return failed(state.error, () => {
      setState({ phase: 'idle' })
      setAttempt((value) => value + 1)
    })
  }
  return pending
}
