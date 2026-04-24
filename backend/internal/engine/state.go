package engine

// Object is a 2D tabletop entity (piece, card stack root, container, etc.).
type Object struct {
	GUID          string         `json:"guid"`
	Type          string         `json:"type"`
	Tags          []string       `json:"tags,omitempty"`
	X             float64        `json:"x"`
	Y             float64        `json:"y"`
	Rotation      float64        `json:"rotation"`
	Layer         int            `json:"layer"`
	ParentGUID    string         `json:"parentGuid,omitempty"`
	ChildGUIDs    []string       `json:"childGuids,omitempty"`
	OwnerPlayerID string         `json:"ownerPlayerId,omitempty"`
	Attr          map[string]any `json:"attr,omitempty"`
}

// Zone is an axis-aligned rectangle in table space for hit tests (min/max inclusive corners).
type Zone struct {
	ID string `json:"id"`
	// MinX, MinY, MaxX, MaxY define inclusive AABB bounds in table coordinates.
	MinX float64 `json:"minX"`
	MinY float64 `json:"minY"`
	MaxX float64 `json:"maxX"`
	MaxY float64 `json:"maxY"`
}

// Player holds seating metadata and free-form attributes for rules.
type Player struct {
	ID          string         `json:"id"`
	DisplayName string         `json:"displayName,omitempty"`
	Color       string         `json:"color,omitempty"`
	Attributes  map[string]any `json:"attributes,omitempty"`
}

// OutgoingMessage is queued during effect application for the room to attach to snapshots.
type OutgoingMessage struct {
	Kind     string `json:"kind"` // broadcast | tell | log_host
	Message  string `json:"message"`
	PlayerID string `json:"playerId,omitempty"`
}

// GameState is authoritative, JSON-serializable state for snapshots and replay.
type GameState struct {
	Objects       map[string]*Object `json:"objects"`
	Zones         map[string]Zone    `json:"zones"`
	Players       map[string]*Player `json:"players"`
	TurnPlayer    string             `json:"turnPlayer"`
	Phase         string             `json:"phase"`
	Attributes    map[string]any     `json:"attributes,omitempty"`
	Seed          int64              `json:"seed"`
	RNGStep       int64              `json:"rngStep"`
	NextObjectSeq uint64             `json:"nextObjectSeq"`
	Outbox        []OutgoingMessage  `json:"outbox,omitempty"`
}

// Phase names for generic flow.
const (
	PhaseLobby    = "lobby"
	PhasePlaying  = "playing"
	PhaseFinished = "finished"
)

// InitialLobbyState returns an empty lobby with initialized maps.
func InitialLobbyState() *GameState {
	return &GameState{
		Objects:    make(map[string]*Object),
		Zones:      make(map[string]Zone),
		Players:    make(map[string]*Player),
		TurnPlayer: "",
		Phase:      PhaseLobby,
		Attributes: make(map[string]any),
		Seed:       0,
		RNGStep:    0,
		Outbox:     nil,
	}
}

// EnsurePlayer creates an empty player entry if missing.
func EnsurePlayer(state *GameState, playerID string) *Player {
	if state.Players == nil {
		state.Players = make(map[string]*Player)
	}
	if existing, ok := state.Players[playerID]; ok {
		return existing
	}
	player := &Player{
		ID:         playerID,
		Attributes: make(map[string]any),
	}
	state.Players[playerID] = player
	return player
}
