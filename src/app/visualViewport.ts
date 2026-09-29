export const visualViewportCssValues = (height: number) => {
  if (!Number.isFinite(height) || height <= 0) return undefined

  const cssPixels = (value: number) =>
    `${Math.round(value * 100) / 100}px`

  return {
    height: cssPixels(height),
    controlBudget: cssPixels(height * 0.58),
  }
}
