import dayjs from 'dayjs';
import 'dayjs/locale/ja';

dayjs.locale('ja');

/**
 * 日付を dayjs オブジェクトに変換
 * @param {number|string|Date} [arg1] 年、日付文字列、または Date オブジェクト
 * @param {number} [arg2] 月インデックス (0~11)
 * @param {number} [arg3] 日
 * @returns {dayjs.Dayjs}
 */
export function toDayjs(arg1 = undefined, arg2 = undefined, arg3 = undefined) {
  // 引数がすべて undefined の場合、現在の日付を返す
  if (arg1 === undefined && arg2 === undefined && arg3 === undefined) {
    return dayjs();
  }
  // 数値 3 つ (year, month, day) の場合
  else if (typeof arg1 === 'number' && typeof arg2 === 'number' && typeof arg3 === 'number') {
    return dayjs(new Date(arg1, arg2, arg3));
  }
  // 文字列の場合
  else if (typeof arg1 === 'string') {
    return dayjs(arg1);
  }
  // Date オブジェクトの場合
  else if (arg1 instanceof Date) {
    return dayjs(arg1);
  }

  throw new TypeError('無効な引数: toDayjs(year, month, day) または toDayjs("YYYY-MM-DD") または toDayjs(date) を指定してください');
}

/**
 * 指定した日付とイベントの時間帯が重なっているか判定
 * @param {{start?: {date?: string, dateTime?: string}, end?: {date?: string, dateTime?: string}}} event
 * @param {dayjs.Dayjs} date
 * @returns {boolean}
 */
export function isEventOnDate(event, date) {
  const eventStart = toDayjs(event.start?.dateTime ?? event.start?.date ?? undefined);
  const eventEnd = toDayjs(event.end?.dateTime ?? event.end?.date ?? undefined);
  const dateStart = date.startOf('day');
  const dateEnd = dateStart.add(1, 'day');

  return eventStart.isBefore(dateEnd) && eventEnd.isAfter(dateStart);
}

export default dayjs;
