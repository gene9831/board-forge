package engine

import (
	"encoding/json"
	"testing"
)

func TestApplyEffectsSpawnAndMove(t *testing.T) {
	t.Parallel()
	st := InitialLobbyState()
	err := ApplyEffects(st, []Effect{
		{Type: "spawn_object", Data: mustJSON(t, map[string]any{
			"objectKind": "piece",
			"x":          1.0,
			"y":          2.0,
			"rotation":   0.0,
			"layer":      0,
		})},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(st.Objects) != 1 {
		t.Fatalf("objects %d", len(st.Objects))
	}
	var oid string
	for id := range st.Objects {
		oid = id
		break
	}
	err = ApplyEffects(st, []Effect{
		{Type: "move_object", Data: mustJSON(t, map[string]any{
			"guid": oid,
			"x":    10.0,
			"y":    20.0,
		})},
	})
	if err != nil {
		t.Fatal(err)
	}
	if st.Objects[oid].X != 10 || st.Objects[oid].Y != 20 {
		t.Fatalf("position %+v", st.Objects[oid])
	}
}

func TestShuffleChildrenDeterministic(t *testing.T) {
	t.Parallel()
	st := InitialLobbyState()
	step := []Effect{
		{Type: "spawn_object", Data: mustJSON(t, map[string]any{"objectKind": "a", "x": 0.0, "y": 0.0, "rotation": 0.0, "layer": 0, "guid": "c1"})},
		{Type: "spawn_object", Data: mustJSON(t, map[string]any{"objectKind": "b", "x": 0.0, "y": 0.0, "rotation": 0.0, "layer": 0, "guid": "c2"})},
		{Type: "spawn_object", Data: mustJSON(t, map[string]any{"objectKind": "c", "x": 0.0, "y": 0.0, "rotation": 0.0, "layer": 0, "guid": "c3"})},
		{Type: "spawn_object", Data: mustJSON(t, map[string]any{"objectKind": "deck", "x": 0.0, "y": 0.0, "rotation": 0.0, "layer": 0, "guid": "deck", "childGuids": []any{"c1", "c2", "c3"}})},
	}
	if err := ApplyEffects(st, step); err != nil {
		t.Fatal(err)
	}
	st.Seed = 42
	st.RNGStep = 0
	if err := ApplyEffects(st, []Effect{
		{Type: "shuffle_children", Data: mustJSON(t, map[string]any{"parentGuid": "deck"})},
	}); err != nil {
		t.Fatal(err)
	}
	first := slicesClone(st.Objects["deck"].ChildGUIDs)

	st2 := InitialLobbyState()
	if err := ApplyEffects(st2, step); err != nil {
		t.Fatal(err)
	}
	st2.Seed = 42
	st2.RNGStep = 0
	if err := ApplyEffects(st2, []Effect{
		{Type: "shuffle_children", Data: mustJSON(t, map[string]any{"parentGuid": "deck"})},
	}); err != nil {
		t.Fatal(err)
	}
	second := slicesClone(st2.Objects["deck"].ChildGUIDs)
	if len(first) != len(second) {
		t.Fatal("length mismatch")
	}
	for i := range first {
		if first[i] != second[i] {
			t.Fatalf("shuffle mismatch: %v vs %v", first, second)
		}
	}
}

func mustJSON(t *testing.T, v any) json.RawMessage {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func slicesClone(s []string) []string {
	out := make([]string, len(s))
	copy(out, s)
	return out
}
