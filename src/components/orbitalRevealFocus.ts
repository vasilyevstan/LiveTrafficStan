export const focusOrbitalRevealTarget = (details: HTMLDetailsElement) => {
  const target =
    details.querySelector<HTMLElement>('.orbital-results button') ??
    details.querySelector<HTMLElement>('#map-tools-panel-orbits')
  target?.focus()
}
