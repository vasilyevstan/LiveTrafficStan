import type { Theme } from '../app/theme'
import {
  AIRCRAFT_ALTITUDE_BANDS,
  TRAFFIC_STYLE_IMAGE_IDS,
  type AircraftAltitudeBand,
  type TrafficStyleImageId,
  type VesselStyleImageId,
} from '../domain/trafficPresentation'

type IconPainter = (context: CanvasRenderingContext2D) => void
export type IconPoint = readonly [number, number]
export type IconPolygons = readonly (readonly IconPoint[])[]

export const VESSEL_ICON_SHAPES = {
  vessel: [
    [
      [32, 8],
      [43, 15],
      [49, 24],
      [49, 51],
      [44, 57],
      [20, 57],
      [15, 51],
      [15, 24],
      [21, 15],
    ],
  ],
  'vessel-cargo': [
    [
      [32, 7],
      [50, 13],
      [57, 21],
      [57, 59],
      [7, 59],
      [7, 21],
      [14, 13],
    ],
  ],
  'vessel-tanker': [
    [
      [32, 3],
      [39, 6],
      [44, 12],
      [47, 21],
      [47, 45],
      [44, 54],
      [38, 61],
      [26, 61],
      [20, 54],
      [17, 45],
      [17, 21],
      [20, 12],
      [25, 6],
    ],
  ],
  'vessel-passenger': [
    [
      [32, 3],
      [46, 9],
      [57, 19],
      [52, 27],
      [41, 33],
      [40, 42],
      [55, 52],
      [55, 60],
      [9, 60],
      [9, 52],
      [24, 42],
      [23, 33],
      [12, 27],
      [7, 19],
      [18, 9],
    ],
  ],
  'vessel-fishing': [
    [
      [32, 6],
      [40, 15],
      [42, 50],
      [37, 59],
      [27, 59],
      [22, 50],
      [24, 15],
    ],
    [
      [24, 27],
      [24, 38],
      [7, 49],
      [4, 41],
    ],
    [
      [40, 27],
      [40, 38],
      [57, 49],
      [60, 41],
    ],
  ],
  'vessel-tug': [
    [
      [16, 11],
      [48, 11],
      [55, 20],
      [55, 48],
      [47, 59],
      [42, 59],
      [42, 39],
      [22, 39],
      [22, 59],
      [17, 59],
      [9, 48],
      [9, 20],
    ],
  ],
  'vessel-sailing': [
    [
      [24, 44],
      [40, 44],
      [37, 61],
      [27, 61],
    ],
    [
      [30, 4],
      [30, 43],
      [8, 43],
    ],
    [
      [35, 15],
      [35, 43],
      [51, 43],
    ],
  ],
  'vessel-pleasure': [
    [
      [32, 3],
      [43, 13],
      [51, 29],
      [43, 40],
      [50, 53],
      [48, 61],
      [39, 61],
      [39, 45],
      [25, 45],
      [25, 61],
      [16, 61],
      [14, 53],
      [21, 40],
      [13, 29],
      [21, 13],
    ],
  ],
  'vessel-highspeed': [
    [
      [16, 3],
      [25, 14],
      [25, 52],
      [21, 61],
      [9, 56],
      [10, 18],
    ],
    [
      [48, 3],
      [54, 18],
      [55, 56],
      [43, 61],
      [39, 52],
      [39, 14],
    ],
    [
      [20, 24],
      [44, 24],
      [48, 37],
      [16, 37],
    ],
  ],
} as const satisfies Record<VesselStyleImageId, IconPolygons>

export interface TrafficIconTreatment {
  aircraftFill: string
  aircraftDetail: string
  vesselFill: string
  vesselDetail: string
  outerEdge: string
  innerEdge: string
  shadow: string
}

export const trafficIconTreatment = (
  theme: Theme,
): TrafficIconTreatment =>
  theme === 'dark'
    ? {
        aircraftFill: '#72e4ff',
        aircraftDetail: '#b9f2ff',
        vesselFill: '#ffc878',
        vesselDetail: '#fff0d0',
        outerEdge: 'rgba(0, 9, 15, 0.92)',
        innerEdge: '#eef9fb',
        shadow: 'rgba(0, 0, 0, 0.58)',
      }
    : {
        aircraftFill: '#27b7de',
        aircraftDetail: '#087b9d',
        vesselFill: '#ed9d3f',
        vesselDetail: '#6a3a0b',
        outerEdge: 'rgba(255, 255, 255, 0.9)',
        innerEdge: '#06243a',
        shadow: 'rgba(1, 14, 25, 0.38)',
      }

export interface AircraftAltitudeColors {
  fill: string
  detail: string
}

export const aircraftAltitudeColors = (
  theme: Theme,
  band: AircraftAltitudeBand,
): AircraftAltitudeColors => {
  const fill =
    theme === 'dark'
      ? {
          low: '#38bdf8',
          medium: '#2dd4bf',
          high: '#a78bfa',
          cruise: '#f0abfc',
          unknown: '#94a3b8',
        }[band]
      : {
          low: '#0369a1',
          medium: '#0f766e',
          high: '#6d28d9',
          cruise: '#a21caf',
          unknown: '#64748b',
        }[band]

  return {
    fill,
    detail: theme === 'dark' ? '#f8fdff' : '#ffffff',
  }
}

const aircraftColors = (
  theme: Theme,
  band: AircraftAltitudeBand | undefined,
) => {
  const treatment = trafficIconTreatment(theme)
  return band === undefined
    ? {
        fill: treatment.aircraftFill,
        detail: treatment.aircraftDetail,
      }
    : aircraftAltitudeColors(theme, band)
}

export const createIcon = (paint: IconPainter) => {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is unavailable')

  context.lineJoin = 'round'
  context.lineCap = 'round'
  paint(context)
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

export const fillShape = (
  context: CanvasRenderingContext2D,
  treatment: Pick<
    TrafficIconTreatment,
    'outerEdge' | 'innerEdge' | 'shadow'
  >,
  color: string,
  draw: () => void,
) => {
  context.save()
  context.shadowColor = treatment.shadow
  context.shadowBlur = 5
  context.shadowOffsetY = 1.5
  context.fillStyle = color
  context.beginPath()
  draw()
  context.closePath()
  context.fill()
  context.shadowColor = 'transparent'
  context.strokeStyle = treatment.outerEdge
  context.lineWidth = 5
  context.stroke()
  context.strokeStyle = treatment.innerEdge
  context.lineWidth = 2.25
  context.stroke()
  context.restore()
}

export const strokeDetail = (
  context: CanvasRenderingContext2D,
  treatment: Pick<TrafficIconTreatment, 'outerEdge'>,
  detailColor: string,
  draw: () => void,
) => {
  context.save()
  context.beginPath()
  draw()
  context.strokeStyle = treatment.outerEdge
  context.lineWidth = 5
  context.stroke()
  context.strokeStyle = detailColor
  context.lineWidth = 2.5
  context.stroke()
  context.restore()
}

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

const fillVesselShape = (
  context: CanvasRenderingContext2D,
  treatment: TrafficIconTreatment,
  imageId: VesselStyleImageId,
) => {
  fillShape(context, treatment, treatment.vesselFill, () => {
    tracePolygons(context, VESSEL_ICON_SHAPES[imageId])
  })
}

export const createAircraftIcon = (
  theme: Theme,
  band?: AircraftAltitudeBand,
) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    const colors = aircraftColors(theme, band)
    fillShape(context, treatment, colors.fill, () => {
      context.moveTo(32, 3)
      context.lineTo(38, 24)
      context.lineTo(59, 34)
      context.lineTo(57, 40)
      context.lineTo(38, 34)
      context.lineTo(40, 52)
      context.lineTo(48, 58)
      context.lineTo(46, 61)
      context.lineTo(32, 56)
      context.lineTo(18, 61)
      context.lineTo(16, 58)
      context.lineTo(24, 52)
      context.lineTo(26, 34)
      context.lineTo(7, 40)
      context.lineTo(5, 34)
      context.lineTo(26, 24)
    })
  })

export const createLightAircraftIcon = (
  theme: Theme,
  band?: AircraftAltitudeBand,
) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    const colors = aircraftColors(theme, band)
    fillShape(context, treatment, colors.fill, () => {
      context.moveTo(32, 4)
      context.lineTo(36, 25)
      context.lineTo(50, 34)
      context.lineTo(48, 39)
      context.lineTo(36, 35)
      context.lineTo(38, 52)
      context.lineTo(44, 58)
      context.lineTo(41, 61)
      context.lineTo(32, 56)
      context.lineTo(23, 61)
      context.lineTo(20, 58)
      context.lineTo(26, 52)
      context.lineTo(28, 35)
      context.lineTo(16, 39)
      context.lineTo(14, 34)
      context.lineTo(28, 25)
    })
  })

export const createHeavyAircraftIcon = (
  theme: Theme,
  band?: AircraftAltitudeBand,
) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    const colors = aircraftColors(theme, band)
    fillShape(context, treatment, colors.fill, () => {
      context.moveTo(32, 2)
      context.lineTo(39, 21)
      context.lineTo(61, 33)
      context.lineTo(58, 42)
      context.lineTo(40, 36)
      context.lineTo(42, 50)
      context.lineTo(51, 57)
      context.lineTo(48, 62)
      context.lineTo(32, 57)
      context.lineTo(16, 62)
      context.lineTo(13, 57)
      context.lineTo(22, 50)
      context.lineTo(24, 36)
      context.lineTo(6, 42)
      context.lineTo(3, 33)
      context.lineTo(25, 21)
    })

    strokeDetail(
      context,
      treatment,
      colors.detail,
      () => {
        context.ellipse(17, 37, 3.5, 6, 0, 0, Math.PI * 2)
        context.moveTo(50.5, 37)
        context.ellipse(47, 37, 3.5, 6, 0, 0, Math.PI * 2)
      },
    )
  })

export const createHelicopterIcon = (
  theme: Theme,
  band?: AircraftAltitudeBand,
) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    const colors = aircraftColors(theme, band)
    strokeDetail(
      context,
      treatment,
      colors.detail,
      () => {
        context.moveTo(7, 25)
        context.lineTo(57, 25)
        context.moveTo(32, 7)
        context.lineTo(32, 43)
      },
    )

    fillShape(context, treatment, colors.fill, () => {
      context.moveTo(32, 12)
      context.quadraticCurveTo(44, 18, 43, 33)
      context.lineTo(37, 45)
      context.lineTo(45, 56)
      context.lineTo(40, 59)
      context.lineTo(32, 49)
      context.lineTo(24, 59)
      context.lineTo(19, 56)
      context.lineTo(27, 45)
      context.lineTo(21, 33)
      context.quadraticCurveTo(20, 18, 32, 12)
    })
  })

export const createVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillVesselShape(context, treatment, 'vessel')

    context.save()
    context.strokeStyle = treatment.vesselDetail
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(21, 28)
    context.lineTo(43, 28)
    context.moveTo(23, 39)
    context.lineTo(41, 39)
    context.stroke()
    context.restore()
  })

export const createCargoVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillVesselShape(context, treatment, 'vessel-cargo')

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.rect(21, 22, 10, 10)
      context.rect(33, 22, 10, 10)
      context.rect(21, 35, 10, 10)
      context.rect(33, 35, 10, 10)
      context.moveTo(20, 48)
      context.lineTo(44, 48)
    })
  })

export const createTankerVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillVesselShape(context, treatment, 'vessel-tanker')

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(32, 17)
      context.lineTo(32, 52)
      context.moveTo(39, 28)
      context.ellipse(32, 28, 7, 5, 0, 0, Math.PI * 2)
      context.moveTo(39, 43)
      context.ellipse(32, 43, 7, 5, 0, 0, Math.PI * 2)
    })
  })

export const createPassengerVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillVesselShape(context, treatment, 'vessel-passenger')

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(14, 22)
      context.lineTo(50, 22)
      context.moveTo(19, 29)
      context.lineTo(45, 29)
      context.moveTo(26, 38)
      context.lineTo(38, 38)
      context.moveTo(13, 54)
      context.lineTo(51, 54)
    })
  })

export const createFishingVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillVesselShape(context, treatment, 'vessel-fishing')

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(32, 15)
      context.lineTo(32, 48)
      context.moveTo(22, 29)
      context.lineTo(42, 29)
      context.moveTo(25, 39)
      context.lineTo(39, 39)
    })
  })

export const createTugVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillVesselShape(context, treatment, 'vessel-tug')

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(20, 22)
      context.lineTo(44, 22)
      context.lineTo(44, 35)
      context.lineTo(20, 35)
      context.closePath()
      context.moveTo(32, 22)
      context.lineTo(32, 35)
    })
  })

export const createSailingVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillVesselShape(context, treatment, 'vessel-sailing')

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(32, 6)
      context.lineTo(32, 44)
      context.moveTo(15, 44)
      context.lineTo(49, 44)
    })
  })

export const createPleasureVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillVesselShape(context, treatment, 'vessel-pleasure')

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(22, 31)
      context.lineTo(42, 31)
      context.lineTo(38, 42)
      context.lineTo(26, 42)
      context.closePath()
    })
  })

export const createHighSpeedVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillVesselShape(context, treatment, 'vessel-highspeed')

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(23, 28)
      context.lineTo(41, 28)
      context.moveTo(25, 36)
      context.lineTo(39, 36)
    })
  })

export const createTrafficIcons = (
  theme: Theme,
): Record<TrafficStyleImageId, ImageData> => {
  const images = {
    aircraft: createAircraftIcon(theme),
    'aircraft-light': createLightAircraftIcon(theme),
    'aircraft-heavy': createHeavyAircraftIcon(theme),
    helicopter: createHelicopterIcon(theme),
    vessel: createVesselIcon(theme),
    'vessel-cargo': createCargoVesselIcon(theme),
    'vessel-tanker': createTankerVesselIcon(theme),
    'vessel-passenger': createPassengerVesselIcon(theme),
    'vessel-fishing': createFishingVesselIcon(theme),
    'vessel-tug': createTugVesselIcon(theme),
    'vessel-sailing': createSailingVesselIcon(theme),
    'vessel-pleasure': createPleasureVesselIcon(theme),
    'vessel-highspeed': createHighSpeedVesselIcon(theme),
  } as Partial<Record<TrafficStyleImageId, ImageData>>

  const aircraftFactories = {
    aircraft: createAircraftIcon,
    'aircraft-light': createLightAircraftIcon,
    'aircraft-heavy': createHeavyAircraftIcon,
    helicopter: createHelicopterIcon,
  } as const

  for (const [markerIcon, factory] of Object.entries(
    aircraftFactories,
  )) {
    const aircraftFactory = factory as (
      activeTheme: Theme,
      band: AircraftAltitudeBand,
    ) => ImageData
    for (const band of AIRCRAFT_ALTITUDE_BANDS) {
      const imageId =
        `${markerIcon}-${band}` as TrafficStyleImageId
      images[imageId] = aircraftFactory(theme, band)
    }
  }

  for (const imageId of TRAFFIC_STYLE_IMAGE_IDS) {
    if (!images[imageId]) {
      throw new Error(`Traffic image ${imageId} was not generated`)
    }
  }
  return images as Record<TrafficStyleImageId, ImageData>
}
