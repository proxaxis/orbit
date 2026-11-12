/**
 * タスクイベントの拡張プロパティ読み書き・日次集計・持ち越し計算を担う純粋モジュール。
 * タスクは通常の Google カレンダーイベントに shared 拡張プロパティを付けて表現する。
 * - orbitIsTask: '1' のときタスク
 * - orbitTaskStatus: 'not-started' | 'in-progress' | 'pending' | 'completed' | カスタム文字列
 * - orbitTaskDeferred: '1' のとき未完了タスクを翌日へ自動で持ち越す
 * Vue / Pinia に依存しないため、ページ側と Service Worker の両方から利用できる。
 */
import dayjs from '@/services/dayjs.js';

/** @type {string} イベントがタスクかどうかを保持する shared 拡張プロパティのキー */
export const TASK_IS_TASK_PROPERTY = 'orbitIsTask';
/** @type {string} タスクのステータスを保持する shared 拡張プロパティのキー */
export const TASK_STATUS_PROPERTY = 'orbitTaskStatus';
/** @type {string} 未完了時に翌日へ持ち越すかどうかを保持する shared 拡張プロパティのキー */
export const TASK_DEFERRED_PROPERTY = 'orbitTaskDeferred';

/** @type {string[]} フォーム送信時に削除候補として扱うタスク関連キーの一覧 */
export const TASK_SHARED_PROPERTY_KEYS = [TASK_IS_TASK_PROPERTY, TASK_STATUS_PROPERTY, TASK_DEFERRED_PROPERTY];

export const TASK_STATUS_NOT_STARTED = 'not-started';
export const TASK_STATUS_IN_PROGRESS = 'in-progress';
export const TASK_STATUS_PENDING = 'pending';
export const TASK_STATUS_COMPLETED = 'completed';

/** @type {string[]} 既定のタスクステータス（この他にカスタム文字列も許可する） */
export const TASK_STATUSES = [TASK_STATUS_NOT_STARTED, TASK_STATUS_IN_PROGRESS, TASK_STATUS_PENDING, TASK_STATUS_COMPLETED];

/** @type {string[]} 終日タスクの通知時刻（ユーザー設定が無い場合の既定値。'HH:mm'） */
export const DEFAULT_TASK_NOTIFICATION_TIMES = ['09:00'];

/**
 * イベントがタスクかどうか
 * @param {HandyCalendarEvent|GoogleCalendarEvent|any} evt イベント
 * @returns {boolean}
 */
export function isTaskEvent(evt) {
  const value = evt?.raw?.extendedProperties?.shared?.[TASK_IS_TASK_PROPERTY] ?? evt?.extendedProperties?.shared?.[TASK_IS_TASK_PROPERTY];
  return value === '1' || value === 'true';
}

/**
 * タスクステータス文字列を正規化する
 * @param {unknown} value ステータス候補
 * @param {string} [fallback] 無効なときの既定値
 * @returns {string} 正規化されたステータス
 */
export function normalizeTaskStatus(value, fallback = TASK_STATUS_NOT_STARTED) {
  const status = typeof value === 'string' ? value.trim() : '';
  return status || fallback;
}

/**
 * イベントのタスクステータスを返す（タスクでなくても既定値を返す）
 * @param {any} evt イベント
 * @returns {string} タスクステータス
 */
export function taskStatusOf(evt) {
  return normalizeTaskStatus(evt?.raw?.extendedProperties?.shared?.[TASK_STATUS_PROPERTY] ?? evt?.extendedProperties?.shared?.[TASK_STATUS_PROPERTY]);
}

/**
 * 未完了時に翌日へ持ち越す設定かどうか
 * @param {any} evt イベント
 * @returns {boolean}
 */
export function isTaskDeferred(evt) {
  const value = evt?.raw?.extendedProperties?.shared?.[TASK_DEFERRED_PROPERTY] ?? evt?.extendedProperties?.shared?.[TASK_DEFERRED_PROPERTY];
  return value === '1' || value === 'true';
}

/**
 * タスクが完了済みかどうか
 * @param {any} evt イベント
 * @returns {boolean}
 */
export function isTaskCompleted(evt) {
  return isTaskEvent(evt) && taskStatusOf(evt) === TASK_STATUS_COMPLETED;
}

/**
 * タスクステータスの表示ラベルを返す。カスタムステータスはそのまま表示する
 * @param {string} status タスクステータス
 * @returns {string} 表示ラベル
 */
export function taskStatusLabel(status) {
  switch (status) {
    case TASK_STATUS_NOT_STARTED:
      return '未着手';
    case TASK_STATUS_IN_PROGRESS:
      return '進行中';
    case TASK_STATUS_PENDING:
      return '保留';
    case TASK_STATUS_COMPLETED:
      return '完了';
    default:
      return String(status ?? '');
  }
}

/**
 * タスク用の shared 拡張プロパティ一式を生成する
 * @param {{status?: string, isDeferred?: boolean}} options タスクの設定
 * @returns {Record<string, string>} shared 拡張プロパティ
 */
export function buildTaskSharedProperties({ status, isDeferred } = {}) {
  return {
    [TASK_IS_TASK_PROPERTY]: '1',
    [TASK_STATUS_PROPERTY]: normalizeTaskStatus(status),
    [TASK_DEFERRED_PROPERTY]: isDeferred ? '1' : '0',
  };
}

/**
 * タスクプロパティの変更を現在のユーザーへ許可するかどうか。
 * カレンダー書き込み権限・イベント主催者・編集を許可された招待者（guestsCanModify）の
 * いずれかに当てはまれば変更できる。
 * @param {HandyCalendarEvent|any} evt イベント
 * @param {Set<string>|string[]|null|undefined} writableCalendarIds 書き込み可能なカレンダー ID の一覧
 * @returns {boolean}
 */
export function canEditTaskProperties(evt, writableCalendarIds) {
  if (!evt) return false;
  const ids = writableCalendarIds instanceof Set ? writableCalendarIds : new Set(writableCalendarIds ?? []);
  if (ids.has(evt.calendarId)) return true;
  if (evt.raw?.organizer?.self === true) return true;
  return evt.raw?.guestsCanModify === true && (evt.raw?.attendees ?? []).some((/** @type {any} */ attendee) => attendee?.self === true);
}

/**
 * イベントが指定の日に重なるかどうか（終日イベントの end.date は排他として扱う）
 * @param {any} evt イベント
 * @param {Dayjs} day 判定する日
 * @returns {boolean}
 */
export function eventOverlapsDay(evt, day) {
  const dayStart = day.startOf('day');
  const dayEnd = dayStart.add(1, 'day');
  return evt.startDateTime.isBefore(dayEnd) && evt.endDateTime.isAfter(dayStart);
}

/**
 * 指定の日に重なるタスクイベントの一覧を返す
 * @param {any[]} events イベント一覧
 * @param {Dayjs} day 対象の日
 * @returns {any[]} タスクイベントの一覧
 */
export function tasksOverlappingDay(events, day) {
  return (events ?? []).filter((evt) => isTaskEvent(evt) && eventOverlapsDay(evt, day));
}

/**
 * 指定の日に重なる未完了タスクの件数を返す（カレンダーセルの「タスク +N」表示用）
 * @param {any[]} events イベント一覧
 * @param {Dayjs} day 対象の日
 * @returns {number} 未完了タスク数
 */
export function unfinishedTaskCountForDay(events, day) {
  return tasksOverlappingDay(events, day).filter((evt) => !isTaskCompleted(evt)).length;
}

/**
 * 未完了タスクの持ち越し用 PATCH ボディ（start/end のみ）を生成する。
 * イベントの終了が今日の開始以前に完全に過ぎているタスクのみ対象とし、
 * 期間を保ったまま開始日が今日になるよう日付をシフトする。
 * @param {any} evt タスクイベント
 * @param {Dayjs} today 今日（時刻は無視する）
 * @returns {{start: Object, end: Object}|null} 持ち越し不要・対象外のとき null
 */
export function buildTaskDeferralPatch(evt, today) {
  if (!isTaskEvent(evt) || !isTaskDeferred(evt) || isTaskCompleted(evt)) return null;
  const todayStart = today.startOf('day');
  // 今日以降にも残っているタスク（期間中・今日以降終了）は持ち越さない
  if (!evt.endDateTime || evt.endDateTime.isAfter(todayStart)) return null;
  const deltaDays = todayStart.diff(evt.startDateTime.startOf('day'), 'day');
  if (deltaDays <= 0) return null;
  const newStart = evt.startDateTime.add(deltaDays, 'day');
  const newEnd = evt.endDateTime.add(deltaDays, 'day');
  if (evt.isAllDay || evt.raw?.start?.date) {
    return { start: { date: newStart.format('YYYY-MM-DD') }, end: { date: newEnd.format('YYYY-MM-DD') } };
  }
  const timeZone = evt.raw?.start?.timeZone ?? evt.timeZone;
  return {
    start: { dateTime: newStart.toISOString(), ...(timeZone ? { timeZone } : {}) },
    end: { dateTime: newEnd.toISOString(), ...(timeZone ? { timeZone } : {}) },
  };
}

/**
 * 終日タスクの通知時刻（'HH:mm'）一覧を正規化する。重複は除いて昇順で返す
 * @param {unknown} input 時刻候補の一覧
 * @returns {string[]} 'HH:mm' 形式の時刻一覧
 */
export function normalizeTaskNotificationTimes(input) {
  const values = Array.isArray(input) ? input : [];
  /** @type {Set<string>} */
  const times = new Set();
  for (const value of values) {
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? '').trim());
    if (match) times.add(`${match[1].padStart(2, '0')}:${match[2]}`);
  }
  return [...times].sort();
}

/**
 * 終日タスクのまとめ通知（ダイジェスト）用スケジュールエントリを構築する。
 * 「日付 × 通知時刻」ごとに、その日に重なる未完了終日タスクを 1 件の通知へ集約する。
 * start にはその日の終わりを入れる（Service Worker 側の「開始済みは通知しない」判定を
 * 通すため。fireAt を過ぎても当日中なら配信対象になる）。
 * @param {any[]} events 保存済みイベント一覧
 * @param {Dayjs} windowStart 対象期間の開始
 * @param {Dayjs} windowEnd 対象期間の終了
 * @param {string[]} times 通知時刻（'HH:mm'）の一覧
 * @param {(evt: any, start: Dayjs, end: Dayjs) => Dayjs[]} occurrenceStartsFn 繰り返し展開関数（useNotifications.occurrenceStarts）
 * @returns {Array<{key: string, fireAt: number, start: number, eid: string, cid: string, summary: string, icon: string|null, minutes: number, title: string, body: string}>} 通知スケジュールエントリ
 */
export function buildAllDayTaskDigestEntries(events, windowStart, windowEnd, times, occurrenceStartsFn) {
  const notifyTimes = normalizeTaskNotificationTimes(times);
  /** @type {Map<string, {date: Dayjs, time: string, tasks: any[]}>} 日付+時刻ごとの集約スロット */
  const slots = new Map();
  for (const evt of events ?? []) {
    if (!isTaskEvent(evt) || isTaskCompleted(evt)) continue;
    if (!(evt?.isAllDay || evt?.raw?.start?.date)) continue;
    const durationDays = Math.max(1, dayjs(evt.endDateTime).diff(evt.startDateTime, 'day'));
    for (const occStart of occurrenceStartsFn(evt, windowStart, windowEnd)) {
      // 終日イベントの end は排他のため、最終日は開始 + durationDays - 1
      for (let offset = 0; offset < durationDays; offset++) {
        const date = occStart.add(offset, 'day').startOf('day');
        if (date.isBefore(windowStart, 'day') || date.isAfter(windowEnd, 'day')) continue;
        for (const time of notifyTimes) {
          const key = `task-digest|${date.format('YYYY-MM-DD')}|${time}`;
          let slot = slots.get(key);
          if (!slot) {
            slot = { date, time, tasks: [] };
            slots.set(key, slot);
          }
          slot.tasks.push(evt);
        }
      }
    }
  }
  /** @type {Array<any>} */
  const entries = [];
  for (const [key, slot] of slots) {
    const [hour, minute] = slot.time.split(':').map(Number);
    const summaries = slot.tasks.map((evt) => evt.summary ?? evt.raw?.summary ?? 'タスク');
    entries.push({
      key,
      fireAt: slot.date.hour(hour).minute(minute).second(0).millisecond(0).valueOf(),
      start: slot.date.endOf('day').valueOf(),
      eid: slot.tasks[0]?.id ?? '',
      cid: slot.tasks[0]?.calendarId ?? '',
      summary: summaries.join('、'),
      icon: '📋',
      minutes: 0,
      title: `タスク（${slot.tasks.length}件）`,
      body: `${slot.date.format('M月D日 (ddd)')}のタスク: ${summaries.join('、')}`,
    });
  }
  return entries;
}
