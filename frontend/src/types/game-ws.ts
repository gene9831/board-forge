/** 2D engine object (internal/engine.Object). */
export interface EngineObject {
  guid: string
  type: string
  tags?: string[]
  x: number
  y: number
  rotation: number
  layer: number
  parentGuid?: string
  childGuids?: string[]
  ownerPlayerId?: string
  attr?: Record<string, unknown>
}

/** Axis-aligned zone (internal/engine.Zone). */
export interface EngineZone {
  id: string
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Per-player metadata (internal/engine.Player). */
export interface EnginePlayer {
  id: string
  displayName?: string
  color?: string
  attributes?: Record<string, unknown>
}

/** Authoritative game state (internal/engine.GameState). */
export interface GameStateSnapshot {
  objects: Record<string, EngineObject>
  zones: Record<string, EngineZone>
  players: Record<string, EnginePlayer>
  turnPlayer: string
  phase: string
  attributes?: Record<string, unknown>
  seed: number
  rngStep: number
  nextObjectSeq: number
  outbox?: OutgoingMessage[]
}

export interface OutgoingMessage {
  kind: string
  message: string
  playerId?: string
}

/** Matches backend internal/room.Snapshot. */
export interface ServerSnapshotMessage {
  type: 'state'
  state: GameStateSnapshot
  messages?: OutgoingMessage[]
  actionLogLen: number
  lastAction?: {
    playerId: string
    type: string
    payload?: unknown
  }
}

/** Outbound intent; aligns with backend game.Action. */
export interface ClientAction {
  playerId: string
  type: string
  payload?: Record<string, unknown>
}
