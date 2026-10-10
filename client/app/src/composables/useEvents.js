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
import { runEventOperation } from '@/services/event-sync-worker.js';
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
 * 保存・表示イベントの一意キー（カレンダーID:イベントID）
 * @param {HandyCalendarEvent} event
 * @returns {string}
 */
function eventKeyOf(event) {
  return `${event.calendarId}:${event.id}`;
}

/**
 * 削除直後のイベントが events.list の反映遅れで復活するのを防ぐ
 * @param {HandyCalendarEvent} event
 * @returns {boolean} 削除ガード期間内か
 */
function isRecentlyRemovedEvent(event) {
  const at = recentlyRemovedEventKeys.get(eventKeyOf(event));
  if (at === undefined) return false;
  if (Date.now() - at > REMOVED_EVENT_GUARD_MS) {
    recentlyRemovedEventKeys.delete(eventKeyOf(event));
    return false;
  }
  return true;
}

/** @type {Set<string>} 取得中の年月キー（year:monthIndex）。同じ月の重複フェッチを抑止する */
const monthFetchInFlight = new Set();

/**
 * 2 つのイベント一覧が同一内容か判定する（順序も含む）。
 * 取得直後の一覧と既存キャッシュの突き合わせに使い、差分が無い場合の置換・再描画を抑止する。
 * @param {HandyCalendarEvent[]} a
 * @param {HandyCalendarEvent[]} b
 * @returns {boolean} 同一なら true
 */
export function sameEventItems(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (eventKeyOf(x) !== eventKeyOf(y)) return false;
    if (updatedStampOf(x) !== updatedStampOf(y)) return false;
    if (x.color !== y.color) return false;
    // dayjs インスタンスは別オブジェクトになり得るため unix 時刻で比較する
    if (x.startDateTime.unix() !== y.startDateTime.unix() || x.endDateTime.unix() !== y.endDateTime.unix()) return false;
    if ((x.summary ?? '') !== (y.summary ?? '')) return false;
  }
  return true;
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
   * 月単位のイベントを BFF バッチで取得し、メモリキャッシュと保存イベントへ反映する。
   * listEvents からバックグラウンドで呼ばれ、画面は先にキャッシュ/保存済みデータで描画する。
   * @param {{gCalId: string, key: string}[]} targets 取得対象のカレンダー
   * @param {number} year 取得する年
   * @param {number} monthIndex 取得する月インデックス（0-11）
   * @param {GoogleCalendarEventsListQueryParams} query クエリパラメータ
   * @returns {Promise<boolean>} 1 カレンダー以上の取得に成功したか
   */
  async function fetchMonthEvents(targets, year, monthIndex, query) {
    // オフラインキューに残っている操作の対象イベントはローカル保存版を優先する
    const pendingEventIds = new Set(eventStore.pendingOperations.map((operation) => operation.eventId ?? operation.localId));
    // フェッチ開始前の保存イベントキー。取得中に保存されたイベント（作成直後で events.list に未反映など）は
    // 一括書き戻しで消さないために使う
    const storedBeforeKeys = new Set((await getStoredEvents()).map((/** @type {HandyCalendarEvent} */ event) => eventKeyOf(event)));
    const timeMin = dayjs().year(year).month(monthIndex).date(1).toISOString();
    const timeMax = dayjs()
      .year(year)
      .month(monthIndex + 1)
      .date(1)
      .toISOString();
    /** @type {Awaited<ReturnType<typeof gCalAPI.listEventsBatch>>} */
    let results = [];
    try {
      results = await gCalAPI.listEventsBatch(
        authStore.token,
        targets.map(({ gCalId }) => ({ calendarId: gCalId, query: { ...query, timeMin, timeMax } })),
      );
    } catch (error) {
      // バッチ自体の失敗（BFF 到達不可など）はローカル表示分だけで続行する
      console.warn('Event list could not be refreshed. Using offline data.', error);
    }
    /** @type {Map<string, HandyCalendarEvent[]>} API 取得に成功したカレンダー ID → その月のイベント一覧（保存イベントへまとめて反映するため） */
    const succeeded = new Map();
    results.forEach((result, index) => {
      const { gCalId, key } = targets[index];
      if (!result.ok) {
        console.warn('Event list could not be refreshed. Using offline data.', gCalId);
        return;
      }
      const calendarColor = calendarStore.getCalendarColor(gCalId);
      const fetched = result.items.map((/** @type {GoogleCalendarEvent} */ evt) => toHandyEvent(evt, gCalId, calendarColor)).filter((event) => !isRecentlyRemovedEvent(event));
      const prev = eventStore.getCachedEntry(key);
      if (prev && Array.isArray(prev.items) && sameEventItems(prev.items, fetched)) {
        // 内容が同一なら既存のイベント参照を維持して取得時刻だけ更新する（再描画のちらつき防止）
        eventStore.setCachedEntry(key, { at: Date.now(), items: prev.items });
        return;
      }
      eventStore.setCachedEntry(key, { at: Date.now(), items: fetched });
      succeeded.set(gCalId, fetched);
    });

    // 取得成功カレンダーの当月分を保存イベントへ反映する。
    // 全体配列の read-modify-write は同時実行で他カレンダー/他月の保存分を巻き戻すため、
    // 月ロードごとに 1 回の書き込みへまとめた上で直列化する
    if (succeeded.size > 0) {
      // API 版イベントの updated を引けるようにする（ローカル新規版の巻き戻し防止）
      const apiUpdatedByKey = new Map();
      succeeded.forEach((items) => items.forEach((event) => apiUpdatedByKey.set(eventKeyOf(event), updatedStampOf(event))));
      storedEventsWriteQueue = storedEventsWriteQueue
        .then(async () => {
          const monthStart = dayjs().year(year).month(monthIndex).date(1).startOf('day');
          const monthEnd = monthStart.add(1, 'month');
          const currentEvents = await getStoredEvents();
          const kept = currentEvents.filter((/** @type {HandyCalendarEvent} */ event) => {
            if (!succeeded.has(event.calendarId)) return true;
            const overlapsMonth = event.startDateTime.isBefore(monthEnd) && event.endDateTime.isAfter(monthStart);
            if (!overlapsMonth || pendingEventIds.has(event.id)) return true;
            // フェッチ中に保存されたイベントは残す（作成直後で events.list に未反映のイベントを消さない）
            if (!storedBeforeKeys.has(eventKeyOf(event))) return true;
            // 直近に削除したイベントは API 一覧の遅延で復活させない
            if (isRecentlyRemovedEvent(event)) return false;
            const apiUpdated = apiUpdatedByKey.get(eventKeyOf(event));
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
    return succeeded.size > 0;
  }

  /**
   * 指定の年と月における全てのカレンダーリストの全てのイベントを取得。
   * オンライン・オフラインに関わらず、まず保存済み・キャッシュのデータで即座に返す。
   * オンラインでキャッシュが古い場合はバックグラウンドで取り直し、完了後にビューへ通知する。
   * @param {number} year 取得する年
   * @param {number} monthIndex 取得する月インデックス（0-11）
   * @param {GoogleCalendarEventsListQueryParams} [query={}] クエリパラメータ
   * @returns {Promise<HandyCalendarEvent[]>}
   */
  async function listEvents(year, monthIndex, query = {}) {
    /** @type {Map<string, HandyCalendarEvent>} 同一イベントの重複を除くためのマップ（キーは カレンダーID:イベントID） */
    const set = new Map();
    const eventKey = eventKeyOf;
    // オフラインキューに残っている操作の対象イベントはローカル保存版を優先する
    // （API レスポンスは未反映の古いデータのため、上書きすると変更が画面から消える）
    const pendingEventIds = new Set(eventStore.pendingOperations.map((operation) => operation.eventId ?? operation.localId));
    const gCalendarIdSet = new Set(calendarStore.listVisibleCalendars.map((/** @type {any} */ cal) => cal.id));

    // 削除直後のイベントが events.list の反映遅れで復活するのを防ぐ
    const isRecentlyRemoved = isRecentlyRemovedEvent;

    // API 版でローカル保存版を上書きしてよいか。
    // 更新直後のローカル版は updated が新しいため、events.list の反映遅れで古い API 版に戻されるのを防ぐ
    /** @param {Map<string, HandyCalendarEvent>} target @param {HandyCalendarEvent} event */
    const mergeApiEvent = (target, event) => {
      if (pendingEventIds.has(event.id) || isRecentlyRemoved(event)) return;
      const current = target.get(eventKey(event));
      if (current && updatedStampOf(current) > updatedStampOf(event)) return;
      target.set(eventKey(event), event);
    };

    /** @type {{gCalId: string, key: string}[]} API フェッチが必要なカレンダー */
    const fetchTargets = [];
    await Promise.all(
      Array.from(gCalendarIdSet).map(async (gCalId) => {
        const key = `${gCalId}:${year}:${monthIndex}`;
        const storedItems = await storedEventsForMonth(gCalId, year, monthIndex);
        storedItems.forEach((/** @type {HandyCalendarEvent} */ event) => set.set(eventKey(event), event));

        const cached = eventStore.getCachedEntry(key);
        const cachedItems = cached && Array.isArray(cached.items) ? cached.items : null;
        // 期限切れのキャッシュもまず表示に使う（オンラインなら裏で取り直して差し替える）
        if (cachedItems) cachedItems.forEach((/** @type {HandyCalendarEvent} */ event) => mergeApiEvent(set, event));
        const isFresh = cached && Date.now() - cached.at < MONTH_CACHE_TTL_MS;
        if (isFresh || userStore.isOffline || !authStore.token) return;
        fetchTargets.push({ gCalId, key });
      }),
    );

    // 取得が必要なカレンダーはバックグラウンドでまとめてフェッチし、完了後にビューへ通知する。
    // 失敗時は通知しない（通知→再取得の失敗ループを防ぐ）。同じ月の多重フェッチも抑止する
    if (fetchTargets.length > 0) {
      const fetchKey = `${year}:${monthIndex}`;
      if (!monthFetchInFlight.has(fetchKey)) {
        monthFetchInFlight.add(fetchKey);
        void (async () => {
          try {
            if (await fetchMonthEvents(fetchTargets, year, monthIndex, query)) notifyEventDataChanged();
          } finally {
            monthFetchInFlight.delete(fetchKey);
          }
        })();
      }
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
   * メモリキャッシュを期限切れにして現在月の予定を再同期する
   * @param {number} year 取得する年
   * @param {number} monthIndex 取得する月インデックス（0-11）
   * @returns {Promise<HandyCalendarEvent[]>}
   */
  async function syncEvents(year, monthIndex) {
    eventStore.invalidateEventCache();
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
   * イベント API 操作を Web Worker でバックグラウンド実行する。
   * 401 時はトークンを再取得して 1 回だけ再試行する（Worker 内では
   * トークン再取得コールバックが使えないためメインスレッド側で処理する）。
   * @param {'insert'|'update'|'remove'} op 実行する操作
   * @param {...any} args アクセストークン以降の引数
   * @returns {Promise<any>} API レスポンス
   */
  async function runEventApiInBackground(op, ...args) {
    try {
      return await runEventOperation(op, authStore.token, ...args);
    } catch (error) {
      if (/** @type {any} */ (error)?.status !== 401) throw error;
      const { useAuth } = await import('@/composables/useAuth.js');
      const token = await useAuth().fetchToken();
      if (!token) throw error;
      return await runEventOperation(op, token, ...args);
    }
  }

  /**
   * ローカルに保存したイベントをバックグラウンドでサーバへ登録する。
   * 成功時はローカルイベントをサーバ発行 ID のイベントへ差し替え、結果をトーストで通知する。
   * @param {string} localId ローカルイベント ID
   * @param {string} gCalendarId カレンダー ID
   * @param {any} body イベントのペイロード
   * @param {{colorId?: string, backgroundColor?: string, foregroundColor?: string}} calendarColor カレンダーの配色
   * @returns {Promise<HandyCalendarEvent|null>} 作成されたイベント（失敗時は null）
   */
  async function syncCreatedEvent(localId, gCalendarId, body, calendarColor) {
    try {
      const event = await runEventApiInBackground('insert', gCalendarId, body);
      await removeStoredEvent(localId, gCalendarId);
      if (!event) return null;
      const created = { ...toHandyEvent(event, gCalendarId, calendarColor), timeZone: event.start?.timeZone ?? undefined };
      await upsertStoredEvent(created);
      // 詳細画面がローカル ID を指している場合はサーバ ID へ差し替える
      const selected = userStore.nowSelectedEvent;
      if (selected?.eid === localId && selected?.cid === gCalendarId) userStore.setNowSelectedEvent({ eid: created.id, cid: created.calendarId });
      // 作成時の通知は insert 前に出ているため、API 版へ差し替えたことを再通知する
      eventStore.invalidateEventCache();
      notifyEventDataChanged();
      userStore.showToast('予定を保存しました');
      return created;
    } catch (error) {
      console.warn('Event creation could not be synced. Queued for retry.', error);
      queueOperation({ type: 'create', calendarId: gCalendarId, localId, body });
      userStore.showToast('予定の保存に失敗しました。オンライン時に再同期します');
      return null;
    }
  }

  /**
   * イベントの更新をバックグラウンドでサーバへ送信し、結果をトーストで通知する。
   * @param {string} gEventId イベント ID
   * @param {string} gCalendarId カレンダー ID
   * @param {any} body 更新するイベントのペイロード
   * @returns {Promise<void>}
   */
  async function syncUpdatedEvent(gEventId, gCalendarId, body) {
    try {
      const event = await runEventApiInBackground('update', gCalendarId, gEventId, body);
      if (event) {
        const updated = { ...toHandyEvent(event, gCalendarId, calendarStore.getCalendarColor(gCalendarId)), timeZone: event.start?.timeZone ?? undefined };
        await upsertStoredEvent(updated);
      }
      // 更新前の通知は API 反映前に出ているため、サーバー版へ差し替えたことを再通知する
      eventStore.invalidateEventCache();
      notifyEventDataChanged();
      userStore.showToast('予定を保存しました');
    } catch (error) {
      console.warn('Event update could not be synced. Queued for retry.', error);
      queueOperation({ type: 'update', calendarId: gCalendarId, eventId: gEventId, body });
      userStore.showToast('予定の保存に失敗しました。オンライン時に再同期します');
    }
  }

  /**
   * イベントの削除をバックグラウンドでサーバへ送信し、結果をトーストで通知する。
   * @param {string} gEventId イベント ID
   * @param {string} gCalendarId カレンダー ID
   * @returns {Promise<void>}
   */
  async function syncRemovedEvent(gEventId, gCalendarId) {
    try {
      await runEventApiInBackground('remove', gCalendarId, gEventId);
      // 削除前の通知は API 反映前に出ているため、古い一覧で再読込されないよう再通知する
      eventStore.invalidateEventCache();
      notifyEventDataChanged();
      userStore.showToast('予定を削除しました');
    } catch (error) {
      console.warn('Event removal could not be synced. Queued for retry.', error);
      queueOperation({ type: 'remove', calendarId: gCalendarId, eventId: gEventId });
      userStore.showToast('予定の削除に失敗しました。オンライン時に再同期します');
    }
  }

  /**
   * イベントを作成する。ローカル保存と画面反映を先に行い、
   * サーバへの登録は Web Worker のバックグラウンド同期に委譲する。
   * @param {any} body イベントのペイロード
   * @param {string} gCalendarId カレンダー ID
   * @returns {Promise<{event: HandyCalendarEvent, synced: Promise<HandyCalendarEvent|null>}>}
   *   ローカルイベントと、サーバ同期の完了を追跡する Promise（失敗・オフライン時はローカルイベントまたは null）
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
    eventStore.invalidateEventCache();
    notifyEventDataChanged();
    if (userStore.isOffline || !authStore.isAuthenticated) {
      queueOperation({ type: 'create', calendarId: gCalendarId, localId, body });
      return { event: localHandyEvent, synced: Promise.resolve(localHandyEvent) };
    }
    return { event: localHandyEvent, synced: syncCreatedEvent(localId, gCalendarId, body, calendarColor) };
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
    eventStore.invalidateEventCache();
    notifyEventDataChanged();
    if (userStore.isOffline || !authStore.isAuthenticated) {
      queueOperation({ type: 'update', calendarId: gCalendarId, eventId: gEventId, body });
      return true;
    }
    void syncUpdatedEvent(gEventId, gCalendarId, body);
    return true;
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
    /** @type {Awaited<ReturnType<typeof gCalAPI.listEventsBatch>>} */
    let results = [];
    try {
      results = await gCalAPI.listEventsBatch(
        authStore.token,
        calendarStore.list.map((/** @type {any} */ cal) => ({ calendarId: cal.id, query: { q: query, singleEvents: true } })),
      );
    } catch (error) {
      console.warn('Event search failed.', error);
      return [];
    }
    results.forEach((result, index) => {
      if (!result.ok) {
        console.warn('Event search failed for a calendar.', calendarStore.list[index]?.id);
        return;
      }
      const gCalId = calendarStore.list[index].id;
      const calendarColor = calendarStore.getCalendarColor(gCalId);
      result.items.forEach((/** @type {GoogleCalendarEvent} */ evt) => {
        const handy = toHandyEvent(evt, gCalId, calendarColor);
        if (!isCustomHolidayEvent(handy)) found.set(`${handy.calendarId}:${handy.id}`, handy);
      });
    });
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
    eventStore.invalidateEventCache();
    notifyEventDataChanged();
    if (userStore.isOffline || !authStore.isAuthenticated) {
      queueOperation({ type: 'remove', calendarId: gCalendarId, eventId: gEventId });
      return true;
    }
    void syncRemovedEvent(gEventId, gCalendarId);
    return true;
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
