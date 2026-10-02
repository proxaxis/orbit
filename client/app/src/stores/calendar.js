import { defineStore } from 'pinia';
import { onMounted, shallowRef, computed } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import * as gCalAPI from '@/services/google-calendar-api.js';

export const useCalendarStore = defineStore('calendar', () => {
  const authStore = useAuthStore();

  /** @type {ShallowRef<null|Set<GoogleCalendarListEntry>>} */
  const _gCalendarsList = shallowRef(null);

  /** @type {ComputedRef<GoogleCalendarListEntry[]>} */
  const list = computed(() => Array.from(_gCalendarsList.value ?? new Set()));

  async function _listCalendarList() {
    const set = new Set();
    const items = (await gCalAPI.listCalendarList(authStore.token))?.items;
    if (items) items.forEach((item) => set.add(item));
    return set;
  }

  onMounted(async () => {
    // _gCalendarsList.value = await _listCalendarList();
    _gCalendarsList.value = new Set([
      {
        kind: 'calendar#calendarListEntry',
        etag: '"1732417133777000"',
        id: 'chuo-calendar.01p@g.chuo-u.ac.jp',
        summary: '中央大学学年暦（全キャンパス）',
        timeZone: 'Asia/Tokyo',
        summaryOverride: '中央大学学年暦',
        colorId: '20',
        backgroundColor: '#cabdbf',
        foregroundColor: '#000000',
        selected: true,
        accessRole: 'reader',
        defaultReminders: [],
      },
      {
        kind: 'calendar#calendarListEntry',
        etag: '"1732417412327000"',
        id: 'ja.japanese#holiday@group.v.calendar.google.com',
        summary: '日本の祝日',
        description: '日本の祝日と行事',
        timeZone: 'Asia/Tokyo',
        colorId: '21',
        backgroundColor: '#9b9b9b',
        foregroundColor: '#000000',
        selected: true,
        accessRole: 'reader',
        defaultReminders: [],
        conferenceProperties: {
          allowedConferenceSolutionTypes: ['hangoutsMeet'],
        },
      },
      {
        kind: 'calendar#calendarListEntry',
        etag: '"1732597413700000"',
        id: 'badd9bc48b578d2e8be8a95d2afabc3e4024e4876ab49d7cb0bd8e244f591ec9@group.calendar.google.com',
        summary: 'プライベート',
        timeZone: 'Asia/Tokyo',
        dataOwner: 'proxaxis.me@gmail.com',
        colorId: '7',
        backgroundColor: '#42d692',
        foregroundColor: '#000000',
        selected: true,
        accessRole: 'owner',
        defaultReminders: [],
        conferenceProperties: {
          allowedConferenceSolutionTypes: ['hangoutsMeet'],
        },
      },
      {
        kind: 'calendar#calendarListEntry',
        etag: '"1734277277769000"',
        id: '4f0cec11def111dc169f537d1d3408d98689c2775f08298d686b8502da4e0e9a@group.calendar.google.com',
        summary: '中村愛乃との予定',
        timeZone: 'Asia/Tokyo',
        dataOwner: 'proxaxis.me@gmail.com',
        summaryOverride: 'piyopiyo3',
        colorId: '15',
        backgroundColor: '#9fc6e7',
        foregroundColor: '#000000',
        selected: true,
        accessRole: 'owner',
        defaultReminders: [],
        conferenceProperties: {
          allowedConferenceSolutionTypes: ['hangoutsMeet'],
        },
      },
      {
        kind: 'calendar#calendarListEntry',
        etag: '"1737283614101000"',
        id: 'chosoda9311@gmail.com',
        summary: '細田千恵子の予定',
        timeZone: 'Asia/Tokyo',
        summaryOverride: 'チエコの予定',
        colorId: '4',
        backgroundColor: '#fa573c',
        foregroundColor: '#000000',
        selected: true,
        accessRole: 'reader',
        defaultReminders: [],
        conferenceProperties: {
          allowedConferenceSolutionTypes: ['hangoutsMeet'],
        },
      },
      {
        kind: 'calendar#calendarListEntry',
        etag: '"1744205838837295"',
        id: 'dc4aa813d719676363182c67bae698de71ff14431cdc02096866a3ade8a1d2ad@group.calendar.google.com',
        summary: '細田家の予定',
        timeZone: 'Asia/Tokyo',
        dataOwner: 'chosoda9311@gmail.com',
        colorId: '21',
        backgroundColor: '#cca6ac',
        foregroundColor: '#000000',
        selected: true,
        accessRole: 'owner',
        defaultReminders: [],
        conferenceProperties: {
          allowedConferenceSolutionTypes: ['hangoutsMeet'],
        },
      },
      {
        kind: 'calendar#calendarListEntry',
        etag: '"1750595398087839"',
        id: 'proxaxis.me@gmail.com',
        summary: '細田佳希の予定',
        timeZone: 'Asia/Tokyo',
        colorId: '8',
        backgroundColor: '#008f3c',
        foregroundColor: '#ffffff',
        selected: true,
        accessRole: 'owner',
        defaultReminders: [],
        notificationSettings: {
          notifications: [
            {
              type: 'eventCreation',
              method: 'email',
            },
          ],
        },
        primary: true,
        conferenceProperties: {
          allowedConferenceSolutionTypes: ['hangoutsMeet'],
        },
      },
      {
        kind: 'calendar#calendarListEntry',
        etag: '"1764068239657631"',
        id: '4u9fvij6ul4oug11bcphr8ofb0@group.calendar.google.com',
        summary: 'Security Event in Japan',
        description: '日本国内のセキュリティイベントカレンダー。\nイベントを追加したい人は ripjyr@gmail.com/  yosuke.hasegawa@gmail.com までご連絡を。\n※企業セミナーの類は積極的には載せていません。\n',
        location: 'Japan',
        timeZone: 'Asia/Tokyo',
        colorId: '18',
        backgroundColor: '#b99aff',
        foregroundColor: '#000000',
        selected: true,
        accessRole: 'reader',
        defaultReminders: [],
        conferenceProperties: {
          allowedConferenceSolutionTypes: ['hangoutsMeet'],
        },
      },
      {
        kind: 'calendar#calendarListEntry',
        etag: '"1764068250563631"',
        id: '55b2cd19f1f495cd90c98658900467d5461a873850e9f6e410b314b75a780dc3@group.calendar.google.com',
        summary: '学習計画',
        timeZone: 'Asia/Tokyo',
        dataOwner: 'proxaxis.me@gmail.com',
        colorId: '24',
        backgroundColor: '#a47ae2',
        foregroundColor: '#000000',
        selected: true,
        accessRole: 'owner',
        defaultReminders: [],
        conferenceProperties: {
          allowedConferenceSolutionTypes: ['hangoutsMeet'],
        },
      },
    ]);
  });

  return {
    list,
  };
});
