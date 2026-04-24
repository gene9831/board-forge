package room

import (
	"fmt"

	"github.com/gene9831/board-forge/internal/engine"
	"github.com/gene9831/board-forge/internal/game"
)

// validateIntent checks coarse preconditions before rules run.
func validateIntent(state *engine.GameState, action game.Action) error {
	if action.Type == "" {
		return fmt.Errorf("intent type required")
	}
	switch action.Type {
	case game.ActionJoin:
		if action.PlayerID == "" {
			return fmt.Errorf("join requires playerId")
		}
		if state.Phase != engine.PhaseLobby {
			return fmt.Errorf("join only in lobby")
		}
	case game.ActionStart:
		if state.Phase != engine.PhaseLobby {
			return fmt.Errorf("start only in lobby")
		}
		if len(state.Players) == 0 {
			return fmt.Errorf("need at least one player")
		}
	case game.ActionCustom:
		if action.PlayerID == "" {
			return fmt.Errorf("custom requires playerId")
		}
	default:
		return fmt.Errorf("unknown action %q", action.Type)
	}
	return nil
}
