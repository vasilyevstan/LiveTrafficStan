export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const finiteNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

export const finiteInteger = (value: unknown) => {
  const number = finiteNumber(value)
  return number !== undefined && Number.isInteger(number) ? number : undefined
}

export const nonEmptyString = (value: unknown) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export const normalizedDirection = (value: unknown) => {
  const number = finiteNumber(value)
  if (number === undefined || number < 0 || number >= 360) return undefined
  return number
}
