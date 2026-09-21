import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import { LOCAL_MAP_TEXT_FONT, mapTextFont } from './textFont'

const mapWithStyle = (
  style: ReturnType<MapLibreMap['getStyle']>,
) =>
  ({
    getStyle: () => style,
  }) as Pick<MapLibreMap, 'getStyle'>

describe('mapTextFont', () => {
  it('reuses a font stack declared by the active base style', () => {
    expect(
      mapTextFont(
        mapWithStyle({
          version: 8,
          glyphs: 'https://tiles.example.test/{fontstack}/{range}.pbf',
          sources: {},
          layers: [
            {
              id: 'base-italic-label',
              type: 'symbol',
              source: 'base',
              layout: {
                'text-font': ['Noto Sans Italic'],
              },
            },
            {
              id: 'base-label',
              type: 'symbol',
              source: 'base',
              layout: {
                'text-font': ['Noto Sans Regular'],
              },
            },
          ],
        }),
      ),
    ).toEqual(['Noto Sans Regular'])
  })

  it('uses local system fonts when the style has no glyph endpoint', () => {
    expect(
      mapTextFont(
        mapWithStyle({
          version: 8,
          sources: {},
          layers: [],
        }),
      ),
    ).toEqual(LOCAL_MAP_TEXT_FONT)
  })

  it('preserves an explicit local font declared by a glyph-free style', () => {
    expect(
      mapTextFont(
        mapWithStyle({
          version: 8,
          sources: {},
          layers: [
            {
              id: 'local-label',
              type: 'symbol',
              source: 'local',
              layout: {
                'text-font': ['Avenir'],
              },
            },
          ],
        }),
      ),
    ).toEqual(['Avenir'])
  })

  it('fails closed when a server-glyph style declares no font stack', () => {
    expect(
      mapTextFont(
        mapWithStyle({
          version: 8,
          glyphs: 'https://tiles.example.test/{fontstack}/{range}.pbf',
          sources: {},
          layers: [],
        }),
      ),
    ).toBeNull()
  })
})
