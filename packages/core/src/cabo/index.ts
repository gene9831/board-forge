/**
 * Cabo game definition: setup phase only (shuffle, deal, draw pile, discard pile).
 */

import { produce } from 'immer'
import type {
  BaseGameState,
  GameAction,
  GameConfig,
  GameDefinition,
  PhaseDefinition,
  PlayerId,
  RandomSource,
  RngState,
  Zone,
} from '../abstract.ts'
import { deckOps } from '../deck-ops.ts'
import { createRandomSource, createRngState } from '../rng.ts'

/** Cabo card with stable id and numeric value. */
export interface CaboCard {
  id: string
  value: number
}

export type CaboPhase = 'setup' | 'peek' | 'ended'

/** Cabo-specific game state: base state with Cabo cards in zones plus Cabo metadata. */
export interface CaboState extends BaseGameState<CaboCard, CaboPhase> {
  /** Seed used to initialize the RNG for this game; persisted for deterministic replay. */
  seed: number
  /** Serializable RNG state used to drive phase-level randomness. */
  rngState: RngState
  /** Whether the current phase's onEnter hook has already been executed. */
  phaseEntered: boolean
  /** Players who have completed their initial peek of two cards. */
  peekedPlayers: Record<PlayerId, boolean>
}

/** Cabo-specific game config, extending the base GameConfig with an optional seed. */
export interface CaboGameConfig extends GameConfig {
  /** Optional seed for deterministic randomness; when omitted, Date.now() is used. */
  seed?: number
}

/** Template action: player may perform an initial peek of up to two cards. */
export interface CaboSetupPeekTemplateAction extends GameAction {
  type: 'setup-peek-template'
  payload: {
    /** 初始 peek 行为必须精确选择两张牌。 */
    requiredCards: 2
  }
}

/** Concrete action: player has chosen exactly two cards to peek at. */
export interface CaboSetupPeekAction extends GameAction {
  type: 'setup-peek'
  payload: {
    cardIds: [string, string]
  }
}

export type CaboAction = CaboSetupPeekAction
export type CaboTemplateAction = CaboSetupPeekTemplateAction

export type CaboPhaseDefinition = PhaseDefinition<
  CaboPhase,
  CaboState,
  CaboAction,
  CaboTemplateAction
>
export type CaboGameDefinition = GameDefinition<
  CaboGameConfig,
  CaboState,
  CaboAction,
  CaboTemplateAction
>

/** Zone id helpers for Cabo. */
const DRAW_PILE_ID = 'drawPile'
const DISCARD_PILE_ID = 'discardPile'

/** Build a fresh Cabo deck. Cabo deck: 0 and 13 have 2 copies, 1–12 have 4 copies. */
const createCaboDeck = () => {
  const cards: CaboCard[] = []

  for (let value = 0; value <= 13; value++) {
    const copies = value === 0 || value === 13 ? 2 : 4
    for (let copy = 0; copy < copies; copy++) {
      cards.push({
        id: `c-${value}-${copy}`,
        value,
      })
    }
  }

  return cards
}

/** Perform Cabo setup: shuffle, deal 4 cards to each player, create draw + discard piles. */
const setupCabo = (state: CaboState, rng: RandomSource): CaboState => {
  const { players } = state
  if (!players.length) {
    throw new Error('Cabo requires at least one player')
  }
  const uniqueIds = new Set(players)
  if (uniqueIds.size !== players.length) {
    throw new Error('Cabo requires unique player ids')
  }

  const freshDeck = createCaboDeck()
  const shuffled = deckOps.shuffle(freshDeck, rng)

  const zones: Record<string, Zone<CaboCard>> = {}

  // Initialize player tableaus with 4 cards each, dealt from the top of the shuffled deck.
  let deckIndex = shuffled.length - 1

  for (const playerId of players) {
    const hand: CaboCard[] = []
    for (let i = 0; i < 4; i++) {
      if (deckIndex < 0) {
        throw new Error('Not enough cards to deal Cabo setup')
      }
      hand.push(shuffled[deckIndex]!)
      deckIndex -= 1
    }

    const zoneId = `tableau:${playerId}`

    zones[zoneId] = {
      id: zoneId,
      owner: playerId,
      items: hand,
      visibility: 'hidden',
    }
  }

  // Remaining deck becomes draw pile (facedown).
  const remaining = shuffled.slice(0, deckIndex + 1)
  if (remaining.length === 0) {
    throw new Error('Draw pile is empty after dealing Cabo setup')
  }

  // Top of deck (last element) is turned faceup to start the discard pile.
  const topCard = remaining[remaining.length - 1]!
  const drawPile = remaining.slice(0, remaining.length - 1)

  zones[DRAW_PILE_ID] = {
    id: DRAW_PILE_ID,
    items: drawPile,
    visibility: 'hidden',
  }

  zones[DISCARD_PILE_ID] = {
    id: DISCARD_PILE_ID,
    items: [topCard],
    visibility: 'public',
  }

  return produce(state, (draft) => {
    draft.zones = zones
  })
}

const phases: Record<CaboPhase, CaboPhaseDefinition> = {
  setup: {
    name: 'setup',
    getActingSet() {
      // Setup-only: no one may act.
      return { type: 'none' }
    },
    getLegalActions() {
      // No actions are available in setup phase.
      return []
    },
    onEnter(state, rng) {
      return setupCabo(state, rng)
    },
    onExit(state) {
      return state
    },
    isComplete() {
      // Setup completes immediately after dealing.
      return true
    },
    nextPhase() {
      return 'peek'
    },
  },
  peek: {
    name: 'peek',
    getActingSet(state) {
      const pending = state.players.filter((id) => !state.peekedPlayers[id])
      if (pending.length === 0) {
        return { type: 'none' }
      }
      return { type: 'simultaneous', players: pending }
    },
    getLegalActions(state, player: PlayerId) {
      if (state.peekedPlayers[player]) {
        return []
      }

      const zonesForPlayer = Object.values(state.zones).filter((zone) => zone.owner === player)
      const cards = zonesForPlayer.flatMap((zone) => zone.items)

      if (cards.length < 2) {
        return []
      }

      // 返回一个模板 action，描述“该玩家此时可以进行一次初始 peek，且必须精确选择两张牌”；
      // 具体选择哪两张牌由调用方决定，并构造 type 为 'setup-peek' 的 concrete action。
      return [
        {
          type: 'setup-peek-template',
          player,
          payload: {
            requiredCards: 2,
          },
        },
      ]
    },
    isComplete(state) {
      return state.players.every((id) => state.peekedPlayers[id])
    },
    nextPhase() {
      return 'ended'
    },
  },
  ended: {
    name: 'ended',
    getActingSet() {
      // Terminal phase: no further actions.
      return { type: 'none' }
    },
    getLegalActions() {
      return []
    },
    isComplete() {
      // Remain in ended; game termination is handled by isTerminal.
      return true
    },
    nextPhase() {
      return 'ended'
    },
  },
}

const getCurrentPhase = (state: CaboState): CaboPhaseDefinition => {
  const phase = phases[state.phase]

  if (!phase) {
    throw new Error(`Unknown phase: ${state.phase}`)
  }

  return phase
}

/** Advance through automatically-completing phases (e.g. setup → peek). */
export const advanceCaboPhases = (state: CaboState): CaboState =>
  produce(state, (draft) => {
    // 安全上限：防止 phase 配置错误时出现无限循环（例如 nextPhase 形成环且 isComplete 始终为 true）。
    for (let i = 0; i < 8; i++) {
      const phase = getCurrentPhase(draft)

      // 首次进入某个 phase 时，如果定义了 onEnter，就调用一次。
      if (!draft.phaseEntered && phase.onEnter) {
        const rng = createRandomSource(draft.rngState)
        const nextState = phase.onEnter(draft, rng)
        const updatedRngState = rng.state()

        Object.assign(draft, nextState)
        draft.rngState = updatedRngState
        draft.phaseEntered = true
      }

      // 当前 phase 尚未完成时不再推进
      if (!phase.isComplete(draft)) {
        break
      }

      // 即将离开当前 phase，如果定义了 onExit，就调用一次。
      if (phase.onExit) {
        const nextState = phase.onExit(draft)
        Object.assign(draft, nextState)
      }

      const nextPhase = phase.nextPhase(draft)
      if (nextPhase === draft.phase) {
        break
      }

      draft.phase = nextPhase
      draft.phaseEntered = false
    }
  })

/** Cabo GameDefinition – only setup is meaningful for now. */
export const caboGameDefinition: CaboGameDefinition = {
  createInitialState(config): CaboState {
    const seed = config.seed ?? Date.now()

    const initialState: CaboState = {
      players: [...config.playerIds],
      round: 1,
      turn: 1,
      phase: 'setup',
      zones: {},
      seed: seed,
      rngState: createRngState(seed),
      phaseEntered: false,
      peekedPlayers: {},
    }
    return initialState
  },

  getActingSet(state) {
    const phase = getCurrentPhase(state)
    return phase.getActingSet(state)
  },

  getLegalActions(state, player) {
    const phase = getCurrentPhase(state)
    return phase.getLegalActions(state, player)
  },

  applyAction(state, action) {
    if (action.type === 'setup-peek') {
      const payload = action.payload
      if (!payload || payload.cardIds.length !== 2) {
        throw new Error('Initial setup-peek must specify exactly two card ids')
      }

      const { player } = action
      const { cardIds } = payload

      // Validate that both card ids belong to this player's zones.
      const zonesForPlayer = Object.values(state.zones).filter((zone) => zone.owner === player)
      const playerCardIds = new Set(zonesForPlayer.flatMap((zone) => zone.items.map((c) => c.id)))

      if (!cardIds.every((id: string) => playerCardIds.has(id))) {
        throw new Error('Peek targets must be cards owned by the player')
      }

      return produce(state, (draft) => {
        draft.peekedPlayers[player] = true
      })
    }
    return state
  },

  isTerminal(state) {
    // For the demo: game ends after all players finish the peek phase.
    return state.phase === 'ended'
  },

  getResult() {
    throw new Error('Cabo result is not defined – gameplay not implemented')
  },

  projectState(state, _viewer) {
    // For now, return full state; caller can respect visibility metadata.
    return state
  },
}
