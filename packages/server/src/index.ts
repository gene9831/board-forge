import type { GameState, PendingMove } from '@board-forge/shared'
import { WebSocketServer, type WebSocket } from 'ws'
import { HEARTBEAT_INTERVAL_MS, LOCK_TTL_MS, SERVER_HOST, SERVER_PORT, SERVER_TICK_RATE } from './config.js'
import { applyLatestMove, createInitialState } from './game/gameState.js'
import { createLockManager } from './realtime/lockManager.js'
import { createMessageRouter } from './realtime/messageRouter.js'
import { createSnapshotLoop } from './realtime/snapshotLoop.js'
import { createSocketSessions } from './realtime/socketSessions.js'
import { createBroadcaster, sendJson } from './realtime/wsTransport.js'
import { generateUserId } from './utils/id.js'

const state: GameState = createInitialState()
const server = new WebSocketServer({ host: SERVER_HOST, port: SERVER_PORT })
const sessions = createSocketSessions()
const locks = createLockManager(LOCK_TTL_MS)

let tick = 0
let stateDirty = false
let stateRevision = 0
let pendingMoves: PendingMove[] = []

const broadcaster = createBroadcaster({
  server,
  getState: () => state,
  getTick: () => tick,
  getRevision: () => stateRevision,
  getLocks: locks.snapshot,
})

const ensureUser = (socket: WebSocket, requestedUserId?: string) => {
  const userId = requestedUserId || generateUserId()

  sessions.assignUser(socket, userId)
  sendJson(socket, { type: 'user', userId })

  return userId
}

const enqueueMove = (move: PendingMove) => {
  pendingMoves.push(move)
}

const consumePendingMoves = () => {
  const moves = pendingMoves
  pendingMoves = []

  return applyLatestMove(state, moves)
}

const markStateDirty = () => {
  stateDirty = true
  stateRevision += 1
}

const flushStateSnapshot = () => {
  if (!stateDirty) return

  broadcaster.broadcastState(Date.now())
  stateDirty = false
}

const router = createMessageRouter({
  broadcastLocks: broadcaster.broadcastLocks,
  ensureUser,
  enqueueMove,
  locks,
  sessions,
})

const runTick = () => {
  tick += 1

  if (locks.cleanupExpired()) {
    broadcaster.broadcastLocks()
  }

  if (consumePendingMoves()) {
    markStateDirty()
  }

  flushStateSnapshot()
}

const snapshotLoop = createSnapshotLoop({
  tickRate: SERVER_TICK_RATE,
  onTick: runTick,
})

const runHeartbeat = () => {
  for (const socket of server.clients) {
    if (!sessions.isAlive(socket)) {
      socket.terminate()
      continue
    }

    sessions.markPendingPong(socket)
    socket.ping()
  }
}

server.on('connection', (socket) => {
  sessions.markAlive(socket)
  broadcaster.sendState(socket)
  broadcaster.sendLocks(socket)

  socket.on('pong', () => {
    sessions.markAlive(socket)
  })

  socket.on('message', (message) => {
    router.handleMessage(socket, message)
  })

  socket.on('close', () => {
    const userId = sessions.getUser(socket)

    if (userId && locks.releaseByUser(userId)) {
      broadcaster.broadcastLocks()
    }
  })
})

snapshotLoop.start()
setInterval(runHeartbeat, HEARTBEAT_INTERVAL_MS)

console.log(`WebSocket server listening on ws://${SERVER_HOST}:${SERVER_PORT}`)
