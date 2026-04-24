# Minimal 2D engine API (Go authoritative, Lua rules)

This document consolidates the **minimal API surface** for a Tabletop Simulator–style stack: **2D table**, **Go** holds authoritative state and networking, **Lua** implements configurable rules. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the current process layout.

## Design principles

1. **Go owns** session authority, room serialization, 2D geometry, object model, and replication.
2. **Lua owns** legality checks, effect lists, triggers, and win/phase logic—anything that varies per game.
3. The **frontend sends intents** (semantic actions), not a stream of raw pointer moves. Go applies **one intent at a time** per room (actor queue).
4. **Lua is sandboxed**: no direct network or goroutines; expose a single **host table** **`engine.*`** of registered functions.

## Layering (implemented)

```
cmd/board-forge           # -addr, -rules (.json game pack or .lua)
internal/engine           # GameState, ApplyEffects, RNG (no Lua import)
internal/rules            # *lua.LState, rules.Load, engine.*, HandleIntent → []Effect
internal/gateway | room   # WebSocket, validateIntent, pipeline
internal/game             # Action types + GamePack (LoadGamePack)
games/minimal/game.json   # default game pack
```

### Game pack (`game.json`)

- **`schemaVersion`**: `1`
- **`meta`**: `id`, `name`, `version`, optional `description`, `authors`
- **`config`**: arbitrary JSON, exposed as Lua global **`GameConfig`**
- **`scripts.global`**: full Lua source (`DoString` after sandbox init)

Load order sets `BOARD_FORGE_RULES_DIR` and `BOARD_FORGE_GAME_DIR` to the directory containing the JSON file (for future `loadfile` aux scripts).

## Client → server (minimal wire)

| Kind        | Purpose |
|------------|---------|
| **Intent** | JSON `game.Action`: `join`, `start_game`, `custom` (extend with more `type` strings as needed). |
| **Sync**   | Full-state snapshot after each committed intent. |

## Server → Lua (callbacks)

| Callback | Status |
|----------|--------|
| `OnLoad()` → optional `{ effects = { ... } }` | Implemented (`games/minimal` uses `GameConfig.table.zone`). |
| `HandleIntent(intent)` → `{ ok, reason?, effects = { ... } }` | **Required.** |
| `OnStateCommitted()` | Optional no-arg hook after effects apply. |
| `OnSave()` | Not implemented (persist later). |

`intent` fields: `type`, `playerId`, `payload` (Lua table).

## Lua → Go (host API)

Implemented on global **`engine`** (see `internal/rules/host.go`):

- **Reads:** `get_objects`, `get_object`, `get_tags`, `object_type`, `get_position`, `get_rotation`, `get_layer`, `get_parent`, `children`, `players`, `current_turn`, `owner`, `in_hand`, `point_in_zone`, `object_in_zone`
- **RNG:** `random_int(min, max)` inclusive; **mutates** `rngStep` (deterministic with `seed`).

**Shuffle** is not exposed on the host table; use effect `shuffle_children` with `parentGuid`.

## Effect types (v0)

Returned in `effects` as tables: first key **`type`** is the effect name; remaining keys marshal to Go `Effect.Data` (camelCase keys).

| Effect `type` | Notes |
|---------------|--------|
| `spawn_object` | Use **`objectKind`** for piece type (not a second `type` key in the same table). |
| `destroy_object` | `guid` |
| `move_object` | `guid`, `x`, `y`, optional `rotation`, `layer` |
| `set_parent` | `guid`, `parentGuid` |
| `reorder_children` | `parentGuid`, `childGuids` |
| `set_tags` | `guid`, `tags` array |
| `set_owner` | `guid`, `ownerPlayerId` |
| `set_phase` | `phase` |
| `set_turn_player` | `playerId` |
| `ensure_player` | `playerId`, optional `displayName`, `color` |
| `shuffle_children` | `parentGuid` |
| `set_game_attr` | `key`, `value` |
| `set_player_attr` | `playerId`, `key`, `value` |
| `define_zone` | `id`, `minX`, `minY`, `maxX`, `maxY` |
| `broadcast` | `message` |
| `tell` | `message`, `playerId` |
| `log_host` | `message` (delivered in snapshot `messages` with `kind: log_host`) |

Messaging effects append to **`Snapshot.messages`** for clients; **`state.outbox`** is cleared after broadcast.

## Single-intent pipeline

```
Intent dequeued → DeepCopy backup → validateIntent → (start_game: inject Seed into state)
  → rules.HandleIntent → if ok → engine.ApplyEffects → rules.CallOnStateCommitted
  → action log → broadcast (state + messages) → clear outbox
```

## MVP checklist

- [x] **Engine:** 2D objects, geometry zones, players, `ApplyEffects`, deterministic RNG
- [x] **Rules:** sandbox VM, `engine.*`, `HandleIntent`, optional `OnLoad` / `OnStateCommitted`
- [x] **Wire:** `Action` + full snapshot + `messages`
- [x] **RNG:** `seed` + `rngStep` + `shuffle_children` / `random_int`

## 2D scope (v0)

- Axis-aligned zones, object `(x,y)`, scalar `rotation`, draw `layer`.
- No 3D physics, context menus, or hotkeys in-engine (frontends can send `custom` intents).
