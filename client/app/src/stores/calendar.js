import { defineStore } from 'pinia';
import { onMounted, shallowRef, computed } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import { readOffline, writeOffline } from '@/services/offline-storage.js';

export const useCalendarStore = defineStore('calendar', () => {
  const authStore = useAuthStore();
  const userStore = useUserStore();

  /** @type {ShallowRef<null|Set<GoogleCalendarListEntry>>} */
  const _gCalendarsList = shallowRef(null);

  /** @type {ComputedRef<GoogleCalendarListEntry[]>} */
  const list = computed(() => {
    const calendars = Array.from(_gCalendarsList.value ?? new Set());
    const order = userStore.calendarOrder;
    return calendars.sort((left, right) => {
      const leftIndex = order.indexOf(left.id);
      const rightIndex = order.indexOf(right.id);
      if (leftIndex === -1 && rightIndex === -1) return 0;
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    });
  });

  /** @type {ComputedRef<GoogleCalendarListEntry[]>} 書き込み権限を持つカレンダーのリスト */
  const listWritableCalendars = computed(() => list.value.filter((cal) => cal.accessRole === 'writer' || cal.accessRole === 'owner' || cal.primary));

  /** @param {GoogleCalendarListEntry} calendar */
  function addCalendar(calendar) {
    if (!calendar?.id) return;
    _gCalendarsList.value = new Set([...list.value, calendar]);
    writeOffline('calendars', Array.from(_gCalendarsList.value));
  }

  /** @param {GoogleCalendarListEntry} calendar */
  function updateCalendar(calendar) {
    if (!calendar?.id) return;
    _gCalendarsList.value = new Set(list.value.map((item) => (item.id === calendar.id ? calendar : item)));
    writeOffline('calendars', Array.from(_gCalendarsList.value));
  }

  onMounted(async () => {
    const savedCalendars = readOffline('calendars', []);
    if (Array.isArray(savedCalendars) && savedCalendars.length > 0) {
      _gCalendarsList.value = new Set(savedCalendars);
    }

    if (!authStore.token || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    try {
      const response = await gCalAPI.listCalendarList(authStore.token);
      const calendars = Array.isArray(response?.items) ? response.items : [];
      _gCalendarsList.value = new Set(calendars);
      writeOffline('calendars', calendars);
    } catch (error) {
      console.warn('Calendar list could not be refreshed. Using offline data.', error);
    }
  });

  return {
    list,
    listWritableCalendars,
    addCalendar,
    updateCalendar,
  };
});
