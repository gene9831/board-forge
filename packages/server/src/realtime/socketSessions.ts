import type { WebSocket } from 'ws'

export const createSocketSessions = () => {
  const users = new WeakMap<WebSocket, string>()
  const alive = new WeakMap<WebSocket, boolean>()

  const assignUser = (socket: WebSocket, userId: string) => {
    users.set(socket, userId)
  }

  const getUser = (socket: WebSocket) => {
    return users.get(socket)
  }

  const isSocketUser = (socket: WebSocket, userId: string) => {
    return users.get(socket) === userId
  }

  const markAlive = (socket: WebSocket) => {
    alive.set(socket, true)
  }

  const markPendingPong = (socket: WebSocket) => {
    alive.set(socket, false)
  }

  const isAlive = (socket: WebSocket) => {
    return alive.get(socket) === true
  }

  return {
    assignUser,
    getUser,
    isAlive,
    isSocketUser,
    markAlive,
    markPendingPong,
  }
}
