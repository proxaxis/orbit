/**
 * カスタム休日（日付セルのコンテキストメニューから登録する休日）を扱うユーティリティ。
 * 休日は `summary === 'Custom Holiday'` な終日イベントとして Google カレンダーに作成し、
 * `extendedProperties.private.orbitCustomHoliday` マーカーで識別する。
 * カレンダーのイベント描画からは除外し、日付数字の色付けのみに使用する。
 */
import { toDayjs } from '@/services/dayjs.js';

/** @type {string} カスタム休日イベントのタイトル */
export const CUSTOM_HOLIDAY_SUMMARY = 'Custom Holiday';

/** @type {string} カスタム休日を識別する private 拡張プロパティのキー */
export const CUSTOM_HOLIDAY_PROPERTY = 'orbitCustomHoliday';

/**
 * イベントがカスタム休日かどうかを判定する。
 * 作成時に付ける private マーカーに加え、終日イベントかつタイトル一致も休日とみなす。
 * @param {HandyCalendarEvent|GoogleCalendarEvent} evt イベント
 * @returns {boolean} カスタム休日なら true
 */
export function isCustomHolidayEvent(evt) {
  const raw = /** @type {any} */ (evt)?.raw ?? evt;
  if (raw?.extendedProperties?.private?.[CUSTOM_HOLIDAY_PROPERTY] === '1') return true;
  const isAllDay = /** @type {any} */ (evt)?.isAllDay ?? Boolean(raw?.start?.date);
  return Boolean(isAllDay) && (/** @type {any} */ (evt)?.summary ?? raw?.summary) === CUSTOM_HOLIDAY_SUMMARY;
}

/**
 * カスタム休日イベントがカバーする日付キー（YYYY-MM-DD）を列挙する。
 * 終日イベントの end は排他のため start <= d < end の範囲を返す。
 * @param {HandyCalendarEvent} evt カスタム休日イベント
 * @returns {string[]} 日付キーの配列
 */
export function holidayDatesOf(evt) {
  /** @type {string[]} */
  const dates = [];
  let day = evt.startDateTime.startOf('day');
  const end = evt.isAllDay ? evt.endDateTime.startOf('day') : evt.endDateTime;
  for (let i = 0; i < 370 && day.isBefore(end); i += 1) {
    dates.push(day.format('YYYY-MM-DD'));
    day = day.add(1, 'day');
  }
  return dates;
}

/**
 * カスタム休日作成用の Google イベントペイロードを生成する。
 * @param {string} startDateKey 開始日（YYYY-MM-DD、含む）
 * @param {string} endDateKey 終了日（YYYY-MM-DD、含む）
 * @returns {Object} events.insert に渡すイベントボディ
 */
export function buildCustomHolidayBody(startDateKey, endDateKey) {
  return {
    summary: CUSTOM_HOLIDAY_SUMMARY,
    start: { date: startDateKey },
    end: { date: toDayjs(endDateKey).add(1, 'day').format('YYYY-MM-DD') },
    transparency: 'transparent',
    extendedProperties: { private: { [CUSTOM_HOLIDAY_PROPERTY]: '1' } },
    reminders: { useDefault: false },
  };
}
