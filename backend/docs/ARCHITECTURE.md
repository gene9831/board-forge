# Board Forge — 服务端架构说明

面向「2D 桌台 + Go 权威 + Lua 规则」的 **最小 Host/Lua API 面**（与 TTS 思路对齐的补充说明）见 **[MINIMAL_ENGINE_LUA_API.md](./MINIMAL_ENGINE_LUA_API.md)**。

## 设计目标

- **声明式效果：** `HandleIntent`（Lua）返回 `effects[]`，由 **`internal/engine.ApplyEffects`** 在权威状态上落库；Lua 通过只读全局表 **`engine.*`** 查询状态（或在 `random_int` 等函数中产生可复现 RNG 步进）。
- **按房间串行：** 每个房间一个 goroutine 消费意图队列，`GameState` 由该 actor **独占写**。
- **服务端权威：** `start_game` 由房间层注入 **服务端 RNG 种子**（写入 payload 与 `state.Seed`），再交由规则处理。
- **可复现随机：** `Seed` + `RNGStep` 驱动 `engine.Intn` 及洗牌类 effect。
- **实时同步：** 每次成功应用后广播 **全量状态** JSON，并将当 tick 的 **`messages`**（由 `broadcast` / `tell` / `log_host` effect 产生）附在快照上；广播后清空 `state.outbox`。

## 分层结构

```
WebSocket 客户端
       │  JSON Intent (game.Action)
       ▼
┌──────────────────┐
│ internal/gateway │  HTTP 升级、读循环、Enqueue
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ internal/manager │  roomID → *room.Room，统一 rulesPath
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ internal/room    │  DeepCopy → validateIntent → HandleIntent → ApplyEffects
│   (actor)        │  → OnStateCommitted → action 日志 → 广播 Snapshot
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ internal/rules  │  gopher-lua：`HandleIntent` / 可选 `OnLoad` / `OnStateCommitted`
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ internal/engine │  GameState（2D objects + 几何 zones + players）、Effect DSL、RNG
└──────────────────┘

games/minimal/game.json   （默认 `-rules`；单文件游戏包：meta + config + scripts.global）
```

`internal/game`：**线协议** `Action` / payload，以及 **`GamePack`**（`game.json` 结构体 + `LoadGamePack`）。

## 包职责

| 包 | 职责 |
|----|------|
| `cmd/board-forge` | 入口：`-addr`、`-rules`（默认 `games/minimal/game.json`；也可指向 `.lua`）。 |
| `internal/gateway` | `GET /ws/{roomID}`、`GET /healthz`；解析 `game.Action`。 |
| `internal/manager` | `GetOrCreate(roomID)`，所有房间共用进程的 `rulesPath`。 |
| `internal/room` | Actor 循环、回滚、`authoritativeStart` 注种、`validateIntent`、调用 `rules` 与 `engine.ApplyEffects`、扇出 `Snapshot`。 |
| `internal/engine` | **无 Lua 依赖**：`GameState`、`Object`、`Zone`、`Effect`、`ApplyEffects`、确定性 `Intn`、`DeepCopyState`。 |
| `internal/rules` | 沙箱 Lua、`rules.Load(path)`（`.json` 游戏包或 `.lua`）、`engine.*`、`HandleIntent`。JSON 包注入 `GameConfig`、`BOARD_FORGE_GAME_DIR`。 |
| `internal/game` | JSON 线类型：`Action`、`JoinPayload`、`StartPayload`。 |
| `games/minimal` | 最小 `game.json`：`join` / `start_game` / `custom`；`config` 驱动桌面 zone 与棋盘生成坐标。 |

## 并发与一致性

- **每个房间一个 goroutine** 独占 `*engine.GameState` 与 `actions` 通道。
- **WebSocket** 侧只入队；快照在同一线程内构造。
- **失败回滚：** 在应用 `ApplyEffects` 前保存 JSON 深拷贝；任一步失败则恢复指针。

## 通用游戏状态（引擎核心）

`engine.GameState` 主要字段（与 JSON 快照一致）：

- `objects`：`guid → Object`（`x`,`y`,`rotation`,`layer`，父子 `childGuids`，`ownerPlayerId`，`tags`）。
- `zones`：几何区域 `id → { minX, minY, maxX, maxY }`。
- `players`：`id → Player`（`displayName`, `color`, `attributes`）。
- `turnPlayer`, `phase`, `attributes`, `seed`, `rngStep`, `nextObjectSeq`。
- `outbox`：瞬态出站消息，由 room 合并进 `Snapshot.messages` 后清空。

## 通信协议（最小）

**端点：** `GET /ws/{roomId}`（单层路径；多段返回 400）。**无** `?game=` 查询参数。

**客户端 → 服务端**（每条消息一个 JSON 对象）：

```json
{
  "playerId": "p1",
  "type": "join",
  "payload": { "displayName": "Alice" }
}
```

支持的 `type`（由 `games/minimal` 与 coarse validator 覆盖）：

- `join`：大厅阶段加入；payload 可选 `displayName`。
- `start_game`：大厅开局；服务端写入 `Seed`。
- `custom`：任意 payload（演示为 `message` 字符串）；需 `playerId`。

规则是否接受由 **`HandleIntent` 的 `ok`/`reason`** 决定；引擎层只做粗粒度 `validateIntent`。

**服务端 → 客户端**（每次成功应用意图后）：

```json
{
  "type": "state",
  "state": {
    "objects": {},
    "zones": {},
    "players": {},
    "turnPlayer": "p1",
    "phase": "playing",
    "seed": 123,
    "rngStep": 0,
    "nextObjectSeq": 1
  },
  "messages": [{ "kind": "broadcast", "message": "Game started" }],
  "actionLogLen": 2,
  "lastAction": { "playerId": "p1", "type": "join" }
}
```

**连接登记：** 首条 **`playerId` 非空** 的消息登记该连接以接收广播。

## Lua 规则约定

- 加载后设置全局 **`BOARD_FORGE_RULES_DIR`**、**`BOARD_FORGE_GAME_DIR`**（游戏包或 `.lua` 所在目录）；`.json` 包还将 **`config`** 注入为 Lua 全局表 **`GameConfig`**。
- 标准库仅 **`base` / `string` / `table`**（无 `os` / `io` / `math` 等，随机请用 **`engine.random_int`**）。
- **必需：** `HandleIntent(intent)` → `{ ok = bool, reason = "...", effects = { { type = "...", ... }, ... } }`。
- **可选：** `OnLoad()` → `{ effects = { ... } }`；`OnStateCommitted()`。
- effect 表中 **字段名使用 camelCase**，与 Go 的 effect JSON 标签一致；`spawn_object` 使用 **`objectKind`** 表示物件类型（避免与 `type = "spawn_object"` 歧义——后者是 Lua 表中对 **effect 种类** 的编码，解析时会变为顶层的 `Effect.Type`）。

## 本地运行

在 **`backend/`** 目录下启动（保证默认 `games/minimal/game.json` 可解析）：

```bash
cd backend && go run ./cmd/board-forge -addr :8080
```

指定规则文件：

```bash
cd backend && go run ./cmd/board-forge -addr :8080 -rules /path/to/rules.lua
```

健康检查：`GET http://localhost:8080/healthz`。

## 依赖

| 依赖 | 用途 |
|------|------|
| `github.com/gorilla/websocket` | WebSocket |
| `github.com/yuin/gopher-lua` | Lua 5.1，`internal/rules` |

其余为标准库。

## 故意尚未实现的部分

- 持久化、增量同步、结构化错误回传、观战、多实例协调等（见 `note.md` 等文档中的扩展讨论）。
