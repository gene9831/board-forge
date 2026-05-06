import type { BoardObject } from './game.js'

export type ObjectBounds = {
  width: number
  height: number
}

export const getObjectBounds = (object: BoardObject): ObjectBounds => {
  if (object.kind === 'circle') {
    return {
      width: object.radius * 2,
      height: object.radius * 2,
    }
  }

  if (object.kind === 'rectangle') {
    return {
      width: object.width,
      height: object.height,
    }
  }

  return {
    width: object.size,
    height: object.size,
  }
}
