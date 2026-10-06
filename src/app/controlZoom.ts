type ControlWheelEvent = Pick<
  WheelEvent,
  'ctrlKey' | 'cancelable' | 'defaultPrevented' | 'target' | 'preventDefault'
>

export const preventCompactControlWheelZoom = (event: ControlWheelEvent) => {
  if (
    !event.ctrlKey ||
    !event.cancelable ||
    event.defaultPrevented ||
    !(event.target instanceof Element)
  ) return

  if (event.target.closest(
    '.brand-panel:not(:has(details[open])), .workspace-dock:not(:has(details[open]))',
  )) {
    event.preventDefault()
  }
}
