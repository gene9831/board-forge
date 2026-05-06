# TODO

## P0 - Correctness and Consistency

- [x] Add an explicit lock handshake.
  - Server sends `lock-granted` / `lock-denied`.
  - Client keeps optimistic drag behavior but rolls back when lock is denied.

- [x] Broadcast lock state separately from `gameState`.
  - Locks are stored as transient session state, not persisted world state.
  - Clients receive `locks` messages independently from state snapshots.

- [x] Add lock TTL and heartbeat cleanup.
  - Locks are refreshed by drag/move activity.
  - Locks are released on disconnect and expired by TTL cleanup.

- [x] Validate user identity per socket.
  - `hello` binds `socket -> userId`.
  - Later `move/drag-start/drag-end` messages must match the socket user.

- [x] Make drag lifecycle robust.
  - Handles `pointercancel`, window blur, page visibility changes, websocket disconnect, and component unmount.
  - Mobile multi-touch is limited to the primary active pointer.

- [ ] Validate object existence before granting locks.
  - Current lock manager can grant a lock for any non-empty `objectId`.
  - Reject `drag-start` / `move` for objects not present in the current `gameState`.

- [ ] Harden incoming move bounds and payload constraints.
  - Zod validates shape and number types, but not board bounds or semantic limits.
  - Clamp is applied during state update; also consider rejecting impossible or abusive values earlier.

## P1 - Real-Time Snapshot Sync

- [x] Use a snapshot sync tick loop.
  - Server tick scheduling uses `performance.now()` and self-scheduled `setTimeout`.
  - Missed ticks are dropped instead of replayed because the server broadcasts latest snapshots.

- [x] Broadcast only dirty game snapshots.
  - `stateDirty` controls snapshot broadcasting.
  - `stateRevision` increments when `gameState` changes and is included in `state` messages.

- [x] Include state snapshot metadata.
  - `state` messages include `tick`, `revision`, and `serverTime`.

- [ ] Add client/server sequence numbers.
  - Include a per-client input sequence on `move`.
  - Echo acknowledged sequence in server messages.
  - This enables future client-side prediction, reconciliation, and duplicate/out-of-order filtering.

- [ ] Reintroduce client-side interpolation with snapshot interpolation.
  - Client interpolation was removed temporarily to keep the sync path simple.
  - Add a snapshot buffer keyed by `serverTime`, `tick`, or `revision`.
  - Render at `serverTime - interpolationDelay`, e.g. 80ms, for smoother remote object motion under jitter.
  - Do not interpolate the object currently being dragged by this client.

- [ ] Add server clock offset estimation.
  - Use `serverTime` and websocket ping measurements to estimate client/server clock offset.
  - Add `tickRate` to hello/state metadata if the client needs to adapt dynamically.

- [ ] Separate input messages from transform state.
  - Current `move` sends absolute coordinates.
  - Consider `drag` input with pointer position, delta, or intended transform.
  - This lets server apply constraints, snapping, permissions, and physics consistently.

- [ ] Add delta snapshot messages when object count grows.
  - Current dirty broadcast sends the full object list.
  - Add `state-delta` or `object-updated` messages once full snapshots become too expensive.
  - Keep occasional full snapshots for resync.

## P1 - Data Model and Protocol

- [x] Share protocol types between frontend and backend.
  - `packages/shared` exports game schemas, protocol schemas, types, and shared geometry helpers.

- [x] Add runtime schema validation with Zod.
  - `GameStateSchema` validates demo state.
  - Client message guards use Zod schemas in `@board-forge/shared`.

- [x] Move board dimensions into `GameState`.
  - `gameState.board.width/height` drives server clamping, canvas sizing, coordinate conversion, and rendering.

- [x] Normalize object geometry helpers.
  - `@board-forge/shared/geometry` provides shared object bounds logic without pulling Zod into the frontend runtime bundle.

- [ ] Add protocol versioning.
  - Include `version` in `hello`.
  - Reject or downgrade incompatible clients.

- [ ] Stabilize object id generation and persistence semantics.
  - Demo JSON uses fixed object ids.
  - Generated 6-digit hex ids still need a policy: ephemeral per server boot or persistent across saved sessions.

- [ ] Centralize initial game state for frontend fallback.
  - Server loads `packages/server/demo/gameState.json`.
  - Frontend still has a duplicated `INITIAL_GAME_STATE` fallback.
  - Consider moving demo state into a shared package or exposing it from the server during bootstrap.

## P2 - Performance

- [ ] Avoid repeated sorting every draw.
  - Rendering sorts objects by `zIndex` on every draw.
  - Cache render order and invalidate only when z-index or object list changes.

- [ ] Reduce cloning and array scans in the render path.
  - `syncRenderObjects` clones object arrays.
  - Hit testing and lock lookup scan arrays.
  - For larger scenes, use indexed maps or mutable render buffers.

- [ ] Add websocket backpressure handling.
  - Check `socket.bufferedAmount` before sending frequent messages.
  - Drop stale movement updates instead of queueing old data.

- [ ] Reduce JSON stringify/parse overhead later.
  - JSON is good for the current prototype.
  - For high object counts or high-frequency events, evaluate binary encoding or compact payloads.

- [ ] Measure and display runtime metrics.
  - Client FPS, websocket ping, server tick rate, tick drift, pending input count, and dropped messages.

## P2 - UX and Debugging

- [ ] Show lock ownership in the UI.
  - Locked objects are visually highlighted.
  - Add the short user id of the current lock owner.
  - Show lock denial reasons during development.

- [ ] Add a debug panel.
  - Current user id, server tick, state revision, lock state, object count, websocket status, and board size.

- [ ] Add object selection state.
  - Separate "selected" from "dragging".
  - Support future context menu, keyboard actions, and inspector panels.

- [ ] Add custom canvas context menu.
  - Default right-click/long-press menu is disabled.
  - Add object-aware actions: inspect, lock, duplicate, hide, delete, bring forward/back.

- [ ] Improve mobile touch behavior.
  - Tune drag threshold, long-press behavior, and pointer capture.
  - Add visual feedback when an object is grabbed or locked by another user.

## P3 - Architecture and Operations

- [x] Move all workspace packages under `packages/`.
  - Frontend, server, and shared packages are all under `packages/*`.

- [x] Use scoped package names.
  - Packages use `@board-forge/frontend`, `@board-forge/server`, and `@board-forge/shared`.

- [x] Extract server modules.
  - Server code is grouped into `game/`, `realtime/`, and `utils/`.

- [ ] Add tests for server state and locks.
  - Unit test lock acquire/deny/release.
  - Unit test multiple users moving different objects in the same tick.
  - Unit test disconnect cleanup and lock TTL cleanup.

- [ ] Add tests for schema validation.
  - Test valid and invalid `GameState` JSON.
  - Test valid and invalid client websocket messages.

- [ ] Add integration tests for websocket protocol.
  - Simulate two clients dragging different objects.
  - Simulate two clients contending for the same object.
  - Verify state sync, revision increments, and lock behavior.

- [ ] Add persistence strategy.
  - Decide whether game state lives only in memory, in Postgres, or in periodic snapshots.
  - Define load/save boundaries before adding rooms.

- [ ] Add rooms/sessions.
  - Current state is global.
  - Introduce room id in URL and websocket hello.
  - Scope users, object ids, locks, and state by room.

- [ ] Add structured logging.
  - Log connects, disconnects, lock events, malformed messages, tick drift, state revisions, and broadcast errors.
