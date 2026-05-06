export type SnapshotLoopTick = {
  /**
   * Time elapsed since the previous executed tick.
   *
   * 距离上一次实际执行 tick 过去的时间。
   *
   * In snapshot sync this is diagnostic timing, not a request to replay missed ticks.
   *
   * 在 snapshot sync 中它主要用于诊断，不代表需要补跑错过的 tick。
   */
  deltaMs: number
  /**
   * How late this tick started compared with its scheduled time.
   *
   * 本次 tick 相比计划时间晚了多久。
   *
   * A positive value means one or more old snapshots were skipped.
   *
   * 正数表示服务端跳过了一个或多个过期 snapshot。
   */
  driftMs: number
  /**
   * Monotonic timestamp from performance.now() captured at the start of this tick.
   *
   * 本次 tick 开始时从 performance.now() 获取的单调递增时间戳。
   */
  now: number
}

type SnapshotLoopOptions = {
  onTick: (tick: SnapshotLoopTick) => void
  tickRate: number
}

export const createSnapshotLoop = ({ onTick, tickRate }: SnapshotLoopOptions) => {
  const tickMs = 1000 / tickRate

  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastTickAt = 0
  let nextTickAt = 0

  const clearTimer = () => {
    if (!timer) return

    clearTimeout(timer)
    timer = undefined
  }

  const scheduleNextTick = (now = performance.now()) => {
    const delayMs = Math.max(0, nextTickAt - now)
    timer = setTimeout(run, delayMs)
  }

  const run = () => {
    if (!running) return

    const now = performance.now()
    if (now < nextTickAt) {
      scheduleNextTick(now)
      return
    }

    const deltaMs = lastTickAt > 0 ? now - lastTickAt : tickMs
    const driftMs = Math.max(0, now - nextTickAt)

    lastTickAt = now
    onTick({ deltaMs, driftMs, now })

    // Snapshot sync only needs the newest state; missed ticks are dropped instead of replayed.
    nextTickAt = now + tickMs
    scheduleNextTick(now)
  }

  const start = () => {
    if (running) return

    const startedAt = performance.now()

    running = true
    lastTickAt = 0
    nextTickAt = startedAt + tickMs
    scheduleNextTick(startedAt)
  }

  const stop = () => {
    running = false
    clearTimer()
  }

  return {
    start,
    stop,
    get isRunning() {
      return running
    },
  }
}
