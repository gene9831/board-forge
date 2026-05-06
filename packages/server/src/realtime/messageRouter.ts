import type { WebSocket } from 'ws'
import {
  isDragEndMessage,
  isDragStartMessage,
  isHelloMessage,
  isMoveMessage,
  type PendingMove,
} from '@board-forge/shared'
import type { createLockManager } from './lockManager.js'
import type { createSocketSessions } from './socketSessions.js'
import { sendJson } from './wsTransport.js'

type MessageRouterOptions = {
  broadcastLocks: () => void
  ensureUser: (socket: WebSocket, requestedUserId?: string) => string
  enqueueMove: (move: PendingMove) => void
  locks: ReturnType<typeof createLockManager>
  sessions: ReturnType<typeof createSocketSessions>
}

const parseMessage = (rawMessage: WebSocket.RawData) => {
  try {
    return JSON.parse(rawMessage.toString()) as unknown
  } catch {
    return null
  }
}

export const createMessageRouter = ({
  broadcastLocks,
  ensureUser,
  enqueueMove,
  locks,
  sessions,
}: MessageRouterOptions) => {
  const handleDragStart = (socket: WebSocket, message: unknown) => {
    if (!isDragStartMessage(message)) return
    if (!sessions.isSocketUser(socket, message.userId)) return

    const result = locks.request(message.objectId, message.userId)

    if (!result.granted) {
      sendJson(socket, {
        type: 'lock-denied',
        objectId: message.objectId,
        userId: result.ownerUserId,
      })
      return
    }

    sendJson(socket, {
      type: 'lock-granted',
      objectId: message.objectId,
      userId: message.userId,
    })
    broadcastLocks()
  }

  const handleDragEnd = (socket: WebSocket, message: unknown) => {
    if (!isDragEndMessage(message)) return
    if (!sessions.isSocketUser(socket, message.userId)) return

    if (locks.release(message.objectId, message.userId)) {
      broadcastLocks()
    }
  }

  const handleMove = (socket: WebSocket, message: unknown) => {
    if (!isMoveMessage(message)) return
    if (!sessions.isSocketUser(socket, message.userId)) return
    if (locks.getOwner(message.objectId) !== message.userId) return

    locks.refresh(message.objectId, message.userId)
    enqueueMove({
      ...message,
      receivedAt: Date.now(),
    })
  }

  const handleMessage = (socket: WebSocket, rawMessage: WebSocket.RawData) => {
    const message = parseMessage(rawMessage)
    if (!message) return

    if (isHelloMessage(message)) {
      ensureUser(socket, message.userId)
      return
    }

    handleDragStart(socket, message)
    handleDragEnd(socket, message)
    handleMove(socket, message)
  }

  return {
    handleMessage,
  }
}
