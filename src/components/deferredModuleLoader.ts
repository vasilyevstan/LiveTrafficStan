export const startDeferredModuleLoad = <Module,>(
  load: () => Promise<Module>,
  onReady: (module: Module) => void,
  onError: (error: Error) => void,
) => {
  let current = true
  void load().then(
    (module) => {
      if (current) onReady(module)
    },
    (error: unknown) => {
      if (!current) return
      onError(error instanceof Error ? error : new Error(String(error)))
    },
  )
  return () => {
    current = false
  }
}
