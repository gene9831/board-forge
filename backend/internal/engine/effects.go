package engine

import (
	"encoding/json"
	"fmt"
	"slices"
)

// Effect is a declarative state change produced by rules and applied by the engine.
// Data holds type-specific fields as JSON (from Lua tables or Go callers).
type Effect struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data,omitempty"`
}

// ApplyEffects applies a list of effects in order; on first error, returns without applying remaining.
func ApplyEffects(state *GameState, effects []Effect) error {
	for i := range effects {
		if err := applyEffect(state, &effects[i]); err != nil {
			return fmt.Errorf("effect %d (%s): %w", i, effects[i].Type, err)
		}
	}
	return nil
}

func applyEffect(state *GameState, e *Effect) error {
	switch e.Type {
	case "spawn_object":
		var p spawnObjectData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		return effectSpawnObject(state, &p)
	case "destroy_object":
		var p destroyObjectData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		return effectDestroyObject(state, &p)
	case "move_object":
		var p moveObjectData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		return effectMoveObject(state, &p)
	case "set_parent":
		var p setParentData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		return effectSetParent(state, &p)
	case "reorder_children":
		var p reorderChildrenData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		return effectReorderChildren(state, &p)
	case "set_tags":
		var p setTagsData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		return effectSetTags(state, &p)
	case "set_owner":
		var p setOwnerData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		return effectSetOwner(state, &p)
	case "set_phase":
		var p setPhaseData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		state.Phase = p.Phase
		return nil
	case "set_turn_player":
		var p setTurnPlayerData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		state.TurnPlayer = p.PlayerID
		return nil
	case "ensure_player":
		var p ensurePlayerData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		pl := EnsurePlayer(state, p.PlayerID)
		if p.DisplayName != "" {
			pl.DisplayName = p.DisplayName
		}
		if p.Color != "" {
			pl.Color = p.Color
		}
		return nil
	case "shuffle_children":
		var p shuffleChildrenData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		return effectShuffleChildren(state, &p)
	case "set_game_attr":
		var p setAttrData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		if state.Attributes == nil {
			state.Attributes = make(map[string]any)
		}
		state.Attributes[p.Key] = p.Value
		return nil
	case "set_player_attr":
		var p setPlayerAttrData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		pl := state.Players[p.PlayerID]
		if pl == nil {
			return fmt.Errorf("unknown player %q", p.PlayerID)
		}
		if pl.Attributes == nil {
			pl.Attributes = make(map[string]any)
		}
		pl.Attributes[p.Key] = p.Value
		return nil
	case "define_zone":
		var p defineZoneData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		if state.Zones == nil {
			state.Zones = make(map[string]Zone)
		}
		state.Zones[p.ID] = Zone{
			ID: p.ID, MinX: p.MinX, MinY: p.MinY, MaxX: p.MaxX, MaxY: p.MaxY,
		}
		return nil
	case "broadcast":
		var p messageData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		state.Outbox = append(state.Outbox, OutgoingMessage{Kind: "broadcast", Message: p.Message})
		return nil
	case "tell":
		var p tellData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		state.Outbox = append(state.Outbox, OutgoingMessage{Kind: "tell", Message: p.Message, PlayerID: p.PlayerID})
		return nil
	case "log_host":
		var p messageData
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return err
		}
		state.Outbox = append(state.Outbox, OutgoingMessage{Kind: "log_host", Message: p.Message})
		return nil
	default:
		return fmt.Errorf("unknown effect type %q", e.Type)
	}
}

// --- effect payloads (JSON fields use camelCase for wire/Lua parity).

type spawnObjectData struct {
	GUID          string         `json:"guid,omitempty"`
	ObjectKind    string         `json:"objectKind"`
	Tags          []string       `json:"tags,omitempty"`
	X             float64        `json:"x"`
	Y             float64        `json:"y"`
	Rotation      float64        `json:"rotation"`
	Layer         int            `json:"layer"`
	ParentGUID    string         `json:"parentGuid,omitempty"`
	OwnerPlayerID string         `json:"ownerPlayerId,omitempty"`
	ChildGUIDs    []string       `json:"childGuids,omitempty"`
	Attr          map[string]any `json:"attr,omitempty"`
}

type destroyObjectData struct {
	GUID string `json:"guid"`
}

type moveObjectData struct {
	GUID     string  `json:"guid"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Rotation *float64 `json:"rotation,omitempty"`
	Layer    *int    `json:"layer,omitempty"`
}

type setParentData struct {
	GUID       string `json:"guid"`
	ParentGUID string `json:"parentGuid,omitempty"`
}

type reorderChildrenData struct {
	ParentGUID  string   `json:"parentGuid"`
	ChildGUIDs  []string `json:"childGuids"`
}

type setTagsData struct {
	GUID string   `json:"guid"`
	Tags []string `json:"tags"`
}

type setOwnerData struct {
	GUID          string `json:"guid"`
	OwnerPlayerID string `json:"ownerPlayerId,omitempty"`
}

type setPhaseData struct {
	Phase string `json:"phase"`
}

type setTurnPlayerData struct {
	PlayerID string `json:"playerId"`
}

type ensurePlayerData struct {
	PlayerID    string `json:"playerId"`
	DisplayName string `json:"displayName,omitempty"`
	Color       string `json:"color,omitempty"`
}

type shuffleChildrenData struct {
	ParentGUID string `json:"parentGuid"`
}

type setAttrData struct {
	Key   string `json:"key"`
	Value any    `json:"value"`
}

type setPlayerAttrData struct {
	PlayerID string `json:"playerId"`
	Key      string `json:"key"`
	Value    any    `json:"value"`
}

type defineZoneData struct {
	ID   string  `json:"id"`
	MinX float64 `json:"minX"`
	MinY float64 `json:"minY"`
	MaxX float64 `json:"maxX"`
	MaxY float64 `json:"maxY"`
}

type messageData struct {
	Message string `json:"message"`
}

type tellData struct {
	Message  string `json:"message"`
	PlayerID string `json:"playerId"`
}

func effectSpawnObject(state *GameState, p *spawnObjectData) error {
	if p.ObjectKind == "" {
		return fmt.Errorf("spawn_object requires objectKind")
	}
	guid := p.GUID
	if guid == "" {
		state.NextObjectSeq++
		guid = fmt.Sprintf("obj-%d", state.NextObjectSeq)
	}
	if state.Objects == nil {
		state.Objects = make(map[string]*Object)
	}
	if _, exists := state.Objects[guid]; exists {
		return fmt.Errorf("spawn_object: object %q already exists", guid)
	}
	obj := &Object{
		GUID:          guid,
		Type:          p.ObjectKind,
		Tags:          slices.Clone(p.Tags),
		X:             p.X,
		Y:             p.Y,
		Rotation:      p.Rotation,
		Layer:         p.Layer,
		OwnerPlayerID: p.OwnerPlayerID,
		Attr:          cloneAttr(p.Attr),
	}
	state.Objects[guid] = obj

	for _, cid := range p.ChildGUIDs {
		child := state.Objects[cid]
		if child == nil {
			return fmt.Errorf("spawn_object: child %q not found", cid)
		}
		orphanFromParent(state, cid)
		child.ParentGUID = guid
		obj.ChildGUIDs = append(obj.ChildGUIDs, cid)
	}

	if p.ParentGUID != "" {
		parent := state.Objects[p.ParentGUID]
		if parent == nil {
			return fmt.Errorf("spawn_object: parent %q not found", p.ParentGUID)
		}
		obj.ParentGUID = p.ParentGUID
		parent.ChildGUIDs = append(parent.ChildGUIDs, guid)
	}
	return nil
}

func cloneAttr(m map[string]any) map[string]any {
	if m == nil {
		return nil
	}
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

func effectDestroyObject(state *GameState, p *destroyObjectData) error {
	obj := state.Objects[p.GUID]
	if obj == nil {
		return fmt.Errorf("destroy_object: unknown %q", p.GUID)
	}
	// Depth-first destroy children first.
	for _, cid := range slices.Clone(obj.ChildGUIDs) {
		_ = effectDestroyObject(state, &destroyObjectData{GUID: cid})
	}
	orphanFromParent(state, p.GUID)
	delete(state.Objects, p.GUID)
	return nil
}

func orphanFromParent(state *GameState, guid string) {
	obj := state.Objects[guid]
	if obj == nil || obj.ParentGUID == "" {
		if obj != nil {
			obj.ParentGUID = ""
		}
		return
	}
	parent := state.Objects[obj.ParentGUID]
	if parent != nil {
		parent.ChildGUIDs = removeString(parent.ChildGUIDs, guid)
	}
	obj.ParentGUID = ""
}

func removeString(slice []string, s string) []string {
	return slices.DeleteFunc(slices.Clone(slice), func(x string) bool { return x == s })
}

func effectMoveObject(state *GameState, p *moveObjectData) error {
	obj := state.Objects[p.GUID]
	if obj == nil {
		return fmt.Errorf("move_object: unknown %q", p.GUID)
	}
	obj.X = p.X
	obj.Y = p.Y
	if p.Rotation != nil {
		obj.Rotation = *p.Rotation
	}
	if p.Layer != nil {
		obj.Layer = *p.Layer
	}
	return nil
}

func effectSetParent(state *GameState, p *setParentData) error {
	obj := state.Objects[p.GUID]
	if obj == nil {
		return fmt.Errorf("set_parent: unknown child %q", p.GUID)
	}
	if p.ParentGUID != "" && state.Objects[p.ParentGUID] == nil {
		return fmt.Errorf("set_parent: unknown parent %q", p.ParentGUID)
	}
	orphanFromParent(state, p.GUID)
	if p.ParentGUID == "" {
		return nil
	}
	parent := state.Objects[p.ParentGUID]
	obj.ParentGUID = p.ParentGUID
	parent.ChildGUIDs = append(parent.ChildGUIDs, p.GUID)
	return nil
}

func effectReorderChildren(state *GameState, p *reorderChildrenData) error {
	parent := state.Objects[p.ParentGUID]
	if parent == nil {
		return fmt.Errorf("reorder_children: unknown parent %q", p.ParentGUID)
	}
	seen := make(map[string]struct{}, len(p.ChildGUIDs))
	for _, id := range p.ChildGUIDs {
		if _, ok := seen[id]; ok {
			return fmt.Errorf("reorder_children: duplicate child %q", id)
		}
		seen[id] = struct{}{}
		child := state.Objects[id]
		if child == nil {
			return fmt.Errorf("reorder_children: unknown child %q", id)
		}
		if child.ParentGUID != p.ParentGUID {
			return fmt.Errorf("reorder_children: child %q not under parent %q", id, p.ParentGUID)
		}
	}
	if len(p.ChildGUIDs) != len(parent.ChildGUIDs) {
		return fmt.Errorf("reorder_children: child count mismatch")
	}
	parent.ChildGUIDs = slices.Clone(p.ChildGUIDs)
	return nil
}

func effectSetTags(state *GameState, p *setTagsData) error {
	obj := state.Objects[p.GUID]
	if obj == nil {
		return fmt.Errorf("set_tags: unknown %q", p.GUID)
	}
	obj.Tags = slices.Clone(p.Tags)
	return nil
}

func effectSetOwner(state *GameState, p *setOwnerData) error {
	obj := state.Objects[p.GUID]
	if obj == nil {
		return fmt.Errorf("set_owner: unknown %q", p.GUID)
	}
	obj.OwnerPlayerID = p.OwnerPlayerID
	return nil
}

func effectShuffleChildren(state *GameState, p *shuffleChildrenData) error {
	parent := state.Objects[p.ParentGUID]
	if parent == nil {
		return fmt.Errorf("shuffle_children: unknown parent %q", p.ParentGUID)
	}
	n := len(parent.ChildGUIDs)
	if n <= 1 {
		return nil
	}
	shuffled := slices.Clone(parent.ChildGUIDs)
	for i := n - 1; i > 0; i-- {
		j := Intn(state, i+1)
		shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
	}
	parent.ChildGUIDs = shuffled
	return nil
}

