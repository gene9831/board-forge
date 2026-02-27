import {
  advanceCaboPhases,
  caboGameDefinition,
  runGame,
  type ActionResolver,
  type CaboAction,
  type CaboState,
  type CaboTemplateAction,
  type PlayerId,
} from '@board-forge/core'

const args = process.argv.slice(2)
const playerIds = args.length > 0 ? args : ['P1', 'P2', 'P3', 'P4']

const peekedCardIdsByPlayer: Record<PlayerId, string[]> = {}

function formatCaboState(state: CaboState): string {
  const lines: string[] = []

  lines.push('=== Cabo Phase Demo ===')
  lines.push(`Phase: ${state.phase}`)
  lines.push(`Players: ${state.players.join(', ')}`)
  lines.push('')

  const zones = Object.values(state.zones)

  for (const playerId of state.players) {
    const playerCards = zones
      .filter((zone) => zone.owner === playerId)
      .flatMap((zone) => zone.items)

    lines.push(
      `Player ${playerId} cards: ` +
        (playerCards.length ? playerCards.map((card) => `${card.value}`).join(' ') : '(none)'),
    )
  }

  const drawPile = state.zones['drawPile']
  const discardPile = state.zones['discardPile']

  lines.push('')
  lines.push(`Draw pile size: ${drawPile?.items.length ?? 0}`)

  const topDiscard = discardPile?.items.at(-1)
  if (topDiscard) {
    lines.push(`Top of discard pile (faceup): value=${topDiscard.value}, id=${topDiscard.id}`)
  } else {
    lines.push('Discard pile is empty')
  }

  lines.push('')
  lines.push('Peek summary (status and randomly chosen cards):')
  for (const playerId of state.players) {
    const done = state.peekedPlayers[playerId] ?? false
    const ids = peekedCardIdsByPlayer[playerId]
    if (!ids || ids.length === 0) {
      lines.push(`- ${playerId}: ${done ? 'peeked' : 'pending'} -> (none)`)
      continue
    }

    const ownerZones = Object.values(state.zones).filter((zone) => zone.owner === playerId)
    const cardsWithIndex = ownerZones.flatMap((zone) =>
      zone.items.map((card, index) => ({ card, index })),
    )

    const [firstId, secondId] = ids
    const first = cardsWithIndex.find((entry) => entry.card.id === firstId)
    const second = cardsWithIndex.find((entry) => entry.card.id === secondId)

    if (!first || !second) {
      lines.push(`- ${playerId}: (?, ?)`)
      continue
    }

    const [a, b] = first.index <= second.index ? [first, second] : [second, first]

    const parts = [`(${a.index}, ${a.card.value})`, `(${b.index}, ${b.card.value})`]
    lines.push(`- ${playerId}: ${done ? 'peeked' : 'pending'} -> ${parts.join(' ')}`)
  }

  return lines.join('\n')
}

const resolver: ActionResolver<CaboState, CaboAction, CaboTemplateAction> = (args: {
  state: CaboState
  player: PlayerId
  actingSet: import('@board-forge/core').ActingSet
  templates: (CaboAction | CaboTemplateAction)[]
}) => {
  const { state, player, actingSet, templates } = args
  // Only resolve actions during the peek phase.
  if (state.phase !== 'peek') return null
  if (actingSet.type === 'none') return null

  const template = templates.find(
    (a: CaboAction | CaboTemplateAction) => a.type === 'setup-peek-template',
  )
  if (!template || template.payload?.requiredCards !== 2) {
    return null
  }

  const zonesForPlayer = Object.values(state.zones).filter((zone) => zone.owner === player)
  const cards = zonesForPlayer.flatMap((zone) => zone.items)
  if (cards.length < 2) {
    return null
  }

  const firstIndex = Math.floor(Math.random() * cards.length)
  let secondIndex = Math.floor(Math.random() * cards.length)
  while (secondIndex === firstIndex) {
    secondIndex = Math.floor(Math.random() * cards.length)
  }

  const chosenIds: [string, string] = [cards[firstIndex]!.id, cards[secondIndex]!.id]
  peekedCardIdsByPlayer[player] = chosenIds

  const action: CaboAction = {
    type: 'setup-peek',
    player,
    payload: {
      cardIds: chosenIds,
    },
  }

  return action
}

const initial: CaboState = caboGameDefinition.createInitialState({ playerIds, seed: 42 })
const state: CaboState = runGame(caboGameDefinition, initial, advanceCaboPhases, resolver)

console.log(formatCaboState(state))
