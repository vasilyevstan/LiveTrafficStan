const DARK_PLACE_IMAGE_ALIAS = 'circle-11'
const DARK_PLACE_IMAGE_SOURCE = 'circle_11'

interface PlaceImageData {
  width: number
  height: number
  data: Uint8Array
}

interface PlaceImage {
  data: PlaceImageData
  pixelRatio: number
  sdf: boolean
}

interface PlaceImageMap {
  hasImage(id: string): boolean
  getImage(id: string): PlaceImage | undefined
  addImage(
    id: string,
    image: PlaceImageData,
    options: Pick<PlaceImage, 'pixelRatio' | 'sdf'>,
  ): unknown
}

export const resolveDarkBasemapPlaceImage = (
  map: PlaceImageMap,
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
