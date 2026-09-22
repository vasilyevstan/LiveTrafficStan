import {
  flagStateForMmsi,
  formatCountryAllocation,
} from '../domain/countryAllocations'
import type { TrafficEntity } from '../domain/traffic'

export interface TrafficTooltipSummary {
  title: string
  details: readonly string[]
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

  return root
}
