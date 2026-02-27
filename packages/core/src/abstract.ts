/**
 * Stable abstract API for board games. No game-specific types.
 * All state and actions are serializable for replay and AI.
 */

/** Visibility of zone items to players. */
export type Visibility = 'public' | 'owner-only' | 'hidden'

/** Unique identifier for a player within a game. */
export type PlayerId = string

/**
 * Acting set: who may act and in what semantics.
 * - none: no one may act
 * - single: exactly one player may act (e.g. turn-based)
 * - multiple: several players may act in any order
 * - all: everyone may act (convenience for "all players")
 * - simultaneous: collect actions from all listed players before advancing
 */
export type ActingSet =
  | { type: 'none' }
  | { type: 'single'; player: PlayerId }
  | { type: 'multiple'; players: PlayerId[] }
  | { type: 'all' }
  | { type: 'simultaneous'; players: PlayerId[] }

/** Zone: a named collection of items with visibility. */
export interface Zone<Item = unknown> {
  /** Stable identifier for this zone (e.g. "drawPile"). */
  id: string
  /** Optional owner of this zone; `undefined` means shared/public. */
  owner?: PlayerId
  /** Ordered list of items currently contained in the zone. */
  items: Item[]
  /** Who can see items in this zone. */
  visibility: Visibility
}

/** Reference to a specific location or item within a zone (for targeting). */
export interface TargetRef {
  /** Identifier of the target zone. */
  zoneId: string
  /** Optional index within the zone's items array. */
  index?: number
  /** Optional stable item identifier, if items are addressable by id. */
  id?: string
}

/** Base game state structure shared by all games: players, round, turn, phase, zones. */
export interface BaseGameState<Item = unknown, Phase = string> {
  /** All players participating in the game, in seating order. */
  players: PlayerId[]
  /** Current round number, starting from 1. */
  round: number
  /** Current turn number within the round, starting from 1. */
  turn: number
  /** Name of the current phase (e.g. "draw", "action", "scoring"). */
  phase: Phase
  /** Mapping from zone id to zone contents. */
  zones: Record<string, Zone<Item>>
  /** Optional mapping from player id to score, when scoring is defined. */
  scores?: Record<PlayerId, number>
}

/** Generic game action: discriminated by type, emitted by a player, with optional payload. */
export interface GameAction {
  /** Action kind identifier (e.g. "draw", "playCard"). */
  type: string
  /** Player who is performing the action. */
  player: PlayerId
  /** Game-specific data required to perform the action. */
  payload?: unknown
}

/** Result when the game is terminal. */
export interface GameResult {
  /** Winning player id, or null if there is no single winner. */
  winner: PlayerId | null
  /** Final scores for all players. */
  scores: Record<PlayerId, number>
  /** Whether the game ended in a draw according to game rules. */
  isDraw?: boolean
}

/** Minimal config for game creation (e.g. playerIds). */
export interface GameConfig {
  /** Players who will participate in the game, in seating order. */
  playerIds: PlayerId[]
}

/** Serializable RNG state */
export interface RngState {
  seed: number
  counter: number
}

/** Source of deterministic random numbers in [0, 1). */
export interface RandomSource {
  state: () => RngState
  /** Get the next pseudo-random number in [0, 1). */
  next(): number
}

/** Strategy for turning templates into concrete actions for a specific player. */
export type ActionResolver<State, Action, TemplateAction = Action> = (args: {
  state: State
  player: PlayerId
  actingSet: ActingSet
  templates: (Action | TemplateAction)[]
}) => Action | null

/** Phase definition for phase-driven games. */
export interface PhaseDefinition<Phase, State, Action, TemplateAction = Action> {
  /** Unique name of this phase (must match values used in state). */
  name: Phase
  /** Who may act in this phase and with what semantics. */
  getActingSet(state: State): ActingSet
  /** All legal actions (or templates) available to the given player in the given state. */
  getLegalActions(state: State, player: PlayerId): (Action | TemplateAction)[]
  /** Optional hook invoked when entering this phase. */
  onEnter?(state: State, rng: RandomSource): State
  /** Optional hook invoked when exiting this phase. */
  onExit?(state: State): State
  /** Whether this phase has finished and should transition. */
  isComplete(state: State): boolean
  /** Name of the next phase to enter once this phase is complete. */
  nextPhase(state: State): Phase
}

/** Top-level game protocol: one entry for all games. */
export interface GameDefinition<
  Config extends GameConfig,
  State,
  Action,
  TemplateAction = Action,
  ViewState = State,
> {
  /** Build the initial state for a new game with the given config. */
  createInitialState(config: Config): State
  /** Who may act in the current state and with what semantics. */
  getActingSet(state: State): ActingSet
  /** Compute legal actions (or templates) for the given player in the given state. */
  getLegalActions(state: State, player: PlayerId): (Action | TemplateAction)[]
  /** Apply a concrete action to the state and return the updated state. */
  applyAction(state: State, action: Action): State
  /** Whether the game has reached a terminal (finished) state. */
  isTerminal(state: State): boolean
  /** Final result of the game; only valid when state is terminal. */
  getResult(state: State): GameResult
  /**
   * Project the full internal state to a view suitable for a specific player.
   * This is used to hide private information while preserving rules.
   */
  projectState(state: State, viewer: PlayerId): ViewState
}
