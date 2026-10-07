import dayjs from '@/services/dayjs.js';
import { readOffline, writeOffline } from '@/services/offline-storage.js';
import { rrulestr } from 'rrule';

/** 通知済みイベントを記録するオフラインストレージのキー */
const NOTIFIED_KEY = 'notified-events';
/** Service Worker 側が参照する今後の通知スケジュールのキー */
const SCHEDULE_KEY = 'notification-schedule';
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
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
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
 * @returns {import('dayjs').Dayjs|null}
 */
export function eventStartOf(evt) {
  const raw = evt?.raw?.start?.dateTime ?? evt?.raw?.start?.date ?? evt?.start?.dateTime ?? evt?.start?.date ?? evt?.startDateTime ?? null;
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = dayjs(raw);
  return parsed.isValid() ? parsed : null;
}

/** @param {import('dayjs').Dayjs} date ローカル壁時計を UTC として解釈した Date に変換する */
function toFakeUtc(date) {
  return new Date(Date.UTC(date.year(), date.month(), date.date(), date.hour(), date.minute(), date.second()));
}

/** @param {Date} date fake-UTC の Date をローカル壁時計の dayjs に戻す */
function fromFakeUtc(date) {
  return dayjs(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()));
}

/**
 * ウィンドウ内のイベント開始日時の一覧を返す。繰り返しイベントは RRULE で展開する。
 * @param {any} evt 保存済みイベント
 * @param {import('dayjs').Dayjs} windowStart スキャン開始
 * @param {import('dayjs').Dayjs} windowEnd スキャン終了
 * @returns {import('dayjs').Dayjs[]}
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
 * @param {import('dayjs').Dayjs} start その回の開始日時
 * @param {number} minutes 何分前の通知か
 * @param {string} key 通知済み管理用キー
 */
async function deliverNotification(evt, start, minutes, key) {
  notifiedKeys.add(key);
  await writeOffline(NOTIFIED_KEY, [...notifiedKeys]);

  const minutesLeft = Math.max(0, start.diff(dayjs(), 'minute'));
  const timingText = minutes > 0 ? `${minutes}分前` : '開始時刻';
  const title = `${evt?.icon ?? '📌'} ${evt?.summary ?? evt?.raw?.summary ?? '予定'}`;
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

  const [storedEvents, storedCalendars, storedNotified] = await Promise.all([readOffline('events', []), readOffline('calendars', []), readOffline(NOTIFIED_KEY, [])]);
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
  await writeOffline(SCHEDULE_KEY, scheduleEntries.slice(0, MAX_SCHEDULE_ENTRIES));

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
async function registerBackgroundSync() {
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.sync) await registration.sync.register('orbit-notifications').catch(() => null);
    if (registration?.periodicSync) {
      const status = await navigator.permissions?.query?.({ name: /** @type {any} */ ('periodic-background-sync') }).catch(() => null);
      if (!status || status.state === 'granted') {
        await registration.periodicSync.register('orbit-notifications', { minInterval: 15 * 60 * 1000 }).catch(() => null);
      }
    }
  } catch {
    // 非対応環境ではバックグラウンド通知なし
  }
}

/** イベント通知のスケジューリングを開始する */
export function initEventNotifications() {
  if (initialized || !notificationsSupported()) return;
  initialized = true;
  readOffline(NOTIFIED_KEY, []).then((keys) => {
    notifiedKeys = new Set(Array.isArray(keys) ? keys : []);
    rescheduleNotifications();
  });
  registerBackgroundSync();
  window.setInterval(rescheduleNotifications, RESCAN_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) rescheduleNotifications();
  });
  window.addEventListener('online', rescheduleNotifications);
}
