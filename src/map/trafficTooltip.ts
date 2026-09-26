import {
  flagStateForMmsi,
  formatCountryAllocation,
} from '../domain/countryAllocations'
import type { AircraftPhotoViewState } from '../domain/aircraftPhoto'
import {
  formatAltitude,
  formatVesselSpeed,
} from '../domain/format'
import type { TrafficEntity } from '../domain/traffic'
import type { UnitSystem } from '../domain/units'
import type { VesselReferencePhoto } from '../domain/vesselPhoto'

export interface TrafficTooltipSummary {
  title: string
  details: readonly string[]
}

export interface TrafficTooltipOptions {
  aircraftPhoto?: AircraftPhotoViewState
  aircraftPhotoEnabled?: boolean
  units?: UnitSystem
  vesselPhoto?: VesselReferencePhoto
}

const reportedText = (value: string | undefined) => {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

const appendTooltipPhoto = (
  root: HTMLElement,
  ownerDocument: Document,
  photo: {
    alt: string
    context?: string
    credit: string
    height: number
    href: string
    referrerPolicy?: ReferrerPolicy
    src: string
    title: string
    width: number
  },
) => {
  const link = ownerDocument.createElement('a')
  link.className = 'traffic-tooltip__photo-link'
  link.href = photo.href
  link.target = '_blank'
  link.rel = 'noreferrer noopener'
  link.title = photo.title

  const image = ownerDocument.createElement('img')
  image.className = 'traffic-tooltip__photo'
  image.src = photo.src
  image.width = photo.width
  image.height = photo.height
  image.alt = photo.alt
  image.loading = 'eager'
  image.decoding = 'async'
  if (photo.referrerPolicy) image.referrerPolicy = photo.referrerPolicy

  const credit = ownerDocument.createElement('span')
  credit.className = 'traffic-tooltip__photo-credit'
  credit.textContent = photo.credit

  link.append(image, credit)
  if (photo.context) {
    const context = ownerDocument.createElement('span')
    context.className = 'traffic-tooltip__photo-status'
    context.textContent = photo.context
    link.append(context)
  }
  root.append(link)
}

export const trafficTooltipSummary = (
  entity: TrafficEntity,
  units: UnitSystem = 'metric',
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
        `Reported altitude: ${
          entity.altitudeMeters === undefined
            ? 'unreported'
            : formatAltitude(entity.altitudeMeters, units)
        }`,
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
      `Speed over ground: ${
        entity.speedKph === undefined
          ? 'unreported'
          : formatVesselSpeed(entity.speedKph)
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
  const summary = trafficTooltipSummary(entity, options.units)
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
      appendTooltipPhoto(root, ownerDocument, {
        alt: `Aircraft ${identityKey}`,
        credit: `Photo © ${photoState.photo.photographer} via ${photoState.photo.source.name}`,
        height: photoState.photo.thumbnailHeight,
        href: photoState.photo.photoPageUrl,
        referrerPolicy: 'strict-origin-when-cross-origin',
        src: photoState.photo.thumbnailUrl,
        title: `Open this exact aircraft photo on ${photoState.photo.source.name}`,
        width: photoState.photo.thumbnailWidth,
      })
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

  if (entity.kind === 'vessel' && options.vesselPhoto) {
    const photo = options.vesselPhoto
    const expectedIdentityKey = `${entity.id}|${photo.imo}|${photo.manifestVersion}`
    if (
      String(entity.imo) === photo.imo &&
      photo.identityKey === expectedIdentityKey
    ) {
      appendTooltipPhoto(root, ownerDocument, {
        alt: photo.alt,
        context: `Historical reference matched to AIS-reported IMO ${photo.imo}`,
        credit: `Photo by ${photo.rights.author} via ${photo.rights.sourceName} · ${photo.rights.licenseName}`,
        height: photo.asset.height,
        href: photo.identityEvidence.commonsRevisionUrl,
        src: photo.asset.path,
        title: `Open the fixed ${photo.rights.sourceName} source revision`,
        width: photo.asset.width,
      })
    }
  }

  return root
}
