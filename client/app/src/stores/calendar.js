/**
 * カレンダー一覧の状態管理のみを担当するストア。
 * Google Calendar API との通信は `composables/useCalendars.js` に置く。
 * 状態の変更はオフラインキャッシュ（useCache）へも永続化する。
 */
import { defineStore } from 'pinia';
import { shallowRef, computed } from 'vue';
import { useUserStore } from '@/stores/user.js';
import { useShareStore } from '@/stores/share.js';
import { CACHE_KEYS, writeCache } from '@/composables/useCache.js';

export const useCalendarStore = defineStore('calendar', () => {
  const userStore = useUserStore();
  const shareStore = useShareStore();

  /** @type {ShallowRef<null|Set<GoogleCalendarListEntry>>} @description ユーザーのカレンダーリスト */
  const _gCalendarsList = shallowRef(null);

  /** @type {ShallowRef<Set<GoogleCalendarListEntry>>} @description 一時利用するセッションカレンダー */
  const _sessionCalendars = shallowRef(new Set());

  /** @type {ComputedRef<GoogleCalendarListEntry[]>} @description 表示順を適用したカレンダーリスト */
  const list = computed(() => {
    const calendars = Array.from(new Map([...Array.from(_gCalendarsList.value ?? new Set()), ...Array.from(_sessionCalendars.value)].map((calendar) => [calendar.id, calendar])).values());
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

  /** @type {ComputedRef<GoogleCalendarListEntry[]>} @description 書き込み権限を持つカレンダーのリスト */
  const listWritableCalendars = computed(() => list.value.filter((cal) => cal.accessRole === 'writer' || cal.accessRole === 'owner' || cal.primary));

  /** @type {ComputedRef<GoogleCalendarListEntry[]>} @description 非表示設定を除いたカレンダーのリスト（期間指定共有カレンダーは明示的に表示した場合のみ含む） */
  const listVisibleCalendars = computed(() => list.value.filter((cal) => (shareStore.copyCalendarIds.has(cal.id) ? userStore.visibleShareCalendarIds.includes(cal.id) : !userStore.hiddenCalendarIds.includes(cal.id))));

  /** @type {ComputedRef<GoogleCalendarListEntry[]>} @description セッションカレンダーのリスト */
  const sessionCalendars = computed(() => Array.from(_sessionCalendars.value));

  /**
   * カレンダーリスト全体を置き換える
   * @param {GoogleCalendarListEntry[]} calendars カレンダー一覧
   * @returns {void}
   */
  function setCalendars(calendars) {
    _gCalendarsList.value = new Set(Array.isArray(calendars) ? calendars : []);
    writeCache(CACHE_KEYS.CALENDARS, Array.from(_gCalendarsList.value));
  }

  /**
   * セッションカレンダー一覧を置き換える
   * @param {GoogleCalendarListEntry[]} calendars セッションカレンダー一覧
   * @returns {void}
   */
  function setSessionCalendars(calendars) {
    _sessionCalendars.value = new Set(Array.isArray(calendars) ? calendars : []);
    writeCache(CACHE_KEYS.SESSION_CALENDARS, Array.from(_sessionCalendars.value));
  }

  /**
   * セッションカレンダーを追加する
   * @param {GoogleCalendarResource|GoogleCalendarListEntry} calendar 追加するカレンダー
   * @returns {void}
   */
  function addSessionCalendar(calendar) {
    if (!calendar?.id) return;
    // 期間指定共有のコピーカレンダーはセッション追加しない（共有管理側で表示・削除を行うため）
    if (shareStore.copyCalendarIds.has(calendar.id)) return;
    const entry = {
      kind: 'calendar#calendarListEntry',
      etag: calendar.etag ?? '',
      id: calendar.id,
      summary: calendar.summary ?? calendar.id,
      description: calendar.description,
      location: calendar.location,
      timeZone: calendar.timeZone,
      backgroundColor: calendar.backgroundColor ?? '#607d8b',
      foregroundColor: calendar.foregroundColor ?? '#ffffff',
      accessRole: calendar.accessRole ?? 'reader',
      session: true,
    };
    _sessionCalendars.value = new Set([..._sessionCalendars.value].filter((item) => item.id !== entry.id).concat(entry));
    writeCache(CACHE_KEYS.SESSION_CALENDARS, Array.from(_sessionCalendars.value));
  }

  /** セッションカレンダーを全て消去する */
  function clearSessionCalendars() {
    setSessionCalendars([]);
  }

  /**
   * セッション一覧からカレンダーを除去する
   * @param {string} calendarId 除去するカレンダー ID
   * @returns {void}
   */
  function removeSessionCalendar(calendarId) {
    _sessionCalendars.value = new Set([..._sessionCalendars.value].filter((calendar) => calendar.id !== calendarId));
    writeCache(CACHE_KEYS.SESSION_CALENDARS, Array.from(_sessionCalendars.value));
  }

  /**
   * カレンダーを一覧へ追加する
   * @param {GoogleCalendarListEntry} calendar 追加するカレンダー
   * @returns {void}
   */
  function addCalendar(calendar) {
    if (!calendar?.id) return;
    _gCalendarsList.value = new Set([...list.value, calendar]);
    writeCache(CACHE_KEYS.CALENDARS, Array.from(_gCalendarsList.value));
  }

  /**
   * カレンダーを一覧上で更新する
   * @param {GoogleCalendarListEntry} calendar 更新するカレンダー
   * @returns {void}
   */
  function updateCalendar(calendar) {
    if (!calendar?.id) return;
    _gCalendarsList.value = new Set(list.value.map((item) => (item.id === calendar.id ? calendar : item)));
    writeCache(CACHE_KEYS.CALENDARS, Array.from(_gCalendarsList.value));
  }

  /**
   * カレンダーを一覧から除去する
   * @param {string} calendarId 除去するカレンダー ID
   * @returns {void}
   */
  function removeCalendar(calendarId) {
    if (!calendarId) return;
    _gCalendarsList.value = new Set(list.value.filter((calendar) => calendar.id !== calendarId));
    writeCache(CACHE_KEYS.CALENDARS, Array.from(_gCalendarsList.value));
  }

  /**
   * カレンダーの配色を取得する
   * @param {string} calendarId カレンダー ID
   * @returns {{ colorId?: string; backgroundColor?: string; foregroundColor?: string }}
   */
  function getCalendarColor(calendarId) {
    const calendar = list.value.find((cal) => cal.id === calendarId);
    return {
      colorId: calendar?.colorId,
      backgroundColor: calendar?.backgroundColor,
      foregroundColor: calendar?.foregroundColor,
    };
  }

  return {
    list,
    listWritableCalendars,
    listVisibleCalendars,
    sessionCalendars,
    setCalendars,
    setSessionCalendars,
    addSessionCalendar,
    clearSessionCalendars,
    removeSessionCalendar,
    addCalendar,
    updateCalendar,
    removeCalendar,
    getCalendarColor,
  };
});
