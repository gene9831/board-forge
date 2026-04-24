package game

import (
	"encoding/json"
	"fmt"
	"os"
)

// GamePack is a single-file game definition (metadata, config JSON, embedded global Lua).
type GamePack struct {
	SchemaVersion int `json:"schemaVersion"`

	Meta GamePackMeta `json:"meta"`

	// Config is opaque JSON made available to Lua as the global table `GameConfig`.
	Config json.RawMessage `json:"config,omitempty"`

	Scripts GamePackScripts `json:"scripts"`
}

// GamePackMeta describes the game for tooling and UI.
type GamePackMeta struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Version     string   `json:"version"`
	Description string   `json:"description,omitempty"`
	Authors     []string `json:"authors,omitempty"`
}

// GamePackScripts holds embedded rule sources.
type GamePackScripts struct {
	// Global is the full Lua source (HandleIntent, OnLoad, etc.).
	Global string `json:"global"`
}

// LoadGamePack reads and validates a game.json from disk.
func LoadGamePack(path string) (*GamePack, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var pack GamePack
	if err := json.Unmarshal(raw, &pack); err != nil {
		return nil, fmt.Errorf("game pack json: %w", err)
	}
	if pack.SchemaVersion < 1 {
		return nil, fmt.Errorf("game pack: unsupported schemaVersion %d", pack.SchemaVersion)
	}
	if pack.Scripts.Global == "" {
		return nil, fmt.Errorf("game pack: scripts.global is required")
	}
	return &pack, nil
}
