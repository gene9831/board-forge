package rules

import (
	"sort"

	"github.com/gene9831/board-forge/internal/engine"
	lua "github.com/yuin/gopher-lua"
)

func (r *Rules) registerEngineAPI() error {
	tb := r.L.NewTable()
	r.L.SetFuncs(tb, map[string]lua.LGFunction{
		"get_objects":       r.luaGetObjects,
		"get_object":        r.luaGetObject,
		"get_tags":          r.luaGetTags,
		"object_type":       r.luaObjectType,
		"get_position":      r.luaGetPosition,
		"get_rotation":      r.luaGetRotation,
		"get_layer":         r.luaGetLayer,
		"get_parent":        r.luaGetParent,
		"children":          r.luaChildren,
		"players":           r.luaPlayers,
		"current_turn":    r.luaCurrentTurn,
		"owner":             r.luaOwner,
		"in_hand":           r.luaInHand,
		"point_in_zone":     r.luaPointInZone,
		"object_in_zone":    r.luaObjectInZone,
		"random_int":        r.luaRandomInt,
	})
	r.L.SetGlobal("engine", tb)
	return nil
}

func (r *Rules) mustState(L *lua.LState) *engine.GameState {
	if r.bindState == nil {
		L.RaiseError("engine API used without active intent context")
	}
	return r.bindState
}

func objectToLuaTable(L *lua.LState, o *engine.Object) *lua.LTable {
	t := L.NewTable()
	t.RawSetString("guid", lua.LString(o.GUID))
	t.RawSetString("type", lua.LString(o.Type))
	t.RawSetString("x", lua.LNumber(o.X))
	t.RawSetString("y", lua.LNumber(o.Y))
	t.RawSetString("rotation", lua.LNumber(o.Rotation))
	t.RawSetString("layer", lua.LNumber(o.Layer))
	t.RawSetString("parentGuid", lua.LString(o.ParentGUID))
	t.RawSetString("ownerPlayerId", lua.LString(o.OwnerPlayerID))
	tags := L.CreateTable(len(o.Tags), 0)
	for i, tag := range o.Tags {
		tags.RawSetInt(i+1, lua.LString(tag))
	}
	t.RawSetString("tags", tags)
	ch := L.CreateTable(len(o.ChildGUIDs), 0)
	for i, id := range o.ChildGUIDs {
		ch.RawSetInt(i+1, lua.LString(id))
	}
	t.RawSetString("childGuids", ch)
	return t
}

func (r *Rules) luaGetObjects(L *lua.LState) int {
	st := r.mustState(L)
	tb := L.NewTable()
	i := 1
	ids := make([]string, 0, len(st.Objects))
	for id := range st.Objects {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		tb.RawSetInt(i, objectToLuaTable(L, st.Objects[id]))
		i++
	}
	L.Push(tb)
	return 1
}

func (r *Rules) luaGetObject(L *lua.LState) int {
	st := r.mustState(L)
	guid := L.CheckString(1)
	o := st.Objects[guid]
	if o == nil {
		L.Push(lua.LNil)
		return 1
	}
	L.Push(objectToLuaTable(L, o))
	return 1
}

func (r *Rules) luaGetTags(L *lua.LState) int {
	st := r.mustState(L)
	guid := L.CheckString(1)
	o := st.Objects[guid]
	if o == nil {
		L.Push(lua.LNil)
		return 1
	}
	tb := L.CreateTable(len(o.Tags), 0)
	for i, tag := range o.Tags {
		tb.RawSetInt(i+1, lua.LString(tag))
	}
	L.Push(tb)
	return 1
}

func (r *Rules) luaObjectType(L *lua.LState) int {
	st := r.mustState(L)
	guid := L.CheckString(1)
	o := st.Objects[guid]
	if o == nil {
		L.Push(lua.LNil)
		return 1
	}
	L.Push(lua.LString(o.Type))
	return 1
}

func (r *Rules) luaGetPosition(L *lua.LState) int {
	st := r.mustState(L)
	guid := L.CheckString(1)
	o := st.Objects[guid]
	if o == nil {
		L.Push(lua.LNil)
		L.Push(lua.LNil)
		return 2
	}
	L.Push(lua.LNumber(o.X))
	L.Push(lua.LNumber(o.Y))
	return 2
}

func (r *Rules) luaGetRotation(L *lua.LState) int {
	st := r.mustState(L)
	guid := L.CheckString(1)
	o := st.Objects[guid]
	if o == nil {
		L.Push(lua.LNil)
		return 1
	}
	L.Push(lua.LNumber(o.Rotation))
	return 1
}

func (r *Rules) luaGetLayer(L *lua.LState) int {
	st := r.mustState(L)
	guid := L.CheckString(1)
	o := st.Objects[guid]
	if o == nil {
		L.Push(lua.LNil)
		return 1
	}
	L.Push(lua.LNumber(o.Layer))
	return 1
}

func (r *Rules) luaGetParent(L *lua.LState) int {
	st := r.mustState(L)
	guid := L.CheckString(1)
	o := st.Objects[guid]
	if o == nil || o.ParentGUID == "" {
		L.Push(lua.LNil)
		return 1
	}
	L.Push(lua.LString(o.ParentGUID))
	return 1
}

func (r *Rules) luaChildren(L *lua.LState) int {
	st := r.mustState(L)
	guid := L.CheckString(1)
	o := st.Objects[guid]
	if o == nil {
		L.Push(lua.LNil)
		return 1
	}
	tb := L.CreateTable(len(o.ChildGUIDs), 0)
	for i, id := range o.ChildGUIDs {
		tb.RawSetInt(i+1, lua.LString(id))
	}
	L.Push(tb)
	return 1
}

func (r *Rules) luaPlayers(L *lua.LState) int {
	st := r.mustState(L)
	ids := make([]string, 0, len(st.Players))
	for id := range st.Players {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	tb := L.CreateTable(len(ids), 0)
	for i, id := range ids {
		tb.RawSetInt(i+1, lua.LString(id))
	}
	L.Push(tb)
	return 1
}

func (r *Rules) luaCurrentTurn(L *lua.LState) int {
	st := r.mustState(L)
	if st.TurnPlayer == "" {
		L.Push(lua.LNil)
		return 1
	}
	L.Push(lua.LString(st.TurnPlayer))
	return 1
}

func (r *Rules) luaOwner(L *lua.LState) int {
	st := r.mustState(L)
	guid := L.CheckString(1)
	o := st.Objects[guid]
	if o == nil || o.OwnerPlayerID == "" {
		L.Push(lua.LNil)
		return 1
	}
	L.Push(lua.LString(o.OwnerPlayerID))
	return 1
}

func (r *Rules) luaInHand(L *lua.LState) int {
	st := r.mustState(L)
	playerID := L.CheckString(1)
	guid := L.CheckString(2)
	o := st.Objects[guid]
	if o == nil {
		L.Push(lua.LBool(false))
		return 1
	}
	// MVP: owned by player and tagged "hand".
	if o.OwnerPlayerID != playerID {
		L.Push(lua.LBool(false))
		return 1
	}
	for _, t := range o.Tags {
		if t == "hand" {
			L.Push(lua.LBool(true))
			return 1
		}
	}
	L.Push(lua.LBool(false))
	return 1
}

func (r *Rules) luaPointInZone(L *lua.LState) int {
	st := r.mustState(L)
	zoneID := L.CheckString(1)
	x := float64(L.CheckNumber(2))
	y := float64(L.CheckNumber(3))
	z, ok := st.Zones[zoneID]
	if !ok {
		L.Push(lua.LBool(false))
		return 1
	}
	inside := x >= z.MinX && x <= z.MaxX && y >= z.MinY && y <= z.MaxY
	L.Push(lua.LBool(inside))
	return 1
}

func (r *Rules) luaObjectInZone(L *lua.LState) int {
	st := r.mustState(L)
	guid := L.CheckString(1)
	zoneID := L.CheckString(2)
	o := st.Objects[guid]
	if o == nil {
		L.Push(lua.LBool(false))
		return 1
	}
	z, ok := st.Zones[zoneID]
	if !ok {
		L.Push(lua.LBool(false))
		return 1
	}
	inside := o.X >= z.MinX && o.X <= z.MaxX && o.Y >= z.MinY && o.Y <= z.MaxY
	L.Push(lua.LBool(inside))
	return 1
}

// random_int advances RNG state (side effect) for deterministic multiplayer.
func (r *Rules) luaRandomInt(L *lua.LState) int {
	st := r.mustState(L)
	min := L.CheckInt(1)
	max := L.CheckInt(2)
	if max < min {
		L.RaiseError("random_int: max < min")
		return 0
	}
	span := max - min + 1
	v := engine.Intn(st, span) + min
	L.Push(lua.LNumber(v))
	return 1
}
