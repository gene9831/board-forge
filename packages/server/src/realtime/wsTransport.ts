import { WebSocket, type WebSocketServer } from 'ws'
import type { GameState, ObjectLock, ServerMessage, ServerStateMessage } from '@board-forge/shared'

type BroadcasterOptions = {
  getLocks: () => ObjectLock[]
  getRevision: () => number
  getState: () => GameState
  getTick: () => number
  server: WebSocketServer
}

export const sendJson = (client: WebSocket, message: ServerMessage) => {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message))
  }
}

export const createBroadcaster = ({
  getLocks,
  getRevision,
  getState,
  getTick,
  server,
}: BroadcasterOptions) => {
  const createStateMessage = (serverTime = Date.now()): ServerStateMessage => ({
    type: 'state',
    tick: getTick(),
    revision: getRevision(),
    serverTime,
    state: getState(),
  })

  const sendState = (client: WebSocket, serverTime = Date.now()) => {
    sendJson(client, createStateMessage(serverTime))
  }

  const broadcastState = (serverTime = Date.now()) => {
    for (const client of server.clients) {
      sendState(client, serverTime)
    }
  }

  const sendLocks = (client: WebSocket) => {
    sendJson(client, {
      type: 'locks',
      locks: getLocks(),
    })
  }

  const broadcastLocks = () => {
    for (const client of server.clients) {
      sendLocks(client)
    }
  }

  return {
    broadcastLocks,
    broadcastState,
    sendLocks,
    sendState,
  }
}
