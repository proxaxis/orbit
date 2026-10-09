/**
 * イベントの CRUD・一覧取得・オフライン同期を担うコンポーザブル。
 * API 通信とオフラインキャッシュの調停はここに集約し、
 * ストア（stores/event.js）には状態のみを保持させる。
 * オフライン操作キューは Service Worker の Background Sync にも委譲する。
 */
import dayjs, { toDayjs } from '@/services/dayjs.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useEventStore } from '@/stores/event.js';
import { useUserStore } from '@/stores/user.js';
import { rescheduleNotifications } from '@/composables/useNotifications.js';
import { CACHE_KEYS, SYNC_TAGS, registerBackgroundSync, writeCache } from '@/composables/useCache.js';
import { getStoredEvents, processEventOperations, readEventOperations, removeStoredEvent, storedEventsForMonth, upsertStoredEvent, writeEventOperations } from '@/services/event-offline.js';
import { parseEventTags, stripTagsFromDescription } from '@/services/event-tags.js';
import { isCustomHolidayEvent } from '@/services/custom-holidays.js';

/** @type {boolean} オフライン同期の初期化済みフラグ */
let syncInitialized = false;

/** @type {Promise<void>} 保存イベントへの反映を直列化するキュー（複数月の同時ロードで全体配列を巻き戻さないため） */
let storedEventsWriteQueue = Promise.resolve();

/** @type {number} カレンダー別月キャッシュの有効期間。期限なしだと他デバイス等での変更がセッション中反映されない */
const MONTH_CACHE_TTL_MS = 10 * 60 * 1000;

/** @type {Map<string, number>} 直近で削除したイベントキー（calendarId:eventId）と削除時刻。events.list の反映遅れで復活するのを防ぐ */
const recentlyRemovedEventKeys = new Map();

/** @type {number} 削除ガードの有効期間（この間に届いた API 一覧内の該当イベントを無視する） */
const REMOVED_EVENT_GUARD_MS = 60 * 1000;

/**
 * イベントの更新時刻を返す。ローカル保存版はトップレベルの updated、API 版は raw.updated を持つため新しい方を使う
 * @param {any} event イベント
 * @returns {string} ISO 形式の更新時刻（無ければ空文字）
 */
function updatedStampOf(event) {
  const raw = String(event?.raw?.updated ?? '');
  const top = String(event?.updated ?? '');
  return top > raw ? top : raw;
}

/**
 * 予定データに関わる副作用（通知リスケジュールと共有カレンダー同期の予約）
 * @returns {void}
 */
function runEventDataSideEffects() {
  rescheduleNotifications();
  // 共有同期は useShare 側で初期化済みのときだけ動く（遅延 import で循環を避ける）
  import('@/composables/useShare.js').then(({ scheduleShareSync }) => scheduleShareSync());
}

/**
 * 予定データの変更後に実行する処理。ビューの再取得通知と副作用をまとめて実行する。
 * 取得処理（listEvents）からは呼ばないこと。ビューはバージョンを監視して再取得するため、
 * 取得のたびにバージョンを上げると無限ループになる。
 * @returns {void}
 */
export function notifyEventDataChanged() {
  useEventStore().bumpEventsVersion();
  runEventDataSideEffects();
}

/**
 * Google Calendar API のイベントを表示用モデルへ変換する
 * @param {GoogleCalendarEvent} evt API イベント
 * @param {string} calendarId 所属カレンダー ID
 * @param {{colorId?: string, backgroundColor?: string, foregroundColor?: string}} calendarColor カレンダーの配色
 * @returns {HandyCalendarEvent}
 */
function toHandyEvent(evt, calendarId, calendarColor) {
  const tags = parseEventTags(evt);
  return {
    id: evt.id ?? 'unknown',
    calendarId: calendarId ?? 'unknown',
    summary: evt.summary ?? 'Unknown Event',
    description: stripTagsFromDescription(evt.description ?? '', tags),
    tags,
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
  };
}

/**
 * イベントの CRUD・一覧取得・オフライン同期のコンポーザブル
 * @returns {Object} イベント操作関数群
 */
export function useEvents() {
  const authStore = useAuthStore();
  const calendarStore = useCalendarStore();
  const eventStore = useEventStore();
  const userStore = useUserStore();

  /**
   * 保留中の操作キューを永続化し、Service Worker のバックグラウンド同期にも委譲する
   * @returns {Promise<void>}
   */
  async function persistOperations() {
    await writeEventOperations(eventStore.pendingOperations);
    await registerBackgroundSync(SYNC_TAGS.OFFLINE_QUEUE);
  }

  /**
   * 保留中の操作をキューに追加する
   * @param {import('@/services/event-offline.js').EventOperation} operation 追加する操作
   * @returns {void}
   */
  function queueOperation(operation) {
    eventStore.pushPendingOperation(operation);
    persistOperations();
  }

  /**
   * 保留中の操作を API で同期する。
   * @returns {Promise<void>}
   */
  async function syncPendingOperations() {
    if (userStore.isOffline || !authStore.token) return;
    const { remaining, synced } = await processEventOperations(eventStore.pendingOperations, authStore.token);
    eventStore.setPendingOperations(remaining);
    await writeEventOperations(remaining);
    if (synced) notifyEventDataChanged();
  }

  /**
   * 指定の年と月における全てのカレンダーリストの全てのイベントを取得
   * @param {number} year 取得する年
   * @param {number} monthIndex 取得する月インデックス（0-11）
   * @param {GoogleCalendarEventsListQueryParams} [query={}] クエリパラメータ
   * @returns {Promise<HandyCalendarEvent[]>}
   */
  async function listEvents(year, monthIndex, query = {}) {
    /** @type {Map<string, HandyCalendarEvent>} 同一イベントの重複を除くためのマップ（キーは カレンダーID:イベントID） */
    const set = new Map();
    const eventKey = (/** @type {HandyCalendarEvent} */ event) => `${event.calendarId}:${event.id}`;
    // オフラインキューに残っている操作の対象イベントはローカル保存版を優先する
    // （API レスポンスは未反映の古いデータのため、上書きすると変更が画面から消える）
    const pendingEventIds = new Set(eventStore.pendingOperations.map((operation) => operation.eventId ?? operation.localId));
    const gCalendarIdSet = new Set(calendarStore.listVisibleCalendars.map((/** @type {any} */ cal) => cal.id));

    /** @type {Map<string, HandyCalendarEvent[]>} API 取得に成功したカレンダー ID → その月のイベント一覧（保存イベントへまとめて反映するため） */
    const succeeded = new Map();
    // フェッチ開始前の保存イベントキー。取得中に保存されたイベント（作成直後で events.list に未反映など）は
    // 一括書き戻しで消さないために使う
    const storedBeforeKeys = new Set((await getStoredEvents()).map((/** @type {HandyCalendarEvent} */ event) => eventKey(event)));

    // 削除直後のイベントが events.list の反映遅れで復活するのを防ぐ
    /** @param {HandyCalendarEvent} event @returns {boolean} 削除ガード期間内か */
    const isRecentlyRemoved = (event) => {
      const at = recentlyRemovedEventKeys.get(eventKey(event));
      if (at === undefined) return false;
      if (Date.now() - at > REMOVED_EVENT_GUARD_MS) {
        recentlyRemovedEventKeys.delete(eventKey(event));
        return false;
      }
      return true;
    };

    // API 版でローカル保存版を上書きしてよいか。
    // 更新直後のローカル版は updated が新しいため、events.list の反映遅れで古い API 版に戻されるのを防ぐ
    /** @param {Map<string, HandyCalendarEvent>} target @param {HandyCalendarEvent} event */
    const mergeApiEvent = (target, event) => {
      if (pendingEventIds.has(event.id) || isRecentlyRemoved(event)) return;
      const current = target.get(eventKey(event));
      if (current && updatedStampOf(current) > updatedStampOf(event)) return;
      target.set(eventKey(event), event);
    };

    await Promise.all(
      Array.from(gCalendarIdSet).map(async (gCalId) => {
        const key = `${gCalId}:${year}:${monthIndex}`;
        const storedItems = await storedEventsForMonth(gCalId, year, monthIndex);
        storedItems.forEach((/** @type {HandyCalendarEvent} */ event) => set.set(eventKey(event), event));

        const cached = eventStore.getCachedEntry(key);
        const cachedItems = cached && Array.isArray(cached.items) && Date.now() - cached.at < MONTH_CACHE_TTL_MS ? cached.items : null;
        if (cachedItems) {
          cachedItems.forEach((/** @type {HandyCalendarEvent} */ event) => mergeApiEvent(set, event));
          return;
        }
        if (userStore.isOffline || !authStore.token) return;

        const timeMin = dayjs().year(year).month(monthIndex).date(1).toISOString();
        const timeMax = dayjs()
          .year(year)
          .month(monthIndex + 1)
          .date(1)
          .toISOString();
        /** @type {HandyCalendarEvent[]} */
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
            const calendarColor = calendarStore.getCalendarColor(gCalId);
            items.push(...events.items.map((/** @type {GoogleCalendarEvent} */ evt) => toHandyEvent(evt, gCalId, calendarColor)));
          }
        } while (events?.nextPageToken);

        const fetched = items.filter((event) => !isRecentlyRemoved(event));
        eventStore.setCachedEntry(key, { at: Date.now(), items: fetched });
        succeeded.set(gCalId, fetched);
        // キューに残る操作対象とローカル新規版は保存版を維持し、それ以外は API の最新データで上書きする
        fetched.forEach((event) => mergeApiEvent(set, event));
      }),
    );

    // 取得成功カレンダーの当月分を保存イベントへ反映する。
    // 全体配列の read-modify-write は同時実行で他カレンダー/他月の保存分を巻き戻すため、
    // 月ロードごとに 1 回の書き込みへまとめた上で直列化する
    if (succeeded.size > 0) {
      // API 版イベントの updated を引けるようにする（ローカル新規版の巻き戻し防止）
      const apiUpdatedByKey = new Map();
      succeeded.forEach((items) => items.forEach((event) => apiUpdatedByKey.set(eventKey(event), updatedStampOf(event))));
      storedEventsWriteQueue = storedEventsWriteQueue
        .then(async () => {
          const monthStart = dayjs().year(year).month(monthIndex).date(1).startOf('day');
          const monthEnd = monthStart.add(1, 'month');
          const currentEvents = await getStoredEvents();
          const kept = currentEvents.filter((/** @type {HandyCalendarEvent} */ event) => {
            if (!succeeded.has(event.calendarId)) return true;
            const overlapsMonth = event.startDateTime.isBefore(monthEnd) && event.endDateTime.isAfter(monthStart);
            if (!overlapsMonth || pendingEventIds.has(event.id)) return true;
            // フェッチ中に保存されたイベントは残す（作成直後で list に未反映のイベントを消さない）
            if (!storedBeforeKeys.has(eventKey(event))) return true;
            // 直近に削除したイベントは API 一覧の遅延で復活させない
            if (isRecentlyRemoved(event)) return false;
            const apiUpdated = apiUpdatedByKey.get(eventKey(event));
            // API 一覧に無いイベントはサーバ側の削除・月外移動を反映して落とす
            if (apiUpdated === undefined) return false;
            // ローカル保存版の方が新しい（更新直後で list 未反映）なら残す
            return updatedStampOf(event) > apiUpdated;
          });
          await writeCache(CACHE_KEYS.EVENTS, [...kept, ...[...succeeded.values()].flat()]);
        })
        .catch(() => {});
      await storedEventsWriteQueue;
    }

    // バージョンは上げず副作用だけ実行する（バージョンを上げるとビューの再取得→再取得の無限ループになる）
    runEventDataSideEffects();
    return Array.from(set.values());
  }

  /**
   * 指定の年月日における全てのカレンダーリストの全てのイベントを取得
   * @param {number} year 取得する年
   * @param {number} monthIndex 取得する月インデックス（0-11）
   * @param {number} date 取得する日付（1-31）
   * @param {GoogleCalendarEventsListQueryParams} [query={}] クエリパラメータ
   * @returns {Promise<HandyCalendarEvent[]>}
   */
  async function listEventsByDate(year, monthIndex, date, query = {}) {
    const events = await listEvents(year, monthIndex, query);
    const start = toDayjs(year, monthIndex, date).startOf('day');
    const end = toDayjs(year, monthIndex, date).endOf('day');
    return events.filter((/** @type {HandyCalendarEvent} */ event) => event.startDateTime.unix() < end.unix() && event.endDateTime.unix() > start.unix());
  }

  /**
   * メモリキャッシュを破棄して現在月の予定を再同期する
   * @param {number} year 取得する年
   * @param {number} monthIndex 取得する月インデックス（0-11）
   * @returns {Promise<HandyCalendarEvent[]>}
   */
  async function syncEvents(year, monthIndex) {
    eventStore.clearEventCache();
    return listEvents(year, monthIndex);
  }

  /**
   * 指定のイベント ID からイベントを取得
   * @param {string} gEventId イベント ID
   * @param {string} gCalendarId カレンダー ID
   * @returns {Promise<HandyCalendarEvent|null>}
   */
  async function getEventById(gEventId, gCalendarId) {
    const cached = eventStore.getCachedEntry(`${gCalendarId}:${gEventId}`);
    if (cached) return cached;
    /** @type {HandyCalendarEvent|undefined} キャッシュ済みのイベント */
    const storedEvent = (await getStoredEvents()).find((/** @type {HandyCalendarEvent} */ event) => event.id === gEventId && event.calendarId === gCalendarId);
    if (storedEvent) return storedEvent;
    if (userStore.isOffline || !authStore.isAuthenticated) return null;
    try {
      const event = await gCalAPI.getEvent(authStore.token, gCalendarId, gEventId);
      if (!event) return null;
      const result = { ...toHandyEvent(event, gCalendarId, calendarStore.getCalendarColor(gCalendarId)), timeZone: event.start?.timeZone ?? undefined };
      await upsertStoredEvent(result);
      return result;
    } catch (error) {
      console.warn('Event could not be loaded while offline.', error);
      return null;
    }
  }

  /**
   * イベントを作成する
   * @param {any} body イベントのペイロード
   * @param {string} gCalendarId カレンダー ID
   * @returns {Promise<HandyCalendarEvent>} 作成されたイベント（オフライン等で同期保留になった場合はローカルイベント）
   */
  async function createEvent(body, gCalendarId) {
    const localId = `offline-${globalThis.crypto?.randomUUID?.() ?? `${dayjs().valueOf()}-${Math.random().toString(36).slice(2)}`}`;
    const localEvent = { ...body, id: localId, calendarId: gCalendarId, created: dayjs().toISOString(), updated: dayjs().toISOString() };
    const calendarColor = calendarStore.getCalendarColor(gCalendarId);
    const localHandyEvent = {
      id: localId,
      calendarId: gCalendarId,
      summary: body.summary ?? 'Unknown Event',
      startDateTime: toDayjs(body.start?.dateTime ?? body.start?.date),
      endDateTime: toDayjs(body.end?.dateTime ?? body.end?.date),
      timeZone: body.start?.timeZone ?? undefined,
      description: stripTagsFromDescription(body.description ?? '', parseEventTags(body)),
      tags: parseEventTags(body),
      location: body.location,
      isAllDay: !!body.start?.date,
      icon: body.extendedProperties?.shared?.icon ?? undefined,
      eventColorId: body.colorId ?? undefined,
      calendarColorId: calendarColor.colorId,
      calendarBackgroundColor: calendarColor.backgroundColor,
      calendarForegroundColor: calendarColor.foregroundColor,
      raw: localEvent,
    };
    // HandyCalendarEvent 形式で保存する。Google 形式（start/end）で保存すると
    // 読み戻し時に startDateTime/endDateTime が欠落して日時が現在時刻扱いになる
    await upsertStoredEvent(localHandyEvent);
    eventStore.clearEventCache();
    notifyEventDataChanged();
    if (userStore.isOffline || !authStore.isAuthenticated) {
      queueOperation({ type: 'create', calendarId: gCalendarId, localId, body });
      return localHandyEvent;
    }
    try {
      const event = await gCalAPI.insertEvent(authStore.token, gCalendarId, body);
      await removeStoredEvent(localId, gCalendarId);
      if (!event) return localHandyEvent;
      const created = { ...toHandyEvent(event, gCalendarId, calendarColor), timeZone: event.start?.timeZone ?? undefined };
      await upsertStoredEvent(created);
      // 作成時の通知は insert 前に出ているため、API 版へ差し替えたことを再通知する
      eventStore.clearEventCache();
      notifyEventDataChanged();
      return created;
    } catch {
      queueOperation({ type: 'create', calendarId: gCalendarId, localId, body });
      return localHandyEvent;
    }
  }

  /**
   * イベントを更新する
   * @param {string} gEventId イベント ID
   * @param {string} gCalendarId カレンダー ID
   * @param {any} body 更新するイベントのペイロード
   * @returns {Promise<boolean>} 更新に成功したかどうか
   */
  async function updateEvent(gEventId, gCalendarId, body) {
    const existing = (await getStoredEvents()).find((/** @type {HandyCalendarEvent} */ event) => event.id === gEventId && event.calendarId === gCalendarId) ?? {};
    // body は Google 形式（start/end）なので、保存用モデルの日時フィールドは明示的に上書きする。
    // start/end が含まれない部分更新（参加回答など）では既存値を維持する
    const bodyTags = parseEventTags(body);
    const now = dayjs().toISOString();
    await upsertStoredEvent({
      ...existing,
      ...body,
      id: gEventId,
      calendarId: gCalendarId,
      summary: body.summary ?? existing.summary,
      // description 末尾の #tag 文字列は表示用モデルから取り除く
      description: body.description !== undefined ? stripTagsFromDescription(body.description, bodyTags) : existing.description,
      tags: body.extendedProperties?.shared !== undefined ? bodyTags : existing.tags,
      startDateTime: body.start ? toDayjs(body.start.dateTime ?? body.start.date) : existing.startDateTime,
      endDateTime: body.end ? toDayjs(body.end.dateTime ?? body.end.date) : existing.endDateTime,
      isAllDay: body.start ? !!body.start.date : existing.isAllDay,
      eventColorId: body.colorId === undefined ? existing.eventColorId : (body.colorId ?? undefined),
      // raw も更新内容で上書きする。古い raw.updated のままだと鮮度比較で API 版に負けて変更が巻き戻る
      raw: { ...(existing.raw ?? {}), ...body, id: gEventId, updated: now },
      updated: now,
    });
    eventStore.clearEventCache();
    notifyEventDataChanged();
    if (userStore.isOffline || !authStore.isAuthenticated) {
      queueOperation({ type: 'update', calendarId: gCalendarId, eventId: gEventId, body });
      return true;
    }
    try {
      const event = await gCalAPI.updateEvent(authStore.token, gCalendarId, gEventId, body);
      if (event) {
        const updated = { ...toHandyEvent(event, gCalendarId, calendarStore.getCalendarColor(gCalendarId)), timeZone: event.start?.timeZone ?? undefined };
        await upsertStoredEvent(updated);
      }
      // 更新前の通知は API 反映前に出ているため、サーバー版へ差し替えたことを再通知する
      eventStore.clearEventCache();
      notifyEventDataChanged();
      return true;
    } catch {
      queueOperation({ type: 'update', calendarId: gCalendarId, eventId: gEventId, body });
      return true;
    }
  }

  /**
   * 全カレンダーを横断してイベントをキーワード検索する。
   * Google Calendar API の events.list クエリパラメータ `q` を利用し、
   * summary/description/location などにマッチするイベントを返す。
   * カスタム休日のイベントは検索結果から除外する。
   * @param {string} text 検索キーワード（'#tag' でタグ検索も可能）
   * @returns {Promise<HandyCalendarEvent[]>} 開始日時昇順のイベント一覧
   */
  async function searchEvents(text) {
    const query = String(text ?? '').trim();
    if (!query || userStore.isOffline || !authStore.token) return [];
    /** @type {Map<string, HandyCalendarEvent>} */
    const found = new Map();
    await Promise.all(
      calendarStore.list.map(async (/** @type {any} */ cal) => {
        const gCalId = cal.id;
        /** @type {GoogleCalendarEventsListResponse|undefined} */
        let events;
        do {
          try {
            events = await gCalAPI.listEvents(authStore.token, gCalId, { q: query, singleEvents: true, pageToken: events?.nextPageToken });
          } catch (error) {
            console.warn('Event search failed for a calendar.', error);
            return;
          }
          const calendarColor = calendarStore.getCalendarColor(gCalId);
          events?.items?.forEach((/** @type {GoogleCalendarEvent} */ evt) => {
            const handy = toHandyEvent(evt, gCalId, calendarColor);
            if (!isCustomHolidayEvent(handy)) found.set(`${handy.calendarId}:${handy.id}`, handy);
          });
        } while (events?.nextPageToken);
      }),
    );
    return Array.from(found.values()).sort((a, b) => a.startDateTime.unix() - b.startDateTime.unix());
  }

  /**
   * イベントを削除する
   * @param {string} gEventId イベント ID
   * @param {string} gCalendarId カレンダー ID
   * @returns {Promise<boolean>} 削除に成功したかどうか
   */
  async function removeEvent(gEventId, gCalendarId) {
    recentlyRemovedEventKeys.set(`${gCalendarId}:${gEventId}`, Date.now());
    await removeStoredEvent(gEventId, gCalendarId);
    eventStore.clearEventCache();
    notifyEventDataChanged();
    if (userStore.isOffline || !authStore.isAuthenticated) {
      queueOperation({ type: 'remove', calendarId: gCalendarId, eventId: gEventId });
      return true;
    }
    try {
      await gCalAPI.deleteEvent(authStore.token, gCalendarId, gEventId);
      // 削除前の通知は API 反映前に出ているため、古い一覧で再読込されないよう再通知する
      eventStore.clearEventCache();
      notifyEventDataChanged();
      return true;
    } catch {
      queueOperation({ type: 'remove', calendarId: gCalendarId, eventId: gEventId });
      return true;
    }
  }

  return {
    listEvents,
    listEventsByDate,
    searchEvents,
    syncEvents,
    getEventById,
    createEvent,
    updateEvent,
    removeEvent,
    syncPendingOperations,
  };
}

/**
 * オフラインイベント同期の初期化。保存済みキューの読み込みと
 * オンライン復帰時の同期・Service Worker メッセージ処理を開始する。
 * アプリ起動時に一度だけ呼ぶ。
 * @returns {Promise<void>}
 */
export async function initEventSync() {
  if (syncInitialized || typeof window === 'undefined') return;
  syncInitialized = true;
  const eventStore = useEventStore();
  eventStore.setPendingOperations(await readEventOperations());

  const events = useEvents();
  window.addEventListener('online', events.syncPendingOperations);
  await events.syncPendingOperations();
}
