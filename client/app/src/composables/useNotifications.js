/**
 * イベント通知のスケジューリングを担うコンポーザブル。
 * ページ側ではタイマーで通知を配信し、アプリ未起動時は
 * Service Worker のバックグラウンド同期にスケジュールを委譲する。
 */
import dayjs from '@/services/dayjs.js';
import { rrulestr } from 'rrule';
import { CACHE_KEYS, SYNC_TAGS, readCache, registerBackgroundSync, registerPeriodicBackgroundSync, writeCache } from '@/composables/useCache.js';
import { ensurePushSubscription, syncPushSchedule } from '@/composables/usePushNotifications.js';

/** スケジュールに保存する通知エントリの上限 */
const MAX_SCHEDULE_ENTRIES = 200;
/** 発火済みかどうかの再スキャン間隔 */
const RESCAN_INTERVAL_MS = 60_000;
/** setTimeout の最大遅延（32bit 上限を少し下回る値） */
const MAX_TIMER_DELAY_MS = 2_000_000_000;
/** 繰り返しイベントの展開・通知スキャンを行う先読み期間 */
const SCAN_WINDOW_DAYS = 45;
/** Google Calendar API のリマインダー上限 */
const MAX_REMINDER_MINUTES = 40320;
/** バックグラウンド通知の定期同期の最小間隔 */
const PERIODIC_SYNC_INTERVAL_MS = 15 * 60 * 1000;

/** @type {boolean} 初期化済みかどうか */
let initialized = false;
/** @type {number|null} 次の通知発火タイマー */
let scanTimer = null;
/** @type {Set<string>} 既に通知を送ったキー */
let notifiedKeys = new Set();

/**
 * 通知 API が利用可能かどうか
 * @returns {boolean}
 */
export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * 現在の通知許可状態を返す
 * @returns {'unsupported'|NotificationPermission}
 */
export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

/**
 * 通知の許可を要求する（ユーザーの操作イベント内で呼ぶこと）
 * @returns {Promise<'unsupported'|NotificationPermission>}
 */
export async function ensureNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') {
    // 許可済みならモバイル向けのプッシュ購読も確保する
    ensurePushSubscription().then(() => rescheduleNotifications());
    return 'granted';
  }
  if (Notification.permission === 'denied') return 'denied';
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      await ensurePushSubscription();
      rescheduleNotifications();
    }
    return result;
  } catch {
    return Notification.permission;
  }
}

/**
 * イベントが持つ通知タイミング（開始何分前か）の一覧を返す。
 * useDefault の場合はカレンダーのデフォルトリマインダーを使う。
 * @param {any} evt 保存済みイベント
 * @param {any} calendar イベントのカレンダーリストエントリ
 * @returns {number[]} 通知までの分数一覧
 */
export function reminderMinutesOf(evt, calendar) {
  const reminders = evt?.raw?.reminders ?? evt?.reminders;
  if (reminders && reminders.useDefault === false) {
    if (!Array.isArray(reminders.overrides)) return [];
    return reminders.overrides
      .filter((/** @type {any} */ override) => typeof override?.minutes === 'number' && override.minutes >= 0)
      .map((/** @type {any} */ override) => Math.min(MAX_REMINDER_MINUTES, Math.floor(override.minutes)))
      .slice(0, 5);
  }
  // カレンダー既定のリマインダー（popup のみアプリ内通知として扱う）
  if (Array.isArray(calendar?.defaultReminders)) {
    return calendar.defaultReminders
      .filter((/** @type {any} */ reminder) => reminder?.method === 'popup' && typeof reminder?.minutes === 'number' && reminder.minutes >= 0)
      .map((/** @type {any} */ reminder) => Math.min(MAX_REMINDER_MINUTES, Math.floor(reminder.minutes)))
      .slice(0, 5);
  }
  return [];
}

/**
 * イベントの開始日時を解析する。オフライン作成イベントは body 形式を持つため両方を見る。
 * @param {any} evt 保存済みイベント
 * @returns {Dayjs|null}
 */
export function eventStartOf(evt) {
  const raw = evt?.raw?.start?.dateTime ?? evt?.raw?.start?.date ?? evt?.start?.dateTime ?? evt?.start?.date ?? evt?.startDateTime ?? null;
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = dayjs(raw);
  return parsed.isValid() ? parsed : null;
}

/**
 * ローカル壁時計を UTC として解釈した Date に変換する（rrule 展開のための補助関数）
 * @param {Dayjs} date 変換する日時
 * @returns {Date}
 */
function toFakeUtc(date) {
  return new Date(Date.UTC(date.year(), date.month(), date.date(), date.hour(), date.minute(), date.second()));
}

/**
 * fake-UTC の Date をローカル壁時計の dayjs に戻す
 * @param {Date} date 変換する日時
 * @returns {Dayjs}
 */
function fromFakeUtc(date) {
  return dayjs(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()));
}

/**
 * ウィンドウ内のイベント開始日時の一覧を返す。繰り返しイベントは RRULE で展開する。
 * @param {any} evt 保存済みイベント
 * @param {Dayjs} windowStart スキャン開始
 * @param {Dayjs} windowEnd スキャン終了
 * @returns {Dayjs[]}
 */
export function occurrenceStarts(evt, windowStart, windowEnd) {
  const start = eventStartOf(evt);
  if (!start) return [];
  const recurrence = evt?.raw?.recurrence ?? evt?.recurrence;
  if (!Array.isArray(recurrence) || recurrence.length === 0) return [start];

  try {
    // rrule は UTC ベースで動作するため、ローカル時刻を UTC として与えて壁時計ベースで展開する
    const options = { dtstart: toFakeUtc(start) };
    let rule;
    try {
      rule = rrulestr(recurrence.join('\n'), options);
    } catch {
      rule = rrulestr(recurrence.find((/** @type {string} */ line) => typeof line === 'string' && line.startsWith('RRULE:')) ?? '', options);
    }
    return rule.between(toFakeUtc(windowStart), toFakeUtc(windowEnd), true).map(fromFakeUtc);
  } catch (error) {
    console.warn('Failed to expand recurrence for notifications.', error);
    return [start];
  }
}

/**
 * 通知を送信する
 * @param {any} evt イベント
 * @param {Dayjs} start その回の開始日時
 * @param {number} minutes 何分前の通知か
 * @param {string} key 通知済み管理用キー
 * @returns {Promise<void>}
 */
async function deliverNotification(evt, start, minutes, key) {
  notifiedKeys.add(key);
  await writeCache(CACHE_KEYS.NOTIFIED_EVENTS, [...notifiedKeys]);

  const minutesLeft = Math.max(0, start.diff(dayjs(), 'minute'));
  const timingText = minutes > 0 ? `${minutes}分前` : '開始時刻';
  const title = `${evt?.icon ?? ''} ${evt?.summary ?? evt?.raw?.summary ?? '予定'}`;
  const body = `${start.format('M月D日 (ddd) HH:mm')} 開始（${timingText} / あと${minutesLeft}分）`;
  const options = {
    body,
    tag: `orbit-event-${key}`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // 通知タップ時にイベント詳細ページを開くための情報
    data: {
      eid: evt?.id ?? null,
      cid: evt?.calendarId ?? null,
      url: `${import.meta.env.BASE_URL}evt/detail?eid=${encodeURIComponent(evt?.id ?? '')}&cid=${encodeURIComponent(evt?.calendarId ?? '')}`,
    },
  };

  try {
    /** @type {ServiceWorkerRegistration|null} 登録済みの Service Worker */
    const registration = (await navigator.serviceWorker?.getRegistration?.()) ?? (await navigator.serviceWorker?.ready);
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
      return;
    }
  } catch (error) {
    console.warn('Service Worker notification failed. Falling back to window Notification.', error);
  }
  try {
    new Notification(title, options);
  } catch (error) {
    console.warn('Notification could not be shown.', error);
  }
}

/**
 * 保存済みイベントをスキャンし、期限の来た通知を送信して次回のタイマーをセットする。
 * @returns {Promise<void>}
 */
export async function rescheduleNotifications() {
  if (!initialized || notificationPermission() !== 'granted') return;
  if (scanTimer !== null) {
    window.clearTimeout(scanTimer);
    scanTimer = null;
  }

  const now = dayjs();
  const windowStart = now;
  const windowEnd = now.add(SCAN_WINDOW_DAYS, 'day');
  /** @type {number|null} 次に発火する通知までの遅延（ms） */
  let nextDelay = null;
  /** @type {Array<{key: string, fireAt: number, start: number, eid: string, cid: string, summary: string, icon: string|null, minutes: number}>} Service Worker のバックグラウンド配信が参照するスケジュール */
  const scheduleEntries = [];

  const [storedEvents, storedCalendars, storedNotified] = await Promise.all([readCache(CACHE_KEYS.EVENTS, []), readCache(CACHE_KEYS.CALENDARS, []), readCache(CACHE_KEYS.NOTIFIED_EVENTS, [])]);
  // Service Worker 側で配信済みの通知を取り込んで二重通知を防ぐ
  notifiedKeys = new Set([...notifiedKeys, ...(Array.isArray(storedNotified) ? storedNotified : [])]);
  const calendarMap = new Map((Array.isArray(storedCalendars) ? storedCalendars : []).map((/** @type {any} */ cal) => [cal.id, cal]));

  for (const evt of Array.isArray(storedEvents) ? storedEvents : []) {
    if (!evt?.id || !evt?.calendarId) continue;
    const minutesList = reminderMinutesOf(evt, calendarMap.get(evt.calendarId));
    if (!minutesList.length) continue;

    for (const start of occurrenceStarts(evt, windowStart, windowEnd)) {
      for (const minutes of minutesList) {
        const notifyAt = start.subtract(minutes, 'minute');
        const key = `${evt.calendarId}|${evt.id}|${start.unix()}|${minutes}`;
        if (notifiedKeys.has(key)) continue;
        if (notifyAt.isAfter(now)) {
          const delay = notifyAt.diff(now);
          if (nextDelay === null || delay < nextDelay) nextDelay = delay;
          scheduleEntries.push({
            key,
            fireAt: notifyAt.valueOf(),
            start: start.valueOf(),
            eid: evt.id,
            cid: evt.calendarId,
            summary: evt.summary ?? evt.raw?.summary ?? '',
            icon: evt.icon ?? null,
            minutes,
          });
        } else if (start.isAfter(now)) {
          // アプリを閉じている間に通知時刻を過ぎたが、イベントはまだ始まっていない
          await deliverNotification(evt, start, minutes, key);
        }
      }
    }
  }

  scheduleEntries.sort((a, b) => a.fireAt - b.fireAt);
  const limitedEntries = scheduleEntries.slice(0, MAX_SCHEDULE_ENTRIES);
  await writeCache(CACHE_KEYS.NOTIFICATION_SCHEDULE, limitedEntries);
  // モバイル端末でアプリが閉じていても届くよう、購読情報とスケジュールを BFF へ送る
  syncPushSchedule(limitedEntries);

  if (nextDelay !== null) {
    scanTimer = window.setTimeout(
      () => {
        scanTimer = null;
        rescheduleNotifications();
      },
      Math.min(nextDelay, MAX_TIMER_DELAY_MS),
    );
  }
}

/**
 * Service Worker がアプリ未起動時に通知を配信できるよう、Background Sync / Periodic Background Sync を登録する。
 * 非対応ブラウザでは無視される（ページ側のタイマーが引き続き通知を担当する）。
 * @returns {Promise<void>}
 */
async function registerNotificationBackgroundSync() {
  await registerBackgroundSync(SYNC_TAGS.NOTIFICATIONS);
  await registerPeriodicBackgroundSync(SYNC_TAGS.NOTIFICATIONS, PERIODIC_SYNC_INTERVAL_MS);
}

/** 通知済みイベントの記録を破棄する（アカウント切替時などに使用） */
export function resetNotificationHistory() {
  notifiedKeys = new Set();
}

/** イベント通知のスケジューリングを開始する */
export function initEventNotifications() {
  if (initialized || !notificationsSupported()) return;
  initialized = true;
  readCache(CACHE_KEYS.NOTIFIED_EVENTS, []).then((keys) => {
    notifiedKeys = new Set(Array.isArray(keys) ? keys : []);
    rescheduleNotifications();
  });
  // 既に通知許可済みならモバイル向けのプッシュ購読を確保する
  if (notificationPermission() === 'granted') ensurePushSubscription();
  registerNotificationBackgroundSync();
  window.setInterval(rescheduleNotifications, RESCAN_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) rescheduleNotifications();
  });
  window.addEventListener('online', rescheduleNotifications);
}
