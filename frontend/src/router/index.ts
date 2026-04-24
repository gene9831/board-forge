import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import GamePlayView from '../views/GamePlayView.vue'
import { getGameById } from '../games/catalog'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    {
      path: '/play/:gameId',
      name: 'play',
      component: GamePlayView,
      props: true,
      beforeEnter: (to, _from, next) => {
        const id = to.params.gameId as string
        if (!getGameById(id)) {
          next({ name: 'home', query: { unknownGame: id } })
          return
        }
        next()
      },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
