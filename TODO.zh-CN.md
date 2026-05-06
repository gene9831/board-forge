# TODO 中文版

## P0 - 正确性与一致性

- [x] 增加明确的对象锁握手。
  - 服务端发送 `lock-granted` / `lock-denied`。
  - 客户端保留乐观拖拽，但锁被拒绝时会回滚。

- [x] 将锁状态与 `gameState` 分开广播。
  - 锁作为临时会话状态保存，不写入持久化世界状态。
  - 客户端通过独立的 `locks` 消息接收锁状态。

- [x] 增加锁 TTL 和心跳清理。
  - 拖拽和移动会刷新锁。
  - 断开连接和 TTL 过期会释放锁。

- [x] 按 socket 校验用户身份。
  - `hello` 后绑定 `socket -> userId`。
  - 后续 `move/drag-start/drag-end` 必须与该 socket 的用户一致。

- [x] 强化拖拽生命周期。
  - 处理 `pointercancel`、窗口失焦、页面可见性变化、WebSocket 断开和组件卸载。
  - 移动端多触点只允许当前 primary pointer 操作。

- [ ] 授予锁前校验对象是否存在。
  - 当前 lock manager 可以给任意非空 `objectId` 授锁。
  - 对当前 `gameState` 中不存在的对象，拒绝 `drag-start` / `move`。

- [ ] 加强 move 入站边界和语义校验。
  - Zod 目前校验消息形状和数字类型，但没有校验 board 边界或业务范围。
  - 当前在状态更新时会 clamp；后续可考虑更早拒绝异常或滥用 payload。

## P1 - 实时 Snapshot 同步

- [x] 使用 snapshot sync tick loop。
  - 服务端 tick 基于 `performance.now()` 和自调度 `setTimeout`。
  - 因为服务端广播最新 snapshot，错过的 tick 会直接丢弃，不补跑旧帧。

- [x] 只广播 dirty 的 game snapshot。
  - `stateDirty` 控制是否广播状态快照。
  - `stateRevision` 在 `gameState` 变化时递增，并写入 `state` 消息。

- [x] 增加状态快照元信息。
  - `state` 消息包含 `tick`、`revision` 和 `serverTime`。

- [ ] 增加客户端/服务端序列号。
  - `move` 中包含每个客户端递增的 input sequence。
  - 服务端消息回传已确认的 sequence。
  - 这为后续客户端预测、回滚校正、重复/乱序过滤打基础。

- [ ] 重新引入客户端插值，并采用 snapshot interpolation。
  - 客户端插值已临时移除，以保持同步路径简单。
  - 增加基于 `serverTime`、`tick` 或 `revision` 的快照缓冲区。
  - 按 `serverTime - interpolationDelay` 渲染，例如延迟 80ms，以便在网络抖动下更平滑地显示远端对象。
  - 当前客户端正在拖拽的对象不要插值。

- [ ] 增加服务端时钟偏移估算。
  - 利用 `serverTime` 和 websocket ping 估算客户端/服务端时钟偏移。
  - 如果客户端需要动态适配，可以在 hello/state 元信息中增加 `tickRate`。

- [ ] 将输入消息与 transform 状态分离。
  - 当前 `move` 发送的是绝对坐标。
  - 可以考虑发送 `drag` 输入，例如指针位置、delta 或期望 transform。
  - 这样服务端可以统一应用约束、吸附、权限和物理规则。

- [ ] 对象数量增加后增加 delta snapshot。
  - 当前 dirty 广播仍发送完整对象列表。
  - 完整快照过重后，增加 `state-delta` 或 `object-updated` 消息。
  - 保留偶尔的完整快照用于重新同步。

## P1 - 数据模型与协议

- [x] 前后端共享协议类型。
  - `packages/shared` 导出 game schema、protocol schema、类型和共享几何工具。

- [x] 使用 Zod 增加运行时 schema 校验。
  - `GameStateSchema` 校验 demo state。
  - 客户端消息 guard 使用 `@board-forge/shared` 中的 Zod schema。

- [x] 将 board 尺寸放入 `GameState`。
  - `gameState.board.width/height` 同时驱动服务端 clamp、canvas 尺寸、坐标换算和绘制。

- [x] 统一对象几何工具。
  - `@board-forge/shared/geometry` 提供共享对象 bounds 逻辑，并避免前端运行时引入 Zod。

- [ ] 增加协议版本。
  - 在 `hello` 中包含 `version`。
  - 拒绝或降级处理不兼容客户端。

- [ ] 稳定 object id 生成和持久化语义。
  - demo JSON 使用固定 object id。
  - 生成的 6 位 hex id 仍需要明确策略：服务端重启后临时变化，还是跨存档持久化。

- [ ] 集中管理前端 fallback 初始状态。
  - 服务端读取 `packages/server/demo/gameState.json`。
  - 前端仍有一份重复的 `INITIAL_GAME_STATE` fallback。
  - 可以考虑把 demo state 移到 shared，或由服务端在 bootstrap 时提供。

## P2 - 性能

- [ ] 避免每次绘制都排序。
  - 渲染时每次 draw 都按 `zIndex` 排序对象。
  - 缓存渲染顺序，只在 z-index 或对象列表变化时失效。

- [ ] 减少渲染路径中的 clone 和数组扫描。
  - `syncRenderObjects` 会 clone 对象数组。
  - hit testing 和 lock lookup 都会扫描数组。
  - 对象数量变多后，改用索引 Map 或可变 render buffer。

- [ ] 增加 websocket backpressure 处理。
  - 高频发送前检查 `socket.bufferedAmount`。
  - 丢弃过期移动更新，而不是排队旧数据。

- [ ] 后续降低 JSON stringify/parse 开销。
  - 当前阶段 JSON 没问题。
  - 当对象数量或事件频率变高时，评估二进制编码或更紧凑的 payload。

- [ ] 采集并显示运行指标。
  - 客户端 FPS、WebSocket ping、服务端 tick rate、tick drift、pending input 数量、丢弃消息数量。

## P2 - 交互与调试

- [ ] UI 显示对象锁归属。
  - 被锁对象已经有视觉高亮。
  - 增加当前锁持有者的短 user id。
  - 开发阶段显示锁被拒绝原因。

- [ ] 增加调试面板。
  - 展示当前 user id、server tick、state revision、锁状态、对象数量、WebSocket 状态和 board 尺寸。

- [ ] 增加对象选中状态。
  - 将 “selected” 和 “dragging” 分开。
  - 支持后续右键菜单、键盘操作和属性检查面板。

- [ ] 增加自定义 Canvas 右键菜单。
  - 默认右键/长按菜单已经禁用。
  - 增加对象相关操作：inspect、lock、duplicate、hide、delete、bring forward/back。

- [ ] 改善移动端触控体验。
  - 调整拖拽阈值、长按行为和 pointer capture。
  - 当对象被抓取或被其他用户锁定时，提供视觉反馈。

## P3 - 架构与运维

- [x] 将所有 workspace 包移动到 `packages/` 下。
  - frontend、server、shared 都位于 `packages/*`。

- [x] 使用统一 scoped package name。
  - 包名使用 `@board-forge/frontend`、`@board-forge/server` 和 `@board-forge/shared`。

- [x] 拆分服务端模块。
  - 服务端代码按 `game/`、`realtime/` 和 `utils/` 分组。

- [ ] 增加服务端状态与锁测试。
  - 单测锁获取/拒绝/释放。
  - 单测多个用户在同一 tick 移动不同对象。
  - 单测断线清理和锁 TTL 清理。

- [ ] 增加 schema validation 测试。
  - 测试合法/非法的 `GameState` JSON。
  - 测试合法/非法的客户端 websocket 消息。

- [ ] 增加 WebSocket 协议集成测试。
  - 模拟两个客户端拖拽不同对象。
  - 模拟两个客户端争抢同一个对象。
  - 验证状态同步、revision 递增和锁行为。

- [ ] 增加持久化策略。
  - 决定 game state 只存在内存、写入 Postgres，还是周期性快照。
  - 在增加房间前定义清楚加载/保存边界。

- [ ] 增加房间/会话。
  - 当前状态是全局的。
  - 在 URL 和 websocket hello 中引入 room id。
  - 按 room 隔离用户、对象 id、锁和状态。

- [ ] 增加结构化日志。
  - 记录连接、断开、锁事件、非法消息、tick drift、state revision 和广播错误。
