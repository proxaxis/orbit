import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('@/zone/HomeZone.vue'),
      name: 'HomeZone',
      children: [
        {
          path: '',
          name: 'Home',
          components: {
            default: () => import('@/views/CalendarMonthHorizonView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/DateEventsView.vue'),
          },
        },
        {
          path: '/evt/new',
          name: 'EventCreator',
          components: {
            default: () => import('@/views/CalendarMonthHorizonView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/EventCreatorView.vue'),
          },
        },
        {
          path: '/evt/:id',
          name: 'EventDetail',
          components: {
            default: () => import('@/views/CalendarMonthHorizonView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/EventDetailView.vue'),
          },
        },
        {
          path: '/evt/:id/edit',
          name: 'EventEditor',
          components: {
            default: () => import('@/views/CalendarMonthHorizonView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/EventEditorView.vue'),
          },
        },
      ],
    },
  ],
});

export default router;
