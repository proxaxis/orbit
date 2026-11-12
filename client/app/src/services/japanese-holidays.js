/**
 * 日本の祝日判定ヘルパー（@holiday-jp/holiday_jp）。
 * カレンダー各ビューで祝日の日付を着色するために利用する。
 */
import holiday_jp from '@holiday-jp/holiday_jp';

/**
 * @param {Dayjs|Date} date 対象日（ローカル日付として評価）
 * @returns {boolean} 日本の祝日かどうか
 */
export function isJapaneseHoliday(date) {
  const d = date instanceof Date ? date : date.toDate();
  return holiday_jp.isHoliday(d);
}

/**
 * @param {Dayjs|Date} start 期間の開始（含む）
 * @param {Dayjs|Date} end 期間の終了（含む）
 * @returns {Set<string>} 期間内の祝日の日付キー（YYYY-MM-DD）の集合
 */
export function japaneseHolidayDates(start, end) {
  const s = start instanceof Date ? start : start.toDate();
  const e = end instanceof Date ? end : end.toDate();
  // holiday_jp.between が返す Date は UTC 基準のため、日付キーは UTC 成分から生成する
  return new Set(holiday_jp.between(s, e).map((holiday) => `${holiday.date.getUTCFullYear()}-${String(holiday.date.getUTCMonth() + 1).padStart(2, '0')}-${String(holiday.date.getUTCDate()).padStart(2, '0')}`));
}
