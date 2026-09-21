import type { Theme } from '../app/theme'
import {
  AIRCRAFT_ALTITUDE_BANDS,
  AIRCRAFT_VERTICAL_TRENDS,
  TRAFFIC_STYLE_IMAGE_IDS,
  aircraftAltitudeBandCode,
  type AircraftAltitudeBand,
  type AircraftVerticalTrend,
  type TrafficStyleImageId,
  type VesselMotionState,
} from '../domain/trafficPresentation'

type IconPainter = (context: CanvasRenderingContext2D) => void

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

const createIcon = (paint: IconPainter) => {
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

const fillShape = (
  context: CanvasRenderingContext2D,
  treatment: TrafficIconTreatment,
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

const strokeDetail = (
  context: CanvasRenderingContext2D,
  treatment: TrafficIconTreatment,
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

export const createAircraftIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillShape(context, treatment, treatment.aircraftFill, () => {
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

export const createLightAircraftIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillShape(context, treatment, treatment.aircraftFill, () => {
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

export const createHeavyAircraftIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillShape(context, treatment, treatment.aircraftFill, () => {
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
      treatment.aircraftDetail,
      () => {
        context.ellipse(17, 37, 3.5, 6, 0, 0, Math.PI * 2)
        context.moveTo(50.5, 37)
        context.ellipse(47, 37, 3.5, 6, 0, 0, Math.PI * 2)
      },
    )
  })

export const createHelicopterIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    strokeDetail(
      context,
      treatment,
      treatment.aircraftDetail,
      () => {
        context.moveTo(7, 25)
        context.lineTo(57, 25)
        context.moveTo(32, 7)
        context.lineTo(32, 43)
      },
    )

    fillShape(context, treatment, treatment.aircraftFill, () => {
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
    fillShape(context, treatment, treatment.vesselFill, () => {
      context.moveTo(32, 4)
      context.lineTo(50, 20)
      context.lineTo(45, 55)
      context.lineTo(37, 61)
      context.lineTo(27, 61)
      context.lineTo(19, 55)
      context.lineTo(14, 20)
    })

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
    fillShape(context, treatment, treatment.vesselFill, () => {
      context.moveTo(32, 4)
      context.lineTo(45, 16)
      context.lineTo(48, 55)
      context.lineTo(40, 61)
      context.lineTo(24, 61)
      context.lineTo(16, 55)
      context.lineTo(19, 16)
    })

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(22, 25)
      context.lineTo(42, 25)
      context.moveTo(21, 35)
      context.lineTo(43, 35)
      context.moveTo(21, 45)
      context.lineTo(43, 45)
      context.moveTo(32, 24)
      context.lineTo(32, 46)
    })
  })

export const createTankerVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillShape(context, treatment, treatment.vesselFill, () => {
      context.moveTo(32, 3)
      context.quadraticCurveTo(45, 11, 47, 22)
      context.lineTo(46, 54)
      context.quadraticCurveTo(40, 61, 32, 61)
      context.quadraticCurveTo(24, 61, 18, 54)
      context.lineTo(17, 22)
      context.quadraticCurveTo(19, 11, 32, 3)
    })

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
    fillShape(context, treatment, treatment.vesselFill, () => {
      context.moveTo(32, 3)
      context.lineTo(47, 17)
      context.lineTo(49, 51)
      context.lineTo(42, 60)
      context.lineTo(22, 60)
      context.lineTo(15, 51)
      context.lineTo(17, 17)
    })

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(23, 24)
      context.lineTo(41, 24)
      context.moveTo(20, 34)
      context.lineTo(44, 34)
      context.moveTo(19, 44)
      context.lineTo(45, 44)
    })
  })

export const createFishingVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(25, 28)
      context.lineTo(7, 44)
      context.lineTo(11, 49)
      context.moveTo(39, 28)
      context.lineTo(57, 44)
      context.lineTo(53, 49)
    })

    fillShape(context, treatment, treatment.vesselFill, () => {
      context.moveTo(32, 6)
      context.lineTo(44, 20)
      context.lineTo(42, 53)
      context.lineTo(36, 61)
      context.lineTo(28, 61)
      context.lineTo(22, 53)
      context.lineTo(20, 20)
    })

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(25, 36)
      context.lineTo(39, 36)
      context.moveTo(27, 46)
      context.lineTo(37, 46)
    })
  })

export const createTugVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillShape(context, treatment, treatment.vesselFill, () => {
      context.moveTo(32, 8)
      context.lineTo(49, 25)
      context.lineTo(46, 50)
      context.lineTo(39, 58)
      context.lineTo(25, 58)
      context.lineTo(18, 50)
      context.lineTo(15, 25)
    })

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(22, 31)
      context.lineTo(42, 31)
      context.lineTo(42, 44)
      context.lineTo(22, 44)
      context.closePath()
      context.moveTo(32, 31)
      context.lineTo(32, 44)
    })
  })

export const createSailingVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillShape(context, treatment, treatment.vesselFill, () => {
      context.moveTo(32, 4)
      context.lineTo(43, 48)
      context.lineTo(39, 59)
      context.lineTo(25, 59)
      context.lineTo(21, 48)
    })

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(32, 10)
      context.lineTo(32, 48)
      context.moveTo(31, 14)
      context.lineTo(17, 43)
      context.lineTo(31, 43)
      context.moveTo(33, 18)
      context.lineTo(46, 43)
      context.lineTo(33, 43)
    })
  })

export const createPleasureVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillShape(context, treatment, treatment.vesselFill, () => {
      context.moveTo(32, 4)
      context.lineTo(47, 26)
      context.lineTo(45, 53)
      context.lineTo(38, 60)
      context.lineTo(26, 60)
      context.lineTo(19, 53)
      context.lineTo(17, 26)
    })

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(23, 34)
      context.lineTo(41, 34)
      context.lineTo(38, 45)
      context.lineTo(26, 45)
      context.closePath()
      context.moveTo(28, 27)
      context.lineTo(36, 27)
    })
  })

export const createHighSpeedVesselIcon = (theme: Theme) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    fillShape(context, treatment, treatment.vesselFill, () => {
      context.moveTo(32, 3)
      context.lineTo(46, 24)
      context.lineTo(47, 56)
      context.lineTo(39, 61)
      context.lineTo(34, 50)
      context.lineTo(30, 50)
      context.lineTo(25, 61)
      context.lineTo(17, 56)
      context.lineTo(18, 24)
    })

    strokeDetail(context, treatment, treatment.vesselDetail, () => {
      context.moveTo(24, 30)
      context.lineTo(40, 30)
      context.moveTo(27, 39)
      context.lineTo(37, 39)
    })
  })

const createBadgeBackground = (
  context: CanvasRenderingContext2D,
  treatment: TrafficIconTreatment,
  fill: string,
) => {
  context.save()
  context.shadowColor = treatment.shadow
  context.shadowBlur = 4
  context.fillStyle = fill
  context.strokeStyle = treatment.outerEdge
  context.lineWidth = 4
  context.beginPath()
  context.arc(32, 32, 21, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.strokeStyle = treatment.innerEdge
  context.lineWidth = 1.75
  context.stroke()
  context.restore()
}

export const createVesselMotionBadgeIcon = (
  theme: Theme,
  state: VesselMotionState,
) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    const ink =
      theme === 'dark' ? treatment.outerEdge : treatment.innerEdge
    createBadgeBackground(context, treatment, treatment.vesselFill)

    context.save()
    context.fillStyle = ink
    context.strokeStyle = ink
    context.lineWidth = 6
    context.lineCap = 'round'
    if (state === 'moving') {
      context.beginPath()
      context.moveTo(24, 19)
      context.lineTo(46, 32)
      context.lineTo(24, 45)
      context.closePath()
      context.fill()
    } else if (state === 'slow-stopped') {
      context.beginPath()
      context.moveTo(21, 32)
      context.lineTo(43, 32)
      context.stroke()
    } else {
      context.font = '700 31px system-ui, sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText('?', 32, 33)
    }
    context.restore()
  })

const drawTrend = (
  context: CanvasRenderingContext2D,
  trend: AircraftVerticalTrend,
  color: string,
) => {
  context.save()
  context.strokeStyle = color
  context.fillStyle = color
  context.lineWidth = 4
  context.lineCap = 'round'
  if (trend === 'climb' || trend === 'descent') {
    const tipY = trend === 'climb' ? 21 : 43
    const tailY = trend === 'climb' ? 43 : 21
    context.beginPath()
    context.moveTo(43, tailY)
    context.lineTo(43, tipY)
    context.stroke()
    context.beginPath()
    context.moveTo(35, trend === 'climb' ? 29 : 35)
    context.lineTo(43, tipY)
    context.lineTo(51, trend === 'climb' ? 29 : 35)
    context.stroke()
  } else if (trend === 'small') {
    context.beginPath()
    context.moveTo(35, 32)
    context.lineTo(51, 32)
    context.stroke()
  } else {
    context.font = '700 26px system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('?', 43, 33)
  }
  context.restore()
}

export const createAircraftStateBadgeIcon = (
  theme: Theme,
  band: AircraftAltitudeBand,
  trend: AircraftVerticalTrend,
) =>
  createIcon((context) => {
    const treatment = trafficIconTreatment(theme)
    const ink =
      theme === 'dark' ? treatment.outerEdge : treatment.innerEdge
    createBadgeBackground(context, treatment, treatment.aircraftFill)
    context.save()
    context.fillStyle = ink
    context.font = '700 26px system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(aircraftAltitudeBandCode(band), 23, 33)
    context.restore()
    drawTrend(context, trend, ink)
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
    'vessel-motion-moving': createVesselMotionBadgeIcon(theme, 'moving'),
    'vessel-motion-slow-stopped': createVesselMotionBadgeIcon(
      theme,
      'slow-stopped',
    ),
    'vessel-motion-unknown': createVesselMotionBadgeIcon(
      theme,
      'unknown',
    ),
  } as Partial<Record<TrafficStyleImageId, ImageData>>

  for (const band of AIRCRAFT_ALTITUDE_BANDS) {
    for (const trend of AIRCRAFT_VERTICAL_TRENDS) {
      images[`aircraft-state-${band}-${trend}`] =
        createAircraftStateBadgeIcon(theme, band, trend)
    }
  }

  for (const imageId of TRAFFIC_STYLE_IMAGE_IDS) {
    if (!images[imageId]) {
      throw new Error(`Traffic image ${imageId} was not generated`)
    }
  }
  return images as Record<TrafficStyleImageId, ImageData>
}
