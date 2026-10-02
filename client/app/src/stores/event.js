import { defineStore } from 'pinia';
import { onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import * as gCalAPI from '@/services/google-calendar-api.js';

export const useEventStore = defineStore('event', () => {
  const authStore = useAuthStore();
  const calendarStore = useCalendarStore();
  const userStore = useUserStore();

  /** @type {Ref<Map<string, GoogleEvent[]>>} @description イベントデータ */
  const _gEventsList = ref(new Map());

  /**
   * 指定の年と月における全てのカレンダーリストの全てのイベントを取得
   * @param {number} year 取得する年
   * @param {number} monthIndex 取得する月インデックス（0-11）
   * @param {EventsListQueryParams} [query={}] クエリパラメータ
   * @return {Promise<GoogleEvent[]>}
   */
  async function listEvents(year, monthIndex, query = {}) {
    return [
      {
        kind: 'calendar#event',
        etag: '"3525814452816254"',
        id: '_8d9lcgrfdpr6asjk60r34dr374s62e9l60ojcc1lc4pm8e1o65gjedb5ckr34p1lclgg',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=XzhkOWxjZ3JmZHByNmFzams2MHIzNGRyMzc0czYyZTlsNjBvamNjMWxjNHBtOGUxbzY1Z2plZGI1Y2tyMzRwMWxjbGdnIGNodW8tY2FsZW5kYXIuMDFwQGcuY2h1by11LmFjLmpw',
        created: '2025-11-12T00:27:05.000Z',
        updated: '2025-11-12T00:27:06.408Z',
        summary: '祝日の授業実施日',
        creator: {
          email: 'chuo-calendar.01p@g.chuo-u.ac.jp',
          self: true,
        },
        organizer: {
          email: 'chuo-calendar.01p@g.chuo-u.ac.jp',
          self: true,
        },
        start: {
          date: '2026-10-12',
        },
        end: {
          date: '2026-10-13',
        },
        iCalUID: 'CSVConvert0627c98a9501605a3d881a75ee62d5ea',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3525814452816254"',
        id: '_8d9lcgrfdpr6asjk6dj6ccpg61ij4dhiccoj4d9h6pijepb46lh3ic34clh34e1g6pj0',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=XzhkOWxjZ3JmZHByNmFzams2ZGo2Y2NwZzYxaWo0ZGhpY2NvajRkOWg2cGlqZXBiNDZsaDNpYzM0Y2xoMzRlMWc2cGowIGNodW8tY2FsZW5kYXIuMDFwQGcuY2h1by11LmFjLmpw',
        created: '2025-11-12T00:27:05.000Z',
        updated: '2025-11-12T00:27:06.408Z',
        summary: '臨時休業',
        creator: {
          email: 'chuo-calendar.01p@g.chuo-u.ac.jp',
          self: true,
        },
        organizer: {
          email: 'chuo-calendar.01p@g.chuo-u.ac.jp',
          self: true,
        },
        start: {
          date: '2026-10-29',
        },
        end: {
          date: '2026-10-30',
        },
        iCalUID: 'CSVConvert3ff300e262c12516e7ed5b90deb2806f',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3525814452816254"',
        id: '_8d9lcgrfdpr6asjkccr6apb471j32e9k70s3cd9mcpi64phkcgp32p326cq3gd1p6sq0',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=XzhkOWxjZ3JmZHByNmFzamtjY3I2YXBiNDcxajMyZTlrNzBzM2NkOW1jcGk2NHBoa2NncDMycDMyNmNxM2dkMXA2c3EwIGNodW8tY2FsZW5kYXIuMDFwQGcuY2h1by11LmFjLmpw',
        created: '2025-11-12T00:27:05.000Z',
        updated: '2025-11-12T00:27:06.408Z',
        summary: '全日休講',
        creator: {
          email: 'chuo-calendar.01p@g.chuo-u.ac.jp',
          self: true,
        },
        organizer: {
          email: 'chuo-calendar.01p@g.chuo-u.ac.jp',
          self: true,
        },
        start: {
          date: '2026-10-30',
        },
        end: {
          date: '2026-10-31',
        },
        iCalUID: 'CSVConvertc6eed8f19488656fdbf4d21db3484974',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3432807024384000"',
        id: '20261012_9h809akrnv7bgja9ifjciu0g8o',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=MjAyNjEwMTJfOWg4MDlha3JudjdiZ2phOWlmamNpdTBnOG8gamEuamFwYW5lc2UjaG9saWRheUB2',
        created: '2024-05-22T18:45:12.000Z',
        updated: '2024-05-22T18:45:12.192Z',
        summary: 'スポーツの日',
        description: '祝日',
        creator: {
          email: 'ja.japanese#holiday@group.v.calendar.google.com',
          displayName: '日本の祝日',
          self: true,
        },
        organizer: {
          email: 'ja.japanese#holiday@group.v.calendar.google.com',
          displayName: '日本の祝日',
          self: true,
        },
        start: {
          date: '2026-10-12',
        },
        end: {
          date: '2026-10-13',
        },
        transparency: 'transparent',
        visibility: 'public',
        iCalUID: '20261012_9h809akrnv7bgja9ifjciu0g8o@google.com',
        sequence: 0,
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3516231939968830"',
        id: 'cop6ccb5c5j3eb9pckp3ab9kcooj6bb1ckq34b9l6tj6cd9icgrmcd34c4',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=Y29wNmNjYjVjNWozZWI5cGNrcDNhYjlrY29vajZiYjFja3EzNGI5bDZ0ajZjZDlpY2dybWNkMzRjNF8yMDI1MTAwNyBiYWRkOWJjNDhiNTc4ZDJlOGJlOGE5NWQyYWZhYmMzZTQwMjRlNDg3NmFiNDlkN2NiMGJkOGUyNDRmNTkxZWM5QGc',
        created: '2025-09-17T13:32:49.000Z',
        updated: '2025-09-17T13:32:49.984Z',
        summary: '🎂記念日',
        creator: {
          email: 'proxaxis.me@gmail.com',
        },
        organizer: {
          email: 'badd9bc48b578d2e8be8a95d2afabc3e4024e4876ab49d7cb0bd8e244f591ec9@group.calendar.google.com',
          displayName: 'プライベート',
          self: true,
        },
        start: {
          date: '2025-10-07',
        },
        end: {
          date: '2025-10-08',
        },
        recurrence: ['RRULE:FREQ=YEARLY;WKST=MO;INTERVAL=1'],
        iCalUID: 'cop6ccb5c5j3eb9pckp3ab9kcooj6bb1ckq34b9l6tj6cd9icgrmcd34c4@google.com',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3581756949065502"',
        id: '7gjbn6j7motip5lo9mg0vs6b9t',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=N2dqYm42ajdtb3RpcDVsbzltZzB2czZiOXQgcHJveGF4aXMubWVAbQ',
        created: '2026-10-01T18:14:34.000Z',
        updated: '2026-10-01T18:14:34.532Z',
        summary: '予定1',
        creator: {
          email: 'proxaxis.me@gmail.com',
          self: true,
        },
        organizer: {
          email: 'proxaxis.me@gmail.com',
          self: true,
        },
        start: {
          date: '2026-10-03',
        },
        end: {
          date: '2026-10-04',
        },
        transparency: 'transparent',
        iCalUID: '7gjbn6j7motip5lo9mg0vs6b9t@google.com',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3581756992436286"',
        id: '65qte3t5k5ngubers9makge20r',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=NjVxdGUzdDVrNW5ndWJlcnM5bWFrZ2UyMHIgcHJveGF4aXMubWVAbQ',
        created: '2026-10-01T18:14:55.000Z',
        updated: '2026-10-01T18:14:56.218Z',
        summary: '予定2',
        creator: {
          email: 'proxaxis.me@gmail.com',
          self: true,
        },
        organizer: {
          email: 'proxaxis.me@gmail.com',
          self: true,
        },
        start: {
          dateTime: '2026-10-04T10:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: '2026-10-04T11:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        iCalUID: '65qte3t5k5ngubers9makge20r@google.com',
        sequence: 0,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3526893304505374"',
        id: '_70p44d1i8ksk4b9o8gpj0b9k6h34cb9o84r38b9j68r46ga26oo36e1m8k',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=XzcwcDQ0ZDFpOGtzazRiOW84Z3BqMGI5azZoMzRjYjlvODRyMzhiOWo2OHI0NmdhMjZvbzM2ZTFtOGsgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2025-11-18T06:17:32.000Z',
        updated: '2025-11-18T06:17:32.252Z',
        summary: 'コンピュータセキュリティシンポジウム2025',
        location: 'アクトシティ浜松',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-19',
        },
        end: {
          date: '2026-10-24',
        },
        transparency: 'transparent',
        iCalUID: '82B42E9B-8D30-44FF-8A64-326CAB60386E',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3533943842659358"',
        id: '19rcg6p5fcv9oc34elbql2i94l',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=MTlyY2c2cDVmY3Y5b2MzNGVsYnFsMmk5NGwgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2025-12-29T01:32:01.000Z',
        updated: '2025-12-29T01:32:01.329Z',
        summary: 'Microsoft 月例セキュリティ更新プログラム',
        description: '<a href="https://www.microsoft.com/en-us/msrc/blog/category?cat=Japan%20Security%20Team">https://www.microsoft.com/en-us/msrc/blog/category?cat=Japan%20Security%20Team</a>',
        creator: {
          email: '8nyantaku8@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-14',
        },
        end: {
          date: '2026-10-15',
        },
        transparency: 'transparent',
        iCalUID: '19rcg6p5fcv9oc34elbql2i94l@google.com',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3533948613886302"',
        id: '7jag03dkf5uegdpa5h3989hhl1',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=N2phZzAzZGtmNXVlZ2RwYTVoMzk4OWhobDEgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2025-12-29T02:11:46.000Z',
        updated: '2025-12-29T02:11:46.943Z',
        summary: 'Fortinet Vulnerability Advisory',
        description: 'https://fortiguard.fortinet.com/psirt',
        creator: {
          email: '8nyantaku8@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-14',
        },
        end: {
          date: '2026-10-15',
        },
        transparency: 'transparent',
        iCalUID: '7jag03dkf5uegdpa5h3989hhl1@google.com',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3533950280254750"',
        id: '7pv8ickdn8fg1ai6qg0cr5enn3',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=N3B2OGlja2RuOGZnMWFpNnFnMGNyNWVubjMgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2025-12-29T02:25:39.000Z',
        updated: '2025-12-29T02:25:40.127Z',
        summary: 'Atlassian 月例セキュリティ更新プログラム',
        description: '<p><a href="https://confluence.atlassian.com/security/security-advisories-bulletins-1236937381.html" target="_blank">https://confluence.atlassian.com/security/security-advisories-bulletins-1236937381.html</a></p>',
        creator: {
          email: '8nyantaku8@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-21',
        },
        end: {
          date: '2026-10-22',
        },
        transparency: 'transparent',
        iCalUID: '7pv8ickdn8fg1ai6qg0cr5enn3@google.com',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3533951476305854"',
        id: '00k2edr03d6vgfjhv41t8l8p0p',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=MDBrMmVkcjAzZDZ2Z2ZqaHY0MXQ4bDhwMHAgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2025-12-29T02:35:37.000Z',
        updated: '2025-12-29T02:35:38.152Z',
        summary: 'SAP Security Patch Day',
        description: 'https://support.sap.com/en/my-support/knowledge-base/security-notes-news.html',
        creator: {
          email: '8nyantaku8@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-14',
        },
        end: {
          date: '2026-10-15',
        },
        transparency: 'transparent',
        iCalUID: '00k2edr03d6vgfjhv41t8l8p0p@google.com',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3533952257154558"',
        id: '7a87ppq6je23nt71fc6j5bhfbo',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=N2E4N3BwcTZqZTIzbnQ3MWZjNmo1YmhmYm8gNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2025-12-29T02:42:08.000Z',
        updated: '2025-12-29T02:42:08.577Z',
        summary: 'Ivanti 月例セキュリティ更新プログラム',
        description: 'https://www.ivanti.com/blog/topics/security-advisory',
        creator: {
          email: '8nyantaku8@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-14',
        },
        end: {
          date: '2026-10-15',
        },
        transparency: 'transparent',
        iCalUID: '7a87ppq6je23nt71fc6j5bhfbo@google.com',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3534452725378974"',
        id: '9gauvd45v7h40jn6t5li9ni3cc',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=OWdhdXZkNDV2N2g0MGpuNnQ1bGk5bmkzY2MgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-01-01T00:12:41.000Z',
        updated: '2026-01-01T00:12:42.689Z',
        summary: 'Adobeセキュリティ脆弱性情報(公式で曜日指定なし)',
        description: 'https://helpx.adobe.com/security.html',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-14',
        },
        end: {
          date: '2026-10-15',
        },
        iCalUID: '9gauvd45v7h40jn6t5li9ni3cc@google.com',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3534452739452542"',
        id: '12s61ujd5u7aer41h0pcm4uch8',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=MTJzNjF1amQ1dTdhZXI0MWgwcGNtNHVjaDggNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-01-01T00:12:49.000Z',
        updated: '2026-01-01T00:12:49.726Z',
        summary: 'Oracle Critical Patch Updates',
        description: 'https://www.oracle.com/jp/security-alerts/',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-21',
        },
        end: {
          date: '2026-10-22',
        },
        iCalUID: '12s61ujd5u7aer41h0pcm4uch8@google.com',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3534452799498526"',
        id: '19ip3cifq6h9kqro02sn9h4gog',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=MTlpcDNjaWZxNmg5a3FybzAyc245aDRnb2cgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-01-01T00:13:19.000Z',
        updated: '2026-01-01T00:13:19.749Z',
        summary: 'Paloalto 月例セキュリティ更新プログラム',
        description: 'https://security.paloaltonetworks.com/',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-15',
        },
        end: {
          date: '2026-10-16',
        },
        iCalUID: '19ip3cifq6h9kqro02sn9h4gog@google.com',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3542399638762942"',
        id: '_8ksk8ci5610jcb9k8go3gb9k8ook4b9o6grkab9l64pkccq36p242d9m8o',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=Xzhrc2s4Y2k1NjEwamNiOWs4Z28zZ2I5azhvb2s0YjlvNmdya2FiOWw2NHBrY2NxMzZwMjQyZDltOG8gNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-02-15T23:56:59.000Z',
        updated: '2026-02-15T23:56:59.381Z',
        summary: 'Japan IT Week, Japan DX Week, 営業・デジタルマーケティング Week, EC・店舗 Week【秋】',
        description: 'https://www.japan-it.jp/autumn/ja-jp.html',
        location: '幕張メッセ 1～8ホール',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-21',
        },
        end: {
          date: '2026-10-24',
        },
        transparency: 'transparent',
        iCalUID: 'E9D2E0A6-4D08-4F1B-847E-513F3C6DA56F',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3544978297499870"',
        id: '_892k6gpg88p30b9g7523cb9k6orjcb9p60p32ba160p3chhm84r4ch9m6k',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=Xzg5Mms2Z3BnODhwMzBiOWc3NTIzY2I5azZvcmpjYjlwNjBwMzJiYTE2MHAzY2hobTg0cjRjaDltNmsgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-02-20T10:10:09.000Z',
        updated: '2026-03-02T22:05:48.749Z',
        summary: '情報セキュリティワークショップin越後湯沢2026',
        description: 'http://www.anisec.jp/yuzawa/',
        location: 'オンライン',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-09',
        },
        end: {
          date: '2026-10-11',
        },
        transparency: 'transparent',
        iCalUID: 'BECC0B20-09D6-4676-9021-A026F6A6FE65',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3546814033180990"',
        id: '_6p236chg6d1j2b9h60qj0b9k61344ba16d0jeb9o60qk6da374qj8dhm84',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=XzZwMjM2Y2hnNmQxajJiOWg2MHFqMGI5azYxMzQ0YmExNmQwamViOW82MHFrNmRhMzc0cWo4ZGhtODQgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-03-13T13:03:36.000Z',
        updated: '2026-03-13T13:03:36.590Z',
        summary: 'Hardening 競技会 ＋ Softening Day ＠函館',
        description: 'https://wasforum.jp/2026/03/hardening-project-2026-masterplan/',
        location: '函館サーモン・まるなまアリーナ',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-05',
        },
        end: {
          date: '2026-10-09',
        },
        transparency: 'transparent',
        iCalUID: '6D3203C1-1050-40FB-A3A7-805C5C95466A',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3550176846215486"',
        id: 'q96hsaolthl1333at6ta49gqlc',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=cTk2aHNhb2x0aGwxMzMzYXQ2dGE0OWdxbGNfMjAyNjA0MDYgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-01-01T00:12:55.000Z',
        updated: '2026-04-02T00:07:03.107Z',
        summary: 'Android Security Bulletins',
        description: 'https://source.android.com/docs/security/bulletin/asb-overview',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-04-06',
        },
        end: {
          date: '2026-04-07',
        },
        recurrence: ['RRULE:FREQ=MONTHLY;BYDAY=1MO'],
        iCalUID: 'q96hsaolthl1333at6ta49gqlc@google.com',
        sequence: 2,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3557036581792446"',
        id: '_6t34cca18534ab9o8or3ab9k6l0j4b9o6914cb9g6spjec1o6t0j6dq360',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=XzZ0MzRjY2ExODUzNGFiOW84b3IzYWI5azZsMGo0YjlvNjkxNGNiOWc2c3BqZWMxbzZ0MGo2ZHEzNjAgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-05-11T16:51:30.000Z',
        updated: '2026-05-11T16:51:30.896Z',
        summary: '第2回 OSINT.JP カンファレンス(OSINT.JP Conference 2026)',
        description: 'https://osint.jp/2026',
        location: 'KFC Hall Annex（東京都墨田区横網一丁目6番1号）',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          dateTime: '2026-10-17T09:30:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: '2026-10-17T19:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        iCalUID: '7FF1AAFE-8F65-45A2-82BF-0737087A37C0',
        sequence: 0,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3559177529498238"',
        id: '0vmc6rej1a6oibf1m12e1d5lrg',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=MHZtYzZyZWoxYTZvaWJmMW0xMmUxZDVscmdfMjAyNjA2MTAgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-05-24T02:12:44.000Z',
        updated: '2026-05-24T02:12:44.749Z',
        summary: 'Siemens　定例パッチ',
        description: '<a href="https://www.siemens.com/en-us/content/cert-services/#SecurityPublications">https://www.siemens.com/en-us/content/cert-services/#SecurityPublications</a>',
        creator: {
          email: '8nyantaku8@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-06-10',
        },
        end: {
          date: '2026-06-11',
        },
        recurrence: ['RRULE:FREQ=MONTHLY;BYDAY=2WE'],
        transparency: 'transparent',
        iCalUID: '0vmc6rej1a6oibf1m12e1d5lrg@google.com',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3560917217521086"',
        id: '18485tibddmemvgpdt58tjl09k',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=MTg0ODV0aWJkZG1lbXZncGR0NTh0amwwOWsgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-06-03T03:50:08.000Z',
        updated: '2026-06-03T03:50:08.760Z',
        summary: 'OffensiveCon Tokyo',
        description: '<a href="https://www.offensivecon.jp/">https://www.offensivecon.jp/</a>',
        location: 'JWマリオット・ホテル東京',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-27',
        },
        end: {
          date: '2026-10-29',
        },
        transparency: 'transparent',
        iCalUID: '18485tibddmemvgpdt58tjl09k@google.com',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3565901253693982"',
        id: '6aj4ugr2qm5f73eliseg16okf4',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=NmFqNHVncjJxbTVmNzNlbGlzZWcxNm9rZjQgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-07-02T00:03:46.000Z',
        updated: '2026-07-02T00:03:46.846Z',
        summary: 'Adobeセキュリティ脆弱性情報',
        description: 'https://helpx.adobe.com/security.html',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-28',
        },
        end: {
          date: '2026-10-29',
        },
        iCalUID: '6aj4ugr2qm5f73eliseg16okf4@google.com',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3568397240728702"',
        id: '2lp0ilf66ilvoh3mn7pqpamvv0',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=MmxwMGlsZjY2aWx2b2gzbW43cHFwYW12djAgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-07-16T10:43:39.000Z',
        updated: '2026-07-16T10:43:40.364Z',
        summary: 'F5+Nginx 月例セキュリティ更新プログラム',
        description: 'https://my.f5.com/manage/s/article/K12201527',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-22',
        },
        end: {
          date: '2026-10-23',
        },
        iCalUID: '2lp0ilf66ilvoh3mn7pqpamvv0@google.com',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3568403839641598"',
        id: 'f2f0hognaupjutfuf46arrkb04',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=ZjJmMGhvZ25hdXBqdXRmdWY0NmFycmtiMDQgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-07-16T11:38:39.000Z',
        updated: '2026-07-16T11:38:39.820Z',
        summary: 'Juniper Critical Patch Updates',
        description: 'https://supportportal.juniper.net/s/global-search/%40uri#sortCriteria=date%20descending&f-sf_primarysourcename=Knowledge&f-sf_articletype=Security%20Advisories',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-15',
        },
        end: {
          date: '2026-10-16',
        },
        iCalUID: 'f2f0hognaupjutfuf46arrkb04@google.com',
        sequence: 0,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3570247915920894"',
        id: '3la6f5a7psrsi36tu4jc1dfhmp',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=M2xhNmY1YTdwc3JzaTM2dHU0amMxZGZobXAgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-07-27T03:45:57.000Z',
        updated: '2026-07-27T03:45:57.960Z',
        summary: '第6回 セキュリティ若手の会（ワークショップ&交流会）',
        description: 'https://sec-wakate.connpass.com/event/401186/',
        location: '東京都 文京区 本駒込 2-28-8 (文京グリーンコートセンター)',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          dateTime: '2026-10-03T13:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: '2026-10-03T19:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        iCalUID: '3la6f5a7psrsi36tu4jc1dfhmp@google.com',
        sequence: 0,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3571520056992958"',
        id: '4t6khlf0fm54ioqoq7sdtl6u4u',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=NHQ2a2hsZjBmbTU0aW9xb3E3c2R0bDZ1NHUgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-08-03T12:27:08.000Z',
        updated: '2026-08-03T12:27:08.496Z',
        summary: '全国型CTFコンテスト',
        description: '<a href="https://www.soumu.go.jp/menu_news/s-news/01cyber01_02000001_00302.html">https://www.soumu.go.jp/menu_news/s-news/01cyber01_02000001_00302.html</a>',
        location:
          '（1）本会場 　　○東京会場：AP浜松町　Room D+E+F  （2）地方会場 　　○仙台会場：TKPガーデンシティPREMIUM仙台西口　ホール7A 　　○長野会場：ホテル信濃路　浅間 　　○金沢会場：TKPガーデンシティPREMIUM金沢駅西口　ホール3B 　　○名古屋会場：TKPガーデンシティPREMIUM名古屋太閤　ホール6A 　　○大阪会場：AP大阪梅田東　Room M 　　○宇部会場：国際ホテル宇部　パール 　　○松山会場：松山大学　文京キャンパス2号館　214教室 　　○博多会場：TKPガーデンシティPREMIUM博多駅前　ホール3A  （3）オンライン会場',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          dateTime: '2026-10-04T12:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: '2026-10-04T17:30:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        iCalUID: '4t6khlf0fm54ioqoq7sdtl6u4u@google.com',
        sequence: 0,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3572465144822046"',
        id: '68h5vtqoe98v208kio56ka4kie',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=NjhoNXZ0cW9lOTh2MjA4a2lvNTZrYTRraWUgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-08-08T23:42:52.000Z',
        updated: '2026-08-08T23:42:52.411Z',
        summary: '令和8年熊本地震チャリティ駆動LT大会',
        description: 'https://gbdaitokai.connpass.com/event/402904/',
        location: '岡山市北区奉還町2丁目5-23',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          dateTime: '2026-10-24T18:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: '2026-10-24T21:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        iCalUID: '68h5vtqoe98v208kio56ka4kie@google.com',
        sequence: 0,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3574161475909470"',
        id: '1hscla9l3rah22j6lk6bovumiq',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=MWhzY2xhOWwzcmFoMjJqNmxrNmJvdnVtaXEgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-08-18T19:18:57.000Z',
        updated: '2026-08-18T19:18:57.954Z',
        summary: 'OWASP Saitama MTG #34',
        description: 'https://owaspsaitama.connpass.com/event/404239/',
        location: '埼玉県春日部市南1丁目1-7',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          dateTime: '2026-10-19T19:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: '2026-10-19T20:30:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        iCalUID: '1hscla9l3rah22j6lk6bovumiq@google.com',
        sequence: 0,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3574579131501150"',
        id: '_85130chp88rk8b9p74q38b9k6t1j6ba26t1j2ba460sj4cpm8cqjgg9m88',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=Xzg1MTMwY2hwODhyazhiOXA3NHEzOGI5azZ0MWo2YmEyNnQxajJiYTQ2MHNqNGNwbThjcWpnZzltODggNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-08-21T05:19:03.000Z',
        updated: '2026-08-21T05:19:25.750Z',
        summary: 'Security Days Fall 2026 Osaka',
        description: 'https://f2ff.jp/event/secd/2026-fall/',
        location: 'コングレコンベンションセンター(グランフロント大阪B2F)',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          dateTime: '2026-10-14T09:30:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: '2026-10-14T19:05:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        iCalUID: 'AB029B7D-9944-47C3-B7C1-D09236C58A6B',
        sequence: 0,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3574579183008894"',
        id: '_6h232ghi60r38ba470s30b9k712k8ba18kq4aba374o30e2568p4agpi70',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=XzZoMjMyZ2hpNjByMzhiYTQ3MHMzMGI5azcxMms4YmExOGtxNGFiYTM3NG8zMGUyNTY4cDRhZ3BpNzAgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-08-21T05:19:34.000Z',
        updated: '2026-08-21T05:19:51.504Z',
        summary: 'Security Days Fall 2026 Sapporo',
        description: 'https://f2ff.jp/event/secd/2026-fall/',
        location: 'ACU札幌(アスティ45ビル16F)',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          dateTime: '2026-10-07T09:30:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: '2026-10-07T19:05:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        iCalUID: '4D1B2064-D880-48ED-AE4E-C9008E22EC28',
        sequence: 0,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3574579234142142"',
        id: '_6h23egq46ssj4ba285346b9k8h2jab9o84s3cb9i6t34cc1p8cpj4ea36k',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=XzZoMjNlZ3E0NnNzajRiYTI4NTM0NmI5azhoMmphYjlvODRzM2NiOWk2dDM0Y2MxcDhjcGo0ZWEzNmsgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-08-21T05:19:59.000Z',
        updated: '2026-08-21T05:20:17.071Z',
        summary: 'Security Days Fall 2026 Fukuoka',
        description: 'https://f2ff.jp/event/secd/2026-fall/',
        location: 'ONE FUKUOKA CONFERENCE HALL(6F)',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          dateTime: '2026-10-16T09:30:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: '2026-10-16T19:05:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        iCalUID: '4D7CD792-BAFC-4DE5-8A86-27FF09C329C5',
        sequence: 0,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3574579305681022"',
        id: '_8gr4agq16l1jcba38co32b9k84s48b9p6t2j8b9j8gq3eghm6sqkcgi18o',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=XzhncjRhZ3ExNmwxamNiYTM4Y28zMmI5azg0czQ4YjlwNnQyajhiOWo4Z3EzZWdobTZzcWtjZ2kxOG8gNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-08-21T05:20:22.000Z',
        updated: '2026-08-21T05:20:52.840Z',
        summary: 'Security Days Fall 2026 Tokyo',
        description: 'https://f2ff.jp/event/secd/2026-fall/',
        location: 'TAKANAWA GATEWAY Convention Center(B2F&B1F)',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-21',
        },
        end: {
          date: '2026-10-24',
        },
        transparency: 'transparent',
        iCalUID: 'D6ECA5C6-CC01-4A8D-97E4-3D47B675FBAF',
        sequence: 1,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3574579355479166"',
        id: '_6csj8ci56so30ba264rjib9k68o3iba1891jgb9i64sj2da56kpjcca170',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=XzZjc2o4Y2k1NnNvMzBiYTI2NHJqaWI5azY4bzNpYmExODkxamdiOWk2NHNqMmRhNTZrcGpjY2ExNzAgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-08-21T05:21:01.000Z',
        updated: '2026-08-21T05:21:17.739Z',
        summary: 'Security Days Fall 2026 Nagoya',
        description: 'https://f2ff.jp/event/secd/2026-fall/',
        location: 'JPタワー名古屋 ホール&カンファレンス(KITTE 3F)',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          date: '2026-10-28',
        },
        end: {
          date: '2026-10-30',
        },
        transparency: 'transparent',
        iCalUID: '3942E700-B179-4209-ABC8-21915E5361A8',
        sequence: 2,
        reminders: {
          useDefault: false,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3575339698276382"',
        id: '26tn9mdpm9p53rg377fof1k3bq',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=MjZ0bjltZHBtOXA1M3JnMzc3Zm9mMWszYnEgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-08-25T14:57:28.000Z',
        updated: '2026-08-25T14:57:29.138Z',
        summary: '総関西サイバーセキュリティＬＴ大会（第58回）',
        description: 'https://sec-kansai.connpass.com/event/404839/',
        location: '大阪市北区梅田3-1-3 ノースゲートビルディング19階',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          dateTime: '2026-10-14T19:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: '2026-10-14T21:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        iCalUID: '26tn9mdpm9p53rg377fof1k3bq@google.com',
        sequence: 0,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3575477257905918"',
        id: '_75138da16cq4ab9g8or3eb9k8p2j8b9p6so32b9n64r3ghhh88s3ce1m74',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=Xzc1MTM4ZGExNmNxNGFiOWc4b3IzZWI5azhwMmo4YjlwNnNvMzJiOW42NHIzZ2hoaDg4czNjZTFtNzQgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-08-26T10:03:37.000Z',
        updated: '2026-08-26T10:03:48.952Z',
        summary: 'AI×Security Conference 2026',
        description: 'https://ai-x-security-con.findy-tools.io/2026',
        location: 'KABUTO ONE HALL & CONFERENCE',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          dateTime: '2026-10-28T09:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: '2026-10-28T18:40:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        iCalUID: '9B45A34E-0F67-4FE4-9701-7168F1B86869',
        sequence: 1,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3578938785967742"',
        id: '46lfre0chj6rp0h4aavt9ojuq6',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=NDZsZnJlMGNoajZycDBoNGFhdnQ5b2p1cTYgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-09-15T10:49:52.000Z',
        updated: '2026-09-15T10:49:52.983Z',
        summary: 'ローレン・コンフェルダー氏のなぜなぜ脅威モデリングワークショップ',
        description: 'https://threatmodeling.connpass.com/event/406540/',
        location: '〒160-0023 東京都新宿区西新宿8-19-1 (小林ビル513)',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          dateTime: '2026-10-02T19:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: '2026-10-02T21:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        iCalUID: '46lfre0chj6rp0h4aavt9ojuq6@google.com',
        sequence: 0,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3579239426858718"',
        id: '1igom7qt29ikqlfslmmjkc8nnm',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=MWlnb203cXQyOWlrcWxmc2xtbWprYzhubm0gNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-09-17T04:35:13.000Z',
        updated: '2026-09-17T04:35:13.429Z',
        summary: 'せきゅぽろ SNR vol.5 no.10',
        description: 'https://secpolo.connpass.com/event/407183/',
        location: 'オンライン',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          dateTime: '2026-10-21T19:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: '2026-10-21T21:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        iCalUID: '1igom7qt29ikqlfslmmjkc8nnm@google.com',
        sequence: 0,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3580228631682270"',
        id: '0t0bqpfuk79u9nhk4a7bdhnb0u',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=MHQwYnFwZnVrNzl1OW5oazRhN2JkaG5iMHUgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-09-22T21:58:35.000Z',
        updated: '2026-09-22T21:58:35.841Z',
        summary: 'mini Security-JAWS[第53回]もくもく会 2026年10月03日(土)',
        description: 'https://s-jaws.connpass.com/event/407437/',
        location: 'オンライン',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          dateTime: '2026-10-03T10:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: '2026-10-03T12:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        iCalUID: '0t0bqpfuk79u9nhk4a7bdhnb0u@google.com',
        sequence: 0,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3580701895790238"',
        id: '6he4gqtlm09tmrbrjbuj44rvq0',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=NmhlNGdxdGxtMDl0bXJicmpidWo0NHJ2cTAgNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-09-25T15:42:27.000Z',
        updated: '2026-09-25T15:42:27.895Z',
        summary: '【ハンズオン】大阪電通大 x OWASP Kansai 〜ゲームとアプリのセキュリティ〜',
        description:
          'イベント詳細：<a href="https://www.google.com/url?q=https://owasp-kansai.doorkeeper.jp/events/199183&amp;sa=D&amp;source=calendar&amp;usd=2&amp;usg=AOvVaw3kZCj2BXF_wc93uVCL93-Y" target="_blank">https://owasp-kansai.doorkeeper.jp/events/199183</a>\n\n###**2026年10月、大阪電気通信大学 寝屋川キャンパスにOWASP Kansai が遠征！**\n今回のイベントは、[大阪電気通信大学](<a href="https://www.google.com/url?q=https://www.osakac.ac.jp/faculty/&amp;sa=D&amp;source=calendar&amp;usd=2&amp;usg=AOvVaw3RVplzkPF8vkUtPR-xtFtO" target="_blank">https://www.osakac.ac.jp/faculty/</a>) とOWASP Kansaiスクールキャラバンのコラボイベントです。\n\n今回もOWASP Kansaiらしく、やわらかいネタからムズカシイ話まで\nセミナー・ハンズオン（ハードニング）・LT、欲張りイベントとなっていますのでお楽しみに！\n\nOWASPはみんなの技術・知恵・悩みを共有できる場です\nスキル、役職、業種、国籍、性別、年齢関係なく、遠慮なくお越しください\nカジュアルなスタイルで楽しく、セキュリティについて情報交換しましょう\n\n## **タイムテーブル**\n| 時間 | コンテンツ | スライド撮影 | 内容Tweet | 資料公開 |\n|------|-----------|------------|-----------|----------|\n| 12:30- | 開場・受付開始 | ー | ー | ー |\n| 13:00- | 開会・会場説明 | ー | ー | ー |\n| 13:20- | 自己紹介 | ー | ー | ー |\n| 13:30- | 【ハンズオン①】 .NETのゲームアプリのハッキングを体験してみよう\n\nOWASP Kansai 森田 | OK | OK | 調整中 |\n| 15:00- | 休憩 | ー | ー | ー |\n| 15:10- | 【ハンズオン②】 Webアプリの脆弱性を見つけてみよう\n\nOWASP Kansai 松田 | OK | OK | 準備中 |\n| 15:50- | 休憩 | ー | ー | ー |\n| 16:10- | LT1 「ゲームと利用規約～利用者が読んでおきたいゲームの利用規約のポイント～」 [子供とネットを考える会](<a href="https://www.google.com/url?q=https://www.safewebkids.net/&amp;sa=D&amp;source=calendar&amp;usd=2&amp;usg=AOvVaw0UWqmS0S1ZbYWRl-eDrv4G" target="_blank">https://www.safewebkids.net/</a>)  代表 [山口 あゆみ](<a href="https://www.google.com/url?q=https://www.k-of.jp/2013/session/454.html&amp;sa=D&amp;source=calendar&amp;usd=2&amp;usg=AOvVaw24QRl2HEuY5h9iERl5Dngk" target="_blank">https://www.k-of.jp/2013/session/454.html</a>) | 調整中 | 調整中 | 調整中 |\n| 16:20- | LT2 「パスワード再設定メールのURLについて知っておこう～パスワードリセットポイズニング～(仮)」 京都産業大学 [uyuki234](<a href="https://www.google.com/url?q=https://x.com/uyuki234&amp;sa=D&amp;source=calendar&amp;usd=2&amp;usg=AOvVaw2OkPOg3goSQHU8LZFaE_lf" target="_blank">https://x.com/uyuki234</a>)  | 調整中 | 調整中 | 調整中 |\n| 16:30- | LT3（調整中） | 調整中 | 調整中 | 調整中 |\n| 16:40- | LT4（調整中） | 調整中 | 調整中 | 調整中 |\n| 16:50- | 閉会・名刺交換会 | ー | ー | ー |\n| 17:00 | 閉場・完全撤収 | ー | ー | ー |\n| 17:30- | 希望者のみ別会場にて事後懇親会（検討中） | ー | ー | ー |\n\n　　・当日のハッシュタグは　[#owaspkansai](<a href="https://www.google.com/url?q=https://x.com/search?q%3D%2523owaspkansai%2520until%253A2026-09-01%2520since%253A2025-11-01%26src%3Dtyped_query%26f%3Dlive&amp;sa=D&amp;source=calendar&amp;usd=2&amp;usg=AOvVaw2Iz0QuNpalzYBUI6o4rPTM" target="_blank">https://x.com/search?q=%23owaspkansai%20until%3A2026-09-01%20since%3A2025-11-01&amp;src=typed_query&amp;f=live</a>)\n　　※開場・開会時間は決定していますが、各コンテンツの時間配分は微修正する可能性があります\n\n## **ハンズオン①について**\n時間枠：90分\n　　13:30- : 事前説明\n　　13:50- : ハンズオン～解説 x Nセット\n　　15:00 : 終了\n\n概要：\n　　.NETで作成した簡単なゲームアプリをリバースエンジニアリングし、ゲーム開発におけるセキュリティリスクを体験しその対策を学びます。\n\n事前準備要否：要\n　　デコンパイラdnspyのダウンロード(<a href="https://www.google.com/url?q=https://github.com/dnspy/dnspy&amp;sa=D&amp;source=calendar&amp;usd=2&amp;usg=AOvVaw1gs6yLjLOzYN3G3e7eHS6k" target="_blank">https://github.com/dnspy/dnspy</a>)\n　　　└[dnspy binary](<a href="https://www.google.com/url?q=https://github.com/dnSpy/dnSpy/releases&amp;sa=D&amp;source=calendar&amp;usd=2&amp;usg=AOvVaw1eF9mVkLbDX7D3AECgxPYp" target="_blank">https://github.com/dnSpy/dnSpy/releases</a>)\n　　[参考:<a href="https://www.google.com/url?q=http://xn--x8jva4bq8409a6wedudlsav98azv6h9m4a.net&amp;sa=D&amp;source=calendar&amp;usd=2&amp;usg=AOvVaw1a2cPiVnnN3VNpR4j03dRO" target="_blank">凄すぎて大草原不可避な.NET</a> デコンパイラdnSpyを使ってみる](<a href="https://www.google.com/url?q=https://qiita.com/Tokeiya/items/54fbf30cb21c77c05c41&amp;sa=D&amp;source=calendar&amp;usd=2&amp;usg=AOvVaw1W1Hb-f1S6mXPmVor2Run7" target="_blank">https://qiita.com/Tokeiya/items/54fbf30cb21c77c05c41</a>)\n\n必要な技術や経験：\n　　- 簡単なプログラムを読んだ経験がある\n　　- 英語の関数名からおおよその処理の内容を類推できる程度の知識。\n　　- ゲームの開発経験は問いません\n\n## **ハンズオン②について**\n時間枠：40分\n　　15:10- : 事前説明\n　　15:15- : ハンズオン開始\n　　15:45- : 解説\n　　15:50 : 終了\n\n概要：\n　　Nodejsで作成された脆弱なWebアプリケーションをHardeningする体験をします。ソースコードを提供するので、脆弱性を見つけて修正する方法を学びます。\n\n事前準備要否：要\n　　- GitHubアカウントをご準備ください（無料でOK）。\n　　- ご自身のGitHub CodespaceもしくはローカルPC（要Docker）を利用します。\n\n必要な技術や経験：\n　　- Nodejsのプログラムを読んだ経験\n　　- Webアプリケーションの開発経験\n　　- 経験不足が不足していても、見学も大歓迎です。\n\n## **講演・LTについて**\n講演（20分）・LT（5-8分）の枠で登壇したい・話したい！という方は[ご連絡](<a href="https://www.google.com/url?q=https://owasp-kansai.doorkeeper.jp/contact/new)%25E3%2581%258F%25E3%2581%25A0%25E3%2581%2595%25E3%2581%2584&amp;sa=D&amp;source=calendar&amp;usd=2&amp;usg=AOvVaw36Qaj8rH03LBRqx__3OscG" target="_blank">https://owasp-kansai.doorkeeper.jp/contact/new)ください</a>\n(特定製品やサービスの宣伝、PR等はご遠慮願います。資料は後日公開を原則とします。その他、[Speaker Agreement](<a href="https://www.google.com/url?q=https://owasp.org/www-policy/legal/speaker-agreement)%25E3%2582%2592%25E3%2581%2594%25E7%25A2%25BA%25E8%25AA%258D%25E3%2581%258F%25E3%2581%25A0%25E3%2581%2595%25E3%2581%2584&amp;sa=D&amp;source=calendar&amp;usd=2&amp;usg=AOvVaw3oD9oyP7453p9qQBMHa34E" target="_blank">https://owasp.org/www-policy/legal/speaker-agreement)をご確認ください</a>)\n\n## **会費**\n**無料**\n※有料のイベント後懇親会開催を検討中\n※直前のキャンセルやNo-Showはできる限り無いようお願いします\n　やむなくキャンセルの場合は、なるべくはやくキャンセル登録をお願いします\n\n## **懇親会について**\n　キャンパス付近での飲食店を検討中\n\n## **持参物と会場インフラについて**\n　PC：ハンズオンがありますので是非お持ちください。\n　名刺：任意\n　電源：あり\n　机：あり\n　Wi-Fi／有線LAN：あり\n　会場内での飲食：ペットボトルなど蓋のできるドリンク持ち込み可能。ゴミはご自身で持ち帰ってください\n\n## **会場**\n寝屋川キャンパスへのアクセス\n<a href="https://www.google.com/url?q=https://www.osakac.ac.jp/institution/campus/access/&amp;sa=D&amp;source=calendar&amp;usd=2&amp;usg=AOvVaw3eJipyS6F6NR62ZU5t6g7W" target="_blank">https://www.osakac.ac.jp/institution/campus/access/</a>\nフロアガイド（OECUイノベーションスクエア　１F　コンベンションホール）\n<a href="https://www.google.com/url?q=https://www.osakac.ac.jp/special/neyagawa/floor-map01.php&amp;sa=D&amp;source=calendar&amp;usd=2&amp;usg=AOvVaw2jVcw1zD6rxfv9F0E5t59q" target="_blank">https://www.osakac.ac.jp/special/neyagawa/floor-map01.php</a>\n寝屋川駅からイベント会場へのおおよその経路\n<a href="https://www.google.com/url?q=https://maps.app.goo.gl/kF7cPVV73efKG8jh6&amp;sa=D&amp;source=calendar&amp;usd=2&amp;usg=AOvVaw3iWH96XaGkAZ66xht2cy6b" target="_blank">https://maps.app.goo.gl/kF7cPVV73efKG8jh6</a>',
        location: '〒572-8530 大阪府寝屋川市初町18-8',
        creator: {
          email: 'hanazukin@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          dateTime: '2026-10-11T13:00:00+09:00',
          timeZone: 'UTC',
        },
        end: {
          dateTime: '2026-10-11T17:00:00+09:00',
          timeZone: 'UTC',
        },
        iCalUID: '6he4gqtlm09tmrbrjbuj44rvq0@google.com',
        sequence: 0,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3580867726512958"',
        id: '_8933aca1851jib9l8h0k4b9k88r3gba16go44b9l8p13ecq6892k2hi588',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=Xzg5MzNhY2ExODUxamliOWw4aDBrNGI5azg4cjNnYmExNmdvNDRiOWw4cDEzZWNxNjg5MmsyaGk1ODggNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-09-26T14:44:23.000Z',
        updated: '2026-09-26T14:44:23.256Z',
        summary: 'ITmedia CxO Insights 2026 秋\nAI経営時代を勝ち抜く、リーダーの選択',
        description: 'https://members06.live.itmedia.co.jp/library/MTA4MDYz',
        location: 'ライブ配信セミナー\n',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          dateTime: '2026-10-15T13:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: '2026-10-15T17:30:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        iCalUID: 'BF51AAC9-5DAB-4B68-A40B-5FB73FBEAFEB',
        sequence: 0,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
      {
        kind: 'calendar#event',
        etag: '"3581014693379678"',
        id: '2541gt0o35jc3kl86dt5jrbuqn',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=MjU0MWd0MG8zNWpjM2tsODZkdDVqcmJ1cW4gNHU5ZnZpajZ1bDRvdWcxMWJjcGhyOG9mYjBAZw',
        created: '2026-09-27T11:09:06.000Z',
        updated: '2026-09-27T11:09:06.689Z',
        summary: 'M365セキュリティ&ゼロトラスト勉強会 42',
        description: 'https://m365security.connpass.com/event/408021/',
        location: 'オンライン',
        creator: {
          email: 'ripjyr@gmail.com',
        },
        organizer: {
          email: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
          displayName: 'Security Event in Japan',
          self: true,
        },
        start: {
          dateTime: '2026-10-17T19:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: '2026-10-17T20:00:00+09:00',
          timeZone: 'Asia/Tokyo',
        },
        iCalUID: '2541gt0o35jc3kl86dt5jrbuqn@google.com',
        sequence: 0,
        reminders: {
          useDefault: true,
        },
        eventType: 'default',
      },
    ];

    const set = new Set();
    const gCalendarIdSet = new Set(calendarStore.list.map((cal) => cal.id));

    await Promise.all(
      Array.from(gCalendarIdSet).map(async (gCalId) => {
        const key = `${gCalId}:${year}:${monthIndex}`;
        if (_gEventsList.value.has(key)) {
          (_gEventsList.value.get(key) ?? []).forEach((event) => set.add(event));
          return;
        }

        const timeMin = new Date(year, monthIndex, 1).toISOString();
        const timeMax = new Date(year, monthIndex + 1, 0).toISOString();
        const items = [];
        let events;
        do {
          if (events?.nextPageToken && query) query.pageToken = events.nextPageToken;
          events = await gCalAPI.listEvents(authStore.token, gCalId, {
            ...query,
            timeMin,
            timeMax,
          });
          if (events?.items) items.push(...events.items);
        } while (events?.nextPageToken);

        _gEventsList.value.set(key, items);
        items.forEach((event) => set.add(event));
      }),
    );

    console.log(`listEvents:`, set);
    return Array.from(set);
  }

  /**
   * 指定の年と月における全てのカレンダーリストの全てのイベントを取得
   * @param {number} year 取得する年
   * @param {number} monthIndex 取得する月インデックス（0-11）
   * @param {number} date 取得する日付（1-31）
   * @param {EventsListQueryParams} [query={}] クエリパラメータ
   * @return {Promise<GoogleEvent[]>}
   */
  async function listEventsByDate(year, monthIndex, date, query = {}) {
    const events = await listEvents(year, monthIndex, query);
    const targetDate = new Date(year, monthIndex, date);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    return events.filter((event) => {
      const eventStart = new Date(event.start?.dateTime || event.start?.date || '');
      const eventEnd = new Date(event.end?.dateTime || event.end?.date || '');
      return eventStart < endOfDay && eventEnd > startOfDay;
    });
  }

  function writableCalendar() {
    return calendarStore.list.find((calendar) => ['owner', 'writer'].includes(calendar.accessRole)) || calendarStore.list.find((calendar) => calendar.primary);
  }

  async function findEvent(eventId) {
    for (const calendar of calendarStore.list) {
      const events = await listEvents(new Date().getFullYear(), new Date().getMonth(), {
        calendarId: calendar.id,
      });
      const event = events.find((item) => item.id === eventId);
      if (event) return { event, calendar };
    }
    return null;
  }

  function clearEventCache() {
    _gEventsList.value.clear();
  }

  async function createEvent(body, calendarId = writableCalendar()?.id) {
    if (!calendarId) throw new Error('書き込み可能なカレンダーがありません');
    const result = await gCalAPI.insertEvent(authStore.token, calendarId, body);
    clearEventCache();
    return result;
  }

  async function updateEvent(eventId, body, calendarId) {
    if (!calendarId) throw new Error('更新対象のカレンダーがありません');
    const result = await gCalAPI.updateEvent(authStore.token, calendarId, eventId, body);
    clearEventCache();
    return result;
  }

  async function removeEvent(eventId, calendarId) {
    if (!calendarId) throw new Error('削除対象のカレンダーがありません');
    const result = await gCalAPI.deleteEvent(authStore.token, calendarId, eventId);
    clearEventCache();
    return result;
  }

  return {
    listEvents,
    listEventsByDate,
    writableCalendar,
    findEvent,
    createEvent,
    updateEvent,
    removeEvent,
  };
});
