import type { GameState, PendingMove } from '@board-forge/shared'
import { getObjectBounds } from '@board-forge/shared/geometry'
import { loadDemoGameState } from './demoState.js'

export const createInitialState = (): GameState => loadDemoGameState()

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

const getLatestMovesByObjectId = (moves: PendingMove[]) => {
  const latestMoves = new Map<string, PendingMove>()

  for (const move of moves) {
    const currentMove = latestMoves.get(move.objectId)

    if (!currentMove || move.receivedAt >= currentMove.receivedAt) {
      latestMoves.set(move.objectId, move)
    }
  }

  return latestMoves.values()
}

export const applyLatestMove = (state: GameState, moves: PendingMove[]) => {
  if (moves.length === 0) return false

  let changed = false

  for (const latestMove of getLatestMovesByObjectId(moves)) {
    const object = state.objects.find((candidate) => candidate.id === latestMove.objectId)
    if (!object || object.locked) continue

    const bounds = getObjectBounds(object)
    const maxX = Math.max(0, state.board.width - bounds.width)
    const maxY = Math.max(0, state.board.height - bounds.height)

    object.x = clamp(latestMove.x, 0, maxX)
    object.y = clamp(latestMove.y, 0, maxY)
    changed = true
  }

  return changed
}
