import { computed, onBeforeUnmount, ref, type Ref } from 'vue'
import type {
  GameState,
  ObjectLock,
  ServerLockDeniedMessage,
  ServerLockGrantedMessage,
  ServerMessage,
  ServerStateMessage,
} from '@board-forge/shared'
import { DEFAULT_NETWORK_RATE } from '../game/config'

export type SocketStatus = 'connecting' | 'connected' | 'disconnected'

const USER_ID_STORAGE_KEY = 'board-forge:user-id'

type UseGameSocketOptions = {
  initialState: GameState
  onLockDenied?: (message: ServerLockDeniedMessage) => void
  onLockGranted?: (message: ServerLockGrantedMessage) => void
  onLocks?: (locks: ObjectLock[]) => void
  onState?: (message: ServerStateMessage) => void
  onUser?: (userId: string) => void
  reconnectDelay?: number
  sendRate?: number
}

const getDefaultWsUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const port = import.meta.env.VITE_WS_PORT ?? '3001'

  return import.meta.env.VITE_WS_URL ?? `${protocol}//${window.location.hostname}:${port}`
}

export const useGameSocket = (options: UseGameSocketOptions) => {
  const gameState = ref<GameState>(options.initialState) as Ref<GameState>
  const locks = ref<ObjectLock[]>([])
  const status = ref<SocketStatus>('disconnected')
  const userId = ref(localStorage.getItem(USER_ID_STORAGE_KEY) ?? '')
  const wsUrl = getDefaultWsUrl()
  const reconnectDelay = options.reconnectDelay ?? 1000
  const sendInterval = 1000 / (options.sendRate ?? DEFAULT_NETWORK_RATE)

  let socket: WebSocket | null = null
  let reconnectTimer = 0
  let sendTimer = 0
  let lastSendAt = 0
  let manuallyClosed = false
  let pendingMove: { userId: string; objectId: string; x: number; y: number; clientTime: number } | null =
    null

  const isConnected = computed(() => status.value === 'connected')

  const clearReconnectTimer = () => {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = 0
  }

  const clearSendTimer = () => {
    window.clearTimeout(sendTimer)
    sendTimer = 0
  }

  const flushMove = () => {
    sendTimer = 0

    if (!pendingMove || socket?.readyState !== WebSocket.OPEN) return

    socket.send(
      JSON.stringify({
        type: 'move',
        userId: pendingMove.userId,
        objectId: pendingMove.objectId,
        x: pendingMove.x,
        y: pendingMove.y,
        clientTime: pendingMove.clientTime,
      }),
    )

    pendingMove = null
    lastSendAt = performance.now()
  }

  const scheduleReconnect = () => {
    if (manuallyClosed || reconnectTimer) return

    status.value = 'disconnected'
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = 0
      connect()
    }, reconnectDelay)
  }

  const handleMessage = (event: MessageEvent<string>) => {
    let message: ServerMessage

    try {
      message = JSON.parse(event.data) as ServerMessage
    } catch {
      return
    }

    if (message.type === 'user') {
      userId.value = message.userId
      localStorage.setItem(USER_ID_STORAGE_KEY, message.userId)
      options.onUser?.(message.userId)
      return
    }

    if (message.type === 'lock-denied') {
      options.onLockDenied?.(message)
      return
    }

    if (message.type === 'lock-granted') {
      options.onLockGranted?.(message)
      return
    }

    if (message.type === 'locks') {
      locks.value = message.locks
      options.onLocks?.(message.locks)
      return
    }

    if (message.type !== 'state') return

    gameState.value = message.state
    options.onState?.(message)
  }

  const connect = () => {
    clearReconnectTimer()
    manuallyClosed = false

    if (
      socket &&
      (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
    ) {
      return
    }

    status.value = 'connecting'
    socket = new WebSocket(wsUrl)

    socket.addEventListener('open', () => {
      status.value = 'connected'
      socket?.send(
        JSON.stringify({
          type: 'hello',
          userId: userId.value || undefined,
        }),
      )
    })

    socket.addEventListener('message', handleMessage)

    socket.addEventListener('close', () => {
      socket = null
      scheduleReconnect()
    })

    socket.addEventListener('error', () => {
      status.value = 'disconnected'
    })
  }

  const disconnect = () => {
    manuallyClosed = true
    clearReconnectTimer()
    clearSendTimer()
    pendingMove = null
    socket?.close()
    socket = null
    status.value = 'disconnected'
  }

  const sendJson = (message: unknown) => {
    if (socket?.readyState !== WebSocket.OPEN) return

    socket.send(JSON.stringify(message))
  }

  const sendDragStart = (objectId: string) => {
    if (!userId.value) return

    sendJson({
      type: 'drag-start',
      userId: userId.value,
      objectId,
    })
  }

  const sendDragEnd = (objectId: string) => {
    if (!userId.value) return

    sendJson({
      type: 'drag-end',
      userId: userId.value,
      objectId,
    })
  }

  const sendMove = (objectId: string, x: number, y: number) => {
    if (!userId.value) return

    pendingMove = { userId: userId.value, objectId, x, y, clientTime: performance.now() }

    if (socket?.readyState !== WebSocket.OPEN || sendTimer) return

    const now = performance.now()
    const wait = Math.max(0, sendInterval - (now - lastSendAt))
    sendTimer = window.setTimeout(flushMove, wait)
  }

  onBeforeUnmount(disconnect)

  return {
    connect,
    disconnect,
    gameState,
    isConnected,
    locks,
    sendDragEnd,
    sendDragStart,
    sendMove,
    status,
    userId,
    wsUrl,
  }
}
