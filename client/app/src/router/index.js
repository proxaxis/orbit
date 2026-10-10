import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('@/zones/HomeLayout.vue'),
      name: 'HomeZone',
      children: [
        {
          path: '',
          name: 'Home',
          components: {
            default: () => import('@/views/CalendarMainView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/DateEventsView.vue'),
          },
        },
        {
          path: '/evt/new',
          name: 'EventCreator',
          components: {
            default: () => import('@/views/CalendarMainView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/EventCreatorView.vue'),
          },
        },
        {
          path: '/evt/detail',
          name: 'EventDetail',
          components: {
            default: () => import('@/views/CalendarMainView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/EventDetailView.vue'),
          },
        },
        {
          path: '/evt/edit',
          name: 'EventEditor',
          components: {
            default: () => import('@/views/CalendarMainView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/EventEditorView.vue'),
          },
        },
        {
          path: '/evt/clone',
          name: 'EventCloner',
          components: {
            default: () => import('@/views/CalendarMainView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/EventClonerView.vue'),
          },
        },
        {
          path: '/evt/search',
          name: 'EventSearch',
          components: {
            default: () => import('@/views/CalendarMainView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/EventSearchView.vue'),
          },
        },
        {
          path: '/evt/quick-add',
          name: 'EventQuickAdd',
          components: {
            default: () => import('@/views/CalendarMainView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/EventQuickAddView.vue'),
          },
        },
        {
          path: '/evt/templates',
          name: 'EventTemplatePicker',
          components: {
            default: () => import('@/views/CalendarMainView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/EventTemplatePickerView.vue'),
          },
        },
        {
          path: '/cal/share',
          name: 'ShareManage',
          components: {
            default: () => import('@/views/CalendarMainView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/ShareManageView.vue'),
          },
        },
        {
          path: '/cal/sharing',
          name: 'SharingConfig',
          components: {
            default: () => import('@/views/CalendarMainView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/SharingConfigView.vue'),
          },
        },
        {
          path: '/cal/new',
          name: 'CalendarCreator',
          components: {
            default: () => import('@/views/CalendarMainView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/CalendarCreatorView.vue'),
          },
        },
        {
          path: '/cal/add',
          name: 'CalendarAdder',
          components: {
            default: () => import('@/views/CalendarMainView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/CalendarAdder.vue'),
          },
        },
        {
          path: '/cal/detail',
          name: 'CalendarDetail',
          components: {
            default: () => import('@/views/CalendarMainView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/CaledarDetailView.vue'),
          },
        },
        {
          path: '/usr/config',
          name: 'UserConfig',
          components: {
            default: () => import('@/views/CalendarMainView.vue'),
            nav: () => import('@/views/UserCalendarsView.vue'),
            sub: () => import('@/views/UserConfigView.vue'),
          },
        },
      ],
    },
    {
      // Google OAuth 認証後のリダイレクト先（例: 写真共有の有効化）
      path: '/enable',
      name: 'Enable',
      component: () => import('@/views/EnableView.vue'),
    },
    {
      // Google OAuth でユーザが認可したときのリダイレクト先（?t= で認可対象を識別）
      path: '/authorized',
      name: 'AccessAuthorized',
      component: () => import('@/views/AccessAuthorizedView.vue'),
    },
    {
      // Google OAuth でユーザが拒否したとき・エラー発生時のリダイレクト先
      path: '/unauthorized',
      name: 'AccessUnauthorized',
      component: () => import('@/views/AccessUnauthorizedView.vue'),
    },
  ],
});

export default router;
