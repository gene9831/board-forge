/**
 * DeckOps for Card: shuffle and draw. Uses RandomSource; top of deck = last element.
 */

import type { RandomSource } from './abstract.ts'

/** Fisher-Yates shuffle; returns new array. */
const shuffleArray = <T>(items: T[], rng: RandomSource): T[] => {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export const deckOps = {
  shuffle: shuffleArray,
} as const
