import {
  flagStateForMmsi,
  formatCountryAllocation,
} from '../domain/countryAllocations'
import type { AircraftPhotoViewState } from '../domain/aircraftPhoto'
import type { TrafficEntity } from '../domain/traffic'

export interface TrafficTooltipSummary {
  title: string
  details: readonly string[]
}

export interface TrafficTooltipOptions {
  aircraftPhoto?: AircraftPhotoViewState
  aircraftPhotoEnabled?: boolean
}

const reportedText = (value: string | undefined) => {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

export const trafficTooltipSummary = (
  entity: TrafficEntity,
): TrafficTooltipSummary => {
  if (entity.kind === 'aircraft') {
    const callsign = reportedText(entity.callsign)
    const registration = reportedText(entity.registration)
    const aircraftType = reportedText(entity.aircraftType)
    return {
      title: callsign
        ? `Flight / callsign: ${callsign}`
        : `Aircraft: ${registration ?? entity.hex.toUpperCase()}`,
      details: [
        `Reported aircraft type: ${aircraftType ?? 'unreported'}`,
        registration
          ? `Registration: ${registration}`
          : `ICAO24: ${entity.hex.toUpperCase()}`,
      ],
    }
  }

  const name = reportedText(entity.name)
  const destination = reportedText(entity.destination)
  const flagState = flagStateForMmsi(entity.mmsi)
  return {
    title: name ?? `Vessel MMSI ${entity.mmsi}`,
    details: [
      `Flag: ${
        flagState === undefined
          ? 'unreported'
          : formatCountryAllocation(flagState)
      }`,
      `AIS destination: ${destination ?? 'unreported'}`,
    ],
  }
}

export const createTrafficTooltipElement = (
  entity: TrafficEntity,
  ownerDocument: Document,
  options: TrafficTooltipOptions = {},
) => {
  const summary = trafficTooltipSummary(entity)
  const root = ownerDocument.createElement('div')
  root.className = 'traffic-tooltip'
  root.dataset.trafficId = entity.id

  const title = ownerDocument.createElement('strong')
  title.className = 'traffic-tooltip__title'
  title.textContent = summary.title
  root.append(title)

  for (const detail of summary.details) {
    const line = ownerDocument.createElement('span')
    line.className = 'traffic-tooltip__detail'
    line.textContent = detail
    root.append(line)
  }

  if (entity.kind === 'aircraft' && options.aircraftPhotoEnabled) {
    const identityKey = entity.hex.trim().toUpperCase()
    const photoState =
      options.aircraftPhoto?.identityKey === identityKey
        ? options.aircraftPhoto
        : undefined

    if (photoState?.phase === 'available') {
      const link = ownerDocument.createElement('a')
      link.className = 'traffic-tooltip__photo-link'
      link.href = photoState.photo.photoPageUrl
      link.target = '_blank'
      link.rel = 'noreferrer noopener'
      link.title = `Open this exact aircraft photo on ${photoState.photo.source.name}`

      const image = ownerDocument.createElement('img')
      image.className = 'traffic-tooltip__photo'
      image.src = photoState.photo.thumbnailUrl
      image.width = photoState.photo.thumbnailWidth
      image.height = photoState.photo.thumbnailHeight
      image.alt = `Aircraft ${identityKey}`
      image.loading = 'eager'
      image.referrerPolicy = 'strict-origin-when-cross-origin'

      const credit = ownerDocument.createElement('span')
      credit.className = 'traffic-tooltip__photo-credit'
      credit.textContent = `Photo © ${photoState.photo.photographer} via ${photoState.photo.source.name}`

      link.append(image, credit)
      root.append(link)
    } else if (photoState?.phase === 'loading') {
      const status = ownerDocument.createElement('p')
      status.className = 'traffic-tooltip__photo-status'
      status.textContent = 'Loading exact aircraft photo…'
      root.append(status)
    } else if (
      photoState?.phase === 'error' ||
      photoState?.phase === 'unavailable'
    ) {
      const status = ownerDocument.createElement('p')
      status.className = 'traffic-tooltip__photo-status'
      status.textContent = 'Exact aircraft photo unavailable.'
      root.append(status)
    }
  }

  return root
}
