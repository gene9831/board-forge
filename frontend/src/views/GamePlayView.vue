<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameWebSocket } from '../composables/useGameWebSocket'
import { getGameById } from '../games/catalog'

const props = defineProps<{
  gameId: string
}>()

const router = useRouter()
const game = computed(() => getGameById(props.gameId))

const wsBase = ref('http://localhost:8080')
const roomId = ref('demo')
const playerId = ref('p1')
const displayName = ref('Player one')
const customMessage = ref('hello from vue')

const gameIdRef = computed(() => props.gameId)

const {
  wsUrl,
  connectionState,
  lastSnapshot,
  logLines,
  connect,
  disconnect,
  sendJoin,
  sendStartGame,
  sendCustom,
} = useGameWebSocket({
  wsBase,
  roomId,
  playerId,
  gameId: gameIdRef,
})

const joinedCount = computed(() =>
  lastSnapshot.value ? Object.keys(lastSnapshot.value.state.players).length : 0,
)

const objectCount = computed(() =>
  lastSnapshot.value ? Object.keys(lastSnapshot.value.state.objects).length : 0,
)

function backToPicker() {
  disconnect()
  router.push({ name: 'home' })
}
</script>

<template>
  <div class="min-h-dvh bg-slate-950 text-slate-100 p-6">
    <div class="mx-auto flex max-w-3xl flex-col gap-6">
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-1">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Playing</p>
          <h1 class="text-2xl font-semibold tracking-tight text-teal-400">
            {{ game?.name ?? gameId }}
          </h1>
          <p class="text-sm text-slate-400">
            {{ game?.description }}
          </p>
          <p class="text-xs text-slate-500">
            Pack ID: <code class="text-teal-300/80">{{ gameId }}</code>
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
          @click="backToPicker"
        >
          ← Change game
        </button>
      </header>

      <p class="text-sm text-slate-400">
        WebSocket <code class="text-teal-300/90">/ws/{roomId}</code> — intents
        <code class="text-teal-300/90">join</code>, <code class="text-teal-300/90">start_game</code>,
        <code class="text-teal-300/90">custom</code>. Game id is sent as
        <code class="text-teal-300/90">?game=</code> for servers that support multiple packs.
      </p>

      <section class="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <label class="grid gap-1 text-sm">
          <span class="text-slate-400">Backend (http or ws)</span>
          <input
            v-model="wsBase"
            class="rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm outline-none ring-teal-500/40 focus:ring-2"
            autocomplete="off"
          />
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="grid gap-1 text-sm">
            <span class="text-slate-400">Room ID</span>
            <input
              v-model="roomId"
              class="rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm outline-none ring-teal-500/40 focus:ring-2"
              autocomplete="off"
            />
          </label>
          <label class="grid gap-1 text-sm">
            <span class="text-slate-400">Player ID</span>
            <input
              v-model="playerId"
              class="rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm outline-none ring-teal-500/40 focus:ring-2"
              autocomplete="off"
            />
          </label>
        </div>
        <label class="grid gap-1 text-sm">
          <span class="text-slate-400">Display name (join)</span>
          <input
            v-model="displayName"
            class="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-teal-500/40 focus:ring-2"
            autocomplete="off"
          />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="text-slate-400">Custom intent message</span>
          <input
            v-model="customMessage"
            class="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-teal-500/40 focus:ring-2"
            autocomplete="off"
          />
        </label>

        <p class="break-all font-mono text-xs text-slate-500">
          {{ wsUrl }}
        </p>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50"
            :disabled="connectionState === 'connecting'"
            @click="connect"
          >
            Connect
          </button>
          <button
            type="button"
            class="rounded border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            @click="disconnect"
          >
            Disconnect
          </button>
          <button
            type="button"
            class="rounded bg-slate-700 px-4 py-2 text-sm text-slate-100 hover:bg-slate-600 disabled:opacity-50"
            :disabled="connectionState !== 'open'"
            @click="sendJoin(displayName)"
          >
            Send join
          </button>
          <button
            type="button"
            class="rounded bg-slate-700 px-4 py-2 text-sm text-slate-100 hover:bg-slate-600 disabled:opacity-50"
            :disabled="connectionState !== 'open' || joinedCount < 1"
            @click="sendStartGame"
          >
            Send start_game
          </button>
          <button
            type="button"
            class="rounded bg-amber-800 px-4 py-2 text-sm text-slate-100 hover:bg-amber-700 disabled:opacity-50"
            :disabled="connectionState !== 'open'"
            @click="sendCustom({ message: customMessage })"
          >
            Send custom
          </button>
        </div>

        <p class="text-xs text-slate-500">
          Status:
          <span class="font-mono text-teal-300/90">{{ connectionState }}</span>
          · Joined: {{ joinedCount }} · Objects: {{ objectCount }}
        </p>
      </section>

      <section v-if="lastSnapshot?.messages?.length" class="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <h2 class="mb-2 text-sm font-medium text-slate-300">Server messages (this tick)</h2>
        <ul class="list-inside list-disc text-xs text-slate-400">
          <li v-for="(m, i) in lastSnapshot.messages" :key="i">
            <span class="font-mono text-teal-200/80">{{ m.kind }}</span>
            <span v-if="m.playerId" class="text-slate-500"> → {{ m.playerId }}</span>
            : {{ m.message }}
          </li>
        </ul>
      </section>

      <section v-if="lastSnapshot" class="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <h2 class="mb-2 text-sm font-medium text-slate-300">Last state (raw)</h2>
        <pre class="max-h-48 overflow-auto rounded bg-slate-950 p-3 font-mono text-xs text-slate-400">{{
          JSON.stringify(lastSnapshot.state, null, 2)
        }}</pre>
      </section>

      <section class="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <h2 class="mb-2 text-sm font-medium text-slate-300">Log</h2>
        <pre class="max-h-64 overflow-auto whitespace-pre-wrap wrap-break-word font-mono text-xs text-slate-400">{{
          logLines.join('\n')
        }}</pre>
      </section>
    </div>
  </div>
</template>
