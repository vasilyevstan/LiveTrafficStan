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
  vessel: [[
    [32, 4], [42, 19], [45, 30], [45, 54], [40, 60],
    [24, 60], [19, 54], [19, 30], [22, 19],
  ]],
  'vessel-cargo': [[
    [32, 4], [42, 13], [45, 24], [45, 56], [42, 60],
    [22, 60], [19, 56], [19, 24], [22, 13],
  ]],
  'vessel-tanker': [[
    [32, 4], [41, 15], [44, 27], [44, 51], [40, 60],
    [24, 60], [20, 51], [20, 27], [23, 15],
  ]],
  'vessel-passenger': [[
    [32, 4], [45, 20], [47, 35], [47, 55], [43, 60],
    [21, 60], [17, 55], [17, 35], [19, 20],
  ]],
  'vessel-fishing': [
    [[32, 4], [39, 17], [42, 29], [42, 54], [38, 60],
      [26, 60], [22, 54], [22, 29], [25, 17]],
    [[24, 30], [24, 36], [12, 47], [10, 43]],
    [[40, 30], [40, 36], [52, 47], [54, 43]],
  ],
  'vessel-tug': [[
    [32, 8], [43, 13], [49, 25], [49, 47], [42, 56],
    [22, 56], [15, 47], [15, 25], [21, 13],
  ]],
  'vessel-sailing': [
    [[32, 4], [36, 19], [39, 39], [38, 56], [34, 60],
      [30, 60], [26, 56], [25, 39], [28, 19]],
    [[30, 10], [30, 43], [11, 43]],
    [[35, 19], [35, 43], [49, 43]],
  ],
  'vessel-pleasure': [[
    [32, 4], [42, 20], [43, 43], [39, 60],
    [25, 60], [21, 43], [22, 20],
  ]],
  'vessel-highspeed': [
    [[20, 4], [25, 19], [25, 53], [21, 60], [14, 57], [14, 21]],
    [[44, 4], [50, 21], [50, 57], [43, 60], [39, 53], [39, 19]],
    [[21, 26], [43, 26], [46, 42], [18, 42]],
  ],
} as const satisfies Record<VesselStyleImageId, IconPolygons>

export const VESSEL_ICON_LENGTH_NORMALIZATION = {
  vessel: 1,
  'vessel-cargo': 1,
  'vessel-tanker': 1,
  'vessel-passenger': 1,
  'vessel-fishing': 1,
  'vessel-tug': 56 / 48,
  'vessel-sailing': 1,
  'vessel-pleasure': 1,
  'vessel-highspeed': 1,
} as const satisfies Record<VesselStyleImageId, number>

export const VESSEL_DECK_SHAPES = {
  vessel: [
    [[27, 25], [37, 25], [40, 40], [40, 49], [24, 49], [24, 40]],
  ],
  'vessel-cargo': [
    [[24, 20], [30, 20], [30, 29], [24, 29]],
    [[34, 20], [40, 20], [40, 29], [34, 29]],
    [[24, 33], [30, 33], [30, 42], [24, 42]],
    [[34, 33], [40, 33], [40, 42], [34, 42]],
    [[23, 48], [41, 48], [41, 55], [23, 55]],
  ],
  'vessel-tanker': [
    [[29, 17], [35, 17], [38, 21], [35, 25], [29, 25], [26, 21]],
    [[29, 29], [35, 29], [38, 33], [35, 37], [29, 37], [26, 33]],
    [[29, 41], [35, 41], [38, 45], [35, 49], [29, 49], [26, 45]],
    [[25, 53], [39, 53], [39, 56], [25, 56]],
  ],
  'vessel-passenger': [
    [[27, 18], [37, 18], [41, 25], [41, 47], [39, 53],
      [25, 53], [23, 47], [23, 25]],
  ],
  'vessel-fishing': [
    [[27, 20], [37, 20], [38, 34], [26, 34]],
    [[27, 43], [37, 43], [37, 52], [27, 52]],
  ],
  'vessel-tug': [
    [[24, 20], [40, 20], [43, 29], [40, 36], [24, 36], [21, 29]],
    [[28, 44], [36, 44], [36, 49], [28, 49]],
  ],
  'vessel-sailing': [
    [[27, 21], [27, 39], [17, 39]],
    [[38, 28], [38, 39], [44, 39]],
    [[29, 48], [35, 48], [35, 54], [29, 54]],
  ],
  'vessel-pleasure': [
    [[27, 23], [37, 23], [39, 37], [25, 37]],
    [[26, 44], [38, 44], [36, 53], [28, 53]],
  ],
  'vessel-highspeed': [
    [[24, 30], [40, 30], [42, 38], [22, 38]],
    [[17, 46], [22, 46], [22, 54], [17, 54]],
    [[42, 46], [47, 46], [47, 54], [42, 54]],
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
        vesselFill: '#60a5fa',
        vesselDetail: '#eff6ff',
        outerEdge: 'rgba(0, 9, 15, 0.92)',
        innerEdge: '#eef9fb',
        shadow: 'rgba(0, 0, 0, 0.58)',
      }
    : {
        aircraftFill: '#27b7de',
        aircraftDetail: '#087b9d',
        vesselFill: '#2563eb',
        vesselDetail: '#e4f0ff',
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
  createVesselStyleIcon(theme, 'vessel')

export const createCargoVesselIcon = (theme: Theme) =>
  createVesselStyleIcon(theme, 'vessel-cargo')

export const createTankerVesselIcon = (theme: Theme) =>
  createVesselStyleIcon(theme, 'vessel-tanker')

export const createPassengerVesselIcon = (theme: Theme) =>
  createVesselStyleIcon(theme, 'vessel-passenger')

export const createFishingVesselIcon = (theme: Theme) =>
  createVesselStyleIcon(theme, 'vessel-fishing')

export const createTugVesselIcon = (theme: Theme) =>
  createVesselStyleIcon(theme, 'vessel-tug')

export const createSailingVesselIcon = (theme: Theme) =>
  createVesselStyleIcon(theme, 'vessel-sailing')

export const createPleasureVesselIcon = (theme: Theme) =>
  createVesselStyleIcon(theme, 'vessel-pleasure')

export const createHighSpeedVesselIcon = (theme: Theme) =>
  createVesselStyleIcon(theme, 'vessel-highspeed')

export const createVesselStyleIcon = (theme: Theme, imageId: VesselStyleImageId) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillVesselShape(context, treatment, imageId)
    context.fillStyle = treatment.vesselDetail
    context.beginPath()
    tracePolygons(context, VESSEL_DECK_SHAPES[imageId])
    context.fill()

    context.fillStyle = treatment.vesselFill
    if (imageId === 'vessel-passenger') {
      context.fillRect(26, 26, 12, 3)
      context.fillRect(28, 34, 8, 5)
      context.fillRect(28, 44, 8, 5)
    } else if (imageId === 'vessel' || imageId === 'vessel-tug') {
      context.fillRect(27, 29, 10, 3)
    }
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
