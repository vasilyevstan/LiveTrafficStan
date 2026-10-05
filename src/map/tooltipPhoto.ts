export interface TooltipPhoto {
  alt: string
  context?: string
  crossOrigin?: 'anonymous'
  credit: string
  height: number
  href: string
  referrerPolicy?: ReferrerPolicy
  src: string
  title: string
  width: number
}

export const appendTooltipPhoto = (
  root: HTMLElement,
  ownerDocument: Document,
  photo: TooltipPhoto,
) => {
  const link = ownerDocument.createElement('a')
  link.className = 'traffic-tooltip__photo-link'
  link.href = photo.href
  link.target = '_blank'
  link.rel = 'noreferrer noopener'
  link.title = photo.title

  const image = ownerDocument.createElement('img')
  image.className = 'traffic-tooltip__photo'
  if (photo.referrerPolicy) image.referrerPolicy = photo.referrerPolicy
  if (photo.crossOrigin) image.crossOrigin = photo.crossOrigin
  image.src = photo.src
  image.width = photo.width
  image.height = photo.height
  image.alt = photo.alt
  image.loading = 'eager'
  image.decoding = 'async'

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
