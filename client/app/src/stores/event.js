import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import dayjs, { toDayjs } from '@/services/dayjs';
import { readOffline, writeOffline } from '@/services/offline-storage.js';

/**
 * @typedef {Object} OperationEntry
 * @property {'create'|'update'|'remove'} type 操作の種類
 * @property {string} calendarId カレンダーID
 * @property {string} [eventId] イベントID（update/removeの場合）
 * @property {string} [localId] ローカルイベントID（createの場合）
 * @property {Object} [body] イベントのペイロード（create/updateの場合）
 */

export const useEventStore = defineStore('event', () => {
  const authStore = useAuthStore();
  const calendarStore = useCalendarStore();
  const userStore = useUserStore();

  /** @type {Ref<Map<string, any>>} @description イベントデータ */
  const _cache = ref(new Map());
  /** @type {Ref<OperationEntry[]>} */
  const pendingOperations = ref([]);

  async function persistOperations() {
    await writeOffline('event-operations', pendingOperations.value);
  }

  async function getStoredEvents() {
    const events = await readOffline('events', []);
    return events.map((/** @type {any} */ evt) => ({
      ...evt,
      startDateTime: dayjs(evt.startDateTime),
      endDateTime: dayjs(evt.endDateTime),
    }));
  }

  /** @param {HandyCalendarEvent[]} events */
  async function saveStoredEvents(events) {
    await writeOffline('events', events);
  }

  /** @param {HandyCalendarEvent} event */
  async function upsertStoredEvent(event) {
    const events = (await getStoredEvents()).filter((/** @type {HandyCalendarEvent} */ item) => !(item.id === event.id && item.calendarId === event.calendarId));
    events.push(event);
    await saveStoredEvents(events);
  }

  /** @param {string} eventId @param {string} calendarId */
  async function removeStoredEvent(eventId, calendarId) {
    const events = await getStoredEvents();
    await saveStoredEvents(events.filter((/** @type {HandyCalendarEvent} */ item) => !(item.id === eventId && item.calendarId === calendarId)));
  }

  /**
   * 指定のカレンダー、年、月におけるイベントを取得
   * @param {string} calendarId カレンダーID
   * @param {number} year 年
   * @param {number} monthIndex 月インデックス（0-11）
   * @return {Promise<HandyCalendarEvent[]>}
   */
  async function eventsForMonth(calendarId, year, monthIndex) {
    const events = await getStoredEvents();
    const monthStart = dayjs(new Date(year, monthIndex, 1));
    const monthEnd = dayjs(new Date(year, monthIndex + 1, 1));
    return events.filter((/** @type {HandyCalendarEvent} */ evt) => {
      if (evt.calendarId !== calendarId) return false;
      return evt.startDateTime.isBefore(monthEnd) && evt.endDateTime.isAfter(monthStart);
    });
  }

  /**
   * 保留中の操作をキューに追加
   * @param {OperationEntry} operation
   */
  function queueOperation(operation) {
    if (!operation || !operation.type || !operation.calendarId) return;
    if (operation.type === 'update' || operation.type === 'remove') {
      if (!operation.eventId) return;
    }
    if (operation.type === 'create') {
      if (!operation.localId || !operation.body) return;
    }
    pendingOperations.value.push(operation);
    persistOperations();
  }

  /**
   * 保留中の操作を同期
   * @returns {Promise<void>}
   */
  async function syncPendingOperations() {
    if (userStore.isOffline || !authStore.token) return;
    const remaining = [];
    for (const operation of pendingOperations.value) {
      try {
        if (operation.type === 'create') {
          const result = await gCalAPI.insertEvent(authStore.token, operation.calendarId, operation.body ?? {});
          if (result?.id && operation.localId) {
            const local = (await getStoredEvents()).find((/** @type {HandyCalendarEvent} */ event) => event.id === operation.localId);
            if (local) {
              await removeStoredEvent(operation.localId, operation.calendarId);
              await upsertStoredEvent({ ...local, ...result, calendarId: operation.calendarId });
            }
          }
        } else if (operation.type === 'update') {
          await gCalAPI.updateEvent(authStore.token, operation.calendarId, operation.eventId ?? '', operation.body ?? {});
        } else if (operation.type === 'remove') {
          await gCalAPI.deleteEvent(authStore.token, operation.calendarId, operation.eventId ?? '');
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
   * @param {GoogleCalendarEventsListQueryParams} [query={}] クエリパラメータ
   * @return {Promise<HandyCalendarEvent[]>}
   */
  async function listEvents(year, monthIndex, query = {}) {
    const set = new Set();
    const gCalendarIdSet = new Set(calendarStore.listVisibleCalendars.map((cal) => cal.id));

    await Promise.all(
      Array.from(gCalendarIdSet).map(async (gCalId) => {
        const key = `${gCalId}:${year}:${monthIndex}`;
        if (_cache.value.has(key)) {
          (_cache.value.get(key) ?? []).forEach((/** @type {HandyCalendarEvent} */ event) => set.add(event));
          return;
        }

        const storedItems = await eventsForMonth(gCalId, year, monthIndex);
        if (storedItems.length > 0) {
          _cache.value.set(key, storedItems);
          storedItems.forEach((/** @type {HandyCalendarEvent} */ event) => set.add(event));
        }
        if (userStore.isOffline || !authStore.token) return;

        const timeMin = new Date(year, monthIndex, 1).toISOString();
        const timeMax = new Date(year, monthIndex + 1, 1).toISOString();
        /** @type {HandyCalendarEvent[]} */
        let items = [];
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
            const calendarColor = calendarStore.getCalendarColor(gCalId);
            const itemsChildren = events.items.map((/** @type {GoogleCalendarEvent} */ evt) => ({
              id: evt.id ?? 'unknown',
              calendarId: gCalId ?? 'unknown',
              summary: evt.summary ?? 'Unknown Event',
              description: evt.description ?? '',
              location: evt.location ?? '',
              startDateTime: dayjs(evt.start?.dateTime ?? evt.start?.date),
              endDateTime: dayjs(evt.end?.dateTime ?? evt.end?.date),
              isAllDay: !!evt.start?.date,
              icon: evt.extendedProperties?.shared?.icon ?? undefined,
              eventColorId: evt.colorId,
              calendarColorId: calendarColor.colorId,
              calendarBackgroundColor: calendarColor.backgroundColor,
              calendarForegroundColor: calendarColor.foregroundColor,
              raw: evt,
            }));
            items.push(...itemsChildren);
          }
        } while (events?.nextPageToken);

        _cache.value.set(key, items);
        const currentEvents = await getStoredEvents();
        const monthEvents = await eventsForMonth(gCalId, year, monthIndex);
        const storedEvents = currentEvents.filter((/** @type {HandyCalendarEvent} */ event) => event.calendarId !== gCalId || !monthEvents.some((stored) => stored.id === event.id));
        await saveStoredEvents([...storedEvents, ...items]);
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
   * @param {GoogleCalendarEventsListQueryParams} [query={}] クエリパラメータ
   * @return {Promise<(HandyCalendarEvent)[]>}
   */
  async function listEventsByDate(year, monthIndex, date, query = {}) {
    const events = await listEvents(year, monthIndex, query);
    const start = toDayjs(year, monthIndex, date).second(0).minute(0).hour(0).millisecond(0);
    const end = toDayjs(year, monthIndex, date).second(59).minute(59).hour(23).millisecond(999);
    return events.filter((/** @type {HandyCalendarEvent} */ event) => event.startDateTime.unix() < end.unix() && event.endDateTime.unix() > start.unix());
  }

  /**
   * 指定のイベント ID からイベントを取得
   * @param {string} gEventId イベント ID
   * @param {string} gCalendarId カレンダー ID
   * @return {Promise<HandyCalendarEvent|null>}
   */
  async function getEventById(gEventId, gCalendarId) {
    if (_cache.value.has(`${gCalendarId}:${gEventId}`)) {
      return _cache.value.get(`${gCalendarId}:${gEventId}`);
    }
    const storedEvent = (await getStoredEvents()).find((/** @type {HandyCalendarEvent} */ event) => event.id === gEventId && event.calendarId === gCalendarId);
    if (storedEvent) return storedEvent;
    if (userStore.isOffline || !authStore.isAuthenticated) return null;
    try {
      const event = await gCalAPI.getEvent(authStore.token, gCalendarId, gEventId);
      if (!event) return null;
      const calendarColor = calendarStore.getCalendarColor(gCalendarId);
      const result = {
        id: event.id ?? 'unknown',
        calendarId: gCalendarId ?? 'unknown',
        summary: event.summary ?? 'Unknown Event',
        startDateTime: dayjs(event.start?.dateTime ?? event.start?.date),
        endDateTime: dayjs(event.end?.dateTime ?? event.end?.date),
        timeZone: event.start?.timeZone ?? undefined,
        description: event.description,
        location: event.location,
        isAllDay: event.fullDay ?? false,
        icon: event.extendedProperties?.shared?.icon ?? undefined,
        eventColorId: event.colorId,
        calendarColorId: calendarColor.colorId,
        calendarBackgroundColor: calendarColor.backgroundColor,
        calendarForegroundColor: calendarColor.foregroundColor,
        raw: event,
      };
      await upsertStoredEvent(result);
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
    const localEvent = { ...body, id: localId, calendarId: gCalendarId, created: new Date().toISOString(), updated: new Date().toISOString() };
    await upsertStoredEvent(localEvent);
    _cache.value = new Map();
    if (userStore.isOffline || !authStore.isAuthenticated) {
      queueOperation({ type: 'create', calendarId: gCalendarId, localId, body });
      return true;
    }
    try {
      const event = await gCalAPI.insertEvent(authStore.token, gCalendarId, body);
      await removeStoredEvent(localId, gCalendarId);
      if (event) {
        const calendarColor = calendarStore.getCalendarColor(gCalendarId);
        await upsertStoredEvent({
          id: event.id ?? 'unknown',
          calendarId: gCalendarId ?? 'unknown',
          summary: event.summary ?? 'Unknown Event',
          startDateTime: dayjs(event.start?.dateTime ?? event.start?.date),
          endDateTime: dayjs(event.end?.dateTime ?? event.end?.date),
          timeZone: event.start?.timeZone ?? undefined,
          description: event.description,
          location: event.locatio,
          isAllDay: event.fullDay ?? false,
          icon: event.extendedProperties?.shared?.icon ?? undefined,
          eventColorId: event.colorId,
          calendarColorId: calendarColor.colorId,
          calendarBackgroundColor: calendarColor.backgroundColor,
          calendarForegroundColor: calendarColor.foregroundColor,
          raw: event,
        });
      }
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
    const existing = (await getStoredEvents()).find((/** @type {HandyCalendarEvent} */ event) => event.id === gEeventId && event.calendarId === gCalendarId) ?? {};
    await upsertStoredEvent({ ...existing, ...body, id: gEeventId, calendarId: gCalendarId, updated: new Date().toISOString() });
    _cache.value = new Map();
    if (userStore.isOffline || !authStore.isAuthenticated) {
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
    await removeStoredEvent(gEventId, gCalendarId);
    _cache.value = new Map();
    if (userStore.isOffline || !authStore.isAuthenticated) {
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

  async function initializeOfflineState() {
    pendingOperations.value = await readOffline('event-operations', []);
    await syncPendingOperations();
  }

  if (typeof window !== 'undefined') window.addEventListener('online', syncPendingOperations);
  initializeOfflineState();

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
