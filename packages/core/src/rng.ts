/**
 * Deterministic seeded RNG for game-core.
 *
 * Design goals:
 * - Serializable state (for replay / sync / snapshot)
 * - Pure state transition (no implicit mutation)
 * - Adapter to RandomSource (for GameDefinition)
 *
 * Algorithm: Mulberry32
 */

import type { RandomSource, RngState } from './abstract.ts'

/** Result of a pure RNG step */
interface RngStep {
  value: number
  state: RngState
}

/** Create initial RNG state from seed */
export function createRngState(seed: number): RngState {
  return {
    seed: seed >>> 0,
    counter: 0,
  }
}

/**
 * Pure function: advance RNG and return value + next state.
 */
function next(prev: RngState): RngStep {
  const state = { seed: prev.seed >>> 0, counter: prev.counter + 1 }

  let t = (state.seed += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296

  return { value, state }
}

/**
 * Create a RandomSource adapter.
 */
export function createRandomSource(initial: RngState): RandomSource {
  let state = { ...initial }

  return {
    state: () => state,
    next(): number {
      const step = next(state)
      state = step.state
      return step.value
    },
  }
}
