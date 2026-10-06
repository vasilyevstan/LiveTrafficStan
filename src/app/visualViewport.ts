interface ViewportMeasurements {
  width: number
  height: number
  offsetLeft: number
  offsetTop: number
}

export const visualViewportCssValues = ({
  width,
  height,
  offsetLeft,
  offsetTop,
}: ViewportMeasurements) => {
  if (
    ![width, height, offsetLeft, offsetTop].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) return undefined

  const cssPixels = (value: number) =>
    `${Math.round(value * 100) / 100}px`

  return {
    width: cssPixels(width),
    height: cssPixels(height),
    left: cssPixels(offsetLeft),
    top: cssPixels(offsetTop),
    controlBudget: cssPixels(height * 0.58),
  }
}
