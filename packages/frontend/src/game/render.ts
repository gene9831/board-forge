import type {
  BoardObject,
  CircleObject,
  GameBoard,
  ObjectLock,
  RectangleObject,
  SquareObject,
} from '@board-forge/shared'

const drawRoundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const maxRadius = Math.min(width, height) / 2
  const cornerRadius = Math.min(radius, maxRadius)

  if (cornerRadius <= 0) {
    context.rect(x, y, width, height)
    return
  }

  context.roundRect(x, y, width, height, cornerRadius)
}

const drawObjectPath = (context: CanvasRenderingContext2D, object: BoardObject) => {
  context.beginPath()

  if (object.kind === 'circle') {
    drawCircle(context, object)
    return
  }

  if (object.kind === 'rectangle') {
    drawRectangle(context, object)
    return
  }

  drawSquare(context, object)
}

const drawSquare = (context: CanvasRenderingContext2D, object: SquareObject) => {
  drawRoundedRect(context, object.x, object.y, object.size, object.size, object.borderRadius ?? 0)
}

const drawRectangle = (context: CanvasRenderingContext2D, object: RectangleObject) => {
  drawRoundedRect(context, object.x, object.y, object.width, object.height, object.borderRadius ?? 0)
}

const drawCircle = (context: CanvasRenderingContext2D, object: CircleObject) => {
  context.arc(object.x + object.radius, object.y + object.radius, object.radius, 0, Math.PI * 2)
}

const drawBoardObject = (context: CanvasRenderingContext2D, object: BoardObject, lock?: ObjectLock) => {
  if (object.hidden) return

  context.save()
  context.globalAlpha = object.opacity ?? 1
  context.fillStyle = object.fill ?? '#2563eb'
  context.strokeStyle = object.stroke ?? '#1e3a8a'
  context.lineWidth = object.strokeWidth ?? 0

  drawObjectPath(context, object)
  context.fill()
  if ((object.strokeWidth ?? 0) > 0) {
    context.stroke()
  }

  if (lock) {
    context.lineWidth = 4
    context.strokeStyle = '#eab308'
    context.setLineDash([10, 6])
    drawObjectPath(context, object)
    context.stroke()
  }

  context.restore()
}

export const drawGame = (
  context: CanvasRenderingContext2D,
  board: GameBoard,
  objects: BoardObject[],
  locks: ObjectLock[] = [],
) => {
  context.clearRect(0, 0, board.width, board.height)

  context.fillStyle = '#f8fafc'
  context.fillRect(0, 0, board.width, board.height)

  context.strokeStyle = '#d7dee8'
  context.lineWidth = 1

  for (let x = 0; x <= board.width; x += 40) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, board.height)
    context.stroke()
  }

  for (let y = 0; y <= board.height; y += 40) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(board.width, y)
    context.stroke()
  }

  for (const object of [...objects].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))) {
    drawBoardObject(
      context,
      object,
      locks.find((lock) => lock.objectId === object.id),
    )
  }
}
