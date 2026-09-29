import type { Theme } from '../app/theme'
import type { OrbitalObjectType } from '../domain/orbital'
import {
  createIcon,
  fillShape,
  strokeDetail,
  type IconPolygons,
} from './icons'

export const ORBITAL_STYLE_IMAGE_IDS = [
  'orbital-payload',
  'orbital-rocket-body',
  'orbital-debris',
  'orbital-unknown',
] as const

export type OrbitalStyleImageId =
  (typeof ORBITAL_STYLE_IMAGE_IDS)[number]

export type OrbitalStyleImages = Record<
  OrbitalStyleImageId,
  ImageData
>

const IMAGE_ID_BY_TYPE: Record<
  OrbitalObjectType,
  OrbitalStyleImageId
> = {
  PAY: 'orbital-payload',
  'R/B': 'orbital-rocket-body',
  DEB: 'orbital-debris',
  UNK: 'orbital-unknown',
}

export const orbitalStyleImageId = (
  objectType: OrbitalObjectType,
) => IMAGE_ID_BY_TYPE[objectType]

export const ORBITAL_ICON_SHAPES = {
  PAY: [
    [
      [24, 21],
      [40, 21],
      [40, 45],
      [24, 45],
    ],
    [
      [4, 24],
      [21, 24],
      [21, 42],
      [4, 42],
    ],
    [
      [43, 24],
      [60, 24],
      [60, 42],
      [43, 42],
    ],
    [
      [29, 21],
      [32, 7],
      [35, 21],
    ],
  ],
  'R/B': [
    [
      [27, 12],
      [37, 12],
      [42, 22],
      [40, 49],
      [35, 57],
      [29, 57],
      [24, 49],
      [22, 22],
    ],
    [
      [27, 14],
      [32, 4],
      [37, 14],
    ],
    [
      [24, 39],
      [10, 54],
      [25, 50],
    ],
    [
      [40, 39],
      [54, 54],
      [39, 50],
    ],
  ],
  DEB: [
    [
      [8, 19],
      [27, 23],
      [35, 7],
      [43, 25],
      [59, 31],
      [43, 39],
      [50, 56],
      [32, 47],
      [19, 59],
      [20, 41],
      [5, 33],
    ],
  ],
  UNK: [
    [
      [32, 6],
      [49, 19],
      [54, 36],
      [42, 53],
      [32, 59],
      [22, 53],
      [10, 36],
      [15, 19],
    ],
  ],
} as const satisfies Record<OrbitalObjectType, IconPolygons>

const tracePolygons = (
  context: CanvasRenderingContext2D,
  polygons: IconPolygons,
) => {
  for (const polygon of polygons) {
    const [first, ...remaining] = polygon
    if (!first) continue
    context.moveTo(first[0], first[1])
    for (const point of remaining) {
      context.lineTo(point[0], point[1])
    }
    context.closePath()
  }
}

const treatment = (theme: Theme, objectType: OrbitalObjectType) => {
  const fill =
    theme === 'dark'
      ? {
          PAY: '#67d8ff',
          'R/B': '#ffb45f',
          DEB: '#ff7db8',
          UNK: '#aab8c0',
        }[objectType]
      : {
          PAY: '#087fa6',
          'R/B': '#b85f00',
          DEB: '#b62e69',
          UNK: '#65747c',
        }[objectType]

  return {
    fill,
    detail: theme === 'dark' ? '#f7fcff' : '#ffffff',
    outerEdge:
      theme === 'dark'
        ? 'rgba(0, 9, 15, 0.92)'
        : 'rgba(255, 255, 255, 0.94)',
    innerEdge: theme === 'dark' ? '#eef9fb' : '#102d3b',
    shadow:
      theme === 'dark'
        ? 'rgba(0, 0, 0, 0.58)'
        : 'rgba(1, 14, 25, 0.36)',
  }
}

export const createOrbitalIcon = (
  theme: Theme,
  objectType: OrbitalObjectType,
) =>
  createIcon((context) => {
    const colors = treatment(theme, objectType)
    fillShape(context, colors, colors.fill, () => {
      tracePolygons(context, ORBITAL_ICON_SHAPES[objectType])
    })

    strokeDetail(context, colors, colors.detail, () => {
      switch (objectType) {
        case 'PAY':
          context.moveTo(8, 29)
          context.lineTo(17, 29)
          context.moveTo(8, 36)
          context.lineTo(17, 36)
          context.moveTo(47, 29)
          context.lineTo(56, 29)
          context.moveTo(47, 36)
          context.lineTo(56, 36)
          context.moveTo(32, 25)
          context.lineTo(32, 41)
          break
        case 'R/B':
          context.moveTo(24, 25)
          context.lineTo(40, 25)
          context.moveTo(24, 41)
          context.lineTo(40, 41)
          context.moveTo(32, 15)
          context.lineTo(32, 53)
          break
        case 'DEB':
          context.moveTo(20, 27)
          context.lineTo(35, 34)
          context.lineTo(29, 45)
          context.moveTo(42, 26)
          context.lineTo(35, 34)
          break
        case 'UNK':
          context.moveTo(32, 18)
          context.lineTo(42, 28)
          context.lineTo(37, 43)
          context.lineTo(27, 43)
          context.lineTo(22, 28)
          context.closePath()
          break
      }
    })
  })

export const createOrbitalIcons = (
  theme: Theme,
): OrbitalStyleImages =>
  Object.fromEntries(
    (
      [
        ['PAY', 'orbital-payload'],
        ['R/B', 'orbital-rocket-body'],
        ['DEB', 'orbital-debris'],
        ['UNK', 'orbital-unknown'],
      ] as const
    ).map(([objectType, imageId]) => [
      imageId,
      createOrbitalIcon(theme, objectType),
    ]),
  ) as OrbitalStyleImages
