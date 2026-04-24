package rules

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/gene9831/board-forge/internal/engine"
	"github.com/gene9831/board-forge/internal/game"
)

func TestMinimalRulesJoinAndStart(t *testing.T) {
	t.Parallel()
	rulesPath := filepath.Join("..", "..", "games", "minimal", "game.json")
	ruleVM, err := Load(rulesPath)
	if err != nil {
		t.Fatal(err)
	}
	defer ruleVM.Close()

	st := engine.InitialLobbyState()
	onLoadFX, err := ruleVM.CallOnLoad(st)
	if err != nil {
		t.Fatal(err)
	}
	if err := engine.ApplyEffects(st, onLoadFX); err != nil {
		t.Fatal(err)
	}
	if _, ok := st.Zones["table"]; !ok {
		t.Fatal("expected table zone from OnLoad")
	}

	joinRaw, _ := json.Marshal(game.JoinPayload{DisplayName: "solo"})
	hr, err := ruleVM.HandleIntent(st, game.Action{PlayerID: "p1", Type: game.ActionJoin, Payload: joinRaw})
	if err != nil {
		t.Fatal(err)
	}
	if !hr.OK {
		t.Fatalf("join rejected: %s", hr.Reason)
	}
	if err := engine.ApplyEffects(st, hr.Effects); err != nil {
		t.Fatal(err)
	}
	if st.Players["p1"] == nil {
		t.Fatal("player missing")
	}

	startRaw, _ := json.Marshal(game.StartPayload{Seed: 12345})
	hr, err = ruleVM.HandleIntent(st, game.Action{PlayerID: "p1", Type: game.ActionStart, Payload: startRaw})
	if err != nil {
		t.Fatal(err)
	}
	if !hr.OK {
		t.Fatalf("start rejected: %s", hr.Reason)
	}
	st.Seed = 12345
	if err := engine.ApplyEffects(st, hr.Effects); err != nil {
		t.Fatal(err)
	}
	if st.Phase != engine.PhasePlaying {
		t.Fatalf("phase %q", st.Phase)
	}
	if st.TurnPlayer != "p1" {
		t.Fatalf("turn %q", st.TurnPlayer)
	}
	foundBoard := false
	for _, o := range st.Objects {
		if o.Type == "table_board" {
			foundBoard = true
			break
		}
	}
	if !foundBoard {
		t.Fatal("expected table_board object")
	}
}
