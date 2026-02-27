import type {
  ActionResolver,
  BaseGameState,
  GameConfig,
  GameDefinition,
  PlayerId,
} from './abstract.ts'

/**
 * Generic automatic runner: repeatedly advances phases and uses the provided resolver
 * to choose concrete actions for players until the game reaches a terminal state.
 */
export const runGame = <
  Config extends GameConfig,
  State extends BaseGameState,
  Action,
  TemplateAction = Action,
>(
  game: GameDefinition<Config, State, Action, TemplateAction>,
  initialState: State,
  advancePhases: (state: State) => State,
  resolve: ActionResolver<State, Action, TemplateAction>,
): State => {
  let state = initialState
  while (true) {
    state = advancePhases(state)

    if (game.isTerminal(state)) {
      break
    }

    const actingSet = game.getActingSet(state)
    if (actingSet.type === 'none') {
      break
    }

    const playersToAct: PlayerId[] =
      actingSet.type === 'single'
        ? [actingSet.player]
        : actingSet.type === 'multiple' || actingSet.type === 'simultaneous'
          ? actingSet.players
          : // Fallback to "all players" when using the generic runner; callers should ensure
            // that their State type has a players array when using the 'all' acting set.
            state.players

    for (const player of playersToAct) {
      const templates = game.getLegalActions(state, player)
      const action = resolve({ state, player, actingSet, templates })
      if (action) {
        state = game.applyAction(state, action)
      }
    }
  }

  return state
}
