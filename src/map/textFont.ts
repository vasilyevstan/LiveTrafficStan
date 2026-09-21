import type {
  Map as MapLibreMap,
  SymbolLayerSpecification,
} from 'maplibre-gl'

export type MapTextFont = NonNullable<
  NonNullable<SymbolLayerSpecification['layout']>['text-font']
>

export const LOCAL_MAP_TEXT_FONT: MapTextFont = [
  'system-ui',
  'sans-serif',
]

export const mapTextFont = (
  map: Pick<MapLibreMap, 'getStyle'>,
): MapTextFont | null => {
  const style = map.getStyle()
  let firstDeclaredFont: MapTextFont | undefined
  for (const layer of style.layers ?? []) {
    if (layer.type !== 'symbol') continue
    const textFont = layer.layout?.['text-font']
    if (textFont !== undefined) {
      firstDeclaredFont ??= textFont
      if (
        Array.isArray(textFont) &&
        textFont.some(
          (font) =>
            typeof font === 'string' && /\bRegular\b/i.test(font),
        )
      ) {
        return textFont
      }
    }
  }
  if (firstDeclaredFont) return firstDeclaredFont
  return style.glyphs ? null : [...LOCAL_MAP_TEXT_FONT]
}
