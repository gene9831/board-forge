package rules

import (
	"encoding/json"
	"fmt"

	"github.com/gene9831/board-forge/internal/engine"
	"github.com/gene9831/board-forge/internal/game"
	lua "github.com/yuin/gopher-lua"
)

// HandleResult is the structured outcome of Lua HandleIntent.
type HandleResult struct {
	OK      bool
	Reason  string
	Effects []engine.Effect
}

// HandleIntent runs the global HandleIntent(intent) in Lua; intent uses keys type, playerId, payload.
func (r *Rules) HandleIntent(state *engine.GameState, intent game.Action) (_ HandleResult, err error) {
	r.setBinding(state, intent.PlayerID)
	defer r.setBinding(nil, "")

	fn := r.L.GetGlobal("HandleIntent")
	if fn.Type() != lua.LTFunction {
		return HandleResult{}, fmt.Errorf("lua: global HandleIntent is not a function")
	}
	r.L.Push(fn)
	if err := pushIntentTable(r.L, intent); err != nil {
		return HandleResult{}, err
	}
	if err := r.L.PCall(1, 1, nil); err != nil {
		return HandleResult{}, fmt.Errorf("lua HandleIntent: %w", err)
	}
	ret := r.L.Get(-1)
	r.L.Pop(1)
	return parseHandleResult(ret)
}

// CallOnLoad invokes optional global OnLoad(savedTable). Effects returned are parsed like HandleIntent.
func (r *Rules) CallOnLoad(state *engine.GameState) ([]engine.Effect, error) {
	r.setBinding(state, "")
	defer r.setBinding(nil, "")

	fn := r.L.GetGlobal("OnLoad")
	if fn.Type() != lua.LTFunction {
		return nil, nil
	}
	saved := r.L.NewTable()
	r.L.Push(fn)
	r.L.Push(saved)
	if err := r.L.PCall(1, 1, nil); err != nil {
		return nil, fmt.Errorf("lua OnLoad: %w", err)
	}
	ret := r.L.Get(-1)
	r.L.Pop(1)
	if ret == lua.LNil {
		return nil, nil
	}
	tb, ok := ret.(*lua.LTable)
	if !ok {
		return nil, nil
	}
	rawFX := tb.RawGetString("effects")
	if rawFX == lua.LNil {
		return nil, nil
	}
	fxtb, ok := rawFX.(*lua.LTable)
	if !ok {
		return nil, fmt.Errorf("OnLoad: effects must be a table")
	}
	return parseEffectsTable(fxtb)
}

// CallOnStateCommitted invokes optional global OnStateCommitted() with no arguments.
func (r *Rules) CallOnStateCommitted(state *engine.GameState) error {
	r.setBinding(state, "")
	defer r.setBinding(nil, "")

	fn := r.L.GetGlobal("OnStateCommitted")
	if fn.Type() != lua.LTFunction {
		return nil
	}
	r.L.Push(fn)
	if err := r.L.PCall(0, 0, nil); err != nil {
		return fmt.Errorf("lua OnStateCommitted: %w", err)
	}
	return nil
}

func pushIntentTable(L *lua.LState, a game.Action) error {
	t := L.NewTable()
	t.RawSetString("type", lua.LString(a.Type))
	t.RawSetString("playerId", lua.LString(a.PlayerID))
	if len(a.Payload) > 0 {
		var m map[string]any
		if err := json.Unmarshal(a.Payload, &m); err != nil {
			return fmt.Errorf("intent payload json: %w", err)
		}
		t.RawSetString("payload", goMapToLuaTable(L, m))
	} else {
		t.RawSetString("payload", L.NewTable())
	}
	L.Push(t)
	return nil
}

func parseHandleResult(v lua.LValue) (HandleResult, error) {
	tb, ok := v.(*lua.LTable)
	if !ok {
		return HandleResult{}, fmt.Errorf("HandleIntent must return a table")
	}
	okVal := lua.LVAsBool(tb.RawGetString("ok"))
	reason := ""
	if rs := tb.RawGetString("reason"); rs.Type() == lua.LTString {
		reason = rs.String()
	}
	var effects []engine.Effect
	rawFX := tb.RawGetString("effects")
	if rawFX != lua.LNil {
		fxtb, ok := rawFX.(*lua.LTable)
		if !ok {
			return HandleResult{}, fmt.Errorf("effects must be a table")
		}
		var err error
		effects, err = parseEffectsTable(fxtb)
		if err != nil {
			return HandleResult{}, err
		}
	}
	return HandleResult{OK: okVal, Reason: reason, Effects: effects}, nil
}

func parseEffectsTable(fxtb *lua.LTable) ([]engine.Effect, error) {
	n := fxtb.Len()
	out := make([]engine.Effect, 0, n)
	for i := 1; i <= n; i++ {
		ev := fxtb.RawGetInt(i)
		e, err := effectFromLua(ev)
		if err != nil {
			return nil, fmt.Errorf("effect %d: %w", i, err)
		}
		out = append(out, e)
	}
	return out, nil
}

func effectFromLua(v lua.LValue) (engine.Effect, error) {
	tb, ok := v.(*lua.LTable)
	if !ok {
		return engine.Effect{}, fmt.Errorf("effect entry must be a table")
	}
	m := luaTableToMap(tb)
	typ, _ := m["type"].(string)
	if typ == "" {
		return engine.Effect{}, fmt.Errorf("effect missing type")
	}
	delete(m, "type")
	data, err := json.Marshal(m)
	if err != nil {
		return engine.Effect{}, err
	}
	return engine.Effect{Type: typ, Data: data}, nil
}
