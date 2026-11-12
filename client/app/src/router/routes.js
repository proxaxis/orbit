const routes = [
  {
    path: '/',
    component: () => import('@/zones/HomeLayout.vue'),
    children: [
      {
        path: '',
        name: 'Home',
        components: {
          default: () => import('@/pages/CalendarMainView.vue'),
          nav: () => import('@/pages/UserCalendarsView.vue'),
          sub: () => import('@/pages/DateEventsView.vue'),
        },
      },
      {
        path: '/evt/new',
        name: 'EventCreator',
        components: {
          default: () => import('@/pages/CalendarMainView.vue'),
          nav: () => import('@/pages/UserCalendarsView.vue'),
          sub: () => import('@/pages/EventCreatorView.vue'),
        },
      },
      {
        path: '/task/new',
        name: 'TaskCreator',
        components: {
          default: () => import('@/pages/CalendarMainView.vue'),
          nav: () => import('@/pages/UserCalendarsView.vue'),
          sub: () => import('@/pages/TaskCreatorView.vue'),
        },
      },
      {
        path: '/evt/detail',
        name: 'EventDetail',
        components: {
          default: () => import('@/pages/CalendarMainView.vue'),
          nav: () => import('@/pages/UserCalendarsView.vue'),
          sub: () => import('@/pages/EventDetailView.vue'),
        },
      },
      {
        path: '/evt/edit',
        name: 'EventEditor',
        components: {
          default: () => import('@/pages/CalendarMainView.vue'),
          nav: () => import('@/pages/UserCalendarsView.vue'),
          sub: () => import('@/pages/EventEditorView.vue'),
        },
      },
      {
        path: '/evt/clone',
        name: 'EventCloner',
        components: {
          default: () => import('@/pages/CalendarMainView.vue'),
          nav: () => import('@/pages/UserCalendarsView.vue'),
          sub: () => import('@/pages/EventClonerView.vue'),
        },
      },
      {
        path: '/evt/search',
        name: 'EventSearch',
        components: {
          default: () => import('@/pages/CalendarMainView.vue'),
          nav: () => import('@/pages/UserCalendarsView.vue'),
          sub: () => import('@/pages/EventSearchView.vue'),
        },
      },
      {
        path: '/evt/quick-add',
        name: 'EventQuickAdd',
        components: {
          default: () => import('@/pages/CalendarMainView.vue'),
          nav: () => import('@/pages/UserCalendarsView.vue'),
          sub: () => import('@/pages/EventQuickAddView.vue'),
        },
      },
      {
        path: '/evt/templates',
        name: 'EventTemplatePicker',
        components: {
          default: () => import('@/pages/CalendarMainView.vue'),
          nav: () => import('@/pages/UserCalendarsView.vue'),
          sub: () => import('@/pages/EventTemplatePickerView.vue'),
        },
      },
      {
        path: '/share/accept',
        name: 'ShareAccept',
        components: {
          default: () => import('@/pages/CalendarMainView.vue'),
          nav: () => import('@/pages/UserCalendarsView.vue'),
          sub: () => import('@/pages/ShareAcceptView.vue'),
        },
      },
      {
        path: '/cal/share',
        name: 'ShareManage',
        components: {
          default: () => import('@/pages/CalendarMainView.vue'),
          nav: () => import('@/pages/UserCalendarsView.vue'),
          sub: () => import('@/pages/ShareManageView.vue'),
        },
      },
      {
        path: '/cal/sharing',
        name: 'SharingConfig',
        components: {
          default: () => import('@/pages/CalendarMainView.vue'),
          nav: () => import('@/pages/UserCalendarsView.vue'),
          sub: () => import('@/pages/SharingConfigView.vue'),
        },
      },
      {
        path: '/cal/new',
        name: 'CalendarCreator',
        components: {
          default: () => import('@/pages/CalendarMainView.vue'),
          nav: () => import('@/pages/UserCalendarsView.vue'),
          sub: () => import('@/pages/CalendarCreatorView.vue'),
        },
      },
      {
        path: '/cal/add',
        name: 'CalendarAdder',
        components: {
          default: () => import('@/pages/CalendarMainView.vue'),
          nav: () => import('@/pages/UserCalendarsView.vue'),
          sub: () => import('@/pages/CalendarAdder.vue'),
        },
      },
      {
        path: '/cal/detail',
        name: 'CalendarDetail',
        components: {
          default: () => import('@/pages/CalendarMainView.vue'),
          nav: () => import('@/pages/UserCalendarsView.vue'),
          sub: () => import('@/pages/CaledarDetailView.vue'),
        },
      },
      {
        path: '/usr/config',
        name: 'UserConfig',
        components: {
          default: () => import('@/pages/CalendarMainView.vue'),
          nav: () => import('@/pages/UserCalendarsView.vue'),
          sub: () => import('@/pages/UserConfigView.vue'),
        },
      },
    ],
  },
  {
    // Google OAuth 認証後のリダイレクト先(例: 写真共有の有効化)
    path: '/enable',
    name: 'Enable',
    component: () => import('@/pages/EnableView.vue'),
  },
  {
    // Google OAuth でユーザが認可したときのリダイレクト先(?t= で認可対象を識別)
    path: '/authorized',
    name: 'AccessAuthorized',
    component: () => import('@/pages/AccessAuthorizedView.vue'),
  },
  {
    // Google OAuth でユーザが拒否したとき・エラー発生時のリダイレクト先
    path: '/unauthorized',
    name: 'AccessUnauthorized',
    component: () => import('@/pages/AccessUnauthorizedView.vue'),
  },
  {
    // 404 キャッチオール(常に最後に置く)
    path: '/:pathMatch(.*)*',
    component: () => import('@/pages/[...path].vue'),
  },
];

export default routes;
