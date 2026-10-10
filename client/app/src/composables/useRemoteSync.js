/**
 * 他デバイス等でのリモート変更をバックグラウンドで検出するコンポーザブル。
 * アプリ起動時・タブ復帰時（bfcache 復元を含む）・オンライン復帰時に
 * calendarList の差分と events.list の updatedMin クエリで変更の有無を確認し、
 * 変更があればメモリキャッシュを破棄してビューへ再読込を通知する。
 * UI はブロックせず、変更がない場合は何もしない。
 */
import dayjs from '@/services/dayjs.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useEventStore } from '@/stores/event.js';
import { useUserStore } from '@/stores/user.js';
import { CACHE_KEYS, readCache, writeCache } from '@/composables/useCache.js';
import { notifyEventDataChanged } from '@/composables/useEvents.js';
import { useCalendars } from '@/composables/useCalendars.js';

/** @type {boolean} 初期化済みフラグ */
let syncInitialized = false;

/** @type {boolean} チェック実行中フラグ（重複実行の抑止） */
let checkRunning = false;

/** @type {number} 最後にチェックを実行した時刻（頻繁なトリガのまとめ用） */
let lastCheckRunAt = 0;

/** @type {number} チェック実行の最小間隔 */
const CHECK_MIN_INTERVAL_MS = 60 * 1000;

/** @type {number} 起動中でも他デバイスの変更を拾うための定期チェック間隔 */
const PERIODIC_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * カレンダーリストの比較用文字列。etag があれば本体の変更を含めて検出できる。
 * @param {GoogleCalendarListEntry[]} entries カレンダーリストエントリ
 * @returns {string} フィンガープリント
 */
function calendarListFingerprint(entries) {
  return entries
    .map((entry) => [entry.id, entry.etag ?? '', entry.colorId ?? '', entry.backgroundColor ?? '', entry.hidden ? 1 : 0, entry.selected === false ? 0 : 1].join(':'))
    .sort()
    .join('|');
}

/**
 * カレンダー一覧に変更があるか確認し、あればストアへ反映する。
 * @returns {Promise<boolean>} 変更があったか
 */
async function checkCalendarListChanges() {
  const authStore = useAuthStore();
  const calendarStore = useCalendarStore();
  const response = await gCalAPI.listCalendarList(authStore.token);
  const listEntries = Array.isArray(response?.items) ? response.items : [];
  // セッションカレンダーは calendarList に含まれないため比較対象から除く
  const ownCalendars = calendarStore.list.filter((/** @type {any} */ calendar) => !calendar.session);
  if (calendarListFingerprint(ownCalendars) === calendarListFingerprint(listEntries)) return false;
  // アカウント切替の検出と前アカウント由来キャッシュの破棄を先に行う
  await useCalendars().syncAccountIdentity(listEntries);
  calendarStore.setCalendars(listEntries);
  return true;
}

/**
 * 全カレンダーのイベントを差分確認する。前回チェック時刻が無い（初回）場合は
 * ビュー側の通常取得が走るためチェックをスキップする。
 * カレンダーごとの events.list は BFF バッチでまとめて発行する。
 * @returns {Promise<boolean>} 変更があったか
 */
async function checkEventUpdates() {
  const authStore = useAuthStore();
  const calendarStore = useCalendarStore();
  const since = await readCache(CACHE_KEYS.REMOTE_SYNC_CHECKED_AT, null);
  if (!since) return false;
  try {
    const results = await gCalAPI.listEventsBatch(
      authStore.token,
      calendarStore.list.map((/** @type {any} */ calendar) => ({ calendarId: calendar.id, query: { updatedMin: since, showDeleted: true } })),
    );
    return results.some((result) => result.ok && result.items.length > 0);
  } catch (error) {
    console.warn('Remote event change check failed.', error);
    return false;
  }
}

/**
 * リモートの変更を確認し、あればキャッシュを破棄してビューの再読込を通知する。
 * 未認証・オフライン・実行中・最小間隔未満の呼び出しはスキップする。
 * @param {boolean} [force] true なら最小間隔を無視して即時チェックする（手動同期など）
 * @returns {Promise<void>}
 */
export async function checkRemoteChanges(force = false) {
  const authStore = useAuthStore();
  const userStore = useUserStore();
  if (checkRunning || !authStore.isAuthenticated || !authStore.token || userStore.isOffline) return;
  if (!force && Date.now() - lastCheckRunAt < CHECK_MIN_INTERVAL_MS) return;
  checkRunning = true;
  lastCheckRunAt = Date.now();
  try {
    // 差分クエリの起点はチェック開始時刻にする（終了時刻だとチェック中の変更を取りこぼす）
    const checkedAt = dayjs().toISOString();
    const [calendarsChanged, eventsChanged] = await Promise.all([checkCalendarListChanges(), checkEventUpdates()]);
    if (calendarsChanged || eventsChanged) {
      // items は残して期限切れにする（空キャッシュからの中間描画によるちらつき防止）
      useEventStore().invalidateEventCache();
      notifyEventDataChanged();
    }
    await writeCache(CACHE_KEYS.REMOTE_SYNC_CHECKED_AT, checkedAt);
  } catch (error) {
    console.warn('Remote change check failed.', error);
  } finally {
    checkRunning = false;
  }
}

/**
 * リモート変更チェックを開始する。アプリ起動時に一度だけ呼ぶ。
 * 起動直後のほか、タブ復帰・bfcache 復元・オンライン復帰・定期タイマーでも実行する。
 * @returns {void}
 */
export function initRemoteChangeSync() {
  if (syncInitialized || typeof window === 'undefined') return;
  syncInitialized = true;

  window.addEventListener('online', checkRemoteChanges);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkRemoteChanges();
  });
  window.addEventListener('pageshow', (event) => {
    // bfcache から復元された場合はメモリキャッシュが古いため再確認する
    if (event.persisted) checkRemoteChanges();
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible') checkRemoteChanges();
  }, PERIODIC_CHECK_INTERVAL_MS);
}
