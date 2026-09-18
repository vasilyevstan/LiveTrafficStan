const wholeNumber = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
})

const oneDecimal = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export const formatAge = (timestamp: number | undefined, now: number) => {
  if (!timestamp) return 'not yet'

  const seconds = Math.max(0, Math.round((now - timestamp) / 1_000))
  if (seconds < 2) return 'just now'
  if (seconds < 60) return `${seconds} sec ago`

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.round(minutes / 60)
  return `${hours} hr ago`
}

export const formatAltitude = (meters: number) =>
  `${wholeNumber.format(meters)} m`

export const formatSpeed = (kilometersPerHour: number) =>
  `${wholeNumber.format(kilometersPerHour)} km/h`

export const formatVerticalSpeed = (metersPerSecond: number) => {
  const prefix = metersPerSecond > 0 ? '+' : ''
  return `${prefix}${oneDecimal.format(metersPerSecond)} m/s`
}

export const formatHeading = (degrees: number) =>
  `${wholeNumber.format(degrees)} deg`

export const formatDimension = (meters: number) =>
  `${oneDecimal.format(meters)} m`

export const formatTimestamp = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp)
