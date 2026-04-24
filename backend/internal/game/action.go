package game

import "encoding/json"

// Action is a client-originated intent; JSON field names match wire protocol.
type Action struct {
	PlayerID string          `json:"playerId"`
	Type     string          `json:"type"`
	Payload  json.RawMessage `json:"payload,omitempty"`
}

// Intent type strings for the minimal wire protocol.
const (
	ActionJoin      = "join"
	ActionStart     = "start_game"
	ActionCustom    = "custom"
)

// JoinPayload is the body for ActionJoin.
type JoinPayload struct {
	DisplayName string `json:"displayName"`
}

// StartPayload is the body for ActionStart; Seed is set by the server for replayability.
type StartPayload struct {
	Seed int64 `json:"seed,omitempty"`
}
