/** Catalog of games the UI can launch (id matches backend `games/<id>/` folder name). */
export interface GameCatalogEntry {
  id: string
  name: string
  description: string
}

export const GAME_CATALOG: GameCatalogEntry[] = [
  {
    id: 'minimal',
    name: 'Minimal Demo',
    description: 'Join / start_game / custom — default Board Forge bootstrap pack.',
  },
]

export function getGameById(id: string): GameCatalogEntry | undefined {
  return GAME_CATALOG.find((g) => g.id === id)
}
