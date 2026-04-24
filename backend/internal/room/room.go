package room

import (
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/gene9831/board-forge/internal/engine"
	"github.com/gene9831/board-forge/internal/game"
	"github.com/gene9831/board-forge/internal/rules"
)

// JSONSink is a concurrent-safe JSON writer (e.g. WebSocket).
type JSONSink interface {
	WriteJSON(payload any) error
}

// Snapshot is broadcast after each applied intent (full-state sync).
type Snapshot struct {
	Type         string                   `json:"type"`
	State        engine.GameState         `json:"state"`
	Messages     []engine.OutgoingMessage `json:"messages,omitempty"`
	ActionLogLen int                      `json:"actionLogLen"`
	LastAction   game.Action              `json:"lastAction,omitempty"`
}

// Room is one actor: all mutations happen in Run's receive loop.
type Room struct {
	ID      string
	actions chan game.Action
	state   *engine.GameState
	log     []game.Action
	rules   *rules.Rules

	clientsMu sync.RWMutex
	clients   map[string]JSONSink
}

// New constructs a room and loads Lua rules from rulesPath.
func New(roomID, rulesPath string) (*Room, error) {
	ruleVM, err := rules.Load(rulesPath)
	if err != nil {
		return nil, err
	}
	st := engine.InitialLobbyState()
	onLoadFX, err := ruleVM.CallOnLoad(st)
	if err != nil {
		ruleVM.Close()
		return nil, err
	}
	if err := engine.ApplyEffects(st, onLoadFX); err != nil {
		ruleVM.Close()
		return nil, err
	}
	return &Room{
		ID:      roomID,
		actions: make(chan game.Action, 64),
		state:   st,
		log:     nil,
		rules:   ruleVM,
		clients: make(map[string]JSONSink),
	}, nil
}

// Start launches the actor loop; it returns when the channel closes.
func (gameRoom *Room) Start() {
	for action := range gameRoom.actions {
		action = gameRoom.authoritativeStart(action)

		backup, err := engine.DeepCopyState(gameRoom.state)
		if err != nil {
			slog.Warn("state clone failed", "room", gameRoom.ID, "err", err)
			continue
		}

		if err := validateIntent(gameRoom.state, action); err != nil {
			gameRoom.state = backup
			slog.Warn("dropped action", "room", gameRoom.ID, "type", action.Type, "err", err)
			continue
		}

		if action.Type == game.ActionStart {
			var sp game.StartPayload
			_ = json.Unmarshal(action.Payload, &sp)
			if sp.Seed != 0 {
				gameRoom.state.Seed = sp.Seed
			}
		}

		hr, err := gameRoom.rules.HandleIntent(gameRoom.state, action)
		if err != nil {
			gameRoom.state = backup
			slog.Warn("dropped action", "room", gameRoom.ID, "type", action.Type, "err", err)
			continue
		}
		if !hr.OK {
			gameRoom.state = backup
			slog.Warn("rules rejected intent", "room", gameRoom.ID, "type", action.Type, "reason", hr.Reason)
			continue
		}

		if err := engine.ApplyEffects(gameRoom.state, hr.Effects); err != nil {
			gameRoom.state = backup
			slog.Warn("apply effects failed", "room", gameRoom.ID, "type", action.Type, "err", err)
			continue
		}

		if err := gameRoom.rules.CallOnStateCommitted(gameRoom.state); err != nil {
			gameRoom.state = backup
			slog.Warn("OnStateCommitted failed", "room", gameRoom.ID, "err", err)
			continue
		}

		gameRoom.log = append(gameRoom.log, action)
		gameRoom.broadcast()
	}
}

// Enqueue applies actions in FIFO order; blocks if the room's queue is full.
func (gameRoom *Room) Enqueue(action game.Action) {
	gameRoom.actions <- action
}

// AddClient registers a connection for snapshots.
func (gameRoom *Room) AddClient(playerID string, sink JSONSink) {
	gameRoom.clientsMu.Lock()
	defer gameRoom.clientsMu.Unlock()
	gameRoom.clients[playerID] = sink
}

// RemoveClient drops a client sink.
func (gameRoom *Room) RemoveClient(playerID string) {
	gameRoom.clientsMu.Lock()
	defer gameRoom.clientsMu.Unlock()
	delete(gameRoom.clients, playerID)
}

func (gameRoom *Room) broadcast() {
	msgs := gameRoom.state.Outbox
	gameRoom.state.Outbox = nil

	msg := Snapshot{
		Type:         "state",
		State:        *gameRoom.state,
		Messages:     msgs,
		ActionLogLen: len(gameRoom.log),
	}
	if len(gameRoom.log) > 0 {
		msg.LastAction = gameRoom.log[len(gameRoom.log)-1]
	}
	gameRoom.clientsMu.RLock()
	defer gameRoom.clientsMu.RUnlock()
	for clientID, sink := range gameRoom.clients {
		if err := sink.WriteJSON(msg); err != nil {
			slog.Warn("broadcast failed", "room", gameRoom.ID, "client", clientID, "err", err)
		}
	}
}

// authoritativeStart forces a server-owned RNG seed for replay and fairness.
func (gameRoom *Room) authoritativeStart(action game.Action) game.Action {
	if action.Type != game.ActionStart {
		return action
	}
	startPayload := game.StartPayload{Seed: time.Now().UnixNano()}
	raw, err := json.Marshal(startPayload)
	if err != nil {
		return action
	}
	action.Payload = raw
	return action
}
