export const normalizeAircraftSquawk = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const squawk = value.trim()
  return /^[0-7]{4}$/.test(squawk) ? squawk : undefined
}
