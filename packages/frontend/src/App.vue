<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { BoardObject } from '@board-forge/shared'
import { getObjectBounds } from '@board-forge/shared/geometry'
import { useGameSocket } from './composables/useGameSocket'
import { INITIAL_GAME_STATE } from './game/config'
import { drawGame } from './game/render'

const canvas = ref<HTMLCanvasElement | null>(null)
const renderObjects = ref<BoardObject[]>(INITIAL_GAME_STATE.objects.map((object) => ({ ...object })))
const { connect, gameState, locks, sendDragEnd, sendDragStart, sendMove, status, userId } = useGameSocket({
  initialState: INITIAL_GAME_STATE,
  onLockGranted: (message) => {
    if (message.objectId !== draggingObjectId) return

    draw()
  },
  onLockDenied: (message) => {
    if (message.objectId !== draggingObjectId) return

    finishDragging({ sendEnd: false })
    syncRenderObjects(gameState.value.objects)
    draw()
  },
  onLocks: () => {
    draw()
  },
  onState: (message) => {
    const protectedObjectId = dragging ? draggingObjectId : undefined
    syncRenderObjects(message.state.objects, protectedObjectId)
    syncCanvasSize()
  },
})

const statusLabel = computed(() => {
  if (status.value === 'connected') return 'Connected'
  if (status.value === 'connecting') return 'Connecting'
  return 'Disconnected'
})
const statusDotClass = computed(() => {
  if (status.value === 'connected') return 'bg-green-600'
  if (status.value === 'connecting') return 'bg-amber-500'
  return 'bg-red-600'
})
const board = computed(() => gameState.value.board)
const boardAspectRatio = computed(() => `${board.value.width} / ${board.value.height}`)
const shortUserId = computed(() => userId.value.slice(0, 8))

let dragging = false
let draggingObjectId = ''
let activePointerId: number | null = null
let dragOffsetX = 0
let dragOffsetY = 0
let animationFrame = 0

const cloneObjects = (objects: BoardObject[]) => {
  return objects.map((object) => ({ ...object }))
}

const syncRenderObjects = (objects: BoardObject[], protectedObjectId?: string) => {
  const protectedObject = protectedObjectId
    ? renderObjects.value.find((object) => object.id === protectedObjectId)
    : undefined

  renderObjects.value = cloneObjects(objects).map((object) => {
    if (object.id === protectedObjectId && protectedObject) {
      return protectedObject
    }

    return object
  })
}

const draw = () => {
  const element = canvas.value
  if (!element) return

  const context = element.getContext('2d')
  if (!context) return

  drawGame(context, board.value, renderObjects.value, locks.value)
}

const getObjectLock = (objectId: string) => {
  return locks.value.find((lock) => lock.objectId === objectId)
}

const isLockedByOtherUser = (objectId: string) => {
  const lock = getObjectLock(objectId)

  return Boolean(lock && lock.userId !== userId.value)
}

const syncCanvasSize = () => {
  const element = canvas.value
  if (!element) return

  const pixelRatio = window.devicePixelRatio || 1
  const nextWidth = Math.floor(board.value.width * pixelRatio)
  const nextHeight = Math.floor(board.value.height * pixelRatio)

  if (element.width !== nextWidth || element.height !== nextHeight) {
    element.width = nextWidth
    element.height = nextHeight
  }

  const context = element.getContext('2d')
  context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  draw()
}

const scheduleCanvasResize = () => {
  cancelAnimationFrame(animationFrame)
  animationFrame = requestAnimationFrame(syncCanvasSize)
}

const getCanvasPoint = (event: PointerEvent) => {
  const element = canvas.value
  if (!element) return null

  const rect = element.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * board.value.width,
    y: ((event.clientY - rect.top) / rect.height) * board.value.height,
  }
}

const isPointInObject = (object: BoardObject, x: number, y: number) => {
  if (object.locked || object.hidden || isLockedByOtherUser(object.id)) return false

  if (object.kind === 'circle') {
    const centerX = object.x + object.radius
    const centerY = object.y + object.radius
    return Math.hypot(x - centerX, y - centerY) <= object.radius
  }

  const { width, height } = getObjectBounds(object)
  return x >= object.x && x <= object.x + width && y >= object.y && y <= object.y + height
}

const getObjectAtPoint = (x: number, y: number) => {
  return [...renderObjects.value]
    .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
    .find((object) => isPointInObject(object, x, y))
}

const moveObject = (x: number, y: number) => {
  const element = canvas.value
  if (!element) return

  const object = renderObjects.value.find((candidate) => candidate.id === draggingObjectId)
  if (!object || object.locked) return

  const { width, height } = getObjectBounds(object)
  const maxX = Math.max(0, board.value.width - width)
  const maxY = Math.max(0, board.value.height - height)

  object.x = Math.min(Math.max(0, x - dragOffsetX), maxX)
  object.y = Math.min(Math.max(0, y - dragOffsetY), maxY)

  draw()
  sendMove(object.id, object.x, object.y)
}

const handlePointerDown = (event: PointerEvent) => {
  if (activePointerId !== null || (event.pointerType === 'touch' && !event.isPrimary)) return

  const point = getCanvasPoint(event)
  if (!point) return

  const object = getObjectAtPoint(point.x, point.y)
  if (!object) return

  dragging = true
  draggingObjectId = object.id
  activePointerId = event.pointerId
  dragOffsetX = point.x - object.x
  dragOffsetY = point.y - object.y
  sendDragStart(object.id)
  canvas.value?.setPointerCapture(event.pointerId)
}

const handlePointerMove = (event: PointerEvent) => {
  if (!dragging || event.pointerId !== activePointerId) return

  const point = getCanvasPoint(event)
  if (!point) return

  moveObject(point.x, point.y)
}

const finishDragging = (options: { sendEnd?: boolean } = {}) => {
  const objectId = draggingObjectId
  const pointerId = activePointerId

  dragging = false
  draggingObjectId = ''
  activePointerId = null

  if (options.sendEnd !== false && objectId) {
    sendDragEnd(objectId)
  }

  if (pointerId !== null && canvas.value?.hasPointerCapture(pointerId)) {
    canvas.value.releasePointerCapture(pointerId)
  }
}

const stopDragging = (event: PointerEvent) => {
  if (event.pointerId !== activePointerId) return

  finishDragging()
}

const preventCanvasContextMenu = (event: MouseEvent) => {
  event.preventDefault()
}

const handleWindowBlur = () => {
  finishDragging()
}

const handleVisibilityChange = () => {
  if (document.hidden) {
    finishDragging()
  }
}

onMounted(() => {
  connect()
  syncCanvasSize()
  window.addEventListener('resize', scheduleCanvasResize)
  window.addEventListener('blur', handleWindowBlur)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  finishDragging()
  window.removeEventListener('resize', scheduleCanvasResize)
  window.removeEventListener('blur', handleWindowBlur)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  cancelAnimationFrame(animationFrame)
})

watch(status, (nextStatus) => {
  if (nextStatus === 'disconnected') {
    finishDragging({ sendEnd: false })
  }
})
</script>

<template>
  <main
    class="mx-auto grid min-h-screen w-[min(1120px,calc(100vw-32px))] grid-rows-[auto_minmax(360px,1fr)] gap-4 py-6 max-sm:w-[min(1120px,calc(100vw-24px))] max-sm:grid-rows-[auto_minmax(420px,1fr)] max-sm:py-4"
  >
    <header
      class="flex min-h-16 items-center justify-between gap-4 max-sm:flex-col max-sm:items-start"
    >
      <div>
        <p class="mb-1 text-xs font-bold tracking-normal text-slate-500 uppercase">Board Forge</p>
        <h1 class="m-0 text-[clamp(24px,3vw,36px)] leading-[1.1] font-bold text-slate-900">
          Canvas Sync Demo
        </h1>
      </div>
      <div class="flex items-center gap-2 max-sm:flex-wrap">
        <div
          class="inline-flex min-w-33 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-600 max-sm:justify-start"
        >
          <span class="size-2.5 rounded-full" :class="statusDotClass" />
          {{ statusLabel }}
        </div>
        <div
          class="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-600"
        >
          <span class="text-slate-400">User</span>
          <span class="font-mono text-slate-800">{{ shortUserId || 'pending' }}</span>
        </div>
      </div>
    </header>

    <canvas
      ref="canvas"
      class="aspect-video w-full touch-none select-none rounded-lg border border-slate-300 bg-slate-50 shadow-[0_20px_45px_rgb(15_23_42/12%)] cursor-grab [-webkit-touch-callout:none] active:cursor-grabbing"
      :style="{ aspectRatio: boardAspectRatio }"
      @contextmenu="preventCanvasContextMenu"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="stopDragging"
      @pointercancel="stopDragging"
    />
  </main>
</template>
