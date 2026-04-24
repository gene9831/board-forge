<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { GAME_CATALOG } from '../games/catalog'

const router = useRouter()
const route = useRoute()

const selectedId = ref(GAME_CATALOG[0]?.id ?? '')

const unknownGameHint = computed(() => {
  const q = route.query.unknownGame
  return typeof q === 'string' && q ? q : ''
})

function confirmGame() {
  if (!selectedId.value) return
  router.push({ name: 'play', params: { gameId: selectedId.value } })
}
</script>

<template>
  <div class="min-h-dvh bg-slate-950 text-slate-100">
    <div class="mx-auto flex max-w-lg flex-col gap-8 px-6 py-16">
      <header class="space-y-2 text-center">
        <h1 class="text-3xl font-semibold tracking-tight text-teal-400">Board Forge</h1>
        <p class="text-sm text-slate-400">Choose a game pack, then open the table view.</p>
      </header>

      <div
        v-if="unknownGameHint"
        class="rounded-lg border border-amber-800/60 bg-amber-950/40 px-4 py-3 text-center text-sm text-amber-100/90"
        role="alert"
      >
        Unknown game “{{ unknownGameHint }}” — pick a game from the list.
      </div>

      <section class="grid gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
        <label class="grid gap-2 text-sm">
          <span class="text-slate-400">Game</span>
          <select
            v-model="selectedId"
            class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-base text-slate-100 outline-none ring-teal-500/30 focus:ring-2"
          >
            <option v-for="g in GAME_CATALOG" :key="g.id" :value="g.id">
              {{ g.name }}
            </option>
          </select>
        </label>

        <p
          v-for="g in GAME_CATALOG.filter((x) => x.id === selectedId)"
          :key="'desc-' + g.id"
          class="text-xs leading-relaxed text-slate-500"
        >
          {{ g.description }}
        </p>

        <button
          type="button"
          class="mt-2 rounded-lg bg-teal-600 py-3 text-sm font-medium text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!selectedId"
          @click="confirmGame"
        >
          Confirm & open table
        </button>
      </section>
    </div>
  </div>
</template>
