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
          path: '/evt/detail',
          name: 'EventDetail',
          components: {
            default: () => import('@/views/CalendarMonthHorizonView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/EventDetailView.vue'),
          },
        },
        {
          path: '/evt/edit',
          name: 'EventEditor',
          components: {
            default: () => import('@/views/CalendarMonthHorizonView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/EventEditorView.vue'),
          },
        },
        {
          path: '/calendar/sharing',
          name: 'SharingConfig',
          components: {
            default: () => import('@/views/CalendarMonthHorizonView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/SharingConfigView.vue'),
          },
        },
        {
          path: '/calendar/new',
          name: 'CalendarCreator',
          components: {
            default: () => import('@/views/CalendarMonthHorizonView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/CalendarCreatorView.vue'),
          },
        },
        {
          path: '/calendar/detail',
          name: 'CalendarDetail',
          components: {
            default: () => import('@/views/CalendarMonthHorizonView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/CaledarDetailView.vue'),
          },
        },
        {
          path: '/user/config',
          name: 'UserConfig',
          components: {
            default: () => import('@/views/CalendarMonthHorizonView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/UserConfigView.vue'),
          },
        },
      ],
    },
  ],
});

export default router;
