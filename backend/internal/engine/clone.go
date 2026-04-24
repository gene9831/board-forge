package engine

import "encoding/json"

// DeepCopyState returns a deep copy via JSON round-trip (requires JSON-serializable fields).
func DeepCopyState(state *GameState) (*GameState, error) {
	if state == nil {
		return InitialLobbyState(), nil
	}
	data, err := json.Marshal(state)
	if err != nil {
		return nil, err
	}
	var out GameState
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
