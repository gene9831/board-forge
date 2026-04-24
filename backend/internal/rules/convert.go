package rules

import (
	"fmt"

	lua "github.com/yuin/gopher-lua"
)

// luaKeyToString converts a Lua table key to a Go map key (used for effect payloads).
func luaKeyToString(k lua.LValue) string {
	switch k.Type() {
	case lua.LTString:
		return k.String()
	case lua.LTNumber:
		return fmt.Sprint(int64(lua.LVAsNumber(k)))
	default:
		return k.String()
	}
}

func luaValueToGo(v lua.LValue) any {
	switch v.Type() {
	case lua.LTNil:
		return nil
	case lua.LTBool:
		return lua.LVAsBool(v)
	case lua.LTNumber:
		return float64(lua.LVAsNumber(v))
	case lua.LTString:
		return v.String()
	case lua.LTTable:
		tb := v.(*lua.LTable)
		n := tb.Len()
		if n > 0 {
			arr := make([]any, n)
			for i := 1; i <= n; i++ {
				arr[i-1] = luaValueToGo(tb.RawGetInt(i))
			}
			return arr
		}
		return luaTableToMap(tb)
	default:
		return nil
	}
}

func luaTableToMap(tb *lua.LTable) map[string]any {
	m := make(map[string]any)
	tb.ForEach(func(k lua.LValue, v lua.LValue) {
		m[luaKeyToString(k)] = luaValueToGo(v)
	})
	return m
}

func goMapToLuaTable(L *lua.LState, m map[string]any) *lua.LTable {
	t := L.NewTable()
	for k, v := range m {
		t.RawSetString(k, goValueToLua(L, v))
	}
	return t
}

func goValueToLua(L *lua.LState, v any) lua.LValue {
	switch x := v.(type) {
	case nil:
		return lua.LNil
	case bool:
		return lua.LBool(x)
	case float64:
		return lua.LNumber(x)
	case string:
		return lua.LString(x)
	case []any:
		arr := L.CreateTable(len(x), 0)
		for i, el := range x {
			arr.RawSetInt(i+1, goValueToLua(L, el))
		}
		return arr
	case map[string]any:
		return goMapToLuaTable(L, x)
	default:
		return lua.LString(fmt.Sprint(x))
	}
}
