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
      [32, 3],
      [43, 16],
      [45, 48],
      [39, 61],
      [25, 61],
      [19, 48],
      [21, 16],
    ],
  ],
  'vessel-cargo': [
    [
      [32, 3],
      [44, 12],
      [51, 23],
      [49, 57],
      [41, 62],
      [23, 62],
      [15, 57],
      [13, 23],
      [20, 12],
    ],
  ],
  'vessel-tanker': [
    [
      [32, 3],
      [40, 8],
      [46, 18],
      [47, 50],
      [41, 59],
      [35, 62],
      [29, 62],
      [23, 59],
      [17, 50],
      [18, 18],
      [24, 8],
    ],
  ],
  'vessel-passenger': [
    [
      [32, 2],
      [46, 12],
      [53, 26],
      [50, 55],
      [42, 62],
      [22, 62],
      [14, 55],
      [11, 26],
      [18, 12],
    ],
  ],
  'vessel-fishing': [
    [
      [32, 5],
      [42, 18],
      [43, 51],
      [36, 61],
      [28, 61],
      [21, 51],
      [22, 18],
    ],
    [
      [23, 28],
      [7, 41],
      [9, 49],
      [25, 36],
    ],
    [
      [41, 28],
      [57, 41],
      [55, 49],
      [39, 36],
    ],
  ],
  'vessel-tug': [
    [
      [15, 14],
      [26, 14],
      [26, 21],
      [38, 21],
      [38, 14],
      [49, 14],
      [50, 44],
      [43, 58],
      [21, 58],
      [14, 44],
    ],
  ],
  'vessel-sailing': [
    [
      [19, 48],
      [45, 48],
      [39, 60],
      [25, 60],
    ],
    [
      [30, 5],
      [30, 45],
      [10, 45],
    ],
    [
      [34, 13],
      [34, 45],
      [52, 45],
    ],
  ],
  'vessel-pleasure': [
    [
      [32, 3],
      [50, 29],
      [44, 47],
      [46, 56],
      [37, 62],
      [27, 62],
      [18, 56],
      [20, 47],
      [14, 29],
    ],
  ],
  'vessel-highspeed': [
    [
      [20, 4],
      [29, 20],
      [28, 54],
      [23, 62],
      [14, 56],
      [16, 22],
    ],
    [
      [44, 4],
      [48, 22],
      [50, 56],
      [41, 62],
      [36, 54],
      [35, 20],
    ],
    [
      [24, 23],
      [40, 23],
      [43, 34],
      [21, 34],
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
      context.moveTo(20, 23)
      context.lineTo(44, 23)
      context.moveTo(17, 33)
      context.lineTo(47, 33)
      context.moveTo(17, 43)
      context.lineTo(47, 43)
      context.moveTo(20, 51)
      context.lineTo(44, 51)
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
      context.moveTo(21, 29)
      context.lineTo(43, 29)
      context.lineTo(43, 45)
      context.lineTo(21, 45)
      context.closePath()
      context.moveTo(32, 29)
      context.lineTo(32, 45)
    })
  })

export const createSailingVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillVesselShape(context, treatment, 'vessel-sailing')

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(32, 7)
      context.lineTo(32, 48)
      context.moveTo(17, 48)
      context.lineTo(47, 48)
    })
  })

export const createPleasureVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillVesselShape(context, treatment, 'vessel-pleasure')

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(22, 31)
      context.lineTo(42, 31)
      context.lineTo(38, 43)
      context.lineTo(26, 43)
      context.closePath()
      context.moveTo(22, 50)
      context.lineTo(42, 50)
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
