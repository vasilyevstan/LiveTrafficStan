import type { Map as MapLibreMap } from 'maplibre-gl'

const DARK_PLACE_IMAGE_ALIAS = 'circle-11'
const DARK_PLACE_IMAGE_SOURCE = 'circle_11'

export const resolveDarkBasemapPlaceImage = (
  map: Pick<MapLibreMap, 'addImage' | 'getImage' | 'hasImage'>,
  imageId: string,
) => {
  if (
    imageId !== DARK_PLACE_IMAGE_ALIAS ||
    map.hasImage(DARK_PLACE_IMAGE_ALIAS)
  ) return

  const image = map.getImage(DARK_PLACE_IMAGE_SOURCE)
  if (!image) return

  map.addImage(DARK_PLACE_IMAGE_ALIAS, image.data, {
    pixelRatio: image.pixelRatio,
    sdf: image.sdf,
  })
}
