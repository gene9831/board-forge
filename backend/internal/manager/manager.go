package manager

import (
	"log/slog"
	"sync"

	"github.com/gene9831/board-forge/internal/room"
)

// Manager owns all rooms and spawns one actor goroutine per room.
type Manager struct {
	mu        sync.RWMutex
	rooms     map[string]*room.Room
	rulesPath string
}

// New builds a manager using a single rules.lua path for every room.
func New(rulesPath string) *Manager {
	return &Manager{
		rooms:     make(map[string]*room.Room),
		rulesPath: rulesPath,
	}
}

// GetOrCreate returns an existing room or creates one with the process rules path.
func (mgr *Manager) GetOrCreate(roomID string) *room.Room {
	mgr.mu.Lock()
	defer mgr.mu.Unlock()
	if existingRoom, ok := mgr.rooms[roomID]; ok {
		return existingRoom
	}
	gameRoom, err := room.New(roomID, mgr.rulesPath)
	if err != nil {
		slog.Error("room init failed", "room", roomID, "err", err)
		return nil
	}
	mgr.rooms[roomID] = gameRoom
	go gameRoom.Start()
	return gameRoom
}

// Room returns a room if it exists.
func (mgr *Manager) Room(roomID string) (*room.Room, bool) {
	mgr.mu.RLock()
	defer mgr.mu.RUnlock()
	gameRoom, ok := mgr.rooms[roomID]
	return gameRoom, ok
}
