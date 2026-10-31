export const focusOrbitalRevealTarget = (details: HTMLDetailsElement) => {
  const result = details.querySelector<HTMLElement>('.orbital-results button')
  const target =
    result ?? details.querySelector<HTMLElement>('#map-tools-panel-orbits')
  target?.focus()
  return result !== null
}
