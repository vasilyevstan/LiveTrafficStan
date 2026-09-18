type IconPainter = (context: CanvasRenderingContext2D) => void

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
  color: string,
  draw: () => void,
) => {
  context.save()
  context.shadowColor = 'rgba(1, 14, 25, 0.55)'
  context.shadowBlur = 6
  context.shadowOffsetY = 2
  context.fillStyle = color
  context.strokeStyle = '#06243a'
  context.lineWidth = 2.5
  context.beginPath()
  draw()
  context.closePath()
  context.fill()
  context.stroke()
  context.restore()
}

export const createAircraftIcon = () =>
  createIcon((context) => {
    fillShape(context, '#63d8ff', () => {
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

export const createHelicopterIcon = () =>
  createIcon((context) => {
    context.save()
    context.strokeStyle = '#8de8ff'
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(7, 25)
    context.lineTo(57, 25)
    context.moveTo(32, 7)
    context.lineTo(32, 43)
    context.stroke()
    context.restore()

    fillShape(context, '#63d8ff', () => {
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

export const createVesselIcon = () =>
  createIcon((context) => {
    fillShape(context, '#ffb763', () => {
      context.moveTo(32, 4)
      context.lineTo(50, 20)
      context.lineTo(45, 55)
      context.lineTo(37, 61)
      context.lineTo(27, 61)
      context.lineTo(19, 55)
      context.lineTo(14, 20)
    })

    context.save()
    context.strokeStyle = 'rgba(6, 36, 58, 0.75)'
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(21, 28)
    context.lineTo(43, 28)
    context.moveTo(23, 39)
    context.lineTo(41, 39)
    context.stroke()
    context.restore()
  })
