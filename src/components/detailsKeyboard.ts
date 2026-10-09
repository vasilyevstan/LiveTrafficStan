import type { KeyboardEvent } from 'react'

type CloseKeyEvent = Pick<
  KeyboardEvent<HTMLElement>,
  'key' | 'defaultPrevented' | 'preventDefault' | 'stopPropagation'
>

export const closeDetailsOnEscape = (
  event: CloseKeyEvent,
  onClose: () => void,
) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  event.preventDefault()
  event.stopPropagation()
  onClose()
}
