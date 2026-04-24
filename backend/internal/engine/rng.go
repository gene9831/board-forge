package engine

import (
	"math/rand/v2"
)

// Intn returns a deterministic value in [0, max) using state.Seed and RNGStep, then advances RNGStep.
func Intn(state *GameState, max int) int {
	if max <= 1 {
		return 0
	}
	src := rand.NewPCG(uint64(state.Seed)^uint64(state.RNGStep), uint64(state.RNGStep)^0x9e3779b97f4a7c15)
	rng := rand.New(src)
	v := rng.IntN(max)
	state.RNGStep++
	return v
}
