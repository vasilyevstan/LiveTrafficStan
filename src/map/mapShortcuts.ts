export type MapActionShortcut = 'find' | 'center'

type MapShortcutEvent = Pick<
  KeyboardEvent,
  | 'key' | 'target' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'
  | 'repeat' | 'isComposing' | 'defaultPrevented' | 'preventDefault'
>

export const handleMapActionShortcut = (
  event: MapShortcutEvent,
  canvas: EventTarget,
  focusedElement: EventTarget | null,
  invoke: ((action: MapActionShortcut) => boolean) | undefined,
): boolean => {
  if (
    !invoke || event.target !== canvas || focusedElement !== canvas ||
    event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
    event.repeat || event.isComposing || event.defaultPrevented
  ) return false

  const key = event.key.toLowerCase()
  const action = key === 'f' ? 'find' : key === 'c' ? 'center' : undefined
  if (!action || !invoke(action)) return false
  event.preventDefault()
  return true
}
