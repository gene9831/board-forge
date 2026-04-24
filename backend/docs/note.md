下面给出一套 **从现有架构升级为“桌游引擎 + Lua规则加载”** 的完整设计方案。目标是保持你当前的核心优势：

* **单 mutation path** (`state + action → nextState`)
* **per-room actor**
* **deterministic replay**
* **server authority**

同时实现：

```
不同桌游 = Game Definition + Lua Rules
```

---

# 一、最终目标架构

升级后的整体结构：

```
WebSocket Client
       │
       ▼
gateway
       │
       ▼
room (actor)
       │
       ▼
engine
 ├─ reducer
 ├─ lua runtime
 ├─ effect api
 └─ deterministic RNG
       │
       ▼
game package
 ├─ definition.yaml
 └─ rules.lua
```

核心关系：

```
state + action + lua rule → nextState
```

---

# 二、目录结构设计

建议改造为：

```
board-forge

cmd/
  board-forge/

internal/

  gateway/
  manager/
  room/

  engine/
      engine.go
      reducer.go
      lua_runtime.go
      context.go
      rng.go
      zones.go

  game/
      definition.go
      loader.go

games/

  demo21/
      game.yaml
      rules.lua

  uno/
      game.yaml
      rules.lua

  poker/
      game.yaml
      rules.lua
```

解释：

| 目录     | 用途     |
| ------ | ------ |
| engine | 通用桌游引擎 |
| game   | 游戏配置加载 |
| games  | 具体桌游   |

---

# 三、Game Definition（游戏定义）

每个游戏目录包含：

```
game.yaml
rules.lua
```

## game.yaml

定义 **静态结构**。

示例：

```yaml
name: demo21

players:
  min: 2
  max: 4

zones:
  - deck
  - table
  - discard

playerZones:
  - hand

deck:
  repeat: 2
  cards:
    - id: c1
      value: 1
    - id: c2
      value: 2
    - id: c3
      value: 3

setup:
  shuffle: deck
  deal:
    from: deck
    to: player.hand
    count: 5

actions:
  - join
  - start_game
  - play_card
  - draw
  - end_turn
```

作用：

* 定义 zones
* 定义 deck
* 定义 action 名称
* 定义 setup

Lua 负责 **逻辑**。

---

# 四、GameState 设计

必须变成 **通用结构**。

```go
type GameState struct {

    Players map[string]*Player

    Zones map[string]*Zone

    TurnPlayer string

    Phase string

    Attributes map[string]any

    Seed int64

    RNGStep int

}
```

---

## Player

```go
type Player struct {

    ID string

    Zones map[string][]Card

    Attributes map[string]any

}
```

---

## Zone

```go
type Zone struct {

    Name string

    Cards []Card

}
```

---

## Card

```go
type Card struct {

    ID string

    Type string

    Attr map[string]any

}
```

例如：

```
{
 id: "c1"
 type: "number"
 attr: { value: 3 }
}
```

---

# 五、Engine Context

Lua 不允许直接修改 state。

Lua 只能调用 **Engine API**。

```go
type Context struct {

    State *GameState

    Engine *Engine

}
```

Lua 调用 API：

```
ctx.draw()
ctx.move()
ctx.shuffle()
ctx.addAttr()
ctx.finishGame()
```

---

# 六、Lua Runtime

推荐使用：

* gopher-lua

实现：

```
engine/lua_runtime.go
```

核心：

```
Engine.LoadGameRules()
```

---

示例：

```go
func (e *Engine) LoadLua(path string) error {

    L := lua.NewState()

    e.registerAPI(L)

    if err := L.DoFile(path); err != nil {
        return err
    }

    e.lua = L

    return nil
}
```

---

# 七、注册 Engine API

Lua 可调用函数：

```
ctx.moveCard()
ctx.draw()
ctx.shuffle()
ctx.getPlayer()
ctx.setPhase()
ctx.finishGame()
```

示例：

```go
func (e *Engine) registerAPI(L *lua.LState) {

    L.SetGlobal("move_card",
        L.NewFunction(e.luaMoveCard))

}
```

---

Lua 中使用：

```lua
move_card(player, "hand", "table", index)
```

---

# 八、Reducer 改造

现在 reducer：

```
Reduce(state, action)
```

改为：

```
Reduce(state, action, game)
```

实现：

```
call Lua action handler
```

示例：

```go
func (e *Engine) Reduce(state *GameState, action Action) error {

    fn := e.lua.GetGlobal(action.Type)

    if fn.Type() != lua.LTFunction {
        return errors.New("action not implemented")
    }

    ctx := e.NewContext(state)

    return e.callLua(fn, ctx, action)
}
```

---

# 九、Lua Rules 示例

```
games/demo21/rules.lua
```

```lua
function start_game(ctx)

    ctx:shuffle("deck")

    for _,player in ipairs(ctx:players()) do
        ctx:draw(player, "deck", "hand", 5)
    end

    ctx:setPhase("playing")

end
```

---

## play_card

```lua
function play_card(ctx, player, payload)

    local card = ctx:play(player, "hand", payload.index)

    local value = card.attr.value

    ctx:addPlayerAttr(player, "score", value)

    if ctx:zoneSize("deck") > 0 then
        ctx:draw(player, "deck", "hand", 1)
    end

    if ctx:getPlayerAttr(player, "score") >= 21 then
        ctx:finishGame(player)
    end

end
```

---

# 十、Room 层改动

Room 需要加载 game。

原来：

```
Room
 └ state
```

改为：

```
Room
 ├ state
 └ engine
```

初始化：

```
gameLoader → load yaml
           → load lua
```

---

示例：

```go
func NewRoom(gameType string) *Room {

    def := game.LoadDefinition(gameType)

    engine := engine.New(def)

    engine.LoadLua(def.RulesPath)

}
```

---

# 十一、Replay 保持不变

你的 action log 非常好。

```
actions[] → replay → state
```

只需要：

```
re-run lua reducer
```

因为：

```
RNG deterministic
```

---

# 十二、Deterministic RNG

Lua 不允许调用：

```
math.random
```

必须用：

```
ctx:rand()
```

实现：

```
PCG(seed + RNGStep)
```

每次：

```
RNGStep++
```

---

# 十三、性能

Lua VM 初始化成本较高。

建议：

```
每个游戏类型一个 VM
```

不要：

```
每个房间一个 VM
```

推荐：

```
engine pool
```

结构：

```
gameType
   └ lua VM
```

---

# 十四、安全

必须禁用：

```
os
io
debug
package
```

只暴露：

```
engine API
```

---

# 十五、扩展能力

未来可以支持：

### 事件系统

```
on_card_play
on_draw
on_turn_start
```

Lua：

```
function on_draw(ctx, player)
```

---

### Trigger

类似 MTG：

```
when card enters battlefield
```

---

### AI

Lua 也可以写 AI。

---

# 十六、未来升级

长期可以加入：

| 功能          | 用途     |
| ----------- | ------ |
| spectator   | 观战     |
| delta state | 减少网络流量 |
| rollback    | 卡牌复杂规则 |
| matchmaking | 自动匹配   |

---

# 十七、最终架构

完整引擎：

```
Client
   │
   ▼
Gateway
   │
   ▼
Room Actor
   │
   ▼
Engine
   ├─ GameState
   ├─ Reducer
   ├─ Lua VM
   ├─ RNG
   └─ Effect API
   │
   ▼
Game Definition
   ├─ game.yaml
   └─ rules.lua
```

---

# 十八、开发路线（强烈推荐）

按这个顺序做：

```
Step1
通用 GameState

Step2
zone + card 系统

Step3
Lua runtime

Step4
engine API

Step5
demo21 游戏

Step6
UNO 示例

Step7
poker 示例
```

---

如果你愿意，我可以继续给你一套 **完整的 Engine API 设计（大约 40 个函数）**，那套 API 基本可以支持 **UNO / Dominion / 三国杀 / Poker 这一类桌游规则**。
