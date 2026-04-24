import ReconnectingWebSocket from 'reconnecting-websocket'
import { computed, onUnmounted, ref, shallowRef, type Ref, unref } from 'vue'
import type { ClientAction, ServerSnapshotMessage } from '../types/game-ws'

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed'

/** Turn http(s) origin into ws(s) for the same host. */
export function httpOriginToWsBase(origin: string): string {
  const trimmed = origin.trim().replace(/\/$/, '')
  if (trimmed.startsWith('https://')) {
    return 'wss://' + trimmed.slice(8)
  }
  if (trimmed.startsWith('http://')) {
    return 'ws://' + trimmed.slice(7)
  }
  return trimmed
}

export interface UseGameWebSocketOptions {
  /** e.g. ws://localhost:8080 or http://localhost:8080 */
  wsBase: Ref<string>
  roomId: Ref<string>
  playerId: Ref<string>
  /** When set, appended as `?game=` (for multi-pack servers). */
  gameId?: Ref<string>
  /** Max lines kept in log (oldest dropped). */
  maxLogLines?: number
}

export function useGameWebSocket(options: UseGameWebSocketOptions) {
  const maxLogLines = options.maxLogLines ?? 200
  const socket = shallowRef<ReconnectingWebSocket | null>(null)
  const connectionState = ref<ConnectionState>('idle')
  const lastSnapshot = shallowRef<ServerSnapshotMessage | null>(null)
  const logLines = ref<string[]>([])

  const wsUrl = computed(() => {
    const base = httpOriginToWsBase(options.wsBase.value)
    const room = encodeURIComponent(options.roomId.value.trim())
    let url = `${base}/ws/${room}`
    const gid = options.gameId ? unref(options.gameId).trim() : ''
    if (gid) {
      url += `?game=${encodeURIComponent(gid)}`
    }
    return url
  })

  function appendLog(line: string) {
    const next = [...logLines.value, `[${new Date().toLocaleTimeString()}] ${line}`]
    if (next.length > maxLogLines) {
      next.splice(0, next.length - maxLogLines)
    }
    logLines.value = next
  }

  function connect() {
    disconnect()
    connectionState.value = 'connecting'
    appendLog(`connecting → ${wsUrl.value}`)

    const ws = new ReconnectingWebSocket(wsUrl.value, [], {
      maxReconnectionDelay: 10_000,
      minReconnectionDelay: 1_000,
      reconnectionDelayGrowFactor: 1.3,
      connectionTimeout: 4_000,
      maxRetries: Infinity,
      debug: false,
    })

    ws.addEventListener('open', () => {
      connectionState.value = 'open'
      appendLog('socket open (reconnecting-websocket will retry on drop)')
    })

    ws.addEventListener('close', () => {
      connectionState.value = 'closed'
      appendLog('socket close')
    })

    ws.addEventListener('error', () => {
      appendLog('socket error (see browser devtools / network)')
    })

    ws.addEventListener('message', (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as ServerSnapshotMessage
        if (data.type === 'state') {
          lastSnapshot.value = data
          const nPlayers = Object.keys(data.state.players ?? {}).length
          const nObjects = Object.keys(data.state.objects ?? {}).length
          const msgHint =
            data.messages?.length && data.messages.length > 0
              ? ` msgs=${data.messages.length}`
              : ''
          appendLog(
            `state phase=${data.state.phase} players=${nPlayers} objects=${nObjects} logLen=${data.actionLogLen}${msgHint}`,
          )
        } else {
          appendLog(`message: ${event.data.slice(0, 200)}`)
        }
      } catch {
        appendLog(`raw: ${event.data.slice(0, 200)}`)
      }
    })

    socket.value = ws
  }

  function disconnect() {
    const current = socket.value
    if (current) {
      current.close()
      socket.value = null
    }
    connectionState.value = 'idle'
    appendLog('disconnected')
  }

  function sendAction(action: ClientAction) {
    const ws = socket.value
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      appendLog('send skipped: socket not open')
      return
    }
    ws.send(JSON.stringify(action))
    appendLog(`send ${action.type}`)
  }

  /** First outbound message must include playerId so the Go gateway registers the client. */
  function sendJoin(displayName: string) {
    sendAction({
      playerId: options.playerId.value.trim(),
      type: 'join',
      payload: { displayName },
    })
  }

  function sendStartGame() {
    sendAction({
      playerId: options.playerId.value.trim(),
      type: 'start_game',
    })
  }

  function sendCustom(payload: Record<string, unknown>) {
    sendAction({
      playerId: options.playerId.value.trim(),
      type: 'custom',
      payload,
    })
  }

  onUnmounted(() => {
    disconnect()
  })

  return {
    wsUrl,
    connectionState,
    lastSnapshot,
    logLines,
    connect,
    disconnect,
    sendAction,
    sendJoin,
    sendStartGame,
    sendCustom,
    appendLog,
  }
}
