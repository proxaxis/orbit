import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import { toDayjs } from '@/services/dayjs';
import { readOffline, writeOffline } from '@/services/offline-storage.js';

export const useEventStore = defineStore('event', () => {
  const authStore = useAuthStore();
  const calendarStore = useCalendarStore();
  const userStore = useUserStore();

  /** @type {Ref<Map<string, any>>} @description イベントデータ */
  const _cache = ref(new Map());
  const pendingOperations = ref(readOffline('event-operations', []));

  function isOffline() {
    return typeof navigator !== 'undefined' && !navigator.onLine;
  }

  function persistOperations() {
    writeOffline('event-operations', pendingOperations.value);
  }

  function getStoredEvents() {
    return readOffline('events', []);
  }

  function saveStoredEvents(events) {
    writeOffline('events', events);
  }

  function upsertStoredEvent(event) {
    const events = getStoredEvents().filter((item) => !(item.id === event.id && item.sourceCalendarId === event.sourceCalendarId));
    events.push(event);
    saveStoredEvents(events);
  }

  function removeStoredEvent(eventId, calendarId) {
    saveStoredEvents(getStoredEvents().filter((item) => !(item.id === eventId && item.sourceCalendarId === calendarId)));
  }

  function eventsForMonth(calendarId, year, monthIndex) {
    return getStoredEvents().filter((event) => {
      if (event.sourceCalendarId !== calendarId) return false;
      const start = event.start?.dateTime ?? event.start?.date;
      if (!start) return false;
      const date = new Date(start);
      return date.getFullYear() === year && date.getMonth() === monthIndex;
    });
  }

  function queueOperation(operation) {
    pendingOperations.value.push(operation);
    persistOperations();
  }

  async function syncPendingOperations() {
    if (isOffline() || !authStore.token) return;
    const remaining = [];
    for (const operation of pendingOperations.value) {
      try {
        if (operation.type === 'create') {
          const result = await gCalAPI.insertEvent(authStore.token, operation.calendarId, operation.body);
          if (result?.id && operation.localId) {
            const local = getStoredEvents().find((event) => event.id === operation.localId);
            if (local) {
              removeStoredEvent(operation.localId, operation.calendarId);
              upsertStoredEvent({ ...local, ...result, sourceCalendarId: operation.calendarId });
            }
          }
        } else if (operation.type === 'update') {
          await gCalAPI.updateEvent(authStore.token, operation.calendarId, operation.eventId, operation.body);
        } else if (operation.type === 'remove') {
          await gCalAPI.deleteEvent(authStore.token, operation.calendarId, operation.eventId);
        }
      } catch (error) {
        console.warn('Offline event operation is still pending.', error);
        remaining.push(operation);
      }
    }
    pendingOperations.value = remaining;
    persistOperations();
  }

  /**
   * 指定の年と月における全てのカレンダーリストの全てのイベントを取得
   * @param {number} year 取得する年
   * @param {number} monthIndex 取得する月インデックス（0-11）
   * @param {EventsListQueryParams} [query={}] クエリパラメータ
   * @return {Promise<(GoogleEvent & { sourceCalendarId: string })[]>}
   */
  async function listEvents(year, monthIndex, query = {}) {
    const set = new Set();
    const gCalendarIdSet = new Set(calendarStore.list.map((cal) => cal.id));

    await Promise.all(
      Array.from(gCalendarIdSet).map(async (gCalId) => {
        const key = `${gCalId}:${year}:${monthIndex}`;
        if (_cache.value.has(key)) {
          (_cache.value.get(key) ?? []).forEach((/** @type {GoogleEvent & { sourceCalendarId: string }} */ event) => set.add(event));
          return;
        }

        const storedItems = eventsForMonth(gCalId, year, monthIndex);
        if (storedItems.length > 0) {
          _cache.value.set(key, storedItems);
          storedItems.forEach((event) => set.add(event));
        }
        if (isOffline() || !authStore.token) return;

        const timeMin = new Date(year, monthIndex, 1).toISOString();
        const timeMax = new Date(year, monthIndex + 1, 0).toISOString();
        const items = [];
        let events;
        do {
          if (events?.nextPageToken && query) query.pageToken = events.nextPageToken;
          try {
            events = await gCalAPI.listEvents(authStore.token, gCalId, { ...query, timeMin, timeMax });
          } catch (error) {
            console.warn('Event list could not be refreshed. Using offline data.', error);
            return;
          }
          if (events?.items) {
            events.items = events.items.map((event) => ({ ...event, sourceCalendarId: gCalId }));
            items.push(...events.items);
          }
        } while (events?.nextPageToken);

        _cache.value.set(key, items);
        const storedEvents = getStoredEvents().filter((event) => event.sourceCalendarId !== gCalId || !eventsForMonth(gCalId, year, monthIndex).some((stored) => stored.id === event.id));
        saveStoredEvents([...storedEvents, ...items]);
        items.forEach((event) => set.add(event));
      }),
    );

    return Array.from(set);
  }

  /**
   * 指定の年と月における全てのカレンダーリストの全てのイベントを取得
   * @param {number} year 取得する年
   * @param {number} monthIndex 取得する月インデックス（0-11）
   * @param {number} date 取得する日付（1-31）
   * @param {EventsListQueryParams} [query={}] クエリパラメータ
   * @return {Promise<(GoogleEvent & { sourceCalendarId: string })[]>}
   */
  async function listEventsByDate(year, monthIndex, date, query = {}) {
    const events = await listEvents(year, monthIndex, query);
    const start = toDayjs(year, monthIndex, date).second(0).minute(0).hour(0).millisecond(0);
    const end = toDayjs(year, monthIndex, date).second(59).minute(59).hour(23).millisecond(999);
    return events.filter((event) => {
      const eventStart = toDayjs(event.start?.dateTime ?? event.start?.date ?? undefined);
      const eventEnd = toDayjs(event.end?.dateTime ?? event.end?.date ?? undefined);
      return eventStart.unix() < end.unix() && eventEnd.unix() > start.unix();
    });
  }

  /**
   * 指定のイベント ID からイベントを取得
   * @param {string} gEventId イベント ID
   * @param {string} gCalendarId カレンダー ID
   * @return {Promise<(GoogleEvent & { sourceCalendarId: string })|null>}
   */
  async function getEventById(gEventId, gCalendarId) {
    if (_cache.value.has(`${gCalendarId}:${gEventId}`)) {
      return _cache.value.get(`${gCalendarId}:${gEventId}`);
    }
    const storedEvent = getStoredEvents().find((event) => event.id === gEventId && event.sourceCalendarId === gCalendarId);
    if (storedEvent) return storedEvent;
    if (isOffline() || !authStore.token) return null;
    try {
      const event = await gCalAPI.getEvent(authStore.token, gCalendarId, gEventId);
      if (!event) return null;
      const result = { ...event, sourceCalendarId: gCalendarId };
      upsertStoredEvent(result);
      return result;
    } catch (error) {
      console.warn('Event could not be loaded while offline.', error);
      return null;
    }
  }

  /**
   * イベントを作成
   * @param {any} body イベントのペイロード
   * @param {string} gCalendarId カレンダー ID
   * @returns {Promise<boolean>} 作成に成功したかどうか
   */
  async function createEvent(body, gCalendarId) {
    const localId = `offline-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    const localEvent = { ...body, id: localId, sourceCalendarId: gCalendarId, created: new Date().toISOString(), updated: new Date().toISOString() };
    upsertStoredEvent(localEvent);
    _cache.value = new Map();
    if (isOffline() || !authStore.token) {
      queueOperation({ type: 'create', calendarId: gCalendarId, localId, body });
      return true;
    }
    try {
      const result = await gCalAPI.insertEvent(authStore.token, gCalendarId, body);
      removeStoredEvent(localId, gCalendarId);
      if (result) upsertStoredEvent({ ...result, sourceCalendarId: gCalendarId });
      return true;
    } catch (error) {
      queueOperation({ type: 'create', calendarId: gCalendarId, localId, body });
      return true;
    }
  }

  /**
   * イベントを更新
   * @param {string} gEeventId イベント ID
   * @param {string} gCalendarId カレンダー ID
   * @param {any} body 更新するイベントのペイロード
   * @returns {Promise<boolean>} 更新に成功したかどうか
   */
  async function updateEvent(gEeventId, gCalendarId, body) {
    const existing = getStoredEvents().find((event) => event.id === gEeventId && event.sourceCalendarId === gCalendarId) ?? {};
    upsertStoredEvent({ ...existing, ...body, id: gEeventId, sourceCalendarId: gCalendarId, updated: new Date().toISOString() });
    _cache.value = new Map();
    if (isOffline() || !authStore.token) {
      queueOperation({ type: 'update', calendarId: gCalendarId, eventId: gEeventId, body });
      return true;
    }
    try {
      await gCalAPI.updateEvent(authStore.token, gCalendarId, gEeventId, body);
      return true;
    } catch (error) {
      queueOperation({ type: 'update', calendarId: gCalendarId, eventId: gEeventId, body });
      return true;
    }
  }

  /**
   * イベントを削除
   * @param {string} gEventId イベント ID
   * @param {string} gCalendarId カレンダー ID
   * @returns {Promise<boolean>} 削除に成功したかどうか
   */
  async function removeEvent(gEventId, gCalendarId) {
    removeStoredEvent(gEventId, gCalendarId);
    _cache.value = new Map();
    if (isOffline() || !authStore.token) {
      queueOperation({ type: 'remove', calendarId: gCalendarId, eventId: gEventId });
      return true;
    }
    try {
      await gCalAPI.deleteEvent(authStore.token, gCalendarId, gEventId);
      return true;
    } catch (error) {
      queueOperation({ type: 'remove', calendarId: gCalendarId, eventId: gEventId });
      return true;
    }
  }

  if (typeof window !== 'undefined') window.addEventListener('online', syncPendingOperations);
  syncPendingOperations();

  return {
    listEvents,
    listEventsByDate,
    getEventById,
    createEvent,
    updateEvent,
    removeEvent,
    syncPendingOperations,
  };
});
