package rules

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/gene9831/board-forge/internal/game"
	lua "github.com/yuin/gopher-lua"
)

// Load opens rules from a .lua file (DoFile) or a .json game pack (embedded script + GameConfig).
func Load(path string) (*Rules, error) {
	if strings.HasSuffix(strings.ToLower(path), ".json") {
		return loadFromGameJSON(path)
	}
	return New(path)
}

func loadFromGameJSON(path string) (*Rules, error) {
	pack, err := game.LoadGamePack(path)
	if err != nil {
		return nil, err
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("game pack abs: %w", err)
	}
	dir := filepath.Dir(abs)

	L := lua.NewState(lua.Options{SkipOpenLibs: true})
	lua.OpenBase(L)
	lua.OpenString(L)
	lua.OpenTable(L)

	r := &Rules{L: L}
	if err := r.registerEngineAPI(); err != nil {
		L.Close()
		return nil, err
	}

	L.SetGlobal("BOARD_FORGE_RULES_DIR", lua.LString(dir))
	L.SetGlobal("BOARD_FORGE_GAME_DIR", lua.LString(dir))
	L.SetGlobal("GameConfig", packConfigToLua(L, pack.Config))

	if err := L.DoString(pack.Scripts.Global); err != nil {
		L.Close()
		return nil, fmt.Errorf("lua load game pack %q: %w", path, err)
	}
	return r, nil
}

func packConfigToLua(L *lua.LState, raw json.RawMessage) lua.LValue {
	if len(raw) == 0 || string(raw) == "null" {
		return L.NewTable()
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return L.NewTable()
	}
	if m == nil {
		return L.NewTable()
	}
	return goMapToLuaTable(L, m)
}
