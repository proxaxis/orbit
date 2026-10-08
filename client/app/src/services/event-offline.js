/**
 * イベントのオフライン保存・操作キュー処理を担当する純粋モジュール。
 * Vue / Pinia に依存しないため、ページ側のコンポーザブルと
 * Service Worker（src/sw.js）のバックグラウンド同期の両方から利用できる。
 */
import dayjs from '@/services/dayjs.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import { CACHE_KEYS, readCache, writeCache } from '@/composables/useCache.js';

/**
 * @typedef {Object} EventOperation
 * @property {'create'|'update'|'remove'} type 操作の種類
 * @property {string} calendarId カレンダーID
 * @property {string} [eventId] イベントID（update/removeの場合）
 * @property {string} [localId] ローカルイベントID（createの場合）
 * @property {Object} [body] イベントのペイロード（create/updateの場合）
 */

/**
 * オフライン保存されたイベントを読み込む。日時は Dayjs に復元する。
 * @returns {Promise<any[]>}
 */
export async function getStoredEvents() {
  const events = await readCache(CACHE_KEYS.EVENTS, []);
  return events.map((/** @type {any} */ evt) => ({
    ...evt,
    startDateTime: dayjs(evt.startDateTime),
    endDateTime: dayjs(evt.endDateTime),
  }));
}

/**
 * オフラインイベント一覧を保存する
 * @param {any[]} events 保存するイベント一覧
 * @returns {Promise<void>}
 */
export async function saveStoredEvents(events) {
  await writeCache(CACHE_KEYS.EVENTS, events);
}

/**
 * オフラインイベントを追加または更新する
 * @param {any} event 保存するイベント
 * @returns {Promise<void>}
 */
export async function upsertStoredEvent(event) {
  const events = (await getStoredEvents()).filter((/** @type {any} */ item) => !(item.id === event.id && item.calendarId === event.calendarId));
  events.push(event);
  await saveStoredEvents(events);
}

/**
 * オフラインイベントを削除する
 * @param {string} eventId イベントID
 * @param {string} calendarId カレンダーID
 * @returns {Promise<void>}
 */
export async function removeStoredEvent(eventId, calendarId) {
  const events = await getStoredEvents();
  await saveStoredEvents(events.filter((/** @type {any} */ item) => !(item.id === eventId && item.calendarId === calendarId)));
}

/**
 * 指定のカレンダー・年月のオフライン保存イベントを返す
 * @param {string} calendarId カレンダーID
 * @param {number} year 年
 * @param {number} monthIndex 月インデックス（0-11）
 * @returns {Promise<any[]>}
 */
export async function storedEventsForMonth(calendarId, year, monthIndex) {
  const events = await getStoredEvents();
  const monthStart = dayjs().year(year).month(monthIndex).date(1).startOf('day');
  const monthEnd = monthStart.add(1, 'month');
  return events.filter((/** @type {any} */ evt) => {
    if (evt.calendarId !== calendarId) return false;
    return evt.startDateTime.isBefore(monthEnd) && evt.endDateTime.isAfter(monthStart);
  });
}

/**
 * 操作キューエントリの形式を検証する
 * @param {EventOperation|any} operation 検証する操作
 * @returns {boolean} 有効な操作かどうか
 */
export function isValidOperation(operation) {
  if (!operation || !operation.type || !operation.calendarId) return false;
  if ((operation.type === 'update' || operation.type === 'remove') && !operation.eventId) return false;
  if (operation.type === 'create' && (!operation.localId || !operation.body)) return false;
  return true;
}

/**
 * 保留中のイベント操作キューを読み込む
 * @returns {Promise<EventOperation[]>}
 */
export async function readEventOperations() {
  const operations = await readCache(CACHE_KEYS.EVENT_OPERATIONS, []);
  return Array.isArray(operations) ? operations.filter(isValidOperation) : [];
}

/**
 * 保留中のイベント操作キューを保存する
 * @param {EventOperation[]} operations 操作一覧
 * @returns {Promise<void>}
 */
export async function writeEventOperations(operations) {
  await writeCache(CACHE_KEYS.EVENT_OPERATIONS, operations);
}

/**
 * 保留中のイベント操作を API で再生し、失敗した操作だけを残す。
 * オフラインで作成したローカルイベントは、作成成功時にサーバ発行 ID のイベントへ差し替える。
 * @param {EventOperation[]} operations 再生する操作一覧
 * @param {string} token Google API アクセストークン
 * @returns {Promise<{remaining: EventOperation[], synced: boolean}>} 残った操作と少なくとも1件同期できたか
 */
export async function processEventOperations(operations, token) {
  /** @type {EventOperation[]} */
  const remaining = [];
  let synced = false;
  if (!token) return { remaining: [...operations], synced };

  for (const operation of operations) {
    try {
      if (operation.type === 'create') {
        const result = await gCalAPI.insertEvent(token, operation.calendarId, operation.body ?? {});
        if (result?.id && operation.localId) {
          /** @type {any} ローカル保存済みのイベント */
          const local = (await getStoredEvents()).find((/** @type {any} */ event) => event.id === operation.localId);
          if (local) {
            await removeStoredEvent(operation.localId, operation.calendarId);
            // API レスポンスは Google 形式（start/end）なので、表示モデルの日時フィールドは明示的に復元する
            await upsertStoredEvent({
              ...local,
              ...result,
              calendarId: operation.calendarId,
              startDateTime: result.start?.dateTime ?? result.start?.date ?? local.startDateTime,
              endDateTime: result.end?.dateTime ?? result.end?.date ?? local.endDateTime,
            });
          }
        }
      } else if (operation.type === 'update') {
        await gCalAPI.updateEvent(token, operation.calendarId, operation.eventId ?? '', operation.body ?? {});
      } else if (operation.type === 'remove') {
        await gCalAPI.deleteEvent(token, operation.calendarId, operation.eventId ?? '');
      }
      synced = true;
    } catch (error) {
      console.warn('Offline event operation is still pending.', error);
      remaining.push(operation);
    }
  }
  return { remaining, synced };
}
