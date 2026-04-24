package rules

import (
	"fmt"
	"path/filepath"

	"github.com/gene9831/board-forge/internal/engine"
	lua "github.com/yuin/gopher-lua"
)

// Rules hosts a sandboxed Lua VM and registers the host `engine` API.
type Rules struct {
	L          *lua.LState
	bindState  *engine.GameState
	bindPlayer string
}

// New loads rulesPath (.lua) with a restricted standard library and registers `engine.*`.
// For JSON game packs use Load instead.
func New(rulesPath string) (*Rules, error) {
	L := lua.NewState(lua.Options{SkipOpenLibs: true})
	lua.OpenBase(L)
	lua.OpenString(L)
	lua.OpenTable(L)

	r := &Rules{L: L}
	if err := r.registerEngineAPI(); err != nil {
		L.Close()
		return nil, err
	}

	absRules, err := filepath.Abs(rulesPath)
	if err != nil {
		L.Close()
		return nil, fmt.Errorf("rules path abs: %w", err)
	}
	dir := filepath.Dir(absRules)
	L.SetGlobal("BOARD_FORGE_RULES_DIR", lua.LString(dir))
	L.SetGlobal("BOARD_FORGE_GAME_DIR", lua.LString(dir))
	L.SetGlobal("GameConfig", L.NewTable())

	if err := L.DoFile(absRules); err != nil {
		L.Close()
		return nil, fmt.Errorf("lua load %q: %w", rulesPath, err)
	}
	return r, nil
}

// Close releases the Lua VM.
func (r *Rules) Close() {
	if r != nil && r.L != nil {
		r.L.Close()
		r.L = nil
	}
}

func (r *Rules) setBinding(state *engine.GameState, intentPlayerID string) {
	r.bindState = state
	r.bindPlayer = intentPlayerID
}
