import {
  orbitalObjectTypeLabel,
  type ModeledOrbitalPosition,
} from '../domain/orbital'
import {
  orbitalEnrichmentForPosition,
  type OrbitalEnrichmentView,
} from '../domain/orbitalEnrichment'
import { appendTooltipPhoto } from './tooltipPhoto'

export interface OrbitalTooltipSummary {
  title: string
  details: readonly string[]
}

export const orbitalTooltipSummary = (
  position: ModeledOrbitalPosition,
  enrichment = orbitalEnrichmentForPosition(position),
): OrbitalTooltipSummary => ({
  title: position.name,
  details: [
    `${orbitalObjectTypeLabel(position.objectType)} · NORAD ${position.noradCatalogId}`,
    enrichment
      ? `Purpose: ${enrichment.purpose.shortLabel}`
      : 'Purpose: unavailable for this exact NORAD ID',
    'Modeled position · not live telemetry',
  ],
})

const appendOrbitalImage = (
  root: HTMLElement,
  ownerDocument: Document,
  enrichment: OrbitalEnrichmentView,
  src: string,
) => {
  const image = enrichment.image
  if (!image) return

  appendTooltipPhoto(root, ownerDocument, {
    alt: image.alt,
    context: `${image.kind === 'photograph' ? 'Historical photograph' : 'Reviewed illustration'} · exact NORAD ${enrichment.noradCatalogId}`,
    credit: image.rights.creditLine,
    height: image.asset.height,
    href: image.identityEvidence.sourcePageUrl,
    src,
    title: `Open the reviewed ${image.rights.sourceName} source page`,
    width: image.asset.width,
  })
}

export const createOrbitalTooltipElement = (
  position: ModeledOrbitalPosition,
  ownerDocument: Document,
  imageUrls: ReadonlyMap<string, string> = new Map(),
) => {
  const enrichment = orbitalEnrichmentForPosition(position)
  const summary = orbitalTooltipSummary(position, enrichment)
  const root = ownerDocument.createElement('div')
  root.className = 'traffic-tooltip orbital-tooltip'
  root.dataset.orbitalId = position.id

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

  if (enrichment?.image) {
    const imageUrl = imageUrls.get(enrichment.image.asset.path)
    if (imageUrl) {
      appendOrbitalImage(root, ownerDocument, enrichment, imageUrl)
    }
  }

  return root
}
