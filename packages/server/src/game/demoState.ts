import { readFileSync } from 'node:fs'
import { GameStateSchema, type GameState } from '@board-forge/shared'

const DEMO_STATE_URL = new URL('../../demo/gameState.json', import.meta.url)

const assertUniqueObjectIds = (state: GameState) => {
  const ids = new Set<string>()

  for (const object of state.objects) {
    if (ids.has(object.id)) {
      throw new Error(`Duplicate object id in demo game state: ${object.id}`)
    }

    ids.add(object.id)
  }
}

export const loadDemoGameState = (): GameState => {
  const rawState = JSON.parse(readFileSync(DEMO_STATE_URL, 'utf8')) as unknown
  const state = GameStateSchema.parse(rawState)

  assertUniqueObjectIds(state)

  return {
    board: { ...state.board },
    objects: state.objects.map((object) => ({ ...object })),
  }
}
