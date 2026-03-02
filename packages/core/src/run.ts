import { produce } from 'immer'
import type {
  ActionResolver,
  BaseGameState,
  GameConfig,
  GameDefinition,
  PlayerId,
  RngState,
} from './abstract.ts'
import { createRandomSource, createRngState } from './rng.ts'

/** No-op phase advance for games without phases. */
const noopAdvance = <S>(s: S): S => s

/** Max phase transitions per tick to avoid infinite loops from misconfiguration. */
const MAX_PHASE_STEPS = 8

/**
 * Advance state using game.phases: run onEnter, then isComplete/onExit/nextPhase.
 * Used internally when game.phases is defined; state should have phaseEntered and rngState when phases use onEnter.
 */
function advancePhasesFromDefinition<State extends BaseGameState, Action, TemplateAction>(
  game: GameDefinition<GameConfig, State, Action, TemplateAction>,
  state: State,
): State {
  const phases = game.phases
  if (!phases) return state

  type Phase = State['phase']

  return produce(state, (draft) => {
    for (let i = 0; i < MAX_PHASE_STEPS; i++) {
      const phaseDef = phases[draft.phase as Phase]
      if (!phaseDef) break

      if (!draft.phaseEntered && phaseDef.onEnter) {
        const rngState: RngState = draft.rngState ?? createRngState(0)
        const rng = createRandomSource(rngState)
        const nextState = phaseDef.onEnter(draft as State, rng)
        Object.assign(draft, nextState)
        draft.rngState = rng.state()
        draft.phaseEntered = true
      }

      if (!phaseDef.isComplete(draft as State)) break

      if (phaseDef.onExit) {
        const nextState = phaseDef.onExit(draft as State)
        Object.assign(draft, nextState)
      }

      const nextPhase = phaseDef.nextPhase(draft as State)
      if (nextPhase === draft.phase) break

      draft.phase = nextPhase
      draft.phaseEntered = false
    }
  })
}

/**
 * Generic automatic runner: repeatedly advances phases and uses the provided resolver
 * to choose concrete actions for players until the game reaches a terminal state.
 * When game.phases is defined, phases are advanced automatically; otherwise no phase step.
 */
export const runGame = <
  Config extends GameConfig,
  State extends BaseGameState,
  Action,
  TemplateAction = Action,
>(
  game: GameDefinition<Config, State, Action, TemplateAction>,
  initialState: State,
  resolve: ActionResolver<State, Action, TemplateAction>,
): State => {
  const advance = (s: State) =>
    game.phases ? advancePhasesFromDefinition(game, s) : noopAdvance(s)
  let state = initialState
  while (true) {
    state = advance(state)

    if (game.isTerminal(state)) {
      break
    }

    const actingSet = game.getActingSet(state)
    if (actingSet.type === 'none') {
      continue
    }

    const playersToAct: PlayerId[] =
      actingSet.type === 'single'
        ? [actingSet.player]
        : actingSet.type === 'multiple' || actingSet.type === 'simultaneous' // TODO simultaneous is not supported yet
          ? actingSet.players
          : // Fallback to "all players" when using the generic runner; callers should ensure
            // that their State type has a players array when using the 'all' acting set.
            state.players

    for (const player of playersToAct) {
      const legalActions = game.getLegalActions(state, player)
      const action = resolve({ state, player, actingSet, legalActions })
      if (action) {
        state = game.applyAction(state, action)
      }
    }
  }

  return state
}
